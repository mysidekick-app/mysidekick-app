import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export type ChatAttachment = {
  url: string;
  name: string;
  type: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
};

type ConversationResult = {
  id: string | null;
  error: any;
};

type ReadMap = Map<string, string>;

/**
 * Find or create a direct conversation between two users.
 *
 * Direct conversations MUST use:
 * type = 'direct'
 * group_id = null
 * channel_id = null
 */
export async function ensureDirectConversation(
  myId: string,
  otherUserId: string,
): Promise<ConversationResult> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authenticatedUserId = authData.user?.id;

  if (authError || !authenticatedUserId) {
    return {
      id: null,
      error: authError ?? new Error('You must be signed in.'),
    };
  }

  if (!myId || !otherUserId) {
    return {
      id: null,
      error: new Error('Missing direct conversation participant.'),
    };
  }

  const currentUserId = authenticatedUserId;

  if (currentUserId === otherUserId) {
    return {
      id: null,
      error: new Error('Cannot create a conversation with yourself.'),
    };
  }

  /*
   * First try the database RPC. Creation of a direct conversation needs
   * both conversation memberships to be created atomically, so this is
   * safer than doing three client-side inserts under RLS.
   *
   * The RPC is supplied by chat_direct_fixes.sql:
   *   ensure_direct_conversation(p_other_user_id uuid)
   */
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'ensure_direct_conversation',
    {
      p_other_user_id: otherUserId,
    },
  );

  if (!rpcError) {
    let conversationId: string | null = null;

    if (typeof rpcData === 'string') {
      conversationId = rpcData;
    } else if (Array.isArray(rpcData)) {
      const first = rpcData[0] as any;
      conversationId = first?.id ?? first?.conversation_id ?? null;
    } else if (rpcData && typeof rpcData === 'object') {
      conversationId =
        (rpcData as any).id ??
        (rpcData as any).conversation_id ??
        null;
    }

    if (conversationId) {
      return {
        id: conversationId,
        error: null,
      };
    }
  }

  /*
   * Fallback: find an already-existing direct conversation.
   * This is useful during deployment before the RPC migration has been
   * run, and it avoids creating duplicate conversations.
   */
  const { data: myMemberships, error: myMembershipError } = await supabase
    .from('chat_conversation_members')
    .select('conversation_id')
    .eq('user_id', currentUserId);

  if (myMembershipError) {
    return {
      id: null,
      error: rpcError ?? myMembershipError,
    };
  }

  const candidateIds = [
    ...new Set(
      (myMemberships ?? [])
        .map((row) => row.conversation_id)
        .filter(Boolean),
    ),
  ];

  if (candidateIds.length > 0) {
    const { data: directConversations, error: directError } =
      await supabase
        .from('chat_conversations')
        .select('id, type, group_id, channel_id')
        .eq('type', 'direct')
        .in('id', candidateIds);

    if (directError) {
      return {
        id: null,
        error: directError,
      };
    }

    if (directConversations && directConversations.length > 0) {
      const directIds = directConversations.map((row) => row.id);

      const { data: otherMemberships, error: otherMembershipError } =
        await supabase
          .from('chat_conversation_members')
          .select('conversation_id, user_id')
          .in('conversation_id', directIds)
          .eq('user_id', otherUserId);

      if (otherMembershipError) {
        return {
          id: null,
          error: otherMembershipError,
        };
      }

      const existing = (otherMemberships ?? []).find((row) =>
        directIds.includes(row.conversation_id),
      );

      if (existing) {
        return {
          id: existing.conversation_id,
          error: null,
        };
      }
    }
  }

  /*
   * Final fallback: create a fresh direct conversation client-side.
   * This is important after a user deletes a chat from their own list: the
   * old conversation membership is gone for them, so opening the person
   * again must be able to create a new conversation.
   */
  const { data: createdConversation, error: createConversationError } =
    await supabase
      .from('chat_conversations')
      .insert({
        type: 'direct',
        group_id: null,
        channel_id: null,
        created_by: currentUserId,
      })
      .select('id')
      .single();

  if (createConversationError || !createdConversation?.id) {
    return {
      id: null,
      error:
        createConversationError ??
        rpcError ??
        new Error('Unable to create the direct conversation.'),
    };
  }

  const newConversationId = createdConversation.id;

  const { error: myMemberError } = await supabase
    .from('chat_conversation_members')
    .insert({
      conversation_id: newConversationId,
      user_id: currentUserId,
    });

  if (myMemberError) {
    return {
      id: null,
      error: myMemberError,
    };
  }

  const { error: otherMemberError } = await supabase
    .from('chat_conversation_members')
    .insert({
      conversation_id: newConversationId,
      user_id: otherUserId,
    });

  if (otherMemberError) {
    await supabase
      .from('chat_conversation_members')
      .delete()
      .eq('conversation_id', newConversationId);
    await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', newConversationId);

    return {
      id: null,
      error: otherMemberError,
    };
  }

  return {
    id: newConversationId,
    error: null,
  };
}

/**
 * Find or create the conversation used by a group.
 *
 * Your database requires group conversations to be:
 *
 * type       = 'channel'
 * group_id   = group.id
 * channel_id = channel.id
 *
 * The channel belongs to chat_channels.group_id.
 */
export async function ensureGroupConversation(
  groupId: string,
  userId: string,
): Promise<ConversationResult> {
  if (!groupId || !userId) {
    return {
      id: null,
      error: new Error('Missing group or user ID.'),
    };
  }

  /*
   * First confirm that the user is a member of the group.
   */
  const { data: membership, error: membershipError } = await supabase
    .from('chat_group_members')
    .select('id, role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) {
    return {
      id: null,
      error: membershipError,
    };
  }

  if (!membership) {
    return {
      id: null,
      error: new Error(
        'You are not a member of this group.',
      ),
    };
  }

  /*
   * Find the group's default channel.
   */
  let { data: channel, error: channelError } = await supabase
    .from('chat_channels')
    .select(
      'id, group_id, name, description, position, is_default, created_by',
    )
    .eq('group_id', groupId)
    .eq('is_default', true)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  /*
   * If no default channel exists, use the first channel.
   */
  if (!channel && !channelError) {
    const result = await supabase
      .from('chat_channels')
      .select(
        'id, group_id, name, description, position, is_default, created_by',
      )
      .eq('group_id', groupId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();

    channel = result.data;
    channelError = result.error;
  }

  /*
   * If the group has no channel, create its default channel.
   */
  if (!channel && !channelError) {
    const { data: group, error: groupError } = await supabase
      .from('chat_groups')
      .select('id, name, description, owner_id')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return {
        id: null,
        error:
          groupError ??
          new Error('Group could not be found.'),
      };
    }

    const { data: createdChannel, error: createChannelError } =
      await supabase
        .from('chat_channels')
        .insert({
          group_id: groupId,
          name: group.name,
          description: group.description ?? '',
          position: 0,
          is_default: true,
          created_by: userId,
        })
        .select(
            'id, group_id, name, description, position, is_default, created_by'
          )
        .single();

    if (createChannelError || !createdChannel) {
      return {
        id: null,
        error:
          createChannelError ??
          new Error('Unable to create the group channel.'),
      };
    }

    channel = createdChannel;
  }

  if (channelError) {
    return {
      id: null,
      error: channelError,
    };
  }

  if (!channel) {
    return {
      id: null,
      error: new Error(
        'This group does not have a chat channel.',
      ),
    };
  }

  /*
   * Find the channel conversation.
   *
   * IMPORTANT:
   * Group conversations are type='channel'.
   */
  const { data: existingConversation, error: conversationError } =
    await supabase
      .from('chat_conversations')
      .select('id, type, group_id, channel_id')
      .eq('type', 'channel')
      .eq('group_id', groupId)
      .eq('channel_id', channel.id)
      .maybeSingle();

  if (conversationError) {
    return {
      id: null,
      error: conversationError,
    };
  }

  if (existingConversation) {
    /*
     * Make sure the current user is a conversation member.
     */
    const { error: ensureMemberError } =
      await ensureOwnGroupConversationMembership(
        existingConversation.id,
        userId,
      );

    if (ensureMemberError) {
      return {
        id: null,
        error: ensureMemberError,
      };
    }

    return {
      id: existingConversation.id,
      error: null,
    };
  }

  /*
   * Create the channel conversation.
   */
  const { data: conversation, error: createConversationError } =
    await supabase
      .from('chat_conversations')
      .insert({
        type: 'channel',
        group_id: groupId,
        channel_id: channel.id,
        created_by: userId,
      })
      .select('id, type, group_id, channel_id')
      .single();

  if (createConversationError || !conversation) {
    return {
      id: null,
      error:
        createConversationError ??
        new Error(
          'Unable to create the group conversation.',
        ),
    };
  }

  /*
   * Add all current group members to the conversation.
   *
   * This makes sure everyone in the group can read/send messages.
   */
  const { data: groupMembers, error: groupMembersError } =
    await supabase
      .from('chat_group_members')
      .select('user_id')
      .eq('group_id', groupId);

  if (groupMembersError) {
    return {
      id: conversation.id,
      error: groupMembersError,
    };
  }

  if (groupMembers && groupMembers.length > 0) {
    const conversationMembers = groupMembers.map((member) => ({
      conversation_id: conversation.id,
      user_id: member.user_id,
    }));

    /*
     * Insert individually so an existing membership does not
     * prevent the remaining members from being added.
     */
    for (const member of conversationMembers) {
      const { data: alreadyMember, error: existingError } =
        await supabase
          .from('chat_conversation_members')
          .select('id')
          .eq('conversation_id', member.conversation_id)
          .eq('user_id', member.user_id)
          .maybeSingle();

      if (existingError) {
        continue;
      }

      if (!alreadyMember) {
        await supabase
          .from('chat_conversation_members')
          .insert(member);
      }
    }
  }

  return {
    id: conversation.id,
    error: null,
  };
}

/**
 * Ensure that a user belongs to a conversation.
 */
export async function ensureOwnGroupConversationMembership(
  conversationId: string,
  userId: string,
): Promise<{ error: any }> {
  if (!conversationId || !userId) {
    return {
      error: new Error(
        'Missing conversation ID or user ID.',
      ),
    };
  }

  const { data: existing, error: selectError } = await supabase
    .from('chat_conversation_members')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    return {
      error: selectError,
    };
  }

  if (existing) {
    return {
      error: null,
    };
  }

  const { error } = await supabase
    .from('chat_conversation_members')
    .insert({
      conversation_id: conversationId,
      user_id: userId,
    });

  return {
    error,
  };
}

/**
 * Load messages for an actual conversation.
 *
 * IMPORTANT:
 * This function expects a chat_conversations.id.
 * It does NOT accept a group_id.
 */
export async function loadChatMessages(
  conversationId: string,
): Promise<{
  messages: ChatMessage[];
  error: any;
}> {
  if (!conversationId) {
    return {
      messages: [],
      error: new Error('Missing conversation ID.'),
    };
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select(
      `
        id,
        conversation_id,
        sender_id,
        body,
        created_at,
        updated_at,
        deleted_at,
        sender_type
      `,
    )
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', {
      ascending: true,
    });

  if (error) {
    return {
      messages: [],
      error,
    };
  }

  const messageRows = data ?? [];
  const messageIds = messageRows.map((row) => row.id);

  /*
   * Attachments are optional.
   *
   * The helper deliberately handles the table not existing yet,
   * so loading text messages does not fail if the attachment
   * migration has not been run.
   */
  const attachmentMap = new Map<string, any>();

  if (messageIds.length > 0) {
    const { data: attachmentRows, error: attachmentError } =
      await supabase
        .from('chat_message_attachments')
        .select(
          'message_id, url, name, mime_type, attachment_type',
        )
        .in('message_id', messageIds);

    if (!attachmentError && attachmentRows) {
      for (const row of attachmentRows) {
        attachmentMap.set(row.message_id, row);
      }
    }
  }

  return {
    messages: messageRows.map((row) => {
      const attachment = attachmentMap.get(row.id);

      return {
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        content: row.body ?? '',
        created_at: row.created_at,
        attachment_url: attachment?.url ?? null,
        attachment_name: attachment?.name ?? null,
        attachment_type:
          attachment?.attachment_type ??
          attachment?.mime_type ??
          null,
      };
    }),
    error: null,
  };
}

/**
 * Send a message into chat_messages.
 *
 * The database column is `body`, not `content`.
 */
export async function sendChatMessage(
  conversationId: string,
  senderId: string,
  body: string,
  attachment?: ChatAttachment | null,
): Promise<{
  message: ChatMessage | null;
  error: any;
}> {
  if (!conversationId) {
    return {
      message: null,
      error: new Error('Missing conversation ID.'),
    };
  }

  if (!senderId) {
    return {
      message: null,
      error: new Error('Missing sender ID.'),
    };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authenticatedUserId = authData.user?.id;

  if (authError || !authenticatedUserId) {
    return {
      message: null,
      error: authError ?? new Error('You must be signed in to send messages.'),
    };
  }

  /* Never trust a sender ID supplied by the UI. */
  if (senderId !== authenticatedUserId) {
    senderId = authenticatedUserId;
  }

  /*
   * Verify membership before attempting the message insert. This turns an
   * opaque RLS failure into a clear error and also prevents the helper from
   * trying to send into a conversation the current user cannot access.
   */
  const { data: membership, error: membershipError } = await supabase
    .from('chat_conversation_members')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_id', senderId)
    .maybeSingle();

  if (membershipError) {
    return {
      message: null,
      error: membershipError,
    };
  }

  if (!membership) {
    return {
      message: null,
      error: new Error('You are not a member of this conversation.'),
    };
  }

  const trimmedBody = body.trim();

  if (!trimmedBody && !attachment) {
    return {
      message: null,
      error: new Error('Message cannot be empty.'),
    };
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: trimmedBody,
      sender_type: 'user',
    })
    .select(
      `
        id,
        conversation_id,
        sender_id,
        body,
        created_at,
        updated_at,
        deleted_at,
        sender_type
      `,
    )
    .single();

  if (error || !data) {
    return {
      message: null,
      error:
        error ??
        new Error('The message could not be sent.'),
    };
  }

  let attachmentData: any = null;

  if (attachment) {
    const { data: createdAttachment, error: attachmentError } =
      await supabase
        .from('chat_message_attachments')
        .insert({
          message_id: data.id,
          url: attachment.url,
          name: attachment.name,
          mime_type: attachment.type,
          attachment_type:
            attachment.type.startsWith('image/')
              ? 'image'
              : attachment.type.startsWith('audio/')
                ? 'audio'
                : attachment.type.startsWith('video/')
                  ? 'video'
                  : 'document',
        })
        .select(
          'message_id, url, name, mime_type, attachment_type',
        )
        .single();

    if (attachmentError) {
      console.error('CHAT ATTACHMENT METADATA ERROR:', attachmentError);
      return {
        message: {
          id: data.id,
          conversation_id: data.conversation_id,
          sender_id: data.sender_id,
          content: data.body ?? '',
          created_at: data.created_at,
          attachment_url: attachment.url,
          attachment_name: attachment.name,
          attachment_type: attachment.type,
        },
        error: attachmentError,
      };
    }

    attachmentData = createdAttachment;
  }

  return {
    message: {
      id: data.id,
      conversation_id: data.conversation_id,
      sender_id: data.sender_id,
      content: data.body ?? '',
      created_at: data.created_at,
      attachment_url:
        attachmentData?.url ??
        attachment?.url ??
        null,
      attachment_name:
        attachmentData?.name ??
        attachment?.name ??
        null,
      attachment_type:
        attachmentData?.attachment_type ??
        attachmentData?.mime_type ??
        attachment?.type ??
        null,
    },
    error: null,
  };
}

/**
 * Remove only the current user's membership from a direct conversation.
 * The conversation and the other participant remain intact so the chat
 * can be restored only when the user intentionally sends a new message.
 */
export async function deleteConversationForUser(
  conversationId: string,
  userId: string,
  otherUserId?: string,
): Promise<{ error: any }> {
  if (!conversationId || !userId) {
    return {
      error: new Error('Missing conversation or user ID.'),
    };
  }

  // Normally remove only the current user's membership from this chat.
  // When the other participant is provided, also remove any duplicate direct
  // conversation memberships for the same pair so an older duplicate cannot
  // keep the person visible in the chat list.
  let conversationIds = [conversationId];

  if (otherUserId && otherUserId !== userId) {
    const { data: myMemberships, error: membershipError } = await supabase
      .from('chat_conversation_members')
      .select('conversation_id')
      .eq('user_id', userId);

    if (membershipError) {
      return { error: membershipError };
    }

    const candidateIds = [...new Set(
      (myMemberships ?? [])
        .map((row: any) => row.conversation_id)
        .filter(Boolean),
    )];

    if (candidateIds.length) {
      const { data: directRows, error: directError } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('type', 'direct')
        .in('id', candidateIds);

      if (directError) {
        return { error: directError };
      }

      const directIds = (directRows ?? []).map((row: any) => row.id);

      if (directIds.length) {
        const { data: pairedRows, error: pairedError } = await supabase
          .from('chat_conversation_members')
          .select('conversation_id')
          .in('conversation_id', directIds)
          .eq('user_id', otherUserId);

        if (pairedError) {
          return { error: pairedError };
        }

        conversationIds = [...new Set([
          conversationId,
          ...(pairedRows ?? []).map((row: any) => row.conversation_id).filter(Boolean),
        ])];
      }
    }
  }

  const { error } = await supabase
    .from('chat_conversation_members')
    .delete()
    .in('conversation_id', conversationIds)
    .eq('user_id', userId);

  return { error: error ?? null };
}

/**
 * Mark a conversation as read.
 *
 * The read position is stored in Supabase and also locally as a fallback.
 * This prevents a refresh from turning the entire chat history unread if
 * the database read-state row is temporarily unavailable.
 *
 * IMPORTANT:
 * `readAt` should represent the point the user actually read up to.
 * When omitted, we use "now".
 */
export async function markConversationRead(
  conversationId: string,
  userId: string,
  readAt?: string,
): Promise<{ error: any }> {
  if (!conversationId || !userId) {
    return { error: null };
  }

  const now = new Date().toISOString();
  const lastReadAt = readAt || now;
  const localKey = `mysidekick:chat-read:${userId}:${conversationId}`;

  // Always save locally first. This survives app refreshes even if the
  // Supabase read-state request fails.
  try {
    await AsyncStorage.setItem(localKey, lastReadAt);
  } catch {
    // Local persistence is a fallback; do not block the chat.
  }

  try {
    const { error } = await supabase
      .from('chat_conversation_reads')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: userId,
          last_read_at: lastReadAt,
          updated_at: now,
        },
        {
          onConflict: 'conversation_id,user_id',
        },
      );

    return { error: error ?? null };
  } catch (error) {
    return { error };
  }
}

const CHAT_CLEAR_PREFIX = 'mysidekick:chat-clear:';

function getChatClearKey(userId: string, conversationId: string): string {
  return `${CHAT_CLEAR_PREFIX}${userId}:${conversationId}`;
}

export async function getChatClearedAt(
  userId: string,
  conversationId: string,
): Promise<string | null> {
  if (!userId || !conversationId) return null;

  try {
    return await AsyncStorage.getItem(
      getChatClearKey(userId, conversationId),
    );
  } catch {
    return null;
  }
}

export async function clearChatForUser(
  userId: string,
  conversationId: string,
  clearedAt: string,
): Promise<{ error: any }> {
  if (!userId || !conversationId || !clearedAt) {
    return { error: new Error('Missing chat clear information.') };
  }

  try {
    await AsyncStorage.setItem(
      getChatClearKey(userId, conversationId),
      clearedAt,
    );
    return { error: null };
  } catch (error) {
    return { error };
  }
}

const CHAT_READ_PREFIX = 'mysidekick:chat-read:';

function getChatReadKey(userId: string, conversationId: string): string {
  return `${CHAT_READ_PREFIX}${userId}:${conversationId}`;
}

/**
 * Get the last-read timestamp for each conversation.
 *
 * Read-state priority:
 * 1. Supabase persisted read position.
 * 2. Local AsyncStorage read position.
 * 3. If neither exists, initialize the conversation at its latest
 *    existing message so historical messages are NOT incorrectly counted
 *    as unread after a refresh.
 *
 * This is deliberately done here rather than treating a missing row as
 * "everything is unread".
 */
export async function getConversationReadMap(
  userId: string,
  conversationIds: string[],
): Promise<ReadMap> {
  if (!userId || conversationIds.length === 0) {
    return new Map<string, string>();
  }

  const result = new Map<string, string>();

  // First try the database.
  try {
    const { data, error } = await supabase
      .from('chat_conversation_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId)
      .in('conversation_id', conversationIds);

    if (!error) {
      (data ?? []).forEach((row: any) => {
        if (row.conversation_id && row.last_read_at) {
          result.set(row.conversation_id, row.last_read_at);
        }
      });
    }
  } catch {
    // Fall through to local state.
  }

  // Fill missing conversations from local persistence.
  const missingIds = conversationIds.filter(
    (conversationId) => !result.has(conversationId),
  );

  if (missingIds.length > 0) {
    const localEntries = await Promise.all(
      missingIds.map(async (conversationId) => {
        try {
          const value = await AsyncStorage.getItem(
            getChatReadKey(userId, conversationId),
          );
          return [conversationId, value] as const;
        } catch {
          return [conversationId, null] as const;
        }
      }),
    );

    localEntries.forEach(([conversationId, readAt]) => {
      if (readAt) {
        result.set(conversationId, readAt);
      }
    });
  }

  /*
   * IMPORTANT:
   * If there is still no read position, this is an existing conversation
   * whose read-state record was never created. Do NOT let the UI interpret
   * that as "all historical messages are unread".
   *
   * Instead, use the latest existing message as the initial baseline.
   * Future messages will then be newer than this timestamp and will count.
   */
  const stillMissing = conversationIds.filter(
    (conversationId) => !result.has(conversationId),
  );

  if (stillMissing.length > 0) {
    try {
      const { data: latestMessages, error } = await supabase
        .from('chat_messages')
        .select('conversation_id, created_at')
        .in('conversation_id', stillMissing)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!error && latestMessages) {
        const latestByConversation = new Map<string, string>();

        for (const row of latestMessages as any[]) {
          if (
            row.conversation_id &&
            row.created_at &&
            !latestByConversation.has(row.conversation_id)
          ) {
            latestByConversation.set(
              row.conversation_id,
              row.created_at,
            );
          }
        }

        for (const conversationId of stillMissing) {
          const latestAt = latestByConversation.get(conversationId);

          if (latestAt) {
            result.set(conversationId, latestAt);

            // Persist the baseline so subsequent refreshes do not need
            // to infer it again.
            try {
              await AsyncStorage.setItem(
                getChatReadKey(userId, conversationId),
                latestAt,
              );
            } catch {
              // Local persistence is best-effort.
            }

            try {
              await supabase
                .from('chat_conversation_reads')
                .upsert(
                  {
                    conversation_id: conversationId,
                    user_id: userId,
                    last_read_at: latestAt,
                    updated_at: new Date().toISOString(),
                  },
                  {
                    onConflict: 'conversation_id,user_id',
                  },
                );
            } catch {
              // Supabase persistence is best-effort here.
            }
          }
        }
      }
    } catch {
      // If the message query itself fails, leave the conversation absent.
      // The caller should treat this as zero unread rather than counting
      // the entire historical conversation.
    }
  }

  return result;
}
