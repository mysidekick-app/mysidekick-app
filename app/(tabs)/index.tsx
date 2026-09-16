import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,

  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  Check,
  CheckCheck,
  Plus,
  Search,
  Send,
  UserPlus,
  X,
} from 'lucide-react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useLocalSearchParams,
  useFocusEffect,
  router,
} from 'expo-router';

import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

import { useApp } from '@/components/AppProvider';
import SidekickAvatar from '@/components/SidekickAvatar';
import { supabase } from '@/lib/supabase';
import {
  ensureDirectConversation,
  ensureGroupConversation,
  getChatClearedAt,
  getConversationReadMap,
  getDeletedMessageIds,
  markConversationRead,
  sendChatMessage,
} from './chat/chatHelpers';

/* =========================================================
   TYPES
========================================================= */

type ChatItem = {
  id: string;
  name: string;
  detail: string;
  time: string;
  unread?: number;
  lastMessageSenderId?: string;
  lastMessageRead?: boolean;
  lastMessageAt?: string;
  category: 'system' | 'groups' | 'direct';
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

type IncomingGroupInvite = {
  id: string;
  group_id: string;
  group_name: string;
  inviter_id: string;
  inviter_name: string;
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

/* =========================================================
   SYSTEM CHAT
========================================================= */

const SIDEKICK_GREETING =
  "Hi! I'm your Sidekick. I'm here to help you improve your life, one atomic habit at a time!";

const SYSTEM_CHATS: ChatItem[] = [
  {
    id: 'sys-sidekick',
    name: 'Sidekick',
    detail: SIDEKICK_GREETING,
    time: '',
    category: 'system',
    icon: 'S',
    route: '/chat/sidekick',
  },
];

const filters = [
  'All',
  'Unread',
] as const;

type FilterKey = (typeof filters)[number];

/* =========================================================
   SCREEN
========================================================= */

export default function ChatScreen() {
  const appContext = useApp() as any;

  const {
    accentForeground,
    isDark,
  } = appContext;

  const isBlackDark =
    isDark && appContext.accent_family === 'black';

  /* =======================================================
     HABIT FLEX PARAMETERS

     Habits opens:

     /chat?shareStreak=true&streak=7&habitName=Morning%20Workout

     This puts the chat screen into recipient-selection
     mode instead of opening one person's conversation.
  ======================================================= */

  const params = useLocalSearchParams<{
    flex?: string;
    shareStreak?: string;
    streak?: string;
    habitTitle?: string;
    habitName?: string;
    filter?: string;
  }>();

  const flexMode =
    params.shareStreak === '1' ||
    params.shareStreak === 'true';

  const streakCount =
    Number(params.streak ?? 0);

  const habitTitle =
    typeof params.habitTitle === 'string'
      ? params.habitTitle
      : typeof params.habitName === 'string'
        ? params.habitName
        : '';

  const streakMessage =
    streakCount > 0 && habitTitle
      ? `I just hit my ${streakCount} day streak in ${habitTitle}.`
      : '';

  /* =======================================================
     NORMAL CHAT STATE
  ======================================================= */

  const [query, setQuery] =
    useState('');

  const [filter, setFilter] =
    useState<FilterKey | null>('All');

  const [chatTags, setChatTags] =
    useState<ChatTag[]>([]);

  const [chatTagAssignments, setChatTagAssignments] =
    useState<ChatTagAssignment[]>([]);

  const [selectedTagIds, setSelectedTagIds] =
    useState<string[]>([]);

  const [showAddTagModal, setShowAddTagModal] =
    useState(false);

  const [newTagName, setNewTagName] =
    useState('');

  const [editingTagId, setEditingTagId] =
    useState<string | null>(null);

  const [addTagError, setAddTagError] =
    useState<string | null>(null);

  const [addingTag, setAddingTag] =
    useState(false);

  const [tagChat, setTagChat] =
    useState<ChatItem | null>(null);

  const [tagModalError, setTagModalError] =
    useState<string | null>(null);

  // Read state is kept for the current app session. Opening a chat marks it read.
  const [readChatAt, setReadChatAt] = useState<Record<string, string>>({});
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [userFriends, setUserFriends] =
    useState<ChatItem[]>([]);

  const [searchableFriends, setSearchableFriends] =
    useState<ChatItem[]>([]);

  const [userGroups, setUserGroups] =
    useState<ChatItem[]>([]);

  const [groupsLoading, setGroupsLoading] =
    useState(false);

  const [sidekickPreview, setSidekickPreview] =
    useState<{
      content: string;
      time: string;
    } | null>(null);

  const [sidekickUnreadCount, setSidekickUnreadCount] =
    useState(0);

  /* =======================================================
     FLEX RECIPIENT SELECTION
  ======================================================= */

  const [selectedRecipients, setSelectedRecipients] =
    useState<string[]>([]);

  const [flexSearch, setFlexSearch] =
    useState('');

  const [flexSending, setFlexSending] =
    useState(false);

  const [flexError, setFlexError] =
    useState<string | null>(null);

  // Existing chat messages determine who already received this
  // exact streak message today. No new table is required.
  const [sentStreakRecipients, setSentStreakRecipients] =
    useState<string[]>([]);

  /* =======================================================
     ADD FRIEND
  ======================================================= */

  const [friendSearchOpen, setFriendSearchOpen] =
    useState(false);

  const [friendQuery, setFriendQuery] =
    useState('');

  const [friendResults, setFriendResults] =
    useState<SocialProfile[]>([]);

  const [friendSearching, setFriendSearching] =
    useState(false);

  const [friendError, setFriendError] =
    useState<string | null>(null);

  const [sendingRequestId, setSendingRequestId] =
    useState<string | null>(null);

  // Users who already have an outgoing pending request.
  // Keep the search result visible so the button can change to "Sent".
  const [sentRequestIds, setSentRequestIds] =
    useState<string[]>([]);

  // Users who are already friends with the current user.
  // Their search result stays visible and the button shows "Friends".
  const [existingFriendIds, setExistingFriendIds] =
    useState<string[]>([]);

  /* =======================================================
     CREATE GROUP
  ======================================================= */

  const [createGroupOpen, setCreateGroupOpen] =
    useState(false);

  const [newGroupName, setNewGroupName] =
    useState('');

  const [newGroupDescription, setNewGroupDescription] =
    useState('');

  const [creatingGroup, setCreatingGroup] =
    useState(false);

  const [createGroupError, setCreateGroupError] =
    useState<string | null>(null);

  /* =======================================================
     INCOMING REQUESTS
  ======================================================= */

  const [incomingRequests, setIncomingRequests] =
    useState<IncomingRequest[]>([]);

  const [requestsLoading, setRequestsLoading] =
    useState(true);

  const [requestActionId, setRequestActionId] =
    useState<string | null>(null);

  /* =======================================================
     GROUP INVITES
  ======================================================= */

  const [incomingGroupInvites, setIncomingGroupInvites] =
    useState<IncomingGroupInvite[]>([]);

  const [groupInviteActionId, setGroupInviteActionId] =
    useState<string | null>(null);

  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => setMyUserId(user?.id ?? null)); }, []);

  /* =========================================================
     LOAD FRIENDS
  ========================================================= */

  const loadFriends = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserFriends([]);
      return;
    }

    const {
      data: friendshipRows,
      error: friendshipError,
    } = await supabase
      .from('friendships')
      .select('user_id, friend_user_id')
      .or(`user_id.eq.${user.id},friend_user_id.eq.${user.id}`);

    if (friendshipError) {
      console.error(
        'LOAD FRIENDSHIPS ERROR:',
        friendshipError,
      );

      setUserFriends([]);
      return;
    }

    const friendIds: string[] = [
      ...new Set<string>(
        (friendshipRows ?? []).map(
          (row: { user_id: string; friend_user_id: string }) =>
            row.user_id === user.id ? row.friend_user_id : row.user_id,
        ),
      ),
    ];

    if (!friendIds.length) {
      setUserFriends([]);
      return;
    }

    const {
      data: profiles,
      error: profileError,
    } = await supabase
      .from('social_profiles')
      .select('*')
      .in('user_id', friendIds);

    if (profileError) {
      console.error(
        'LOAD FRIEND PROFILES ERROR:',
        profileError,
      );

      setUserFriends([]);
      return;
    }

    const {
      data: sidekickProfiles,
      error: sidekickProfileError,
    } = await supabase
      .from('profiles')
      .select('user_id, sidekick_id')
      .in('user_id', friendIds);

    if (sidekickProfileError) {
      console.warn(
        'LOAD FRIEND SIDEKICKS ERROR:',
        sidekickProfileError,
      );
    }

    const sidekickByUserId = new Map<string, string | null>(
      (sidekickProfiles ?? []).map((row: any) => [
        row.user_id,
        row.sidekick_id ?? null,
      ]),
    );

    const conversationByFriend = new Map<string, string>();
    const friendHasAnyConversation = new Set<string>();

    const { data: myMembershipRows, error: membershipLoadError } = await supabase
      .from('chat_conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (membershipLoadError) {
      console.error('LOAD CHAT MEMBERSHIPS ERROR:', membershipLoadError);
    } else {
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
    }

    /*
     * A deleted direct chat removes only the current user's membership.
     * The other participant still has membership, so look for old direct
     * conversations belonging to our friends as well. We only restore one
     * when there is a message newer than this user's local chat-clear time.
     *
     * This gives us:
     *   - new friend with no chat -> visible
     *   - deleted chat with no new message -> hidden
     *   - deleted chat with a new incoming message -> restored and visible
     */
    const { data: friendMembershipRows, error: friendMembershipError } = await supabase
      .from('chat_conversation_members')
      .select('conversation_id, user_id')
      .in('user_id', friendIds);

    if (friendMembershipError) {
      console.warn('LOAD FRIEND CHAT MEMBERSHIPS ERROR:', friendMembershipError);
    }

    const historicalFriendMemberships = (friendMembershipRows ?? []).filter(
      (row: any) => row.conversation_id && row.user_id && friendIds.includes(row.user_id),
    );

    historicalFriendMemberships.forEach((row: any) => {
      friendHasAnyConversation.add(row.user_id);
    });

    const historicalConversationIds = [
      ...new Set(
        historicalFriendMemberships
          .map((row: any) => row.conversation_id)
          .filter(Boolean),
      ),
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
      historicalClearRows.filter(
        (row): row is readonly [string, string] => Boolean(row[1]),
      ),
    );

    const candidateHistoricalIds = historicalDirectIds.filter(
      (conversationId) => historicalClearAtByConversation.has(conversationId),
    );

    if (candidateHistoricalIds.length) {
      const { data: historicalMessages, error: historicalMessageError } = await supabase
        .from('chat_messages')
        .select('id, conversation_id, sender_id, body, created_at')
        .in('conversation_id', candidateHistoricalIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (historicalMessageError) {
        console.warn('LOAD DELETED CHAT MESSAGES ERROR:', historicalMessageError);
      } else {
        const friendByConversation = new Map<string, string>();
        historicalFriendMemberships.forEach((row: any) => {
          if (!friendByConversation.has(row.conversation_id)) {
            friendByConversation.set(row.conversation_id, row.user_id);
          }
        });

        const restoredFriendIds = new Set<string>();

        for (const message of historicalMessages ?? []) {
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

          const { error: restoreMembershipError } = await supabase
            .from('chat_conversation_members')
            .insert({
              conversation_id: message.conversation_id,
              user_id: user.id,
            });

          if (restoreMembershipError && restoreMembershipError.code !== '23505') {
            console.warn(
              'RESTORE DELETED CHAT MEMBERSHIP ERROR:',
              restoreMembershipError,
            );
            continue;
          }

          conversationByFriend.set(friendId, message.conversation_id);
          restoredFriendIds.add(friendId);
        }
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

    // Always reload the persisted read positions from Supabase.
    // This prevents unread badges from returning after an app refresh/reload.
    const readRows = directConversationIds.length
      ? await getConversationReadMap(user.id, directConversationIds)
      : new Map<string, string>();

    // Keep the local UI state synchronized with the database so the
    // unread calculation has the same source of truth after refresh.
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

    const directMessageIds = (messageRows ?? [])
      .map((row: any) => row.id)
      .filter(Boolean);

    const { ids: deletedDirectMessageIds } =
      await getDeletedMessageIds(
        directMessageIds,
        user.id,
      );

    const clearRows = await Promise.all(
      directConversationIds.map(async (conversationId) => [
        conversationId,
        await getChatClearedAt(user.id, conversationId),
      ] as const),
    );
    const clearAtByConversation = new Map<string, string>(clearRows.filter((row): row is readonly [string, string] => Boolean(row[1])));

    const messagesByConversation = new Map<string, any[]>();
    (messageRows ?? []).forEach((row: any) => {
      if (deletedDirectMessageIds.has(row.id)) {
        return;
      }

      const clearAt = clearAtByConversation.get(row.conversation_id);
      if (clearAt && new Date(row.created_at).getTime() <= new Date(clearAt).getTime()) {
        return;
      }
      const list = messagesByConversation.get(row.conversation_id) ?? [];
      list.push(row);
      messagesByConversation.set(row.conversation_id, list);
    });

    const getDirectRows = (friendId: string) => {
      const conversationId = conversationByFriend.get(friendId);
      return conversationId ? (messagesByConversation.get(conversationId) ?? []) : [];
    };

    const friendsList: ChatItem[] =
      (profiles ?? []).filter(
        (profile: SocialProfile) =>
          conversationByFriend.has(profile.user_id) ||
          !friendHasAnyConversation.has(profile.user_id),
      ).map(
        (profile: SocialProfile) => ({
          id: profile.user_id,
          name: profile.display_name,
          detail: (() => {
            const last = getDirectRows(profile.user_id)[0];
            return last?.body?.trim() || (profile.title || profile.tag || profile.profile_title || `@${profile.username}`);
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
            const lastRead = (conversationId ? readRows.get(conversationId) : undefined) ?? readChatAt[conversationId ?? ''];
            return rows.filter((row: any) => row.sender_id !== user.id && (!lastRead || row.created_at > lastRead)).length;
          })(),
          category: 'direct',
          icon: (
            profile.display_name || '?'
          )
            .slice(0, 1)
            .toUpperCase(),
          profileId: profile.user_id,
          sidekickId:
            sidekickByUserId.get(profile.user_id) ?? null,
        }),
      );

    friendsList.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    setUserFriends(friendsList);
  }, [readChatAt]);

  /* =========================================================
     LOAD GROUPS
  ========================================================= */

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserGroups([]);
      setGroupsLoading(false);
      return;
    }

    const {
      data: memberRows,
      error: memberError,
    } = await supabase
      .from('chat_group_members')
      .select('group_id, role')
      .eq('user_id', user.id);

    if (memberError) {
      console.error(
        'LOAD GROUP MEMBERSHIPS ERROR:',
        memberError,
      );

      setUserGroups([]);
      setGroupsLoading(false);
      return;
    }

    const groupIds =
      (memberRows ?? []).map(
        (row: {
          group_id: string;
        }) => row.group_id,
      );

    if (!groupIds.length) {
      setUserGroups([]);
      setGroupsLoading(false);
      return;
    }

    const roleByGroupId = new Map(
      (memberRows ?? []).map(
        (row: {
          group_id: string;
          role: string;
        }) => [
          row.group_id,
          row.role,
        ],
      ),
    );

    const {
      data: groupRows,
      error: groupError,
    } = await supabase
      .from('chat_groups')
      .select('id, name, description, created_at')
      .in('id', groupIds)
      .order(
        'created_at',
        {
          ascending: false,
        },
      );

    if (groupError) {
      console.error(
        'LOAD GROUPS ERROR:',
        groupError,
      );

      setUserGroups([]);
      setGroupsLoading(false);
      return;
    }

    // Groups use a channel conversation. A group id is NOT a conversation id.
    const { data: channelRows } = await supabase
      .from('chat_channels')
      .select('id, group_id')
      .in('group_id', groupIds)
      .order('is_default', { ascending: false })
      .order('position', { ascending: true });

    const channelByGroup = new Map<string, string>();
    (channelRows ?? []).forEach((row: any) => {
      if (!channelByGroup.has(row.group_id)) channelByGroup.set(row.group_id, row.id);
    });

    const channelIds = [...new Set([...channelByGroup.values()])];
    const { data: conversationRows } = channelIds.length
      ? await supabase
          .from('chat_conversations')
          .select('id, group_id, channel_id')
          .eq('type', 'channel')
          .in('channel_id', channelIds)
      : { data: [] as any[] };

    const conversationByGroup = new Map<string, string>();
    (conversationRows ?? []).forEach((row: any) => {
      if (row.group_id) conversationByGroup.set(row.group_id, row.id);
    });

    const groupConversationIds = [...conversationByGroup.values()];
    const groupReadMap = await getConversationReadMap(user.id, groupConversationIds);

    // Synchronize persisted group read positions into local UI state too.
    if (groupConversationIds.length && groupReadMap.size) {
      setReadChatAt((previous) => {
        const next = { ...previous };
        groupReadMap.forEach((readAt, conversationId) => {
          next[conversationId] = readAt;
        });
        return next;
      });
    }
    const { data: groupMessageRows } = groupConversationIds.length
      ? await supabase
          .from('chat_messages')
          .select('id, conversation_id, sender_id, body, created_at')
          .in('conversation_id', groupConversationIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
      : { data: [] as any[] };

    const groupMessageIds = (groupMessageRows ?? [])
      .map((row: any) => row.id)
      .filter(Boolean);

    const { ids: deletedGroupMessageIds } =
      await getDeletedMessageIds(
        groupMessageIds,
        user.id,
      );

    const groupMessagesByConversation = new Map<string, any[]>();
    (groupMessageRows ?? []).forEach((row: any) => {
      if (deletedGroupMessageIds.has(row.id)) {
        return;
      }

      const list = groupMessagesByConversation.get(row.conversation_id) ?? [];
      list.push(row);
      groupMessagesByConversation.set(row.conversation_id, list);
    });

    const senderIds = [...new Set((groupMessageRows ?? []).map((row: any) => row.sender_id).filter(Boolean))];
    const { data: senderProfiles } = senderIds.length
      ? await supabase.from('social_profiles').select('user_id, display_name').in('user_id', senderIds)
      : { data: [] as any[] };
    const senderNames = new Map((senderProfiles ?? []).map((p: any) => [p.user_id, p.display_name]));

    const groupsList: ChatItem[] =
      (groupRows ?? []).map(
        (group: {
          id: string;
          name: string;
        }) => ({
          id: `group-${group.id}`,
          name: group.name,
          detail: (() => {
            const last = (groupMessagesByConversation.get(conversationByGroup.get(group.id) ?? '') ?? [])[0];
            if (!last) return ['admin', 'owner'].includes(String(roleByGroupId.get(group.id) ?? '')) ? 'You’re an admin' : 'Group';
            const sender = last.sender_id === user.id ? 'You' : (senderNames.get(last.sender_id) ?? 'Member');
            return `${sender}: ${last.body || 'Attachment'}`;
          })(),
          time: (() => {
            const last = (groupMessagesByConversation.get(conversationByGroup.get(group.id) ?? '') ?? [])[0];
            return last ? formatChatTime(last.created_at) : '';
          })(),
          lastMessageSenderId: (() => {
            const last = (groupMessagesByConversation.get(conversationByGroup.get(group.id) ?? '') ?? [])[0];
            return last?.sender_id;
          })(),
          unread: (() => {
            const rows = groupMessagesByConversation.get(conversationByGroup.get(group.id) ?? '') ?? [];
            const lastRead = groupReadMap.get(conversationByGroup.get(group.id) ?? '') ?? readChatAt[conversationByGroup.get(group.id) ?? ''];
            return rows.filter((row: any) => row.sender_id !== user.id && (!lastRead || row.created_at > lastRead)).length;
          })(),
          category: 'groups',
          icon: (
            group.name || '?'
          )
            .slice(0, 1)
            .toUpperCase(),
          route:
            `/chat/group/${group.id}`,
        }),
      );

    setUserGroups(groupsList);
    setGroupsLoading(false);
  }, [readChatAt]);

  /* =========================================================
     SIDEKICK PREVIEW
  ========================================================= */

  const loadSidekickPreview =
    useCallback(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const {
        data: messages,
        error,
      } = await supabase
        .from('system_messages')
        .select('content, created_at, sender')
        .eq('user_id', user.id)
        .eq('module_key', 'sidekick')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('LOAD SIDEKICK PREVIEW ERROR:', error);
        return;
      }

      const rows = messages ?? [];
      const latest = rows[0];

      if (latest) {
        const time = new Date(latest.created_at).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        });

        setSidekickPreview({
          content: latest.content,
          time,
        });
      } else {
        setSidekickPreview(null);
      }

      const sidekickRows = rows.filter(
        (row: any) => row.sender === 'sidekick',
      );

      const readKey = `mysidekick:sidekick-read-at:${user.id}`;
      let readAt = await AsyncStorage.getItem(readKey);

      // On first use, don't mark existing Sidekick history as new.
      if (!readAt && sidekickRows.length > 0) {
        readAt = sidekickRows[0].created_at;
        if (readAt) {
          await AsyncStorage.setItem(readKey, readAt);
        }
      }

      const unreadCount = sidekickRows.filter((row: any) =>
        !readAt || new Date(row.created_at).getTime() > new Date(readAt).getTime(),
      ).length;

      setSidekickUnreadCount(unreadCount);
    }, []);

  /* =========================================================
     LOAD CHAT TAGS
  ========================================================= */

  const loadChatTags = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setChatTags([]);
      setChatTagAssignments([]);
      return;
    }

    const [
      { data: tags, error: tagsError },
      { data: assignments, error: assignmentsError },
    ] = await Promise.all([
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

    if (tagsError) {
      console.error('LOAD CHAT TAGS ERROR:', tagsError);
      setChatTags([]);
    } else {
      setChatTags((tags ?? []) as ChatTag[]);
    }

    if (assignmentsError) {
      console.error(
        'LOAD CHAT TAG ASSIGNMENTS ERROR:',
        assignmentsError,
      );
      setChatTagAssignments([]);
    } else {
      setChatTagAssignments(
        (assignments ?? []) as ChatTagAssignment[],
      );
    }
  }, []);

  /* =========================================================
     CHAT TAG HELPERS
  ========================================================= */

  const getTagChatId = (chat: ChatItem) => chat.id;

  const isChatTagged = (chat: ChatItem, tagId: string) =>
    chatTagAssignments.some(
      (assignment) =>
        assignment.chat_id === getTagChatId(chat) &&
        assignment.tag_id === tagId,
    );

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((previous) =>
      previous.includes(tagId)
        ? previous.filter((id) => id !== tagId)
        : [...previous, tagId],
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
    if (!name) { setAddTagError('Enter a tag name.'); return; }
    if (name.length > 20) { setAddTagError('Tag names can be up to 20 characters.'); return; }

    setAddingTag(true); setAddTagError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAddTagError('You must be signed in.'); setAddingTag(false); return; }

    if (editingTagId) {
      const { data, error } = await supabase.from('social_chat_tags').update({ name }).eq('id', editingTagId).eq('user_id', user.id).select('id, user_id, name, created_at').single();
      setAddingTag(false);
      if (error || !data) { setAddTagError(error?.message || 'Could not edit tag.'); return; }
      setChatTags(previous => previous.map(tag => tag.id === editingTagId ? data as ChatTag : tag));
      setEditingTagId(null); setNewTagName(''); setShowAddTagModal(false);
      return;
    }

    const { data, error } = await supabase.from('social_chat_tags').insert({ user_id: user.id, name }).select('id, user_id, name, created_at').single();
    setAddingTag(false);
    if (error || !data) {
      if (error?.code === '23505') setAddTagError('You already have a tag with that name.');
      else setAddTagError(error?.message || 'Could not create tag.');
      return;
    }
    const tag = data as ChatTag;
    setChatTags(previous => [...previous, tag]);
    setFilter(null); setSelectedTagIds(previous => [...previous, tag.id]);
    setNewTagName(''); setShowAddTagModal(false);
  };

  const deleteChatTag = async (tag: ChatTag) => {
    Alert.alert('Delete tag?', `Delete “${tag.name}” and remove it from all chats?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error: assignmentError } = await supabase
            .from('social_chat_tag_assignments')
            .delete()
            .eq('user_id', tag.user_id)
            .eq('tag_id', tag.id);
          if (assignmentError) {
            Alert.alert('Could not delete tag', assignmentError.message);
            return;
          }
          const { error } = await supabase
            .from('social_chat_tags')
            .delete()
            .eq('id', tag.id)
            .eq('user_id', tag.user_id);
          if (error) {
            Alert.alert('Could not delete tag', error.message);
            return;
          }
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

  const reorderChatTag = async (tag: ChatTag) => {
    const index = chatTags.findIndex((item) => item.id === tag.id);
    if (index < 0) return;
    const options: any[] = [
      { text: 'Cancel', style: 'cancel' },
    ];
    if (index > 0) {
      options.push({ text: 'Move up', onPress: () => swapChatTags(index, index - 1) });
    }
    if (index < chatTags.length - 1) {
      options.push({ text: 'Move down', onPress: () => swapChatTags(index, index + 1) });
    }
    Alert.alert(`Re-order “${tag.name}”`, undefined, options);
  };

  const swapChatTags = async (a: number, b: number) => {
    const first = chatTags[a];
    const second = chatTags[b];
    if (!first || !second) return;
    const firstDate = first.created_at;
    const secondDate = second.created_at;
    const [firstUpdate, secondUpdate] = await Promise.all([
      supabase.from('social_chat_tags').update({ created_at: secondDate }).eq('id', first.id).eq('user_id', first.user_id),
      supabase.from('social_chat_tags').update({ created_at: firstDate }).eq('id', second.id).eq('user_id', second.user_id),
    ]);
    if (firstUpdate.error || secondUpdate.error) {
      Alert.alert('Could not reorder tag', firstUpdate.error?.message || secondUpdate.error?.message || 'Please try again.');
      return;
    }
    const next = [...chatTags];
    [next[a], next[b]] = [next[b], next[a]];
    setChatTags(next);
  };

  const handleTagLongPress = (tag: ChatTag) => {
    Alert.alert(`Tag: ${tag.name}`, 'Choose an action.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit', onPress: () => editChatTag(tag) },
      { text: 'Delete', style: 'destructive', onPress: () => deleteChatTag(tag) },
      { text: 'Re-order', onPress: () => reorderChatTag(tag) },
    ]);
  };

  const openTagChat = (chat: ChatItem) => {
    setTagChat(chat);
    setTagModalError(null);
  };

  const closeTagChat = () => {
    setTagChat(null);
    setTagModalError(null);
  };

  const setChatTagAssignment = async (
    chat: ChatItem,
    tag: ChatTag,
    assigned: boolean,
  ) => {
    const chatId = getTagChatId(chat);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setTagModalError('You must be signed in.');
      return;
    }

    if (assigned) {
      const { data, error } = await supabase
        .from('social_chat_tag_assignments')
        .insert({
          user_id: user.id,
          chat_id: chatId,
          tag_id: tag.id,
        })
        .select('id, user_id, chat_id, tag_id, created_at')
        .single();

      if (error) {
        console.error('ADD CHAT TAG ERROR:', error);
        if (error.code !== '23505') {
          setTagModalError(error.message || 'Could not add tag.');
        }
        return;
      }

      if (data) {
        setChatTagAssignments((previous) => [
          ...previous,
          data as ChatTagAssignment,
        ]);
      }
      return;
    }

    const { error } = await supabase
      .from('social_chat_tag_assignments')
      .delete()
      .eq('user_id', user.id)
      .eq('chat_id', chatId)
      .eq('tag_id', tag.id);

    if (error) {
      console.error('REMOVE CHAT TAG ERROR:', error);
      setTagModalError(error.message || 'Could not remove tag.');
      return;
    }

    setChatTagAssignments((previous) =>
      previous.filter(
        (assignment) =>
          !(
            assignment.chat_id === chatId &&
            assignment.tag_id === tag.id
          ),
      ),
    );
  };

  /* =========================================================
     GROUP INVITES
  ========================================================= */

  const loadIncomingGroupInvites =
    useCallback(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIncomingGroupInvites([]);
        return;
      }

      const {
        data: inviteRows,
        error: inviteError,
      } = await supabase
        .from(
          'chat_group_invitations',
        )
        .select(
          'id, group_id, inviter_id, created_at',
        )
        .eq(
          'invitee_id',
          user.id,
        )
        .eq(
          'status',
          'pending',
        )
        .order(
          'created_at',
          {
            ascending: false,
          },
        );

      if (inviteError) {
        console.error(
          'LOAD GROUP INVITES ERROR:',
          inviteError,
        );

        setIncomingGroupInvites([]);
        return;
      }

      if (!inviteRows?.length) {
        setIncomingGroupInvites([]);
        return;
      }

      const groupIds = [
        ...new Set(
          inviteRows.map(
            (row) =>
              row.group_id,
          ),
        ),
      ];

      const inviterIds = [
        ...new Set(
          inviteRows.map(
            (row) =>
              row.inviter_id,
          ),
        ),
      ];

      const [
        { data: groupRows },
        { data: profileRows },
      ] = await Promise.all([
        supabase
          .from('chat_groups')
          .select(
            'id, name',
          )
          .in(
            'id',
            groupIds,
          ),

        supabase
          .from('social_profiles')
          .select(
            'user_id, display_name',
          )
          .in(
            'user_id',
            inviterIds,
          ),
      ]);

      const groupNameById =
        new Map(
          (groupRows ?? []).map(
            (group) => [
              group.id,
              group.name,
            ],
          ),
        );

      const inviterNameById =
        new Map(
          (profileRows ?? []).map(
            (profile) => [
              profile.user_id,
              profile.display_name,
            ],
          ),
        );

      setIncomingGroupInvites(
        inviteRows.map(
          (row) => ({
            id: row.id,
            group_id:
              row.group_id,
            group_name:
              groupNameById.get(
                row.group_id,
              ) ?? 'Group',
            inviter_id:
              row.inviter_id,
            inviter_name:
              inviterNameById.get(
                row.inviter_id,
              ) ?? 'Someone',
            created_at:
              row.created_at,
          }),
        ),
      );
    }, []);

  /* =========================================================
     ACCEPT GROUP INVITE
  ========================================================= */

  const acceptGroupInvite =
    async (
      invite: IncomingGroupInvite,
    ) => {
      setGroupInviteActionId(
        invite.id,
      );

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setGroupInviteActionId(null);
        return;
      }

      const {
        error: updateError,
      } = await supabase
        .from(
          'chat_group_invitations',
        )
        .update({
          status: 'accepted',
        })
        .eq(
          'id',
          invite.id,
        );

      if (updateError) {
        console.error(
          'ACCEPT GROUP INVITE ERROR:',
          updateError,
        );

        setGroupInviteActionId(null);
        return;
      }

      const {
        error: memberError,
      } = await supabase
        .from('chat_group_members')
        .insert({
          group_id: invite.group_id,
          user_id: user.id,
          role: 'member',
        });

      if (memberError) {
        console.error(
          'JOIN GROUP AFTER ACCEPT ERROR:',
          memberError,
        );
      }

      const conversation = await ensureGroupConversation(invite.group_id, user.id);
      if (conversation.error || !conversation.id) {
        console.error('JOIN GROUP CHAT ERROR:', conversation.error);
      }

      setIncomingGroupInvites(
        (previous) =>
          previous.filter(
            (item) =>
              item.id !==
              invite.id,
          ),
      );

      await loadGroups();

      setGroupInviteActionId(null);
    };

  /* =========================================================
     DECLINE GROUP INVITE
  ========================================================= */

  const declineGroupInvite =
    async (
      invite: IncomingGroupInvite,
    ) => {
      setGroupInviteActionId(
        invite.id,
      );

      const {
        error,
      } = await supabase
        .from(
          'chat_group_invitations',
        )
        .update({
          status: 'declined',
        })
        .eq(
          'id',
          invite.id,
        );

      if (error) {
        console.error(
          'DECLINE GROUP INVITE ERROR:',
          error,
        );
      }

      setIncomingGroupInvites(
        (previous) =>
          previous.filter(
            (item) =>
              item.id !==
              invite.id,
          ),
      );

      setGroupInviteActionId(null);
    };

  /* =========================================================
     CREATE GROUP
  ========================================================= */

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    const description = newGroupDescription.trim();
    if (!name || creatingGroup) return;

    setCreatingGroup(true);
    setCreateGroupError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCreateGroupError('You must be signed in.');
      setCreatingGroup(false);
      return;
    }

    try {
      // The current Chat schema uses chat_groups -> chat_channels ->
      // chat_conversations(type=channel) for group conversations.
      const { data: groupData, error: groupError } = await supabase
        .from('chat_groups')
        .insert({
          name,
          description,
          visibility: 'private',
          owner_id: user.id,
        })
        .select('id')
        .single();
      if (groupError || !groupData) throw groupError ?? new Error('Could not create group.');

      const groupId = groupData.id;

      const { error: memberError } = await supabase
        .from('chat_group_members')
        .insert({ group_id: groupId, user_id: user.id, role: 'owner' });
      if (memberError) throw memberError;

      const { data: channelData, error: channelError } = await supabase
        .from('chat_channels')
        .insert({
          group_id: groupId,
          name,
          description,
          position: 0,
          is_default: true,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (channelError || !channelData) throw channelError ?? new Error('Could not create group channel.');

      const { data: conversationData, error: conversationError } = await supabase
        .from('chat_conversations')
        .insert({
          type: 'channel',
          group_id: groupId,
          channel_id: channelData.id,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (conversationError || !conversationData) throw conversationError ?? new Error('Could not create group conversation.');

      const { error: conversationMemberError } = await supabase
        .from('chat_conversation_members')
        .insert({ conversation_id: conversationData.id, user_id: user.id });
      if (conversationMemberError) throw conversationMemberError;

      setNewGroupName('');
      setNewGroupDescription('');
      setCreateGroupOpen(false);
      await loadGroups();
      router.push(`/chat/group/${groupId}` as never);
    } catch (error: any) {
      console.error('CREATE GROUP ERROR:', error);
      setCreateGroupError(error?.message || 'Could not create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  /* =========================================================
     LOAD FRIEND REQUESTS
  ========================================================= */

  const loadIncomingRequests =
    useCallback(async () => {
      setRequestsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIncomingRequests([]);
        setRequestsLoading(false);
        return;
      }

      const {
        data: requestRows,
        error: requestError,
      } = await supabase
        .from('friend_requests')
        .select(
          'id, sender_id, created_at',
        )
        .eq(
          'receiver_id',
          user.id,
        )
        .eq(
          'status',
          'pending',
        )
        .order(
          'created_at',
          {
            ascending: false,
          },
        );

      if (requestError) {
        console.error(
          'LOAD FRIEND REQUESTS ERROR:',
          requestError,
        );

        setIncomingRequests([]);
        setRequestsLoading(false);
        return;
      }

      const senderIds =
        (requestRows ?? []).map(
          (row: {
            sender_id: string;
          }) =>
            row.sender_id,
        );

      if (!senderIds.length) {
        setIncomingRequests([]);
        setRequestsLoading(false);
        return;
      }

      const {
        data: profiles,
        error: profileError,
      } = await supabase
        .from(
          'social_profiles',
        )
        .select(
          'user_id, display_name, username',
        )
        .in(
          'user_id',
          senderIds,
        );

      if (profileError) {
        console.error(
          'LOAD REQUEST PROFILES ERROR:',
          profileError,
        );

        setIncomingRequests([]);
        setRequestsLoading(false);
        return;
      }

      const profileMap =
        new Map<
          string,
          SocialProfile
        >(
          (
            profiles ?? []
          ).map(
            (
              profile: SocialProfile,
            ) => [
              profile.user_id,
              profile,
            ],
          ),
        );

      setIncomingRequests(
        (
          requestRows ?? []
        ).map(
          (row: {
            id: string;
            sender_id: string;
            created_at: string;
          }) => ({
            id: row.id,
            sender_id:
              row.sender_id,
            sender:
              profileMap.get(
                row.sender_id,
              ) ?? null,
            created_at:
              row.created_at,
          }),
        ),
      );

      setRequestsLoading(false);
    }, []);

  useEffect(() => {
    const requested = params.filter;
    if (requested === 'All' || requested === 'Unread') {
      setFilter(requested);
    }
  }, [params.filter]);

  /* =========================================================
     REFRESH CHAT DATA WHEN THIS TAB IS SHOWN
  ========================================================= */

  useFocusEffect(
    useCallback(() => {
      loadFriends();
      loadIncomingRequests();
      setUserGroups([]);
      loadSidekickPreview();
      setIncomingGroupInvites([]);
      loadChatTags();
    }, [
      loadFriends,
      loadIncomingRequests,
      loadSidekickPreview,
      loadChatTags,
    ]),
  );

  /* =========================================================
     LOAD STREAK RECIPIENTS ALREADY SENT TODAY

     A recipient is marked sent only when this exact streak
     message was already sent to that person today.

     This allows sharing again on a new day or when the streak
     message changes because the streak count/habit changes.
  ========================================================= */

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

    const {
      data: messageRows,
      error: messageError,
    } = await supabase
      .from('chat_messages')
      .select('conversation_id')
      .eq('sender_id', user.id)
      .eq('body', streakMessage)
      .gte('created_at', startOfToday.toISOString())
      .is('deleted_at', null);

    if (messageError) {
      console.error(
        'LOAD SENT STREAK MESSAGES ERROR:',
        messageError,
      );
      setSentStreakRecipients([]);
      return;
    }

    const conversationIds = [
      ...new Set(
        (messageRows ?? [])
          .map((row: any) => row.conversation_id)
          .filter(Boolean),
      ),
    ];

    if (!conversationIds.length) {
      setSentStreakRecipients([]);
      return;
    }

    const {
      data: directConversations,
      error: conversationError,
    } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('type', 'direct')
      .in('id', conversationIds);

    if (conversationError) {
      console.error(
        'LOAD SENT STREAK CONVERSATIONS ERROR:',
        conversationError,
      );
      setSentStreakRecipients([]);
      return;
    }

    const directIds = (directConversations ?? []).map(
      (row: any) => row.id,
    );

    if (!directIds.length) {
      setSentStreakRecipients([]);
      return;
    }

    const {
      data: memberRows,
      error: memberError,
    } = await supabase
      .from('chat_conversation_members')
      .select('conversation_id, user_id')
      .in('conversation_id', directIds);

    if (memberError) {
      console.error(
        'LOAD SENT STREAK RECIPIENT MEMBERS ERROR:',
        memberError,
      );
      setSentStreakRecipients([]);
      return;
    }

    const recipientIds = [
      ...new Set(
        (memberRows ?? [])
          .filter(
            (row: any) =>
              row.user_id &&
              row.user_id !== user.id,
          )
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
  }, [
    flexMode,
    streakMessage,
    loadSentStreakRecipients,
  ]);

  /* =========================================================
     COMBINED CHAT LIST
  ========================================================= */

  const allChats = useMemo(
    () => [
      ...SYSTEM_CHATS.map(
        (chat) =>
          chat.id ===
            'sys-sidekick'
            ? {
                ...chat,
                ...(sidekickPreview
                  ? {
                      detail: sidekickPreview.content,
                      time: sidekickPreview.time,
                    }
                  : {}),
                unread: sidekickUnreadCount || undefined,
              }
            : chat,
      ),
      ...userFriends,
    ],
    [
      userFriends,
      sidekickPreview,
      sidekickUnreadCount,
    ],
  );

  /* =========================================================
     FILTERED CHAT LIST
  ========================================================= */

  const filteredChats =
    useMemo(() => {
      const lowered =
        query
          .toLowerCase()
          .trim();

      const byName =
        allChats.filter(
          (chat) =>
            chat.name.toLowerCase().includes(lowered) ||
            chat.detail.toLowerCase().includes(lowered),
        );

      const existingProfileIds = new Set(allChats.map((chat) => chat.profileId).filter(Boolean));
      const peopleMatches = lowered
        ? searchableFriends.filter((person) =>
            !existingProfileIds.has(person.profileId) &&
            (person.name.toLowerCase().includes(lowered) || person.detail.toLowerCase().includes(lowered)),
          )
        : [];

      const combinedByName = [...byName, ...peopleMatches];

      const byBaseFilter =
        filter === 'Unread'
          ? combinedByName.filter(
              (chat) => !!chat.unread,
            )
          : combinedByName;

      if (selectedTagIds.length === 0) {
        return byBaseFilter;
      }

      return byBaseFilter.filter((chat) =>
        selectedTagIds.every((tagId) =>
          isChatTagged(chat, tagId),
        ),
      );
    }, [
      allChats,
      searchableFriends,
      query,
      filter,
      selectedTagIds,
      chatTagAssignments,
    ]);

  /* =========================================================
     FLEX FRIEND LIST

     Only direct friends are selectable.
     Sidekick and groups are not recipients.
  ========================================================= */

  const flexRecipients =
    useMemo(() => {
      const lowered =
        flexSearch
          .toLowerCase()
          .trim();

      if (!lowered) {
        return userFriends;
      }

      return userFriends.filter(
        (friend) =>
          friend.name
            .toLowerCase()
            .includes(
              lowered,
            ) ||
          friend.detail
            .toLowerCase()
            .includes(
              lowered,
            ),
      );
    }, [
      userFriends,
      flexSearch,
    ]);

  /* =========================================================
     TOGGLE FLEX RECIPIENT
  ========================================================= */

  const toggleFlexRecipient =
    (profileId: string) => {
      setFlexError(null);

      if (sentStreakRecipients.includes(profileId)) {
        return;
      }

      setSelectedRecipients(
        (previous) =>
          previous.includes(profileId)
            ? previous.filter(
                (id) =>
                  id !== profileId,
              )
            : [
                ...previous,
                profileId,
              ],
      );
    };

  /* =========================================================
     CANCEL FLEX MODE
  ========================================================= */

  const cancelFlexMode =
    () => {
      setSelectedRecipients([]);
      setFlexSearch('');
      setFlexError(null);

      router.replace(
        '/(tabs)' as never,
      );
    };

  /* =========================================================
     SEND FLEX MESSAGE

     IMPORTANT:
     Your existing chat screen only loads/open chats;
     it does not expose the existing message-table schema.

     Therefore we do not invent a Supabase table here.

     Instead, after selection, this passes the selected
     recipients + prepared message to the direct-chat route.

     The existing chat/[id].tsx can then consume:

       composeMessage
       autoSend

     without changing normal chat behavior.
  ========================================================= */

  const sendFlexMessage =
    async () => {
      if (
        flexSending ||
        !selectedRecipients.length
      ) {
        return;
      }

      if (!streakMessage) {
        setFlexError(
          'you have a zero day streak.',
        );
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
          setFlexError(
            'You must be signed in to share your streak.',
          );
          return;
        }

        let sendError: any = null;
        const successfullySentRecipientIds: string[] = [];

        for (const recipientId of selectedRecipients) {
          if (sentStreakRecipients.includes(recipientId)) {
            continue;
          }

          // Conversation creation/restoration happens only now,
          // when the user actually presses Send.
          const {
            id: conversationId,
            error: conversationError,
          } = await ensureDirectConversation(
            user.id,
            recipientId,
          );

          if (
            conversationError ||
            !conversationId
          ) {
            sendError =
              conversationError ||
              new Error(
                'Could not open direct conversation.',
              );
            break;
          }

          const result =
            await sendChatMessage(
              conversationId,
              user.id,
              streakMessage,
            );

          if (result.error) {
            sendError = result.error;
            break;
          }

          successfullySentRecipientIds.push(
            recipientId,
          );
        }

        if (successfullySentRecipientIds.length) {
          setSentStreakRecipients(
            (previous) => [
              ...new Set([
                ...previous,
                ...successfullySentRecipientIds,
              ]),
            ],
          );

          // Remove successful sends from the pending selection.
          // They remain visually checked as sent.
          setSelectedRecipients(
            (previous) =>
              previous.filter(
                (id) =>
                  !successfullySentRecipientIds.includes(id),
              ),
          );
        }

        if (sendError) {
          console.error(
            'FLEX MESSAGE SEND ERROR:',
            sendError,
          );

          setFlexError(
            sendError.message ||
              'Could not send your streak message.',
          );

          return;
        }

        setFlexError(null);

        // Stay on the Share your streak page. Sent recipients
        // remain marked and cannot be selected again today.
      } catch (error) {
        console.error(
          'FLEX MESSAGE SEND EXCEPTION:',
          error,
        );

        setFlexError(
          'Could not send your streak message. Please try again.',
        );
      } finally {
        setFlexSending(false);
      }
    };

  /* =========================================================
     SEARCH USERS BY USERNAME
  ========================================================= */

  const searchUsers = async (
    text: string,
  ) => {
    setFriendQuery(text);

    const cleaned =
      text
        .trim()
        .replace(/^@/, '')
        .toLowerCase();

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
      } =
        await supabase.auth.getUser();

      if (authError) {
        setFriendResults([]);
        setFriendError(
          `Authentication error: ${authError.message}`,
        );
        return;
      }

      if (!user) {
        setFriendResults([]);
        setFriendError(
          'You must be signed in.',
        );
        return;
      }

      const {
        data,
        error: searchError,
      } = await supabase
        .from(
          'social_profiles',
        )
        .select(
          'id, user_id, display_name, username',
        )
        .ilike(
          'username',
          `%${cleaned}%`,
        )
        .neq(
          'user_id',
          user.id,
        )
        .limit(10);

      if (searchError) {
        console.error(
          'USER SEARCH ERROR:',
          searchError,
        );

        setFriendResults([]);
        setFriendError(
          `Search error: ${searchError.message}`,
        );
        return;
      }

      const profiles = (data ?? []) as SocialProfile[];

      setFriendResults(profiles);

      // Load existing friendships for the users currently shown.
      // Existing friends take priority over both "Sent" and "Add".
      const resultIds = profiles
        .map((profile) => profile.user_id)
        .filter(Boolean);

      if (resultIds.length) {
        const {
          data: friendshipRows,
          error: friendshipError,
        } = await supabase
          .from('friendships')
          .select('user_id, friend_user_id')
          .or(`user_id.eq.${user.id},friend_user_id.eq.${user.id}`);

        if (friendshipError) {
          console.error(
            'LOAD SEARCH FRIENDSHIPS ERROR:',
            friendshipError,
          );
          setExistingFriendIds([]);
        } else {
          const friendIds = (friendshipRows ?? [])
            .map((row: { user_id: string; friend_user_id: string }) =>
              row.user_id === user.id
                ? row.friend_user_id
                : row.user_id,
            )
            .filter((friendId: string) =>
              resultIds.includes(friendId),
            );

          setExistingFriendIds([...new Set(friendIds)]);
        }
      } else {
        setExistingFriendIds([]);
      }

      // Load outgoing pending requests for the users currently shown.
      // Reuse the resultIds list above so it is not declared twice.
      if (resultIds.length) {
        const {
          data: pendingRows,
          error: pendingError,
        } = await supabase
          .from('friend_requests')
          .select('receiver_id')
          .eq('sender_id', user.id)
          .eq('status', 'pending')
          .in('receiver_id', resultIds);

        if (pendingError) {
          console.error(
            'LOAD OUTGOING FRIEND REQUESTS ERROR:',
            pendingError,
          );
        } else {
          setSentRequestIds(
            (pendingRows ?? [])
              .map((row: { receiver_id: string }) => row.receiver_id)
              .filter(Boolean),
          );
        }
      } else {
        setSentRequestIds([]);
      }
    } catch (error) {
      console.error(
        'FRIEND SEARCH EXCEPTION:',
        error,
      );

      setFriendResults([]);
      setFriendError(
        'Something went wrong while searching.',
      );
    } finally {
      setFriendSearching(false);
    }
  };

  /* =========================================================
     SEND FRIEND REQUEST
  ========================================================= */

  const sendFriendRequest =
    async (
      friendUserId: string,
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setFriendError(
          'You must be logged in.',
        );
        return;
      }

      if (
        existingFriendIds.includes(friendUserId) ||
        sentRequestIds.includes(friendUserId)
      ) {
        return;
      }

      setSendingRequestId(
        friendUserId,
      );

      setFriendError(null);

      const {
        data: existingPending,
        error: existingError,
      } = await supabase
        .from(
          'friend_requests',
        )
        .select(
          'id, status',
        )
        .eq(
          'sender_id',
          user.id,
        )
        .eq(
          'receiver_id',
          friendUserId,
        )
        .eq(
          'status',
          'pending',
        )
        .maybeSingle();

      if (existingError) {
        setFriendError(
          'Could not check the friend request.',
        );
        setSendingRequestId(null);
        return;
      }

      if (existingPending) {
        setFriendError(
          'A friend request has already been sent.',
        );
        setSendingRequestId(null);
        return;
      }

      const {
        data: reversePending,
        error: reverseError,
      } = await supabase
        .from(
          'friend_requests',
        )
        .select(
          'id, sender_id',
        )
        .eq(
          'sender_id',
          friendUserId,
        )
        .eq(
          'receiver_id',
          user.id,
        )
        .eq(
          'status',
          'pending',
        )
        .maybeSingle();

      if (reverseError) {
        setFriendError(
          'Could not check existing requests.',
        );
        setSendingRequestId(null);
        return;
      }

      if (reversePending) {
        setFriendError(
          'This person has already sent you a friend request. Check your pending requests.',
        );
        setSendingRequestId(null);
        return;
      }

      const {
        data: alreadyFriend,
        error: friendshipError,
      } = await supabase
        .from('friendships')
        .select('id')
        .eq(
          'user_id',
          user.id,
        )
        .eq(
          'friend_user_id',
          friendUserId,
        )
        .maybeSingle();

      if (friendshipError) {
        setFriendError(
          'Could not check the friendship.',
        );
        setSendingRequestId(null);
        return;
      }

      if (alreadyFriend) {
        setFriendError(
          'You are already friends with this person.',
        );
        setSendingRequestId(null);
        return;
      }

      const {
        error: requestError,
      } = await supabase
        .from(
          'friend_requests',
        )
        .insert({
          sender_id:
            user.id,
          receiver_id:
            friendUserId,
          status:
            'pending',
        });

      if (requestError) {
        setFriendError(
          requestError.message ||
            'Could not send friend request.',
        );
        setSendingRequestId(null);
        return;
      }

      // Keep the person in the results and change the button to "Sent".
      setSentRequestIds(
        (previous) =>
          previous.includes(friendUserId)
            ? previous
            : [...previous, friendUserId],
      );

      setSendingRequestId(null);
    };

  /* =========================================================
     ACCEPT FRIEND REQUEST
  ========================================================= */

  const acceptFriendRequest =
    async (
      request: IncomingRequest,
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setFriendError(
          'You must be logged in.',
        );
        return;
      }

      setRequestActionId(
        request.id,
      );

      setFriendError(null);

      const {
        error,
      } = await supabase.rpc(
        'accept_friend_request',
        {
          request_id:
            request.id,
        },
      );

      if (error) {
        setFriendError(
          `Could not accept friend request: ${error.message}`,
        );

        setRequestActionId(null);
        return;
      }

      setIncomingRequests(
        (previous) =>
          previous.filter(
            (item) =>
              item.id !==
              request.id,
          ),
      );

      await loadFriends();

      setRequestActionId(null);
    };

  /* =========================================================
     DECLINE FRIEND REQUEST
  ========================================================= */

  const declineFriendRequest =
    async (
      request: IncomingRequest,
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      setRequestActionId(
        request.id,
      );

      const {
        error,
      } = await supabase
        .from(
          'friend_requests',
        )
        .update({
          status:
            'declined',
        })
        .eq(
          'id',
          request.id,
        )
        .eq(
          'receiver_id',
          user.id,
        );

      if (error) {
        setFriendError(
          error.message ||
            'Could not decline the request.',
        );

        setRequestActionId(null);
        return;
      }

      setIncomingRequests(
        (previous) =>
          previous.filter(
            (item) =>
              item.id !==
              request.id,
          ),
      );

      setRequestActionId(null);
    };

  /* =========================================================
     OPEN NORMAL CHAT
  ========================================================= */

  const openChat = async (
    chat: ChatItem,
  ) => {
    if (flexMode) {
      if (
        chat.category !==
          'direct' ||
        !chat.profileId
      ) {
        return;
      }

      toggleFlexRecipient(
        chat.profileId,
      );

      return;
    }

    const sourceFilter = filter ?? 'All';

    if (chat.id === 'sys-sidekick') {
      if (myUserId) {
        try {
          const readKey = `mysidekick:sidekick-read-at:${myUserId}`;
          const { data: latestSidekickMessage } = await supabase
            .from('system_messages')
            .select('created_at')
            .eq('user_id', myUserId)
            .eq('module_key', 'sidekick')
            .eq('sender', 'sidekick')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const readAt =
            latestSidekickMessage?.created_at ??
            new Date().toISOString();

          await AsyncStorage.setItem(readKey, readAt);
          setSidekickUnreadCount(0);
        } catch (error) {
          console.error('MARK SIDEKICK CHAT READ ERROR:', error);
        }
      }

      router.push(
        {
          pathname: '/chat/sidekick',
          params: {
            from: sourceFilter,
          },
        } as never,
      );

      return;
    }

    /*
     * Direct chats must be marked as read before navigating away.
     * The previous code only did this for groups, which is why the
     * unread counter stayed visible after opening a direct chat.
     */
    if (
      chat.category ===
        'direct' &&
      chat.profileId
    ) {
      if (myUserId) {
        try {
          const directConversation =
            await ensureDirectConversation(
              myUserId,
              chat.profileId,
            );

          if (directConversation.id) {
            const readNow =
              new Date().toISOString();

            /*
             * Update local state immediately so the unread badge
             * disappears without waiting for Supabase or a refresh.
             */
            setReadChatAt((previous) => ({
              ...previous,
              [directConversation.id!]: readNow,
            }));

            /*
             * Persist the read position in Supabase.
             */
            void markConversationRead(
              directConversation.id,
              myUserId,
            );
          }
        } catch (error) {
          console.error(
            'MARK DIRECT CHAT READ ERROR:',
            error,
          );
        }
      }

      router.push(
        {
          pathname: `/chat/${chat.profileId}`,
          params: {
            from: sourceFilter,
          },
        } as never,
      );

      return;
    }

    /*
     * Groups already have their conversation resolved here.
     * Keep that existing behavior, while also updating the local
     * read state immediately.
     */
    if (chat.category === 'groups') {
      const groupId = chat.id.replace(
        /^group-/,
        '',
      );

      if (myUserId) {
        try {
          const groupConversation =
            await ensureGroupConversation(
              groupId,
              myUserId,
            );

          if (groupConversation.id) {
            const readNow =
              new Date().toISOString();

            setReadChatAt((previous) => ({
              ...previous,
              [groupConversation.id!]: readNow,
            }));

            void markConversationRead(
              groupConversation.id,
              myUserId,
            );
          }
        } catch (error) {
          console.error(
            'MARK GROUP CHAT READ ERROR:',
            error,
          );
        }
      }
    }

    if (chat.route) {
      if (chat.category === 'groups') {
        router.push(
          {
            pathname: chat.route,
            params: {
              from: sourceFilter,
            },
          } as never,
        );
      } else {
        router.push(
          chat.route as never,
        );
      }
    }
  };

  /* =========================================================
     OPEN CREATE GROUP
  ========================================================= */

  const openCreateGroup = () => {
    setCreateGroupOpen(true);
    setNewGroupName('');
    setNewGroupDescription('');
    setCreateGroupError(null);
  };

  /* =========================================================
     COLORS
  ========================================================= */

  const C = isDark
    ? {
        bg: '#090909',
        card: '#111111',
        border: '#2A2A2A',
        text: isBlackDark ? '#FFFFFF' : '#F4F2EE',
        muted: isBlackDark ? '#FFFFFF' : '#AAA59D',
        input: '#171717',
        inputBorder: '#363636',
        divider: '#292929',
      }
    : {
        bg: '#FBFAF8',
        card: '#FFFFFF',
        border: '#ECE9E4',
        text: '#292824',
        muted: '#88857E',
        input: '#FFFFFF',
        inputBorder: '#E1DED8',
        divider: '#F0EEEA',
      };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor:
            C.bg,
        },
      ]}
    >
      {/* =====================================================
          FLEX MODE HEADER
      ===================================================== */}

      {flexMode ? (
        <View
          style={[
            styles.flexHeader,
            {
              backgroundColor:
                C.bg,
            },
          ]}
        >
          <View
            style={
              styles.flexHeaderTop
            }
          >
            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={[
                  styles.flexTitle,
                  {
                    color: C.text,
                  },
                ]}
              >
                Share your streak
              </Text>

              <Text
                style={[
                  styles.flexSubtitle,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                Select who you want
                to send it to
              </Text>
            </View>

            <Pressable
              onPress={
                cancelFlexMode
              }
              hitSlop={12}
            >
              <X
                color={C.muted}
                size={22}
              />
            </Pressable>
          </View>

          {streakMessage ? (
            <View
              style={[
                styles.streakPreview,
                {
                  backgroundColor:
                    isDark
                      ? '#171717'
                      : '#FFFFFF',
                  borderColor:
                    C.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.streakPreviewLabel,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                MESSAGE
              </Text>

              <Text
                style={[
                  styles.streakPreviewText,
                  {
                    color:
                      C.text,
                  },
                ]}
              >
                {streakMessage}
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.search,
              {
                backgroundColor:
                  C.input,
                borderColor:
                  C.inputBorder,
              },
            ]}
          >
            <Search
              color={C.muted}
              size={18}
            />

            <TextInput
              value={flexSearch}
              onChangeText={
                setFlexSearch
              }
              placeholder="Search people..."
              placeholderTextColor={
                C.muted
              }
              style={[
                styles.searchInput,
                {
                  color:
                    C.text,
                },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View
            style={
              styles.selectionCountRow
            }
          >
            <Text
              style={[
                styles.selectionCount,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              {selectedRecipients.length}{' '}
              selected
            </Text>
          </View>
        </View>
      ) : (
        /* ===================================================
           NORMAL HEADER
        =================================================== */

        <View
          style={
            styles.frozenHeader
          }
        >
          <View
            style={
              styles.searchRow
            }
          >
            <View
              style={[
                styles.search,
                {
                  flex: 1,
                  backgroundColor:
                    C.input,
                  borderColor:
                    C.inputBorder,
                },
              ]}
            >
              <Search
                color={C.muted}
                size={18}
              />

              <TextInput
                value={query}
                onChangeText={
                  setQuery
                }
                placeholder="Search conversations..."
                placeholderTextColor={
                  C.muted
                }
                style={[
                  styles.searchInput,
                  {
                    color:
                      C.text,
                  },
                ]}
              />
            </View>

            <Pressable
              onPress={() => {
                setFriendSearchOpen(
                  true,
                );
                setFriendQuery('');
                setFriendResults(
                  [],
                );
                setFriendError(
                  null,
                );
              }}
              style={[
                styles.addFriendBtn,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
              hitSlop={8}
            >
              <UserPlus
                color="#FFFFFF"
                size={20}
              />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={
              false
            }
            contentContainerStyle={
              styles.filters
            }
          >
            {filters.map(
              (item) => (
                <Pressable
                  key={item}
                  onPress={() =>
                    setFilter((previous) =>
                      previous === item
                        ? null
                        : item,
                    )
                  }
                  style={[
                    styles.filter,
                    {
                      backgroundColor:
                        C.input,
                      borderColor:
                        C.inputBorder,
                    },
                    filter ===
                      item && {
                      backgroundColor:
                        accentForeground,
                      borderColor:
                        accentForeground,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      {
                        color:
                          C.muted,
                      },
                      filter ===
                        item && {
                        color:
                          '#FFFFFF',
                      },
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ),
            )}

            {chatTags.map((tag) => {
              const selected =
                selectedTagIds.includes(tag.id);

              return (
                <Pressable
                  key={tag.id}
                  onPress={() =>
                    toggleTagFilter(tag.id)
                  }
                  onLongPress={() => handleTagLongPress(tag)}
                  style={[
                    styles.filter,
                    {
                      backgroundColor:
                        C.input,
                      borderColor:
                        C.inputBorder,
                    },
                    selected && {
                      backgroundColor:
                        accentForeground,
                      borderColor:
                        accentForeground,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      {
                        color:
                          C.muted,
                      },
                      selected && {
                        color:
                          '#FFFFFF',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {tag.name}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              onPress={openAddTag}
              style={[
                styles.filter,
                styles.addTagFilter,
                {
                  borderColor:
                    accentForeground,
                  backgroundColor:
                    C.input,
                },
              ]}
            >
              <Plus
                color={isBlackDark ? '#FFFFFF' : accentForeground}
                size={14}
                strokeWidth={2.5}
              />
              <Text
                style={[
                  styles.filterText,
                  {
                    color:
                      isBlackDark
                        ? '#FFFFFF'
                        : accentForeground,
                  },
                ]}
              >
                Add tag
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      {/* =====================================================
          CONTENT
      ===================================================== */}

<ScrollView
  contentContainerStyle={[
    styles.chatScrollContent,
    flexMode &&
      styles.flexContent,
  ]}
  showsVerticalScrollIndicator={
    false
  }
>
        {/* ===================================================
            FLEX RECIPIENT LIST
        =================================================== */}

        {flexMode ? (
          <>
            {flexError ? (
              <Text
                style={[
                  styles.flexError,
                  {
                    color:
                      '#E05252',
                  },
                ]}
              >
                {flexError}
              </Text>
            ) : null}

            <View
              style={[
                styles.chatList,
                {
                  backgroundColor:
                    C.card,
                  borderColor:
                    C.border,
                },
              ]}
            >
              {flexRecipients.length >
              0 ? (
                flexRecipients.map(
                  (friend) => {
                    const isSent =
                      !!friend.profileId &&
                      sentStreakRecipients.includes(
                        friend.profileId,
                      );

                    const selected =
                      !!friend.profileId &&
                      (
                        selectedRecipients.includes(
                          friend.profileId,
                        ) || isSent
                      );

                    return (
                      <Pressable
                        key={
                          friend.id
                        }
                        disabled={isSent}
                        onPress={() =>
                          friend.profileId &&
                          toggleFlexRecipient(
                            friend.profileId,
                          )
                        }
                        style={({ pressed }) => [
                          styles.chatRow,
                          {
                            borderBottomColor:
                              C.divider,
                          },
                          pressed &&
                            !isSent &&
                            styles.pressed,
                          selected && {
                            backgroundColor:
                              isDark
                                ? '#1D241F'
                                : '#F5FAF6',
                          },
                        ]}
                      >
                        {friend.sidekickId ? (
                          <View
                            style={[
                              styles.avatar,
                              styles.sidekickAvatarContainer,
                            ]}
                          >
                            <SidekickAvatar
                              sidekickId={friend.sidekickId}
                              size={38}
                            />
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.avatar,
                              { backgroundColor: accentForeground },
                            ]}
                          >
                            <Text
                              style={[
                                styles.avatarText,
                                { color: '#FFFFFF' },
                              ]}
                            >
                              {friend.icon}
                            </Text>
                          </View>
                        )}

                        <View
                          style={
                            styles.chatCopy
                          }
                        >
                          <Text
                            style={[
                              styles.chatName,
                              {
                                color:
                                  C.text,
                              },
                            ]}
                          >
                            {
                              friend.name
                            }
                          </Text>

                          <Text
                            style={[
                              styles.chatDetail,
                              {
                                color:
                                  C.muted,
                              },
                            ]}
                          >
                            {
                              friend.detail
                            }
                          </Text>
                        </View>

                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          {isSent ? (
                            <Text
                              style={[
                                styles.flexSentLabel,
                                {
                                  color:
                                    accentForeground,
                                },
                              ]}
                            >
                              Sent
                            </Text>
                          ) : null}

                          <View
                            style={[
                              styles.selectionCircle,
                              {
                                borderColor:
                                  selected
                                    ? accentForeground
                                    : C.inputBorder,
                                backgroundColor:
                                  selected
                                    ? accentForeground
                                    : 'transparent',
                              },
                            ]}
                          >
                            {selected ? (
                              <Check
                                color="#FFFFFF"
                                size={16}
                                strokeWidth={3}
                              />
                            ) : null}
                          </View>
                        </View>
                      </Pressable>
                    );
                  },
                )
              ) : (
                <View
                  style={
                    styles.flexEmpty
                  }
                >
                  <Text
                    style={[
                      styles.empty,
                      {
                        color:
                          C.muted,
                      },
                    ]}
                  >
                    {userFriends.length ===
                    0
                      ? 'You do not have any friends to share with yet.'
                      : 'No people match your search.'}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            {/* ===============================================
                FRIEND REQUESTS
            =============================================== */}

            {incomingRequests.length >
              0 && (
              <View
                style={[
                  styles.requestsCard,
                  {
                    backgroundColor:
                      C.card,
                    borderColor:
                      C.border,
                  },
                ]}
              >
                <View
                  style={
                    styles.requestsHeader
                  }
                >
                  <View>
                    <Text
                      style={[
                        styles.requestsTitle,
                        {
                          color:
                            C.text,
                        },
                      ]}
                    >
                      FRIEND REQUESTS
                    </Text>

                    <Text
                      style={[
                        styles.requestsSubtitle,
                        {
                          color:
                            C.muted,
                        },
                      ]}
                    >
                      People who want
                      to connect with
                      you
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.requestCount,
                      {
                        backgroundColor:
                          accentForeground,
                      },
                    ]}
                  >
                    <Text
                      style={
                        styles.requestCountText
                      }
                    >
                      {
                        incomingRequests.length
                      }
                    </Text>
                  </View>
                </View>

                {incomingRequests.map(
                  (request) => (
                    <View
                      key={
                        request.id
                      }
                      style={[
                        styles.requestRow,
                        {
                          borderTopColor:
                            C.divider,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.friendAvatar,
                          {
                            backgroundColor:
                              accentForeground,
                          },
                        ]}
                      >
                        <Text
                          style={
                            styles.friendAvatarText
                          }
                        >
                          {(
                            request
                              .sender
                              ?.display_name ||
                            '?'
                          )
                            .slice(
                              0,
                              1,
                            )
                            .toUpperCase()}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.requestCopy
                        }
                      >
                        <Text
                          style={[
                            styles.requestName,
                            {
                              color:
                                C.text,
                            },
                          ]}
                        >
                          {request
                            .sender
                            ?.display_name ||
                            'Unknown user'}
                        </Text>

                        <Text
                          style={[
                            styles.requestUsername,
                            {
                              color:
                                C.muted,
                            },
                          ]}
                        >
                          @
                          {request
                            .sender
                            ?.username ||
                            'unknown'}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.requestButtons
                        }
                      >
                        <Pressable
                          disabled={
                            requestActionId ===
                            request.id
                          }
                          onPress={() =>
                            acceptFriendRequest(
                              request,
                            )
                          }
                          style={[
                            styles.acceptBtn,
                            {
                              backgroundColor:
                                accentForeground,
                            },
                          ]}
                        >
                          {requestActionId ===
                          request.id ? (
                            <ActivityIndicator
                              size="small"
                              color="#FFFFFF"
                            />
                          ) : (
                            <Check
                              color="#FFFFFF"
                              size={15}
                            />
                          )}
                        </Pressable>

                        <Pressable
                          disabled={
                            requestActionId ===
                            request.id
                          }
                          onPress={() =>
                            declineFriendRequest(
                              request,
                            )
                          }
                          style={[
                            styles.declineBtn,
                            {
                              backgroundColor:
                                C.card,
                              borderColor:
                                C.inputBorder,
                            },
                          ]}
                        >
                          <X
                            color={
                              C.muted
                            }
                            size={15}
                          />
                        </Pressable>
                      </View>
                    </View>
                  ),
                )}
              </View>
            )}

            {/* ===============================================
                CONVERSATION LIST
            =============================================== */}

            <View
              style={[
                styles.chatList,
                {
                  backgroundColor:
                    C.card,
                  borderColor:
                    C.border,
                },
              ]}
            >
              {filteredChats.map(
                (chat) => (
                  <Pressable
                    key={chat.id}
                    onPress={() =>
                      openChat(chat)
                    }
                    style={({ pressed }) => [
                      styles.chatRow,
                      {
                        borderBottomColor:
                          C.divider,
                      },
                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    {chat.category === 'system' &&
                    chat.id === 'sys-sidekick' &&
                    appContext.sidekick_id ? (
                      <View
                        style={[
                          styles.avatar,
                          styles.sidekickAvatarContainer,
                        ]}
                      >
                        <SidekickAvatar
                          sidekickId={appContext.sidekick_id}
                          size={38}
                        />
                      </View>
                    ) : chat.category === 'direct' && chat.sidekickId ? (
                      <View
                        style={[
                          styles.avatar,
                          styles.sidekickAvatarContainer,
                        ]}
                      >
                        <SidekickAvatar
                          sidekickId={chat.sidekickId}
                          size={38}
                        />
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.avatar,
                          { backgroundColor: accentForeground },
                        ]}
                      >
                        <Text
                          style={[
                            styles.avatarText,
                            { color: '#FFFFFF' },
                          ]}
                        >
                          {chat.category === 'system' &&
                          chat.id === 'sys-sidekick'
                            ? (appContext.display_name || '?')
                                .slice(0, 1)
                                .toUpperCase()
                            : chat.icon}
                        </Text>
                      </View>
                    )}

                    <View
                      style={
                        styles.chatCopy
                      }
                    >
                      <View
                        style={
                          styles.chatNameLine
                        }
                      >
                        <Text
                          style={[
                            styles.chatName,
                            {
                              color:
                                C.text,
                            },
                          ]}
                        >
                          {
                            chat.name
                          }
                        </Text>

                      </View>

                      <Text
                        style={[
                          styles.chatDetail,
                          {
                            color:
                              C.muted,
                          },
                        ]}
                        numberOfLines={
                          1
                        }
                      >
                        {
                          chat.detail
                        }
                      </Text>
                    </View>

                    <View
                      style={
                        styles.chatMeta
                      }
                    >
                      <Text
                        style={[
                          styles.time,
                          {
                            color:
                              C.muted,
                          },
                        ]}
                      >
                        {
                          chat.time
                        }
                      </Text>

                      {chat.unread ? (
                        <View
                          style={[
                            styles.unread,
                            {
                              backgroundColor:
                                accentForeground,
                            },
                          ]}
                        >
                          <Text
                            style={
                              styles.unreadText
                            }
                          >
                            {chat.unread}
                          </Text>
                        </View>
                      ) : chat.time &&
                        chat.lastMessageSenderId === myUserId &&
                        chat.lastMessageRead ? (
                        <CheckCheck
                          color={isBlackDark ? '#FFFFFF' : accentForeground}
                          size={15}
                          strokeWidth={2.2}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                ),
              )}
            </View>

            {requestsLoading &&
              incomingRequests.length ===
                0 && (
                <View
                  style={
                    styles.requestLoading
                  }
                >
                  <ActivityIndicator
                    size="small"
                    color={
                      accentForeground
                    }
                  />
                </View>
              )}



            {filteredChats.length ===
              0 &&
              !groupsLoading && (
                <Text
                  style={[
                    styles.empty,
                    {
                      color:
                        C.muted,
                    },
                  ]}
                >
                  No conversations
                  match your
                  filters.
                </Text>
              )}
          </>
        )}
      </ScrollView>

      {/* =====================================================
          FLEX SEND BAR
      ===================================================== */}

      {flexMode ? (
        <View
          style={[
            styles.flexBottomBar,
            {
              backgroundColor:
                C.card,
              borderTopColor:
                C.border,
            },
          ]}
        >
          <View
            style={{
              flex: 1,
            }}
          >
            <Text
              style={[
                styles.flexBottomTitle,
                {
                  color:
                    C.text,
                },
              ]}
            >
              {selectedRecipients.length ===
              0
                ? 'Select people'
                : `${selectedRecipients.length} ${
                    selectedRecipients.length ===
                    1
                      ? 'person'
                      : 'people'
                  } selected`}
            </Text>

            <Text
              style={[
                styles.flexBottomSubtitle,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              Your streak will be
              shared with everyone
              you select. People already
              sent this streak today stay
              marked as sent.
            </Text>
          </View>

          <Pressable
            disabled={
              flexSending ||
              selectedRecipients.length ===
                0
            }
            onPress={
              sendFlexMessage
            }
            style={[
              styles.flexSendButton,
              {
                backgroundColor:
                  accentForeground,
              },
              (flexSending ||
                selectedRecipients.length ===
                  0) && {
                opacity: 0.45,
              },
            ]}
          >
            {flexSending ? (
              <ActivityIndicator
                color="#FFFFFF"
                size="small"
              />
            ) : (
              <>
                <Send
                  color="#FFFFFF"
                  size={17}
                />

                <Text
                  style={
                    styles.flexSendText
                  }
                >
                  Send
                </Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* =====================================================
          ADD TAG MODAL
      ===================================================== */}

      <Modal
        visible={showAddTagModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowAddTagModal(false); setEditingTagId(null); }}
      >
        <Pressable
          style={styles.friendModalShade}
          onPress={() =>
            setShowAddTagModal(false)
          }
        />

        <View
          style={[
            styles.friendSheet,
            {
              backgroundColor: C.card,
            },
          ]}
        >
          <View
            style={styles.friendSheetHeader}
          >
            <Text
              style={[
                styles.friendSheetTitle,
                {
                  color: C.text,
                },
              ]}
            >
              {editingTagId ? 'Edit tag' : 'Add tag'}
            </Text>

            <Pressable
              onPress={() =>
                setShowAddTagModal(false)
              }
              hitSlop={12}
            >
              <X
                color={C.muted}
                size={22}
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.search,
              {
                backgroundColor: C.input,
                borderColor: C.inputBorder,
              },
            ]}
          >
            <TextInput
              value={newTagName}
              onChangeText={(text) => {
                setNewTagName(text.slice(0, 20));
                if (addTagError) {
                  setAddTagError(null);
                }
              }}
              placeholder="Tag name"
              placeholderTextColor={C.muted}
              style={[
                styles.searchInput,
                {
                  color: C.text,
                },
              ]}
              maxLength={20}
              autoFocus
              autoCapitalize="sentences"
              autoCorrect={false}
              onSubmitEditing={createChatTag}
            />
          </View>

          <View
            style={styles.tagCharacterRow}
          >
            <Text
              style={[
                styles.tagCharacterCount,
                {
                  color: C.muted,
                },
              ]}
            >
              {newTagName.length}/20
            </Text>
          </View>

          {addTagError ? (
            <Text style={styles.friendError}>
              {addTagError}
            </Text>
          ) : null}

          <Pressable
            onPress={createChatTag}
            disabled={addingTag || !newTagName.trim()}
            style={[
              styles.createGroupBtn,
              {
                backgroundColor: accentForeground,
              },
              (addingTag || !newTagName.trim()) && {
                opacity: 0.5,
              },
            ]}
          >
            {addingTag ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.createGroupBtnText}>
                {editingTagId ? 'Save changes' : 'Add tag'}
              </Text>
            )}

          </Pressable>
        </View>
      </Modal>

      {/* =====================================================
          CHAT TAG ASSIGNMENT MODAL
      ===================================================== */}

      <Modal
        visible={!!tagChat}
        transparent
        animationType="slide"
        onRequestClose={closeTagChat}
      >
        <Pressable
          style={styles.friendModalShade}
          onPress={closeTagChat}
        />

        <View
          style={[
            styles.friendSheet,
            {
              backgroundColor: C.card,
            },
          ]}
        >
          <View
            style={styles.friendSheetHeader}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text
                style={[
                  styles.friendSheetTitle,
                  { color: C.text },
                ]}
                numberOfLines={1}
              >
                Tags
              </Text>
              {tagChat ? (
                <Text
                  style={[
                    styles.tagModalSubtitle,
                    { color: C.muted },
                  ]}
                  numberOfLines={1}
                >
                  {tagChat.name}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={closeTagChat}
              hitSlop={12}
            >
              <X
                color={C.muted}
                size={22}
              />
            </Pressable>
          </View>

          {chatTags.length === 0 ? (
            <Text
              style={[
                styles.friendHint,
                { color: C.muted },
              ]}
            >
              You haven't created any tags yet.
            </Text>
          ) : (
            <View>
              {chatTags.map((tag) => {
                const assigned =
                  tagChat
                    ? isChatTagged(tagChat, tag.id)
                    : false;

                return (
                  <Pressable
                    key={tag.id}
                    onPress={() =>
                      tagChat &&
                      setChatTagAssignment(
                        tagChat,
                        tag,
                        !assigned,
                      )
                    }
                    style={[
                      styles.tagAssignmentRow,
                      {
                        borderBottomColor: C.divider,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.tagCheckbox,
                        {
                          borderColor: assigned
                            ? accentForeground
                            : C.inputBorder,
                          backgroundColor: assigned
                            ? accentForeground
                            : 'transparent',
                        },
                      ]}
                    >
                      {assigned ? (
                        <Check
                          color="#FFFFFF"
                          size={14}
                          strokeWidth={2.5}
                        />
                      ) : null}
                    </View>

                    <Text
                      style={[
                        styles.tagAssignmentText,
                        { color: C.text },
                      ]}
                      numberOfLines={1}
                    >
                      {tag.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {tagModalError ? (
            <Text style={styles.friendError}>
              {tagModalError}
            </Text>
          ) : null}

          <Pressable
            onPress={() => {
              closeTagChat();
              openAddTag();
            }}
            style={[
              styles.createGroupBtn,
              {
                backgroundColor: accentForeground,
              },
            ]}
          >
            <Text style={styles.createGroupBtnText}>
              + Create tag
            </Text>
          </Pressable>
        </View>
      </Modal>

      {/* =====================================================
          ADD FRIEND MODAL
      ===================================================== */}

      <Modal
        visible={
          friendSearchOpen
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setFriendSearchOpen(
            false,
          )
        }
      >
        <View style={styles.friendModalRoot}>
          <Pressable
            style={styles.friendModalBackdrop}
            onPress={() =>
              setFriendSearchOpen(false)
            }
          />

          <KeyboardAvoidingView
            behavior={
              Platform.OS === 'ios'
                ? 'padding'
                : 'height'
            }
            style={styles.friendKeyboardContainer}
          >
          <View
            style={[
              styles.friendSheet,
              {
                backgroundColor:
                  C.card,
              },
            ]}
          >
            <View
              style={
                styles.friendSheetHeader
              }
          >
            <Text
              style={[
                styles.friendSheetTitle,
                {
                  color:
                    C.text,
                },
              ]}
            >
              Find friends by
              username
            </Text>

            <Pressable
              onPress={() =>
                setFriendSearchOpen(
                  false,
                )
              }
              hitSlop={12}
            >
              <X
                color={C.muted}
                size={22}
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.search,
              {
                backgroundColor:
                  C.input,
                borderColor:
                  C.inputBorder,
              },
            ]}
          >
            <Search
              color={C.muted}
              size={18}
            />

            <TextInput
              value={
                friendQuery
              }
              onChangeText={
                searchUsers
              }
              placeholder="e.g. alex99"
              placeholderTextColor={
                C.muted
              }
              style={[
                styles.searchInput,
                {
                  color:
                    C.text,
                },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </View>

          {friendError ? (
            <Text
              style={
                styles.friendError
              }
            >
              {friendError}
            </Text>
          ) : null}

          {friendSearching ? (
            <ActivityIndicator
              color={
                accentForeground
              }
              style={{
                marginTop: 100,
              }}
            />
          ) : null}

          {!friendSearching &&
            !friendError &&
            friendResults.length ===
              0 &&
            friendQuery.trim()
              .length > 0 && (
              <Text
                style={[
                  styles.friendHint,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                No users found
                with that
                username.
              </Text>
            )}

          <ScrollView
            style={
              styles.friendResults
            }
            showsVerticalScrollIndicator={
              false
            }
          >
            {friendResults.map(
              (profile) => (
                <View
                  key={
                    profile.user_id
                  }
                  style={[
                    styles.friendResultRow,
                    {
                      borderBottomColor:
                        C.divider,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.friendAvatar,
                      {
                        backgroundColor:
                          accentForeground,
                      },
                    ]}
                  >
                    <Text
                      style={
                        styles.friendAvatarText
                      }
                    >
                      {(
                        profile.display_name ||
                        '?'
                      )
                        .slice(
                          0,
                          1,
                        )
                        .toUpperCase()}
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Text
                      style={[
                        styles.friendName,
                        {
                          color:
                            C.text,
                        },
                      ]}
                    >
                      {
                        profile.display_name
                      }
                    </Text>

                    <Text
                      style={[
                        styles.friendUsername,
                        {
                          color:
                            C.muted,
                        },
                      ]}
                    >
                      @
                      {
                        profile.username
                      }
                    </Text>
                  </View>

                  <Pressable
                    disabled={
                      sendingRequestId ===
                        profile.user_id ||
                      existingFriendIds.includes(
                        profile.user_id,
                      ) ||
                      sentRequestIds.includes(
                        profile.user_id,
                      )
                    }
                    onPress={() =>
                      sendFriendRequest(
                        profile.user_id,
                      )
                    }
                    style={[
                      styles.sendFriendBtn,
                      {
                        backgroundColor:
                          accentForeground,
                      },
                    ]}
                  >
                    {sendingRequestId ===
                    profile.user_id ? (
                      <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                      />
                    ) : existingFriendIds.includes(
                        profile.user_id,
                      ) ? (
                      <>
                        <CheckCheck
                          color="#FFFFFF"
                          size={14}
                        />

                        <Text
                          style={
                            styles.sendFriendText
                          }
                        >
                          Friends
                        </Text>
                      </>
                    ) : sentRequestIds.includes(
                        profile.user_id,
                      ) ? (
                      <>
                        <Check
                          color="#FFFFFF"
                          size={14}
                        />

                        <Text
                          style={
                            styles.sendFriendText
                          }
                        >
                          Sent
                        </Text>
                      </>
                    ) : (
                      <>
                        <Send
                          color="#FFFFFF"
                          size={14}
                        />

                        <Text
                          style={
                            styles.sendFriendText
                          }
                        >
                          Add
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ),
            )}
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* =====================================================
          CREATE GROUP MODAL
      ===================================================== */}

      <Modal
        visible={
          createGroupOpen
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setCreateGroupOpen(
            false,
          )
        }
      >
        <Pressable
          style={
            styles.friendModalShade
          }
          onPress={() =>
            setCreateGroupOpen(
              false,
            )
          }
        />

        <View
          style={[
            styles.friendSheet,
            {
              backgroundColor:
                C.card,
            },
          ]}
        >
          <View
            style={
              styles.friendSheetHeader
            }
          >
            <Text
              style={[
                styles.friendSheetTitle,
                {
                  color:
                    C.text,
                },
              ]}
            >
              Create a group
            </Text>

            <Pressable
              onPress={() =>
                setCreateGroupOpen(
                  false,
                )
              }
              hitSlop={12}
            >
              <X
                color={C.muted}
                size={22}
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.search,
              {
                backgroundColor:
                  C.input,
                borderColor:
                  C.inputBorder,
              },
            ]}
          >
            <TextInput
              value={
                newGroupName
              }
              onChangeText={
                setNewGroupName
              }
              placeholder="Group name"
              placeholderTextColor={
                C.muted
              }
              style={[
                styles.searchInput,
                {
                  color:
                    C.text,
                },
              ]}
              autoFocus
              onSubmitEditing={
                handleCreateGroup
              }
            />
          </View>

          <View
            style={[
              styles.search,
              {
                backgroundColor: C.input,
                borderColor: C.inputBorder,
              },
            ]}
          >
            <TextInput
              value={newGroupDescription}
              onChangeText={setNewGroupDescription}
              placeholder="Group description (optional)"
              placeholderTextColor={C.muted}
              style={[styles.searchInput, { color: C.text }]}
              multiline
              maxLength={200}
            />
          </View>

          {createGroupError ? (
            <Text
              style={
                styles.friendError
              }
            >
              {
                createGroupError
              }
            </Text>
          ) : null}

          <Pressable
            onPress={
              handleCreateGroup
            }
            disabled={
              creatingGroup ||
              !newGroupName.trim()
            }
            style={[
              styles.createGroupBtn,
              {
                backgroundColor:
                  accentForeground,
              },
              (creatingGroup ||
                !newGroupName.trim()) && {
                opacity: 0.5,
              },
            ]}
          >
            {creatingGroup ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.createGroupBtnText
                }
              >
                Create Group
              </Text>
            )}
          </Pressable>

          <Text
            style={[
              styles.friendHint,
              {
                color:
                  C.muted,
              },
            ]}
          >
            You'll be the admin. You can rename the group and edit its description after it is created.
          </Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function formatChatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/* =========================================================
   STYLES
========================================================= */

const FONT =
  'Poppins_400Regular';

const FONT_MED =
  'Poppins_500Medium';

const FONT_SEMI =
  'Poppins_600SemiBold';

const FONT_BOLD =
  'Poppins_700Bold';

const styles =
  StyleSheet.create({
    safe: {
      flex: 1,
    },

    frozenHeader: {
      paddingHorizontal: 16,
      paddingTop: 30,
      paddingVertical: 12,
    },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    search: {
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      gap: 10,
    },

    searchInput: {
      flex: 1,
      fontFamily: FONT,
      fontSize: 14,
    },

    addFriendBtn: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },

    filters: {
      gap: 8,
      paddingVertical: 14,
    },

    filter: {
      paddingHorizontal: 18,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    filterText: {
      fontFamily:
        FONT_MED,
      fontSize: 12,
    },

    addTagFilter: {
      flexDirection: 'row',
      gap: 5,
      paddingHorizontal: 13,
    },

    tagCharacterRow: {
      alignItems: 'flex-end',
      marginTop: 5,
    },

    tagCharacterCount: {
      fontFamily: FONT,
      fontSize: 10,
    },

    tagModalSubtitle: {
      fontFamily: FONT,
      fontSize: 11,
      marginTop: 2,
    },

    tagAssignmentRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderBottomWidth: 1,
    },

    tagCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },

    tagAssignmentText: {
      flex: 1,
      fontFamily: FONT_MED,
      fontSize: 13,
    },

    chatScrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 100,
    },

    flexContent: {
      paddingBottom: 130,
    },

    chatScrollContentWithFab: {
      paddingBottom: 150,
    },

    chatList: {
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 14,
    },

    chatRow: {
      minHeight: 78,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      gap: 12,
    },

    pressed: {
      opacity: 0.7,
    },

    avatar: {
      width: 48,
      height: 48,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },

    sidekickAvatarContainer: {
      backgroundColor: '#FFFFFF',
      padding: 5,
    },

    avatarText: {
      fontFamily:
        FONT_BOLD,
      fontSize: 16,
    },

    chatCopy: {
      flex: 1,
      gap: 5,
    },

    chatNameLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },

    chatName: {
      fontFamily:
        FONT_SEMI,
      fontSize: 14,
    },

    chatDetail: {
      fontFamily: FONT,
      fontSize: 12,
    },

    chatMeta: {
      height: 40,
      justifyContent:
        'space-between',
      alignItems:
        'flex-end',
    },

    time: {
      fontFamily: FONT,
      fontSize: 10,
    },

    unread: {
      minWidth: 17,
      height: 17,
      borderRadius: 8.5,
      alignItems: 'center',
      justifyContent: 'center',
    },

    unreadText: {
      color: '#FFF',
      fontFamily:
        FONT_BOLD,
      fontSize: 10,
    },

    empty: {
      textAlign: 'center',
      fontFamily: FONT,
      marginTop: 30,
      lineHeight: 20,
    },

    /* =====================================================
       FLEX MODE
    ===================================================== */

    flexHeader: {
      paddingHorizontal: 16,
      paddingTop: 50,
      paddingBottom: 10,
    },

    flexHeaderTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },

    flexTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 22,
    },

    flexSubtitle: {
      fontFamily: FONT,
      fontSize: 12,
      marginTop: 3,
    },

    streakPreview: {
      borderWidth: 1,
      borderRadius: 15,
      padding: 14,
      marginBottom: 12,
    },

    streakPreviewLabel: {
      fontFamily:
        FONT_BOLD,
      fontSize: 9,
      letterSpacing: 1.3,
      marginBottom: 5,
    },

    streakPreviewText: {
      fontFamily:
        FONT_MED,
      fontSize: 13,
      lineHeight: 19,
    },

    selectionCountRow: {
      paddingTop: 9,
      paddingHorizontal: 2,
    },

    selectionCount: {
      fontFamily:
        FONT_MED,
      fontSize: 11,
    },

    selectionCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },

    flexSentLabel: {
      fontFamily: FONT_MED,
      fontSize: 11,
    },

    flexEmpty: {
      paddingVertical: 35,
      paddingHorizontal: 20,
    },

    flexError: {
      fontFamily: FONT_MED,
      fontSize: 12,
      marginBottom: 10,
      lineHeight: 18,
    },

    flexBottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 70,
      paddingHorizontal: 18,
      paddingTop: 13,
      paddingBottom: 15,
      borderTopWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },

    flexBottomTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 13,
    },

    flexBottomSubtitle: {
      fontFamily: FONT,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 2,
    },

    flexSendButton: {
      minWidth: 92,
      height: 44,
      borderRadius: 13,
      paddingHorizontal: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },

    flexSendText: {
      color: '#FFFFFF',
      fontFamily:
        FONT_BOLD,
      fontSize: 13,
    },

    /* =====================================================
       REQUESTS
    ===================================================== */

    requestsCard: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
      marginBottom: 14,
    },

    requestsHeader: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },

    requestsTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 11,
      letterSpacing: 1.2,
    },

    requestsSubtitle: {
      fontFamily: FONT,
      fontSize: 11,
      marginTop: 3,
    },

    requestCount: {
      minWidth: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },

    requestCountText: {
      color: '#FFFFFF',
      fontFamily:
        FONT_BOLD,
      fontSize: 11,
    },

    requestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: 1,
    },

    requestCopy: {
      flex: 1,
    },

    requestName: {
      fontFamily:
        FONT_SEMI,
      fontSize: 13.5,
    },

    requestUsername: {
      fontFamily: FONT,
      fontSize: 11.5,
      marginTop: 2,
    },

    requestButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },

    acceptBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },

    declineBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    requestLoading: {
      paddingVertical: 12,
      alignItems: 'center',
    },

    /* =====================================================
       AVATARS
    ===================================================== */

    friendAvatar: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },

    friendAvatarText: {
      fontFamily:
        FONT_BOLD,
      fontSize: 15,
      color: '#FFFFFF',
    },

    /* =====================================================
       ADD GROUP
    ===================================================== */

    addGroupFab: {
      position: 'absolute',
      bottom: 20,
      alignSelf: 'center',
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },

    /* =====================================================
       FRIEND MODAL
    ===================================================== */

    friendModalRoot: {
      flex: 1,
      position: 'relative',
      backgroundColor: 'transparent',
    },

    friendModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },

    // Shared backdrop style used by the friend, tag, and group modals.
    friendModalShade: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },

    friendKeyboardContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '88%',
      justifyContent: 'flex-start',
      padding: 0,
    },

    friendSheet: {
      width: '100%',
      height: '100%',
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: 26,
      borderBottomRightRadius: 26,
      padding: 24,
      paddingBottom: 24,
      overflow: 'hidden',
    },

    friendSheetHeader: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },

    friendSheetTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 18,
      flex: 1,
      marginRight: 12,
    },

    friendError: {
      color: '#E05252',
      fontFamily: FONT,
      fontSize: 13,
      marginTop: 8,
      lineHeight: 18,
    },

    friendHint: {
      fontFamily: FONT,
      fontSize: 13,
      marginTop: 12,
      textAlign: 'center',
    },

    friendResults: {
      flex: 1,
      marginTop: 12,
    },

    friendResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      gap: 12,
    },

    friendName: {
      fontFamily:
        FONT_SEMI,
      fontSize: 14,
    },

    friendUsername: {
      fontFamily: FONT,
      fontSize: 12,
      marginTop: 2,
    },

    sendFriendBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 12,
      minWidth: 64,
      height: 32,
      borderRadius: 10,
    },

    sendFriendText: {
      color: '#FFFFFF',
      fontFamily:
        FONT_SEMI,
      fontSize: 12,
    },

    /* =====================================================
       CREATE GROUP
    ===================================================== */

    createGroupBtn: {
      marginTop: 16,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },

    createGroupBtnText: {
      fontFamily:
        FONT_BOLD,
      fontSize: 15,
      color: '#FFFFFF',
    },
  });