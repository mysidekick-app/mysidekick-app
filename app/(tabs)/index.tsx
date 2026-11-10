import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, CheckCheck, ChevronLeft, MoreVertical, Plus, Search, Send, UserPlus, X } from 'lucide-react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useApp } from '@/components/AppProvider';
import SidekickAvatar from '@/components/SidekickAvatar';
import { supabase } from '@/lib/supabase';
import { ensureDirectConversation, getChatClearedAt, getConversationReadMap, getDeletedMessageIds, markConversationRead, sendChatMessage } from './chat/chatHelpers';

type ChatItem = {
  id: string;
  name: string;
  detail: string;
  time: string;
  unread?: number;
  lastMessageSenderId?: string;
  lastMessageRead?: boolean;
  lastMessageAt?: string;
  category: 'direct';
  icon: string;
  profileId?: string;
  route?: string;
  moduleRoute?: string;
  sidekickId?: string | null;
};

type SocialProfile = {
  id?: string;
  user_id: string;
  display_name: string;
  username: string;
  title?: string | null;
  tag?: string | null;
  profile_title?: string | null;
};

type IncomingRequest = {
  id: string;
  sender_id: string;
  sender: SocialProfile | null;
  created_at: string;
};

type ChatTag = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

type ChatTagAssignment = {
  id: string;
  user_id: string;
  chat_id: string;
  tag_id: string;
  created_at: string;
};

const filters = ['All', 'Unread'] as const;
type FilterKey = (typeof filters)[number];

function isAccentBlack(color?: string): boolean {
  if (!color) return false;
  const normalized = color.trim().toLowerCase();
  return (
    normalized === '#000000' ||
    normalized === '#000' ||
    normalized === 'black' ||
    normalized === 'rgb(0,0,0)' ||
    normalized === 'rgba(0,0,0,1)'
  );
}

export default function ChatScreen() {
  const appContext = useApp() as any;
  const { accentForeground, accentColor: rawAccent, isDark } = appContext;
  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);

  const params = useLocalSearchParams<{
    flex?: string;
    shareStreak?: string;
    streak?: string;
    habitTitle?: string;
    habitName?: string;
    frequency?: string;
    filter?: string;
  }>();

  const flexMode =
    params.shareStreak === '1' ||
    params.shareStreak === 'true' ||
    params.flex === '1' ||
    params.flex === 'true';

  const streakCount = Number(params.streak ?? 0);
  const habitTitle =
    typeof params.habitTitle === 'string'
      ? params.habitTitle
      : typeof params.habitName === 'string'
        ? params.habitName
        : '';

  const streakFrequency = typeof params.frequency === 'string' ? params.frequency : 'daily';
  const streakUnit =
    streakFrequency === 'weekly'
      ? 'week'
      : streakFrequency === 'monthly'
        ? 'month'
        : streakFrequency === 'annually'
          ? 'year'
          : 'day';

  const streakMessage =
    streakCount > 0 && habitTitle ? `I just hit my ${streakCount} ${streakUnit} streak in ${habitTitle}.` : '';

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey | null>('All');
  const [chatTags, setChatTags] = useState<ChatTag[]>([]);
  const [chatTagAssignments, setChatTagAssignments] = useState<ChatTagAssignment[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [addTagError, setAddTagError] = useState<string | null>(null);
  const [addingTag, setAddingTag] = useState(false);

  const [readChatAt, setReadChatAt] = useState<Record<string, string>>({});
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [userFriends, setUserFriends] = useState<ChatItem[]>([]);
  const [searchableFriends, setSearchableFriends] = useState<ChatItem[]>([]);

  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [flexSearch, setFlexSearch] = useState('');
  const [flexSending, setFlexSending] = useState(false);
  const [flexError, setFlexError] = useState<string | null>(null);
  const [sentStreakRecipients, setSentStreakRecipients] = useState<string[]>([]);

  const [friendSearchOpen, setFriendSearchOpen] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');
  const [friendResults, setFriendResults] = useState<SocialProfile[]>([]);
  const [friendSearching, setFriendSearching] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [sendingRequestId, setSendingRequestId] = useState<string | null>(null);
  const [sentRequestIds, setSentRequestIds] = useState<string[]>([]);
  const [existingFriendIds, setExistingFriendIds] = useState<string[]>([]);

  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMyUserId(user?.id ?? null));
  }, []);

  const loadFriends = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserFriends([]);
      return;
    }

    const { data: friendshipRows, error: friendshipError } = await supabase
      .from('friendships')
      .select('user_id, friend_user_id')
      .or(`user_id.eq.${user.id},friend_user_id.eq.${user.id}`);

    if (friendshipError) {
      setUserFriends([]);
      return;
    }

    const friendIds: string[] = [
      ...new Set<string>(
        (friendshipRows ?? []).map((row: { user_id: string; friend_user_id: string }) =>
          row.user_id === user.id ? row.friend_user_id : row.user_id,
        ),
      ),
    ];

    if (!friendIds.length) {
      setUserFriends([]);
      return;
    }

    const { data: profiles, error: profileError } = await supabase
      .from('social_profiles')
      .select('*')
      .in('user_id', friendIds);

    if (profileError) {
      setUserFriends([]);
      return;
    }

    const { data: sidekickProfiles } = await supabase
      .from('profiles')
      .select('user_id, sidekick_id')
      .in('user_id', friendIds);

    const sidekickByUserId = new Map<string, string | null>(
      (sidekickProfiles ?? []).map((row: any) => [row.user_id, row.sidekick_id ?? null]),
    );

    const conversationByFriend = new Map<string, string>();
    const friendHasAnyConversation = new Set<string>();

    const { data: myMembershipRows } = await supabase
      .from('chat_conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);

    const conversationIds = [...new Set((myMembershipRows ?? []).map((r: any) => r.conversation_id).filter(Boolean))];
    if (conversationIds.length) {
      const { data: directRows } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('type', 'direct')
        .in('id', conversationIds);

      const directIds = (directRows ?? []).map((r: any) => r.id);

      if (directIds.length) {
        const { data: pairedRows } = await supabase
          .from('chat_conversation_members')
          .select('conversation_id, user_id')
          .in('conversation_id', directIds)
          .in('user_id', friendIds);

        (pairedRows ?? []).forEach((row: any) => {
          if (row.user_id) friendHasAnyConversation.add(row.user_id);
          if (row.user_id && !conversationByFriend.has(row.user_id)) {
            conversationByFriend.set(row.user_id, row.conversation_id);
          }
        });
      }
    }

    const { data: friendMembershipRows } = await supabase
      .from('chat_conversation_members')
      .select('conversation_id, user_id')
      .in('user_id', friendIds);

    const historicalFriendMemberships = (friendMembershipRows ?? []).filter(
      (row: any) => row.conversation_id && row.user_id && friendIds.includes(row.user_id),
    );

    historicalFriendMemberships.forEach((row: any) => {
      friendHasAnyConversation.add(row.user_id);
    });

    const historicalConversationIds = [
      ...new Set(historicalFriendMemberships.map((row: any) => row.conversation_id).filter(Boolean)),
    ];

    const activeConversationIds = new Set(conversationByFriend.values());
    const historicalOnlyIds = historicalConversationIds.filter(
      (conversationId) => !activeConversationIds.has(conversationId),
    );

    const historicalDirectIds = historicalOnlyIds.length
      ? (
          await supabase
            .from('chat_conversations')
            .select('id')
            .eq('type', 'direct')
            .in('id', historicalOnlyIds)
        ).data?.map((row: any) => row.id) ?? []
      : [];

    const historicalClearRows = await Promise.all(
      historicalDirectIds.map(async (conversationId) => [
        conversationId,
        await getChatClearedAt(user.id, conversationId),
      ] as const),
    );

    const historicalClearAtByConversation = new Map<string, string>(
      historicalClearRows.filter((row): row is readonly [string, string] => Boolean(row[1])),
    );

    const candidateHistoricalIds = historicalDirectIds.filter((conversationId) =>
      historicalClearAtByConversation.has(conversationId),
    );

    if (candidateHistoricalIds.length) {
      const { data: historicalMessages } = await supabase
        .from('chat_messages')
        .select('id, conversation_id, sender_id, body, created_at')
        .in('conversation_id', candidateHistoricalIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const historicalMessageIds = (historicalMessages ?? []).map((message: any) => message.id).filter(Boolean);

      const { data: deletedHistoricalRows } = historicalMessageIds.length
        ? await supabase
            .from('chat_message_deletions')
            .select('message_id')
            .eq('user_id', user.id)
            .in('message_id', historicalMessageIds)
        : { data: [] as any[] };

      const deletedHistoricalIds = new Set(
        (deletedHistoricalRows ?? []).map((row: any) => row.message_id).filter(Boolean),
      );

      const friendByConversation = new Map<string, string>();
      historicalFriendMemberships.forEach((row: any) => {
        if (!friendByConversation.has(row.conversation_id)) {
          friendByConversation.set(row.conversation_id, row.user_id);
        }
      });

      const restoredFriendIds = new Set<string>();

      for (const message of historicalMessages ?? []) {
        if (deletedHistoricalIds.has(message.id)) {
          continue;
        }

        const friendId = friendByConversation.get(message.conversation_id);
        const clearedAt = historicalClearAtByConversation.get(message.conversation_id);

        if (
          !friendId ||
          restoredFriendIds.has(friendId) ||
          !clearedAt ||
          new Date(message.created_at).getTime() <= new Date(clearedAt).getTime()
        ) {
          continue;
        }

        await supabase.from('chat_conversation_members').insert({
          conversation_id: message.conversation_id,
          user_id: user.id,
        });

        conversationByFriend.set(friendId, message.conversation_id);
        restoredFriendIds.add(friendId);
      }
    }

    const allFriendProfiles: ChatItem[] = (profiles ?? []).map((profile: SocialProfile) => ({
      id: profile.user_id,
      name: profile.display_name,
      detail: profile.title || profile.tag || profile.profile_title || `@${profile.username}`,
      time: '',
      category: 'direct',
      icon: (profile.display_name || '?').slice(0, 1).toUpperCase(),
      profileId: profile.user_id,
      sidekickId: sidekickByUserId.get(profile.user_id) ?? null,
    }));
    setSearchableFriends(allFriendProfiles);

    const directConversationIds = [...conversationByFriend.values()];

    const readRows = directConversationIds.length
      ? await getConversationReadMap(user.id, directConversationIds)
      : new Map<string, string>();

    if (directConversationIds.length && readRows.size) {
      setReadChatAt((previous) => {
        const next = { ...previous };
        readRows.forEach((readAt, conversationId) => {
          next[conversationId] = readAt;
        });
        return next;
      });
    }

    const { data: peerReadRows } = directConversationIds.length
      ? await supabase
          .from('chat_conversation_reads')
          .select('conversation_id, user_id, last_read_at')
          .in('conversation_id', directConversationIds)
          .in('user_id', friendIds)
      : { data: [] as any[] };
    const peerReadByConversation = new Map<string, string>();
    (peerReadRows ?? []).forEach((row: any) => {
      const current = peerReadByConversation.get(row.conversation_id);
      if (!current || row.last_read_at > current) peerReadByConversation.set(row.conversation_id, row.last_read_at);
    });

    const { data: messageRows } = directConversationIds.length
      ? await supabase
          .from('chat_messages')
          .select('id, conversation_id, sender_id, body, created_at')
          .in('conversation_id', directConversationIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
      : { data: [] as any[] };

    const directMessageIds = (messageRows ?? []).map((row: any) => row.id).filter(Boolean);
    const { ids: deletedDirectMessageIds } = await getDeletedMessageIds(directMessageIds, user.id);

    const clearRows = await Promise.all(
      directConversationIds.map(async (conversationId) => [
        conversationId,
        await getChatClearedAt(user.id, conversationId),
      ] as const),
    );
    const clearAtByConversation = new Map<string, string>(
      clearRows.filter((row): row is readonly [string, string] => Boolean(row[1])),
    );

    const messagesByConversation = new Map<string, any[]>();
    (messageRows ?? []).forEach((row: any) => {
      if (deletedDirectMessageIds.has(row.id)) return;
      const clearAt = clearAtByConversation.get(row.conversation_id);
      if (clearAt && new Date(row.created_at).getTime() <= new Date(clearAt).getTime()) return;
      const list = messagesByConversation.get(row.conversation_id) ?? [];
      list.push(row);
      messagesByConversation.set(row.conversation_id, list);
    });

    const getDirectRows = (friendId: string) => {
      const conversationId = conversationByFriend.get(friendId);
      return conversationId ? (messagesByConversation.get(conversationId) ?? []) : [];
    };

    const friendsList: ChatItem[] = (profiles ?? [])
      .filter((profile: SocialProfile) => {
        const conversationId = conversationByFriend.get(profile.user_id);
        if (conversationId) {
          const clearAt = clearAtByConversation.get(conversationId);
          if (clearAt) {
            const hasNewMessage = (messagesByConversation.get(conversationId) ?? []).some(
              (row: any) => new Date(row.created_at).getTime() > new Date(clearAt).getTime(),
            );
            if (!hasNewMessage) return false;
          }
          return true;
        }
        return !friendHasAnyConversation.has(profile.user_id);
      })
      .map((profile: SocialProfile) => ({
        id: profile.user_id,
        name: profile.display_name,
        detail: (() => {
          const last = getDirectRows(profile.user_id)[0];
          return last?.body?.trim() || profile.title || profile.tag || profile.profile_title || `@${profile.username}`;
        })(),
        time: (() => {
          const last = getDirectRows(profile.user_id)[0];
          return last ? formatChatTime(last.created_at) : '';
        })(),
        lastMessageSenderId: (() => {
          const last = getDirectRows(profile.user_id)[0];
          return last?.sender_id;
        })(),
        lastMessageAt: (() => {
          const last = getDirectRows(profile.user_id)[0];
          return last?.created_at ?? '';
        })(),
        lastMessageRead: (() => {
          const last = getDirectRows(profile.user_id)[0];
          const conversationId = conversationByFriend.get(profile.user_id);
          const peerRead = conversationId ? peerReadByConversation.get(conversationId) : undefined;
          return !!last && last.sender_id === user.id && !!peerRead && peerRead >= last.created_at;
        })(),
        unread: (() => {
          const rows = getDirectRows(profile.user_id);
          const conversationId = conversationByFriend.get(profile.user_id);
          const lastRead =
            (conversationId ? readRows.get(conversationId) : undefined) ?? readChatAt[conversationId ?? ''];
          return rows.filter(
            (row: any) => row.sender_id !== user.id && (!lastRead || row.created_at > lastRead),
          ).length;
        })(),
        category: 'direct',
        icon: (profile.display_name || '?').slice(0, 1).toUpperCase(),
        profileId: profile.user_id,
        sidekickId: sidekickByUserId.get(profile.user_id) ?? null,
      }));

    friendsList.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    setUserFriends(friendsList);
  }, [readChatAt]);

  const loadChatTags = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setChatTags([]);
      setChatTagAssignments([]);
      return;
    }

    const [{ data: tags }, { data: assignments }] = await Promise.all([
      supabase
        .from('social_chat_tags')
        .select('id, user_id, name, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('social_chat_tag_assignments')
        .select('id, user_id, chat_id, tag_id, created_at')
        .eq('user_id', user.id),
    ]);

    setChatTags((tags ?? []) as ChatTag[]);
    setChatTagAssignments((assignments ?? []) as ChatTagAssignment[]);
  }, []);

  const getTagChatId = (chat: ChatItem) => chat.id;

  const isChatTagged = (chat: ChatItem, tagId: string) =>
    chatTagAssignments.some(
      (assignment) => assignment.chat_id === getTagChatId(chat) && assignment.tag_id === tagId,
    );

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((previous) =>
      previous.includes(tagId) ? previous.filter((id) => id !== tagId) : [...previous, tagId],
    );
  };

  const openAddTag = () => {
    setEditingTagId(null);
    setNewTagName('');
    setAddTagError(null);
    setShowAddTagModal(true);
  };

  const createChatTag = async () => {
    const name = newTagName.trim();
    if (addingTag) return;
    if (!name) {
      setAddTagError('Enter a tag name.');
      return;
    }
    if (name.length > 20) {
      setAddTagError('Tag names can be up to 20 characters.');
      return;
    }

    setAddingTag(true);
    setAddTagError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAddTagError('You must be signed in.');
      setAddingTag(false);
      return;
    }

    if (editingTagId) {
      const { data, error } = await supabase
        .from('social_chat_tags')
        .update({ name })
        .eq('id', editingTagId)
        .eq('user_id', user.id)
        .select('id, user_id, name, created_at')
        .single();
      setAddingTag(false);
      if (error || !data) {
        setAddTagError(error?.message || 'Could not edit tag.');
        return;
      }
      setChatTags((previous) => previous.map((tag) => (tag.id === editingTagId ? (data as ChatTag) : tag)));
      setEditingTagId(null);
      setNewTagName('');
      setShowAddTagModal(false);
      return;
    }

    const { data, error } = await supabase
      .from('social_chat_tags')
      .insert({ user_id: user.id, name })
      .select('id, user_id, name, created_at')
      .single();
    setAddingTag(false);
    if (error || !data) {
      if (error?.code === '23505') setAddTagError('You already have a tag with that name.');
      else setAddTagError(error?.message || 'Could not create tag.');
      return;
    }
    const tag = data as ChatTag;
    setChatTags((previous) => [...previous, tag]);
    setFilter(null);
    setSelectedTagIds((previous) => [...previous, tag.id]);
    setNewTagName('');
    setShowAddTagModal(false);
  };

  const deleteChatTag = async (tag: ChatTag) => {
    Alert.alert('Delete tag?', `Delete “${tag.name}” and remove it from all chats?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('social_chat_tag_assignments').delete().eq('user_id', tag.user_id).eq('tag_id', tag.id);
          await supabase.from('social_chat_tags').delete().eq('id', tag.id).eq('user_id', tag.user_id);
          setChatTags((previous) => previous.filter((item) => item.id !== tag.id));
          setChatTagAssignments((previous) => previous.filter((item) => item.tag_id !== tag.id));
          setSelectedTagIds((previous) => previous.filter((id) => id !== tag.id));
        },
      },
    ]);
  };

  const editChatTag = (tag: ChatTag) => {
    setEditingTagId(tag.id);
    setNewTagName(tag.name);
    setAddTagError(null);
    setShowAddTagModal(true);
  };

  const swapChatTags = async (a: number, b: number) => {
    const first = chatTags[a];
    const second = chatTags[b];
    if (!first || !second) return;
    const firstDate = first.created_at;
    const secondDate = second.created_at;
    await Promise.all([
      supabase.from('social_chat_tags').update({ created_at: secondDate }).eq('id', first.id).eq('user_id', first.user_id),
      supabase.from('social_chat_tags').update({ created_at: firstDate }).eq('id', second.id).eq('user_id', second.user_id),
    ]);
    const next = [...chatTags];
    [next[a], next[b]] = [next[b], next[a]];
    setChatTags(next);
  };

  const reorderChatTag = async (tag: ChatTag) => {
    const index = chatTags.findIndex((item) => item.id === tag.id);
    if (index < 0) return;
    const options: any[] = [{ text: 'Cancel', style: 'cancel' }];
    if (index > 0) options.push({ text: 'Move up', onPress: () => swapChatTags(index, index - 1) });
    if (index < chatTags.length - 1) options.push({ text: 'Move down', onPress: () => swapChatTags(index, index + 1) });
    Alert.alert(`Re-order “${tag.name}”`, undefined, options);
  };

  const handleTagLongPress = (tag: ChatTag) => {
    Alert.alert(`Tag: ${tag.name}`, 'Choose an action.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit', onPress: () => editChatTag(tag) },
      { text: 'Delete', style: 'destructive', onPress: () => deleteChatTag(tag) },
      { text: 'Re-order', onPress: () => reorderChatTag(tag) },
    ]);
  };

  const loadIncomingRequests = useCallback(async () => {
    setRequestsLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIncomingRequests([]);
      setRequestsLoading(false);
      return;
    }

    const { data: requestRows } = await supabase
      .from('friend_requests')
      .select('id, sender_id, created_at')
      .eq('receiver_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const senderIds = (requestRows ?? []).map((row: { sender_id: string }) => row.sender_id);
    if (!senderIds.length) {
      setIncomingRequests([]);
      setRequestsLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from('social_profiles')
      .select('user_id, display_name, username')
      .in('user_id', senderIds);

    const profileMap = new Map<string, SocialProfile>(
      (profiles ?? []).map((profile: SocialProfile) => [profile.user_id, profile]),
    );

    setIncomingRequests(
      (requestRows ?? []).map((row: { id: string; sender_id: string; created_at: string }) => ({
        id: row.id,
        sender_id: row.sender_id,
        sender: profileMap.get(row.sender_id) ?? null,
        created_at: row.created_at,
      })),
    );
    setRequestsLoading(false);
  }, []);

  useEffect(() => {
    const requested = params.filter;
    if (requested === 'All' || requested === 'Unread') {
      setFilter(requested);
    }
  }, [params.filter]);

  useFocusEffect(
    useCallback(() => {
      loadFriends();
      loadIncomingRequests();
      loadChatTags();
    }, [loadFriends, loadIncomingRequests, loadChatTags]),
  );

  const loadSentStreakRecipients = useCallback(async () => {
    if (!flexMode || !streakMessage) {
      setSentStreakRecipients([]);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSentStreakRecipients([]);
      return;
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data: messageRows } = await supabase
      .from('chat_messages')
      .select('conversation_id')
      .eq('sender_id', user.id)
      .eq('body', streakMessage)
      .gte('created_at', startOfToday.toISOString())
      .is('deleted_at', null);

    const conversationIds = [
      ...new Set((messageRows ?? []).map((row: any) => row.conversation_id).filter(Boolean)),
    ];
    if (!conversationIds.length) {
      setSentStreakRecipients([]);
      return;
    }

    const { data: directConversations } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('type', 'direct')
      .in('id', conversationIds);

    const directIds = (directConversations ?? []).map((row: any) => row.id);
    if (!directIds.length) {
      setSentStreakRecipients([]);
      return;
    }

    const { data: memberRows } = await supabase
      .from('chat_conversation_members')
      .select('conversation_id, user_id')
      .in('conversation_id', directIds);

    const recipientIds = [
      ...new Set(
        (memberRows ?? [])
          .filter((row: any) => row.user_id && row.user_id !== user.id)
          .map((row: any) => row.user_id),
      ),
    ];
    setSentStreakRecipients(recipientIds);
  }, [flexMode, streakMessage]);

  useEffect(() => {
    if (!flexMode) {
      setSelectedRecipients([]);
      setSentStreakRecipients([]);
      setFlexSearch('');
      setFlexError(null);
      return;
    }
    setSelectedRecipients([]);
    setFlexError(null);
    void loadSentStreakRecipients();
  }, [flexMode, streakMessage, loadSentStreakRecipients]);

  const allChats = useMemo(() => [...userFriends], [userFriends]);

  const filteredChats = useMemo(() => {
    const lowered = query.toLowerCase().trim();
    const byName = allChats.filter(
      (chat) => chat.name.toLowerCase().includes(lowered) || chat.detail.toLowerCase().includes(lowered),
    );

    const existingProfileIds = new Set(allChats.map((chat) => chat.profileId).filter(Boolean));
    const peopleMatches = lowered
      ? searchableFriends.filter(
          (person) =>
            !existingProfileIds.has(person.profileId) &&
            (person.name.toLowerCase().includes(lowered) || person.detail.toLowerCase().includes(lowered)),
        )
      : [];

    const combinedByName = [...byName, ...peopleMatches];
    const byBaseFilter =
      filter === 'Unread' ? combinedByName.filter((chat) => !!chat.unread) : combinedByName;

    if (selectedTagIds.length === 0) return byBaseFilter;
    return byBaseFilter.filter((chat) => selectedTagIds.every((tagId) => isChatTagged(chat, tagId)));
  }, [allChats, searchableFriends, query, filter, selectedTagIds, chatTagAssignments]);

  const flexRecipients = useMemo(() => {
    const lowered = flexSearch.toLowerCase().trim();
    if (!lowered) return userFriends;
    return userFriends.filter(
      (friend) => friend.name.toLowerCase().includes(lowered) || friend.detail.toLowerCase().includes(lowered),
    );
  }, [userFriends, flexSearch]);

  const toggleFlexRecipient = (profileId: string) => {
    setFlexError(null);
    if (sentStreakRecipients.includes(profileId)) return;
    setSelectedRecipients((previous) =>
      previous.includes(profileId) ? previous.filter((id) => id !== profileId) : [...previous, profileId],
    );
  };

  const cancelFlexMode = () => {
    setSelectedRecipients([]);
    setFlexSearch('');
    setFlexError(null);

    router.setParams({
      shareStreak: 'false',
      flex: 'false',
      streak: '',
      habitTitle: '',
      habitName: '',
      frequency: '',
    } as never);

    const validFrequencies = ['daily', 'weekly', 'monthly', 'annually'];
    const returnFrequency = validFrequencies.includes(streakFrequency) ? streakFrequency : 'daily';
    const cameFromHabit =
      Boolean(habitTitle) &&
      (params.shareStreak === '1' || params.shareStreak === 'true' || typeof params.streak === 'string');

    if (cameFromHabit) {
      router.replace({
        pathname: '/(tabs)/habits',
        params: { frequency: returnFrequency },
      } as never);
      return;
    }
    router.replace('/(tabs)' as never);
  };

  const sendFlexMessage = async () => {
    if (flexSending || !selectedRecipients.length) return;
    if (!streakMessage) {
      setFlexError('you have a zero day streak.');
      return;
    }

    setFlexSending(true);
    setFlexError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setFlexError('You must be signed in to share your streak.');
        return;
      }

      let sendError: any = null;
      const successfullySentRecipientIds: string[] = [];

      for (const recipientId of selectedRecipients) {
        if (sentStreakRecipients.includes(recipientId)) continue;
        const { id: conversationId, error: conversationError } = await ensureDirectConversation(user.id, recipientId);
        if (conversationError || !conversationId) {
          sendError = conversationError || new Error('Could not open direct conversation.');
          break;
        }

        const result = await sendChatMessage(conversationId, user.id, streakMessage);
        if (result.error) {
          sendError = result.error;
          break;
        }
        successfullySentRecipientIds.push(recipientId);
      }

      if (successfullySentRecipientIds.length) {
        setSentStreakRecipients((previous) => [...new Set([...previous, ...successfullySentRecipientIds])]);
        setSelectedRecipients((previous) => previous.filter((id) => !successfullySentRecipientIds.includes(id)));
      }

      if (sendError) {
        setFlexError(sendError.message || 'Could not send your streak message.');
        return;
      }
      setFlexError(null);
    } catch {
      setFlexError('Could not send your streak message. Please try again.');
    } finally {
      setFlexSending(false);
    }
  };

  const searchUsers = async (text: string) => {
    setFriendQuery(text);
    const cleaned = text.trim().replace(/^@/, '').toLowerCase();
    if (!cleaned) {
      setFriendResults([]);
      setSentRequestIds([]);
      setExistingFriendIds([]);
      setFriendError(null);
      setFriendSearching(false);
      return;
    }

    setFriendSearching(true);
    setFriendError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setFriendResults([]);
        setFriendError('You must be signed in.');
        return;
      }

      const { data, error: searchError } = await supabase
        .from('social_profiles')
        .select('id, user_id, display_name, username')
        .ilike('username', `%${cleaned}%`)
        .neq('user_id', user.id)
        .limit(10);

      if (searchError) {
        setFriendResults([]);
        setFriendError(`Search error: ${searchError.message}`);
        return;
      }

      const profiles = (data ?? []) as SocialProfile[];
      setFriendResults(profiles);

      const resultIds = profiles.map((profile) => profile.user_id).filter(Boolean);
      if (resultIds.length) {
        const { data: friendshipRows } = await supabase
          .from('friendships')
          .select('user_id, friend_user_id')
          .or(`user_id.eq.${user.id},friend_user_id.eq.${user.id}`);

        const friendIds = (friendshipRows ?? [])
          .map((row: { user_id: string; friend_user_id: string }) =>
            row.user_id === user.id ? row.friend_user_id : row.user_id,
          )
          .filter((friendId: string) => resultIds.includes(friendId));

        setExistingFriendIds([...new Set(friendIds)]);

        const { data: pendingRows } = await supabase
          .from('friend_requests')
          .select('receiver_id')
          .eq('sender_id', user.id)
          .eq('status', 'pending')
          .in('receiver_id', resultIds);

        setSentRequestIds((pendingRows ?? []).map((row: { receiver_id: string }) => row.receiver_id).filter(Boolean));
      } else {
        setExistingFriendIds([]);
        setSentRequestIds([]);
      }
    } catch {
      setFriendResults([]);
      setFriendError('Something went wrong while searching.');
    } finally {
      setFriendSearching(false);
    }
  };

  const sendFriendRequest = async (friendUserId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setFriendError('You must be logged in.');
      return;
    }
    if (existingFriendIds.includes(friendUserId) || sentRequestIds.includes(friendUserId)) return;

    setSendingRequestId(friendUserId);
    setFriendError(null);

    const { error: requestError } = await supabase.from('friend_requests').insert({
      sender_id: user.id,
      receiver_id: friendUserId,
      status: 'pending',
    });

    if (requestError) {
      setFriendError(requestError.message || 'Could not send friend request.');
      setSendingRequestId(null);
      return;
    }

    setSentRequestIds((previous) => (previous.includes(friendUserId) ? previous : [...previous, friendUserId]));
    setSendingRequestId(null);
  };

  const acceptFriendRequest = async (request: IncomingRequest) => {
    setRequestActionId(request.id);
    setFriendError(null);
    const { error } = await supabase.rpc('accept_friend_request', { request_id: request.id });
    if (error) {
      setFriendError(`Could not accept friend request: ${error.message}`);
      setRequestActionId(null);
      return;
    }
    setIncomingRequests((previous) => previous.filter((item) => item.id !== request.id));
    await loadFriends();
    setRequestActionId(null);
  };

  const declineFriendRequest = async (request: IncomingRequest) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setRequestActionId(request.id);
    await supabase.from('friend_requests').update({ status: 'declined' }).eq('id', request.id).eq('receiver_id', user.id);
    setIncomingRequests((previous) => previous.filter((item) => item.id !== request.id));
    setRequestActionId(null);
  };

  const openChat = async (chat: ChatItem) => {
    if (flexMode) {
      if (chat.category !== 'direct' || !chat.profileId) return;
      toggleFlexRecipient(chat.profileId);
      return;
    }

    const sourceFilter = filter ?? 'All';
    if (chat.category === 'direct' && chat.profileId) {
      if (myUserId) {
        try {
          const directConversation = await ensureDirectConversation(myUserId, chat.profileId);
          if (directConversation.id) {
            const readNow = new Date().toISOString();
            setReadChatAt((previous) => ({ ...previous, [directConversation.id!]: readNow }));
            void markConversationRead(directConversation.id, myUserId);
          }
        } catch {}
      }
      router.push({
        pathname: `/chat/${chat.profileId}`,
        params: { from: sourceFilter },
      } as never);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (flexMode) cancelFlexMode();
            else router.push('/modules');
          }}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {flexMode ? 'SHARE STREAK' : 'CHATS'}
        </Text>
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.bellBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <MoreVertical color="#000000" size={22} strokeWidth={2.5} />
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuShade} onPress={() => setMenuOpen(false)}>
          <Pressable
            style={[styles.menuCard, { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderColor: '#000000' }]}
            onPress={(event) => event.stopPropagation()}
          >
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                router.push('/(tabs)/profile');
              }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: isDark ? '#FFFFFF' : '#000000' }]}>Settings</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Top Search & Filter Bar */}
      {!flexMode && (
        <View style={styles.frozenHeader}>
          {streakMessage ? (
            <View style={[styles.streakBanner, { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderColor: '#000000' }]}>
              <Text style={[styles.streakBannerText, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                Sharing streak: {habitTitle} ({streakCount} {streakUnit})
              </Text>
            </View>
          ) : null}

          <View style={styles.searchRow}>
            <View style={styles.searchWrapper}>
              <View style={styles.searchShadowBackdrop} />
              <View style={[styles.search, { backgroundColor: '#FFFFFF' }]}>
                <Search color="#52525B" size={18} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search conversations..."
                  placeholderTextColor="#71717A"
                  style={[styles.searchInput, { color: '#000000' }]}
                />
                {query.length > 0 ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <X color="#000000" size={16} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Pressable
              onPress={() => {
                setFriendSearchOpen(true);
                setFriendQuery('');
                setFriendResults([]);
                setFriendError(null);
              }}
              style={({ pressed }) => [
                styles.addFriendBtn,
                { backgroundColor: '#FFFFFF', borderColor: '#000000' },
                pressed && styles.pressedBtn,
              ]}
              hitSlop={8}
            >
              <UserPlus color="#000000" size={20} />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {filters.map((item) => {
              const isSelected = filter === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setFilter((previous) => (previous === item ? null : item))}
                  style={({ pressed }) => [
                    styles.filter,
                    {
                      backgroundColor: isSelected ? pageBg : isDark ? '#121212' : '#FFFFFF',
                      borderColor: '#000000',
                    },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={[styles.filterText, { color: isSelected ? '#000000' : isDark ? '#FFFFFF' : '#000000' }]}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}

            {chatTags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              return (
                <Pressable
                  key={tag.id}
                  onPress={() => toggleTagFilter(tag.id)}
                  onLongPress={() => handleTagLongPress(tag)}
                  style={({ pressed }) => [
                    styles.filter,
                    {
                      backgroundColor: selected ? pageBg : isDark ? '#121212' : '#FFFFFF',
                      borderColor: '#000000',
                    },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text
                    style={[styles.filterText, { color: selected ? '#000000' : isDark ? '#FFFFFF' : '#000000' }]}
                    numberOfLines={1}
                  >
                    {tag.name}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              onPress={openAddTag}
              style={({ pressed }) => [
                styles.filter,
                styles.addTagFilter,
                { borderColor: '#000000', backgroundColor: isDark ? '#121212' : '#FFFFFF' },
                pressed && styles.pressedBtn,
              ]}
            >
              <Plus color={isDark ? '#FFFFFF' : '#000000'} size={14} strokeWidth={2.5} />
              <Text style={[styles.filterText, { color: isDark ? '#FFFFFF' : '#000000' }]}>Add tag</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      {flexMode && (
        <View style={styles.flexHeader}>
          {streakMessage ? (
            <View style={[styles.streakPreview, { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderColor: '#000000' }]}>
              <Text style={[styles.streakPreviewLabel, { color: isDark ? '#A1A1AA' : '#52525B' }]}>MESSAGE</Text>
              <Text style={[styles.streakPreviewText, { color: isDark ? '#FFFFFF' : '#000000' }]}>{streakMessage}</Text>
            </View>
          ) : null}

          <View style={styles.searchWrapper}>
            <View style={styles.searchShadowBackdrop} />
            <View style={[styles.search, { backgroundColor: '#FFFFFF' }]}>
              <Search color="#52525B" size={18} />
              <TextInput
                value={flexSearch}
                onChangeText={setFlexSearch}
                placeholder="Search people..."
                placeholderTextColor="#71717A"
                style={[styles.searchInput, { color: '#000000' }]}
              />
              {flexSearch.length > 0 ? (
                <Pressable onPress={() => setFlexSearch('')} hitSlop={8}>
                  <X color="#000000" size={16} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <Text style={[styles.selectionCount, { color: isDark ? '#FFFFFF' : '#000000' }]}>
            {selectedRecipients.length} selected
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.chatScrollContent, flexMode && styles.flexContent]} showsVerticalScrollIndicator={false}>
        {flexMode ? (
          <>
            {flexError ? <Text style={styles.flexError}>{flexError}</Text> : null}
            {flexRecipients.length > 0 ? (
              <View style={styles.cardContainer}>
                <View style={styles.cardShadowBackdrop} />
                <View style={[styles.list, { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderColor: '#000000' }]}>
                  {flexRecipients.map((friend, i) => {
                    const isSent = !!friend.profileId && sentStreakRecipients.includes(friend.profileId);
                    const selected = !!friend.profileId && (selectedRecipients.includes(friend.profileId) || isSent);
                    return (
                      <Pressable
                        key={friend.id}
                        disabled={isSent}
                        onPress={() => friend.profileId && toggleFlexRecipient(friend.profileId)}
                        style={({ pressed }) => [
                          styles.row,
                          i < flexRecipients.length - 1 && [styles.rowBorder, { borderBottomColor: isDark ? '#27272A' : '#E4E4E7' }],
                          pressed && !isSent && styles.pressed,
                        ]}
                      >
                        {friend.sidekickId ? (
                          <View style={[styles.avatar, styles.sidekickAvatarContainer]}>
                            <SidekickAvatar sidekickId={friend.sidekickId} size={38} />
                          </View>
                        ) : (
                          <View style={[styles.avatar, { backgroundColor: pageBg }]}>
                            <Text style={[styles.avatarText, { color: '#000000' }]}>{friend.icon}</Text>
                          </View>
                        )}
                        <View style={styles.rowCopy}>
                          <Text style={[styles.rowTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>{friend.name}</Text>
                          <Text style={[styles.rowUrl, { color: isDark ? '#A1A1AA' : '#52525B' }]} numberOfLines={1}>
                            {friend.detail}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          {isSent ? <Text style={[styles.flexSentLabel, { color: isDark ? '#A1A1AA' : '#52525B' }]}>Sent</Text> : null}
                          <View
                            style={[
                              styles.selectionCircle,
                              { borderColor: '#000000', backgroundColor: selected ? pageBg : '#FFFFFF' },
                            ]}
                          >
                            {selected ? <Check color="#000000" size={14} strokeWidth={3} /> : null}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
                  {userFriends.length === 0 ? 'You do not have any friends to share with yet.' : 'No people match your search.'}
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            {incomingRequests.length > 0 && (
              <View style={styles.cardContainer}>
                <View style={styles.cardShadowBackdrop} />
                <View style={[styles.list, { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderColor: '#000000', paddingVertical: 12 }]}>
                  <View style={styles.requestsHeader}>
                    <Text style={[styles.requestsTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>FRIEND REQUESTS</Text>
                    <View style={[styles.requestCount, { backgroundColor: pageBg }]}>
                      <Text style={styles.requestCountText}>{incomingRequests.length}</Text>
                    </View>
                  </View>
                  {incomingRequests.map((request, i) => (
                    <View
                      key={request.id}
                      style={[
                        styles.row,
                        i < incomingRequests.length - 1 && [styles.rowBorder, { borderBottomColor: isDark ? '#27272A' : '#E4E4E7' }],
                      ]}
                    >
                      <View style={[styles.avatar, { backgroundColor: pageBg }]}>
                        <Text style={[styles.avatarText, { color: '#000000' }]}>
                          {(request.sender?.display_name || '?').slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={[styles.rowTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                          {request.sender?.display_name || 'Unknown user'}
                        </Text>
                        <Text style={[styles.rowUrl, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
                          @{request.sender?.username || 'unknown'}
                        </Text>
                      </View>
                      <View style={styles.requestButtons}>
                        <Pressable
                          disabled={requestActionId === request.id}
                          onPress={() => acceptFriendRequest(request)}
                          style={[styles.acceptBtn, { backgroundColor: '#000000', borderColor: pageBg }]}
                        >
                          {requestActionId === request.id ? (
                            <ActivityIndicator size="small" color={pageBg} />
                          ) : (
                            <Check color={pageBg} size={15} />
                          )}
                        </Pressable>
                        <Pressable
                          disabled={requestActionId === request.id}
                          onPress={() => declineFriendRequest(request)}
                          style={[styles.declineBtn, { backgroundColor: isDark ? '#27272A' : '#F4F4F5', borderColor: '#000000' }]}
                        >
                          <X color={isDark ? '#FFFFFF' : '#000000'} size={15} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {filteredChats.length > 0 ? (
              <View style={styles.cardContainer}>
                <View style={styles.cardShadowBackdrop} />
                <View style={[styles.list, { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderColor: '#000000' }]}>
                  {filteredChats.map((chat, i) => (
                    <Pressable
                      key={chat.id}
                      onPress={() => openChat(chat)}
                      style={({ pressed }) => [
                        styles.row,
                        i < filteredChats.length - 1 && [styles.rowBorder, { borderBottomColor: isDark ? '#27272A' : '#E4E4E7' }],
                        pressed && styles.pressed,
                      ]}
                    >
                      {chat.category === 'direct' && chat.sidekickId ? (
                        <View style={[styles.avatar, styles.sidekickAvatarContainer]}>
                          <SidekickAvatar sidekickId={chat.sidekickId} size={38} />
                        </View>
                      ) : (
                        <View style={[styles.avatar, { backgroundColor: pageBg }]}>
                          <Text style={[styles.avatarText, { color: '#000000' }]}>{chat.icon}</Text>
                        </View>
                      )}
                      <View style={styles.rowCopy}>
                        <Text style={[styles.rowTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>{chat.name}</Text>
                        <Text style={[styles.rowUrl, { color: isDark ? '#A1A1AA' : '#52525B' }]} numberOfLines={1}>
                          {chat.detail}
                        </Text>
                      </View>
                      <View style={styles.chatMeta}>
                        <Text style={[styles.time, { color: isDark ? '#A1A1AA' : '#52525B' }]}>{chat.time}</Text>
                        {chat.unread ? (
                          <View style={[styles.unread, { backgroundColor: pageBg }]}>
                            <Text style={styles.unreadText}>{chat.unread}</Text>
                          </View>
                        ) : chat.time && chat.lastMessageSenderId === myUserId && chat.lastMessageRead ? (
                          <CheckCheck color={isDark ? '#A1A1AA' : '#52525B'} size={15} strokeWidth={2.2} />
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {requestsLoading && incomingRequests.length === 0 && (
              <View style={styles.requestLoading}>
                <ActivityIndicator size="small" color={isDark ? '#FFFFFF' : '#000000'} />
              </View>
            )}

            {filteredChats.length === 0 && !requestsLoading && (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
                  {userFriends.length === 0 && !query.trim() && filter === 'All'
                    ? 'No friends added yet. Click + to add friends and start chatting.'
                    : 'No conversations match your filters.'}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {flexMode ? (
        <View style={[styles.flexBottomBar, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderTopColor: '#000000' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.flexBottomTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
              {selectedRecipients.length === 0
                ? 'Select people'
                : `${selectedRecipients.length} ${selectedRecipients.length === 1 ? 'person' : 'people'} selected`}
            </Text>
            <Text style={[styles.flexBottomSubtitle, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
              Your streak will be shared with everyone you select.
            </Text>
          </View>
          <Pressable
            disabled={flexSending || selectedRecipients.length === 0}
            onPress={sendFlexMessage}
            style={({ pressed }) => [
              styles.flexSendButton,
              { backgroundColor: '#000000', borderWidth: 2, borderColor: pageBg },
              (flexSending || selectedRecipients.length === 0) && { opacity: 0.45 },
              pressed && styles.pressedBtn,
            ]}
          >
            {flexSending ? (
              <ActivityIndicator color={pageBg} size="small" />
            ) : (
              <>
                <Send color={pageBg} size={17} />
                <Text style={[styles.flexSendText, { color: pageBg }]}>Send</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* Add Tag Modal */}
      <Modal visible={showAddTagModal} transparent animationType="fade" onRequestClose={() => setShowAddTagModal(false)}>
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setShowAddTagModal(false)}>
          <Pressable
            style={[styles.centeredModalCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: pageBg }]}>{editingTagId ? 'Edit tag' : 'Add tag'}</Text>
              <Pressable onPress={() => setShowAddTagModal(false)} hitSlop={12}>
                <X color={isDark ? '#FFFFFF' : '#000000'} size={21} strokeWidth={2.5} />
              </Pressable>
            </View>

            <View style={[styles.search, { backgroundColor: '#FFFFFF', marginBottom: 8 }]}>
              <TextInput
                value={newTagName}
                onChangeText={(text) => {
                  setNewTagName(text.slice(0, 20));
                  if (addTagError) setAddTagError(null);
                }}
                placeholder="Tag name"
                placeholderTextColor="#71717A"
                style={[styles.searchInput, { color: '#000000' }]}
                maxLength={20}
                autoFocus
                onSubmitEditing={createChatTag}
              />
              {newTagName.length > 0 ? (
                <Pressable onPress={() => setNewTagName('')} hitSlop={8}>
                  <X color="#000000" size={16} />
                </Pressable>
              ) : null}
            </View>

            <Text style={[styles.tagCharacterCount, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
              {newTagName.length}/20
            </Text>

            {addTagError ? <Text style={styles.errorText}>{addTagError}</Text> : null}

            <Pressable
              onPress={createChatTag}
              disabled={addingTag || !newTagName.trim()}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: '#000000', borderWidth: 2, borderColor: pageBg, marginTop: 16 },
                (addingTag || !newTagName.trim()) && { opacity: 0.5 },
                pressed && styles.pressedBtn,
              ]}
            >
              {addingTag ? (
                <ActivityIndicator color={pageBg} />
              ) : (
                <Text style={[styles.saveText, { color: pageBg }]}>{editingTagId ? 'Save changes' : 'Add tag'}</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Friend Modal */}
      <Modal visible={friendSearchOpen} transparent animationType="fade" onRequestClose={() => setFriendSearchOpen(false)}>
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setFriendSearchOpen(false)}>
          <Pressable
            style={[styles.centeredModalCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: pageBg }]}>Find friends</Text>
              <Pressable onPress={() => setFriendSearchOpen(false)} hitSlop={12}>
                <X color={isDark ? '#FFFFFF' : '#000000'} size={21} strokeWidth={2.5} />
              </Pressable>
            </View>

            <View style={[styles.search, { backgroundColor: '#FFFFFF', marginBottom: 12 }]}>
              <Search color="#52525B" size={18} />
              <TextInput
                value={friendQuery}
                onChangeText={searchUsers}
                placeholder="Search by username..."
                placeholderTextColor="#71717A"
                style={[styles.searchInput, { color: '#000000' }]}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {friendQuery.length > 0 ? (
                <Pressable onPress={() => searchUsers('')} hitSlop={8}>
                  <X color="#000000" size={16} />
                </Pressable>
              ) : null}
            </View>

            {friendError ? <Text style={styles.errorText}>{friendError}</Text> : null}
            {friendSearching ? <ActivityIndicator color={pageBg} style={{ marginTop: 20 }} /> : null}

            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {friendResults.map((profile, i) => {
                const isFriend = existingFriendIds.includes(profile.user_id);
                const isRequested = sentRequestIds.includes(profile.user_id);
                const isSending = sendingRequestId === profile.user_id;
                return (
                  <View
                    key={profile.user_id}
                    style={[
                      styles.row,
                      i < friendResults.length - 1 && [styles.rowBorder, { borderBottomColor: isDark ? '#27272A' : '#E4E4E7' }],
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: pageBg }]}>
                      <Text style={[styles.avatarText, { color: '#000000' }]}>
                        {(profile.display_name || '?').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={[styles.rowTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>{profile.display_name}</Text>
                      <Text style={[styles.rowUrl, { color: isDark ? '#A1A1AA' : '#52525B' }]}>@{profile.username}</Text>
                    </View>
                    <Pressable
                      disabled={isSending || isFriend || isRequested}
                      onPress={() => sendFriendRequest(profile.user_id)}
                      style={({ pressed }) => [
                        styles.sendFriendBtn,
                        { backgroundColor: '#000000', borderWidth: 2, borderColor: pageBg },
                        (isFriend || isRequested) && { opacity: 0.6 },
                        pressed && styles.pressedBtn,
                      ]}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color={pageBg} />
                      ) : isFriend ? (
                        <Text style={[styles.sendFriendText, { color: pageBg }]}>Friends</Text>
                      ) : isRequested ? (
                        <Text style={[styles.sendFriendText, { color: pageBg }]}>Sent</Text>
                      ) : (
                        <Text style={[styles.sendFriendText, { color: pageBg }]}>Add</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function formatChatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pressedBtn: { transform: [{ translateX: 2 }, { translateY: 2 }] },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    zIndex: 100,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  headerTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 20, letterSpacing: 1, color: '#000000', textAlign: 'center', flex: 1 },
  bellBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  menuShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'flex-end', paddingTop: 64, paddingRight: 20 },
  menuCard: { borderRadius: 12, borderWidth: 3, paddingVertical: 6, minWidth: 150 },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16 },
  menuItemText: { fontFamily: 'Poppins-Bold', fontSize: 14 },

  frozenHeader: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 6 },
  flexHeader: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10 },

  streakBanner: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  streakBannerText: { fontFamily: 'Poppins-Bold', fontSize: 12, textAlign: 'center' },

  streakPreview: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  streakPreviewLabel: { fontFamily: 'Poppins-ExtraBold', fontSize: 9, letterSpacing: 1.2, marginBottom: 4 },
  streakPreviewText: { fontFamily: 'Poppins-SemiBold', fontSize: 13, lineHeight: 18 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchWrapper: { position: 'relative', flex: 1 },
  searchShadowBackdrop: { position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 },
  search: { height: 48, borderRadius: 12, borderWidth: 2, borderColor: '#000000', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, zIndex: 2 },
  searchInput: { flex: 1, fontFamily: 'Poppins-Medium', fontSize: 14 },

  addFriendBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  filters: { gap: 12, paddingVertical: 12, paddingLeft: 4 },
  filter: { paddingHorizontal: 16, height: 36, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  filterText: { fontFamily: 'Poppins-Bold', fontSize: 12 },
  addTagFilter: { flexDirection: 'row', gap: 5, paddingHorizontal: 12 },
  chatScrollContent: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 90 },
  flexContent: { paddingBottom: 130 },

  cardContainer: { position: 'relative', width: '100%', marginBottom: 14 },
  cardShadowBackdrop: { position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 },
  list: { borderRadius: 16, borderWidth: 3, paddingHorizontal: 14 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 2 },
  pressed: { opacity: 0.7 },

  avatar: { width: 42, height: 42, borderRadius: 12, borderWidth: 2, borderColor: '#000000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sidekickAvatarContainer: { backgroundColor: '#FFFFFF', padding: 4 },
  avatarText: { fontFamily: 'Poppins-ExtraBold', fontSize: 16 },

  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 15 },
  rowUrl: { fontFamily: 'Poppins-Medium', fontSize: 12 },

  chatMeta: { height: 38, justifyContent: 'space-between', alignItems: 'flex-end' },
  time: { fontFamily: 'Poppins-Medium', fontSize: 10 },
  unread: { minWidth: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  unreadText: { fontFamily: 'Poppins-ExtraBold', fontSize: 10, color: '#000000' },

  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontFamily: 'Poppins-Medium', fontSize: 13, textAlign: 'center' },

  requestsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 },
  requestsTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 12, letterSpacing: 0.5 },
  requestCount: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1.5, borderColor: '#000000' },
  requestCountText: { fontFamily: 'Poppins-ExtraBold', fontSize: 11, color: '#000000' },
  requestButtons: { flexDirection: 'row', gap: 6 },
  acceptBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  declineBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  requestLoading: { paddingVertical: 20, alignItems: 'center' },

  selectionCircle: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  flexSentLabel: { fontFamily: 'Poppins-Bold', fontSize: 12 },
  selectionCount: { fontFamily: 'Poppins-Bold', fontSize: 12, marginTop: 8 },
  flexError: { fontFamily: 'Poppins-Bold', fontSize: 12, color: '#EF4444', marginBottom: 10 },

  flexBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  flexBottomTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 13 },
  flexBottomSubtitle: { fontFamily: 'Poppins-Medium', fontSize: 10, marginTop: 2 },
  flexSendButton: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  flexSendText: { fontFamily: 'Poppins-ExtraBold', fontSize: 14 },

  centeredModalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 20 },
  centeredModalCard: { width: '100%', maxWidth: 400, borderRadius: 24, borderWidth: 3, borderColor: '#000000', paddingTop: 22, paddingBottom: 26, paddingHorizontal: 22, shadowColor: '#000000', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0, elevation: 8 },
  modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 20, flex: 1, marginRight: 12 },

  tagCharacterCount: { fontFamily: 'Poppins-Medium', fontSize: 11, textAlign: 'right', marginBottom: 8 },
  errorText: { fontFamily: 'Poppins-Bold', fontSize: 12, color: '#EF4444', marginTop: 4 },
  saveButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { fontFamily: 'Poppins-ExtraBold', fontSize: 15, letterSpacing: 0.5 },

  sendFriendBtn: { paddingHorizontal: 14, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sendFriendText: { fontFamily: 'Poppins-ExtraBold', fontSize: 12 },
});
