import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
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

import {
  useLocalSearchParams,
  router,
} from 'expo-router';

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

/* =========================================================
   TYPES
========================================================= */

type ChatItem = {
  id: string;
  name: string;
  detail: string;
  time: string;
  unread?: number;
  category: 'system' | 'groups' | 'direct';
  icon: string;
  profileId?: string;
  route?: string;
  moduleRoute?: string;
};

type SocialProfile = {
  id?: string;
  user_id: string;
  display_name: string;
  username: string;
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

/* =========================================================
   SYSTEM CHAT
========================================================= */

const SIDEKICK_GREETING =
  "Hi! I'm your Sidekick. How can I help you today?";

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
  'Groups',
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

  const displayName =
    appContext.display_name ||
    appContext.profileName ||
    'User';

  /* =======================================================
     HABIT FLEX PARAMETERS

     Habits opens:

     /chat?flex=1&streak=7&habitTitle=Morning%20Workout

     This puts the chat screen into recipient-selection
     mode instead of opening one person's conversation.
  ======================================================= */

  const params = useLocalSearchParams<{
    flex?: string;
    streak?: string;
    habitTitle?: string;
  }>();

  const flexMode =
    params.flex === '1' ||
    params.flex === 'true';

  const streakCount =
    Number(params.streak ?? 0);

  const habitTitle =
    typeof params.habitTitle === 'string'
      ? params.habitTitle
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
    useState<FilterKey>('All');

  const [userFriends, setUserFriends] =
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

  /* =======================================================
     CREATE GROUP
  ======================================================= */

  const [createGroupOpen, setCreateGroupOpen] =
    useState(false);

  const [newGroupName, setNewGroupName] =
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
      .select('friend_user_id')
      .eq('user_id', user.id);

    if (friendshipError) {
      console.error(
        'LOAD FRIENDSHIPS ERROR:',
        friendshipError,
      );

      setUserFriends([]);
      return;
    }

    const friendIds =
      (friendshipRows ?? []).map(
        (row: {
          friend_user_id: string;
        }) => row.friend_user_id,
      );

    if (!friendIds.length) {
      setUserFriends([]);
      return;
    }

    const {
      data: profiles,
      error: profileError,
    } = await supabase
      .from('social_profiles')
      .select(
        'user_id, display_name, username',
      )
      .in('user_id', friendIds);

    if (profileError) {
      console.error(
        'LOAD FRIEND PROFILES ERROR:',
        profileError,
      );

      setUserFriends([]);
      return;
    }

    const friendsList: ChatItem[] =
      (profiles ?? []).map(
        (profile: SocialProfile) => ({
          id: profile.user_id,
          name: profile.display_name,
          detail: `@${profile.username}`,
          time: 'Active',
          category: 'direct',
          icon: (
            profile.display_name || '?'
          )
            .slice(0, 1)
            .toUpperCase(),
          profileId: profile.user_id,
        }),
      );

    setUserFriends(friendsList);
  }, []);

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
      .from('social_group_members')
      .select('group_id, role')
      .eq('profile_id', user.id);

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
      .from('social_groups')
      .select(
        'id, name, created_at',
      )
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

    const groupsList: ChatItem[] =
      (groupRows ?? []).map(
        (group: {
          id: string;
          name: string;
        }) => ({
          id: `group-${group.id}`,
          name: group.name,
          detail:
            roleByGroupId.get(
              group.id,
            ) === 'admin'
              ? 'You’re an admin'
              : 'Group',
          time: '',
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
  }, []);

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
        data,
        error,
      } = await supabase
        .from('system_messages')
        .select(
          'content, created_at',
        )
        .eq(
          'user_id',
          user.id,
        )
        .eq(
          'module_key',
          'sidekick',
        )
        .order(
          'created_at',
          {
            ascending: false,
          },
        )
        .limit(1)
        .maybeSingle();

      if (error || !data) return;

      const time =
        new Date(
          data.created_at,
        ).toLocaleTimeString(
          [],
          {
            hour: 'numeric',
            minute: '2-digit',
          },
        );

      setSidekickPreview({
        content: data.content,
        time,
      });
    }, []);

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
          'social_group_invites',
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
          .from('social_groups')
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
          'social_group_invites',
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
        .from(
          'social_group_members',
        )
        .insert({
          group_id:
            invite.group_id,
          profile_id:
            user.id,
          role: 'member',
        });

      if (memberError) {
        console.error(
          'JOIN GROUP AFTER ACCEPT ERROR:',
          memberError,
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
          'social_group_invites',
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

  const handleCreateGroup =
    async () => {
      const name =
        newGroupName.trim();

      if (
        !name ||
        creatingGroup
      ) {
        return;
      }

      setCreatingGroup(true);
      setCreateGroupError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCreateGroupError(
          'You must be signed in.',
        );

        setCreatingGroup(false);
        return;
      }

      const {
        data: groupData,
        error: groupError,
      } = await supabase
        .from('social_groups')
        .insert({
          name,
          created_by:
            user.id,
        })
        .select('id')
        .single();

      if (
        groupError ||
        !groupData
      ) {
        console.error(
          'CREATE GROUP ERROR:',
          groupError,
        );

        setCreateGroupError(
          groupError?.message ||
            'Could not create group.',
        );

        setCreatingGroup(false);
        return;
      }

      const groupId =
        (
          groupData as {
            id: string;
          }
        ).id;

      const {
        error: memberError,
      } = await supabase
        .from(
          'social_group_members',
        )
        .insert({
          group_id:
            groupId,
          profile_id:
            user.id,
          role: 'admin',
        });

      setCreatingGroup(false);

      if (memberError) {
        console.error(
          'CREATE GROUP MEMBER ERROR:',
          memberError,
        );

        setCreateGroupError(
          memberError.message ||
            'Group created, but could not add you as a member.',
        );

        return;
      }

      setNewGroupName('');
      setCreateGroupOpen(false);

      await loadGroups();

      router.push(
        `/chat/group/${groupId}` as never,
      );
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

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    loadFriends();
    loadIncomingRequests();
    loadGroups();
    loadSidekickPreview();
    loadIncomingGroupInvites();
  }, [
    loadFriends,
    loadIncomingRequests,
    loadGroups,
    loadSidekickPreview,
    loadIncomingGroupInvites,
  ]);

  /* =========================================================
     CLEAR FLEX SELECTION WHEN NOT IN FLEX MODE
  ========================================================= */

  useEffect(() => {
    if (!flexMode) {
      setSelectedRecipients([]);
      setFlexSearch('');
      setFlexError(null);
    }
  }, [flexMode]);

  /* =========================================================
     COMBINED CHAT LIST
  ========================================================= */

  const allChats = useMemo(
    () => [
      ...SYSTEM_CHATS.map(
        (chat) =>
          chat.id ===
            'sys-sidekick' &&
          sidekickPreview
            ? {
                ...chat,
                detail:
                  sidekickPreview.content,
                time:
                  sidekickPreview.time,
              }
            : chat,
      ),
      ...userFriends,
      ...userGroups,
    ],
    [
      userFriends,
      userGroups,
      sidekickPreview,
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
            chat.name
              .toLowerCase()
              .includes(
                lowered,
              ) ||
            chat.detail
              .toLowerCase()
              .includes(
                lowered,
              ),
        );

      switch (filter) {
        case 'All':
          return byName;

        case 'Unread':
          return byName.filter(
            (chat) =>
              !!chat.unread,
          );

        case 'Groups':
          return byName.filter(
            (chat) =>
              chat.category ===
              'groups',
          );

        default:
          return byName;
      }
    }, [
      allChats,
      query,
      filter,
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

      setSelectedRecipients(
        (previous) =>
          previous.includes(
            profileId,
          )
            ? previous.filter(
                (id) =>
                  id !==
                  profileId,
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
        '/chat' as never,
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
          'The streak message could not be prepared.',
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

        /*
         * Send the streak message directly to every
         * selected friend. This keeps the user on the
         * chat list instead of opening the last selected
         * conversation.
         *
         * Direct conversations use:
         *
         *   direct:{recipientUserId}
         *
         * This matches chat/[id].tsx.
         */
        const messages = selectedRecipients.map(
          (recipientId) => ({
            conversation_id: `direct:${recipientId}`,
            sender_id: user.id,
            content: streakMessage,
          }),
        );

        const { error: sendError } = await supabase
          .from('social_messages')
          .insert(messages);

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

        /*
         * Clear the selection after a successful send.
         */
        setSelectedRecipients([]);
        setFlexSearch('');
        setFlexError(null);

        /*
         * Return to the normal chat list.
         */
        router.replace('/chat' as never);
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

      setFriendResults(
        (data ??
          []) as SocialProfile[],
      );
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

      setFriendResults(
        (previous) =>
          previous.filter(
            (profile) =>
              profile.user_id !==
              friendUserId,
          ),
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

  const openChat = (
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

    if (
      chat.category ===
        'direct' &&
      chat.profileId
    ) {
      router.push(
        `/chat/${chat.profileId}` as never,
      );

      return;
    }

    if (chat.route) {
      router.push(
        chat.route as never,
      );
    }
  };

  /* =========================================================
     OPEN CREATE GROUP
  ========================================================= */

  const openCreateGroup = () => {
    setCreateGroupOpen(true);
    setNewGroupName('');
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
        text: '#F4F2EE',
        muted: '#AAA59D',
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
            style={styles.hero}
          >
            <Text
              style={[
                styles.heroName,
                {
                  color:
                    accentForeground,
                },
              ]}
            >
              {displayName},
            </Text>

            <Text
              style={[
                styles.heroSubtitle,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              What would you like
              to take care of
              today?
            </Text>
          </View>

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
                    setFilter(
                      item,
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
          !flexMode &&
            filter ===
              'Groups' &&
            styles.chatScrollContentWithFab,
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
                    const selected =
                      friend.profileId
                        ? selectedRecipients.includes(
                            friend.profileId,
                          )
                        : false;

                    return (
                      <Pressable
                        key={
                          friend.id
                        }
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
                            styles.pressed,
                          selected && {
                            backgroundColor:
                              isDark
                                ? '#1D241F'
                                : '#F5FAF6',
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.avatar,
                            {
                              backgroundColor:
                                accentForeground,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.avatarText,
                              {
                                color:
                                  '#FFFFFF',
                              },
                            ]}
                          >
                            {
                              friend.icon
                            }
                          </Text>
                        </View>

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
                GROUP INVITES
            =============================================== */}

            {incomingGroupInvites.length >
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
                      GROUP INVITES
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
                      Groups you've
                      been invited to
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
                        incomingGroupInvites.length
                      }
                    </Text>
                  </View>
                </View>

                {incomingGroupInvites.map(
                  (invite) => (
                    <View
                      key={
                        invite.id
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
                          {invite.group_name
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
                          {
                            invite.group_name
                          }
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
                          Invited by{' '}
                          {
                            invite.inviter_name
                          }
                        </Text>
                      </View>

                      <View
                        style={
                          styles.requestButtons
                        }
                      >
                        <Pressable
                          disabled={
                            groupInviteActionId ===
                            invite.id
                          }
                          onPress={() =>
                            acceptGroupInvite(
                              invite,
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
                          {groupInviteActionId ===
                          invite.id ? (
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
                            groupInviteActionId ===
                            invite.id
                          }
                          onPress={() =>
                            declineGroupInvite(
                              invite,
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
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor:
                            accentForeground,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarText,
                          {
                            color:
                              '#FFFFFF',
                          },
                        ]}
                      >
                        {
                          chat.icon
                        }
                      </Text>
                    </View>

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
                              {
                                chat.unread
                              }
                            </Text>
                          </View>
                        ) : null}
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
                        <CheckCheck
                          color={
                            accentForeground
                          }
                          size={15}
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

            {groupsLoading &&
              filter === 'Groups' &&
              filteredChats.length ===
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
                  match that
                  filter.
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
              you select.
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
          ADD GROUP FAB
      ===================================================== */}

      {!flexMode &&
        filter === 'Groups' && (
          <Pressable
            onPress={
              openCreateGroup
            }
            accessibilityRole="button"
            accessibilityLabel="Add group"
            hitSlop={8}
            style={[
              styles.addGroupFab,
              {
                backgroundColor:
                  accentForeground,
              },
            ]}
          >
            <Plus
              color="#FFFFFF"
              size={26}
              strokeWidth={2.5}
            />
          </Pressable>
        )}

      {/* =====================================================
          ADD FRIEND MODAL
      ===================================================== */}

      <Modal
        visible={
          friendSearchOpen
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setFriendSearchOpen(
            false,
          )
        }
      >
        <Pressable
          style={
            styles.friendModalShade
          }
          onPress={() =>
            setFriendSearchOpen(
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
                marginTop: 16,
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
                      profile.user_id
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
            You'll be the
            admin. Invite
            friends and add
            subgroups once
            it's created.
          </Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
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
    },

    hero: {
      paddingTop: 28,
      paddingBottom: 14,
    },

    heroName: {
      fontFamily:
        FONT_BOLD,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.8,
    },

    heroSubtitle: {
      fontFamily: FONT,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
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

    chatScrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 30,
    },

    flexContent: {
      paddingBottom: 130,
    },

    chatScrollContentWithFab: {
      paddingBottom: 110,
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
      width: 42,
      height: 42,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
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
      paddingTop: 22,
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
      bottom: 0,
      paddingHorizontal: 18,
      paddingTop: 13,
      paddingBottom: 25,
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
      bottom: 24,
      left: '50%',
      marginLeft: -29,
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 7,
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.22,
      shadowRadius: 7,
    },

    /* =====================================================
       FRIEND MODAL
    ===================================================== */

    friendModalShade: {
      flex: 1,
      backgroundColor:
        'rgba(0,0,0,0.4)',
    },

    friendSheet: {
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      padding: 24,
      paddingBottom: 34,
      maxHeight: '85%',
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