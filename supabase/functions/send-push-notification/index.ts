const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ChatPushRequest = {
  type?: 'chat_message';
  conversation_id: string;
  message_id: string;
  sender_id: string;
};

type PushTokenRow = {
  expo_push_token: string;
};

type ConversationMemberRow = {
  user_id: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  deleted_at: string | null;
};

type ProfileRow = {
  display_name: string | null;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
}

Deno.serve(async (req: Request) => {
  // ---------------------------------------------------------
  // OPTIONS / CORS
  // ---------------------------------------------------------
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      {
        error: 'Method not allowed',
      },
      405,
    );
  }

  try {
    // -------------------------------------------------------
    // ENVIRONMENT
    // -------------------------------------------------------
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
      );

      return jsonResponse(
        {
          error: 'Server configuration is incomplete.',
        },
        500,
      );
    }

    // -------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return jsonResponse(
        {
          error: 'Missing authorization header.',
        },
        401,
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return jsonResponse(
        {
          error: 'Invalid authorization token.',
        },
        401,
      );
    }

    // Verify the requesting user with Supabase Auth.
    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: serviceRoleKey,
        },
      },
    );

    if (!userResponse.ok) {
      return jsonResponse(
        {
          error: 'Unauthorized.',
        },
        401,
      );
    }

    const requestingUser = await userResponse.json();

    if (!requestingUser?.id) {
      return jsonResponse(
        {
          error: 'Unauthorized.',
        },
        401,
      );
    }

    // -------------------------------------------------------
    // REQUEST DATA
    // -------------------------------------------------------
    const payload = (await req.json()) as ChatPushRequest;

    const conversationId = payload?.conversation_id;
    const messageId = payload?.message_id;
    const senderId = payload?.sender_id;

    if (!conversationId || !messageId || !senderId) {
      return jsonResponse(
        {
          error:
            'conversation_id, message_id, and sender_id are required.',
        },
        400,
      );
    }

    // Never allow the client to send notifications as another user.
    if (requestingUser.id !== senderId) {
      return jsonResponse(
        {
          error: 'The sender does not match the authenticated user.',
        },
        403,
      );
    }

    const restHeaders = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    };

    // -------------------------------------------------------
    // VERIFY THE MESSAGE
    // -------------------------------------------------------
    const messageResponse = await fetch(
      `${supabaseUrl}/rest/v1/chat_messages?id=eq.${encodeURIComponent(
        messageId,
      )}&conversation_id=eq.${encodeURIComponent(
        conversationId,
      )}&sender_id=eq.${encodeURIComponent(
        senderId,
      )}&select=id,conversation_id,sender_id,body,deleted_at&limit=1`,
      {
        headers: restHeaders,
      },
    );

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      console.error('Failed to verify chat message:', errorText);

      return jsonResponse(
        {
          error: 'Could not verify the chat message.',
        },
        500,
      );
    }

    const messages = (await messageResponse.json()) as MessageRow[];
    const message = messages[0];

    if (!message) {
      return jsonResponse(
        {
          error: 'Chat message was not found.',
        },
        404,
      );
    }

    // Do not send a push for a message that has already been deleted.
    if (message.deleted_at) {
      return jsonResponse({
        success: true,
        sent: 0,
        message: 'Message has been deleted; no notification sent.',
      });
    }

    // -------------------------------------------------------
    // VERIFY SENDER MEMBERSHIP
    // -------------------------------------------------------
    const senderMembershipResponse = await fetch(
      `${supabaseUrl}/rest/v1/chat_conversation_members?conversation_id=eq.${encodeURIComponent(
        conversationId,
      )}&user_id=eq.${encodeURIComponent(
        senderId,
      )}&select=user_id&limit=1`,
      {
        headers: restHeaders,
      },
    );

    if (!senderMembershipResponse.ok) {
      const errorText = await senderMembershipResponse.text();
      console.error(
        'Failed to verify conversation membership:',
        errorText,
      );

      return jsonResponse(
        {
          error: 'Could not verify conversation membership.',
        },
        500,
      );
    }

    const senderMembership =
      (await senderMembershipResponse.json()) as ConversationMemberRow[];

    if (!senderMembership.length) {
      return jsonResponse(
        {
          error: 'The sender is not a member of this conversation.',
        },
        403,
      );
    }

    // -------------------------------------------------------
    // FIND ALL OTHER CONVERSATION MEMBERS
    // -------------------------------------------------------
    const membersResponse = await fetch(
      `${supabaseUrl}/rest/v1/chat_conversation_members?conversation_id=eq.${encodeURIComponent(
        conversationId,
      )}&select=user_id`,
      {
        headers: restHeaders,
      },
    );

    if (!membersResponse.ok) {
      const errorText = await membersResponse.text();
      console.error(
        'Failed to retrieve conversation members:',
        errorText,
      );

      return jsonResponse(
        {
          error: 'Could not retrieve conversation members.',
        },
        500,
      );
    }

    const members =
      (await membersResponse.json()) as ConversationMemberRow[];

    const recipientIds = [
      ...new Set(
        members
          .map((member) => member.user_id)
          .filter((userId) => userId && userId !== senderId),
      ),
    ];

    if (!recipientIds.length) {
      return jsonResponse({
        success: true,
        sent: 0,
        message: 'No other conversation members found.',
      });
    }

    // -------------------------------------------------------
    // GET SENDER DISPLAY NAME
    // -------------------------------------------------------
    let senderName = 'New message';

    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(
        senderId,
      )}&select=display_name&limit=1`,
      {
        headers: restHeaders,
      },
    );

    if (profileResponse.ok) {
      const profiles = (await profileResponse.json()) as ProfileRow[];
      const displayName = profiles[0]?.display_name?.trim();

      if (displayName) {
        senderName = displayName;
      }
    }

    const messageBody = message.body?.trim();
    const notificationBody = messageBody || 'Sent you an attachment';

    // -------------------------------------------------------
    // GET RECIPIENT PUSH TOKENS
    // -------------------------------------------------------
    const pushTokens: string[] = [];

    for (const recipientId of recipientIds) {
      const tokensResponse = await fetch(
        `${supabaseUrl}/rest/v1/push_tokens?user_id=eq.${encodeURIComponent(
          recipientId,
        )}&select=expo_push_token`,
        {
          headers: restHeaders,
        },
      );

      if (!tokensResponse.ok) {
        const errorText = await tokensResponse.text();
        console.error(
          `Failed to retrieve push tokens for ${recipientId}:`,
          errorText,
        );
        continue;
      }

      const rows = (await tokensResponse.json()) as PushTokenRow[];

      for (const row of rows) {
        if (row.expo_push_token) {
          pushTokens.push(row.expo_push_token);
        }
      }
    }

    const uniqueTokens = [...new Set(pushTokens)];

    if (!uniqueTokens.length) {
      return jsonResponse({
        success: true,
        sent: 0,
        recipients: recipientIds.length,
        message: 'No push tokens found for the recipient(s).',
      });
    }

    // -------------------------------------------------------
    // BUILD EXPO PUSH MESSAGES
    // -------------------------------------------------------
    const expoMessages = uniqueTokens.map((expoPushToken) => ({
      to: expoPushToken,
      sound: 'default',
      title: senderName,
      body: notificationBody,
      data: {
        type: 'chat_message',
        conversation_id: conversationId,
        message_id: messageId,
        sender_id: senderId,
      },
    }));

    // -------------------------------------------------------
    // SEND TO EXPO
    // -------------------------------------------------------
    let sent = 0;
    const tickets: unknown[] = [];

    // Expo recommends batching push messages rather than sending an
    // unlimited number in a single request.
    for (const batch of chunk(expoMessages, 100)) {
      const expoResponse = await fetch(
        'https://exp.host/--/api/v2/push/send',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        },
      );

      const expoResult = await expoResponse.json();

      if (!expoResponse.ok) {
        console.error(
          'Expo push notification failed:',
          expoResult,
        );
        continue;
      }

      sent += batch.length;

      if (Array.isArray(expoResult?.data)) {
        tickets.push(...expoResult.data);
      } else {
        tickets.push(expoResult);
      }
    }

    console.log(
      `Chat push notification processed: ${sent}/${uniqueTokens.length} device(s).`,
    );

    return jsonResponse({
      success: true,
      sent,
      recipients: recipientIds.length,
      tickets,
    });
  } catch (error) {
    console.error(
      'Unexpected chat push notification error:',
      error,
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error.',
      },
      500,
    );
  }
});
