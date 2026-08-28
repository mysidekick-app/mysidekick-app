import { useCallback, useEffect, useMemo, useState } from 'react';

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

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';

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
   SYSTEM CHATS
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

type FilterKey =
  (typeof filters)[number];

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

  /* ---------------------------------------------------------
     Main chat search/filter
  --------------------------------------------------------- */

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
    useState<{ content: string; time: string } | null>(null);

  /* ---------------------------------------------------------
     Add friend modal
  --------------------------------------------------------- */

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

  /* ---------------------------------------------------------
     Create group modal
  --------------------------------------------------------- */

  const [createGroupOpen, setCreateGroupOpen] =
    useState(false);

  const [newGroupName, setNewGroupName] =
    useState('');

  const [creatingGroup, setCreatingGroup] =
    useState(false);

  const [createGroupError, setCreateGroupError] =
    useState<string | null>(null);

  /* ---------------------------------------------------------
     Incoming requests
  --------------------------------------------------------- */

  const [incomingRequests, setIncomingRequests] =
    useState<IncomingRequest[]>([]);

  const [requestsLoading, setRequestsLoading] =
    useState(true);

  const [requestActionId, setRequestActionId] =
    useState<string | null>(null);

  const [incomingGroupInvites, setIncomingGroupInvites] =
    useState<IncomingGroupInvite[]>([]);

  const [groupInviteActionId, setGroupInviteActionId] =
    useState<string | null>(null);

  /* =========================================================
     LOAD FRIENDS
  ========================================================= */

  const loadFriends =
    useCallback(async () => {
      const {
        data: {
          user,
        },
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
        .select(
          'friend_user_id',
        )
        .eq(
          'user_id',
          user.id,
        );

      if (friendshipError) {
        console.error(
          'LOAD FRIENDSHIPS ERROR:',
          friendshipError,
        );

        setUserFriends([]);
        return;
      }

      const friendIds =
        (friendshipRows ?? [])
          .map(
            (
              row: {
                friend_user_id: string;
              },
            ) =>
              row.friend_user_id,
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
        .in(
          'user_id',
          friendIds,
        );

      if (profileError) {
        console.error(
          'LOAD FRIEND PROFILES ERROR:',
          profileError,
        );

        setUserFriends([]);
        return;
      }

      const friendsList: ChatItem[] =
        (
          profiles ?? []
        ).map(
          (
            profile: SocialProfile,
          ) => ({
            id: profile.user_id,
            name:
              profile.display_name,
            detail:
              `@${profile.username}`,
            time: 'Active',
            category: 'direct',
            icon:
              profile.display_name
                .slice(0, 1)
                .toUpperCase(),
            profileId:
              profile.user_id,
          }),
        );

      setUserFriends(
        friendsList,
      );
    }, []);

  /* =========================================================
     LOAD GROUPS
  ========================================================= */

  const loadGroups =
    useCallback(async () => {
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
        console.error('LOAD GROUP MEMBERSHIPS ERROR:', memberError);
        setUserGroups([]);
        setGroupsLoading(false);
        return;
      }

      const groupIds = (memberRows ?? []).map((r: { group_id: string }) => r.group_id);
      if (!groupIds.length) {
        setUserGroups([]);
        setGroupsLoading(false);
        return;
      }

      const roleByGroupId = new Map(
        (memberRows ?? []).map((r: { group_id: string; role: string }) => [r.group_id, r.role])
      );

      const {
        data: groupRows,
        error: groupError,
      } = await supabase
        .from('social_groups')
        .select('id, name, created_at')
        .in('id', groupIds)
        .order('created_at', { ascending: false });

      if (groupError) {
        console.error('LOAD GROUPS ERROR:', groupError);
        setUserGroups([]);
        setGroupsLoading(false);
        return;
      }

      const groupsList: ChatItem[] = (groupRows ?? []).map(
        (g: { id: string; name: string }) => ({
          id: `group-${g.id}`,
          name: g.name,
          detail: roleByGroupId.get(g.id) === 'admin' ? 'You\u2019re an admin' : 'Group',
          time: '',
          category: 'groups' as const,
          icon: g.name.slice(0, 1).toUpperCase(),
          route: `/chat/group/${g.id}`,
        })
      );

      setUserGroups(groupsList);
      setGroupsLoading(false);
    }, []);

  /* =========================================================
     LOAD SIDEKICK PREVIEW (latest message for the list row)
  ========================================================= */

  const loadSidekickPreview =
    useCallback(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // system_messages may not exist yet if Sidekick hasn't been
      // wired up on the backend — fail quietly and keep the
      // default greeting rather than showing an error.
      const { data, error } = await supabase
        .from('system_messages')
        .select('content, created_at')
        .eq('user_id', user.id)
        .eq('module_key', 'sidekick')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return;

      const time = new Date(data.created_at).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });

      setSidekickPreview({ content: data.content, time });
    }, []);

  /* =========================================================
     LOAD + ACT ON INCOMING GROUP INVITES
  ========================================================= */

  const loadIncomingGroupInvites =
    useCallback(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { setIncomingGroupInvites([]); return; }

      const { data: inviteRows, error: inviteError } = await supabase
        .from('social_group_invites')
        .select('id, group_id, inviter_id, created_at')
        .eq('invitee_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (inviteError) {
        console.error('LOAD GROUP INVITES ERROR:', inviteError);
        setIncomingGroupInvites([]);
        return;
      }

      if (!inviteRows?.length) {
        setIncomingGroupInvites([]);
        return;
      }

      const groupIds = [...new Set(inviteRows.map((r) => r.group_id))];
      const inviterIds = [...new Set(inviteRows.map((r) => r.inviter_id))];

      const [{ data: groupRows }, { data: profileRows }] = await Promise.all([
        supabase.from('social_groups').select('id, name').in('id', groupIds),
        supabase.from('social_profiles').select('user_id, display_name').in('user_id', inviterIds),
      ]);

      const groupNameById = new Map((groupRows ?? []).map((g) => [g.id, g.name]));
      const inviterNameById = new Map((profileRows ?? []).map((p) => [p.user_id, p.display_name]));

      setIncomingGroupInvites(
        inviteRows.map((r) => ({
          id: r.id,
          group_id: r.group_id,
          group_name: groupNameById.get(r.group_id) ?? 'Group',
          inviter_id: r.inviter_id,
          inviter_name: inviterNameById.get(r.inviter_id) ?? 'Someone',
          created_at: r.created_at,
        }))
      );
    }, []);

  const acceptGroupInvite =
    async (invite: IncomingGroupInvite) => {
      setGroupInviteActionId(invite.id);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { setGroupInviteActionId(null); return; }

      const { error: updateError } = await supabase
        .from('social_group_invites')
        .update({ status: 'accepted' })
        .eq('id', invite.id);

      if (updateError) {
        console.error('ACCEPT GROUP INVITE ERROR:', updateError);
        setGroupInviteActionId(null);
        return;
      }

      const { error: memberError } = await supabase
        .from('social_group_members')
        .insert({ group_id: invite.group_id, profile_id: user.id, role: 'member' });

      if (memberError) {
        console.error('JOIN GROUP AFTER ACCEPT ERROR:', memberError);
      }

      setIncomingGroupInvites((prev) => prev.filter((i) => i.id !== invite.id));
      await loadGroups();
      setGroupInviteActionId(null);
    };

  const declineGroupInvite =
    async (invite: IncomingGroupInvite) => {
      setGroupInviteActionId(invite.id);
      const { error } = await supabase
        .from('social_group_invites')
        .update({ status: 'declined' })
        .eq('id', invite.id);

      if (error) {
        console.error('DECLINE GROUP INVITE ERROR:', error);
      }

      setIncomingGroupInvites((prev) => prev.filter((i) => i.id !== invite.id));
      setGroupInviteActionId(null);
    };

  /* =========================================================
     CREATE GROUP (from the Groups tab, no pre-invited friend)
  ========================================================= */

  const handleCreateGroup =
    async () => {
      const name = newGroupName.trim();
      if (!name || creatingGroup) return;

      setCreatingGroup(true);
      setCreateGroupError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCreateGroupError('You must be signed in.');
        setCreatingGroup(false);
        return;
      }

      const {
        data: groupData,
        error: groupErr,
      } = await supabase
        .from('social_groups')
        .insert({ name, created_by: user.id })
        .select('id')
        .single();

      if (groupErr || !groupData) {
        console.error('CREATE GROUP ERROR:', groupErr);
        setCreateGroupError('Could not create group.');
        setCreatingGroup(false);
        return;
      }

      const groupId = (groupData as { id: string }).id;

      const {
        error: memberErr,
      } = await supabase
        .from('social_group_members')
        .insert({ group_id: groupId, profile_id: user.id, role: 'admin' });

      setCreatingGroup(false);

      if (memberErr) {
        console.error('CREATE GROUP MEMBER ERROR:', memberErr);
        setCreateGroupError('Group created, but could not add you as a member.');
        return;
      }

      setNewGroupName('');
      setCreateGroupOpen(false);
      await loadGroups();
      router.push(`/chat/group/${groupId}` as never);
    };

  /* =========================================================
     LOAD INCOMING FRIEND REQUESTS
  ========================================================= */

  const loadIncomingRequests =
    useCallback(async () => {
      setRequestsLoading(true);

      const {
        data: {
          user,
        },
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
        (
          requestRows ?? []
        ).map(
          (
            row: {
              sender_id: string;
            },
          ) =>
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
        .from('social_profiles')
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

      const mappedRequests: IncomingRequest[] =
        (
          requestRows ?? []
        ).map(
          (
            row: {
              id: string;
              sender_id: string;
              created_at: string;
            },
          ) => ({
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
        );

      setIncomingRequests(
        mappedRequests,
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
     COMBINED CHAT LIST
  ========================================================= */

  const allChats = useMemo(
    () => [
      ...SYSTEM_CHATS.map((chat) =>
        chat.id === 'sys-sidekick' && sidekickPreview
          ? { ...chat, detail: sidekickPreview.content, time: sidekickPreview.time }
          : chat,
      ),
      ...userFriends,
      ...userGroups,
    ],
    [userFriends, userGroups, sidekickPreview],
  );

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
            (c) => c.unread,
          );

        case 'Groups':
          return byName.filter(
            (c) =>
              c.category ===
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
     SEARCH USERS BY USERNAME
  ========================================================= */

  const searchUsers =
    async (
      text: string,
    ) => {
      setFriendQuery(
        text,
      );

      const cleaned =
        text
          .trim()
          .replace(
            /^@/,
            '',
          );

      if (!cleaned.length) {
        setFriendResults([]);
        setFriendError(null);
        return;
      }

      setFriendSearching(
        true,
      );
      setFriendError(null);

      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();

      if (!user) {
        setFriendResults([]);
        setFriendError(
          'You must be signed in.',
        );
        setFriendSearching(
          false,
        );
        return;
      }

      const {
        data,
        error: searchErr,
      } = await supabase
        .from(
          'social_profiles',
        )
        .select(
          'user_id, display_name, username',
        )
        .neq(
          'user_id',
          user.id,
        )
        .ilike(
          'username',
          `%${cleaned}%`,
        )
        .limit(10);

      if (searchErr) {
        console.error(
          'USER SEARCH ERROR:',
          searchErr,
        );

        setFriendResults([]);
        setFriendError(
          'Failed to search users.',
        );
      } else {
        setFriendResults(
          (data ??
            []) as SocialProfile[],
        );
      }

      setFriendSearching(
        false,
      );
    };

  /* =========================================================
     SEND FRIEND REQUEST
  ========================================================= */

  const sendFriendRequest =
    async (
      friendUserId: string,
    ) => {
      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();

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

      /* -----------------------------------------------
         Check whether a pending request already exists
      ------------------------------------------------ */

      const {
        data: existingPending,
        error: existingError,
      } = await supabase
        .from('friend_requests')
        .select('id, status')
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
        console.error(
          'CHECK FRIEND REQUEST ERROR:',
          existingError,
        );

        setFriendError(
          'Could not check the friend request.',
        );

        setSendingRequestId(
          null,
        );

        return;
      }

      if (existingPending) {
        setFriendError(
          'A friend request has already been sent.',
        );

        setSendingRequestId(
          null,
        );

        return;
      }

      /* -----------------------------------------------
         Check reverse pending request
      ------------------------------------------------ */

      const {
        data: reversePending,
        error: reverseError,
      } = await supabase
        .from('friend_requests')
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
        console.error(
          'CHECK REVERSE REQUEST ERROR:',
          reverseError,
        );

        setFriendError(
          'Could not check existing requests.',
        );

        setSendingRequestId(
          null,
        );

        return;
      }

      if (reversePending) {
        setFriendError(
          'This person has already sent you a friend request. Check your pending requests.',
        );

        setSendingRequestId(
          null,
        );

        return;
      }

      /* -----------------------------------------------
         Check if already friends
      ------------------------------------------------ */

      const {
        data: alreadyFriend,
        error: friendshipCheckError,
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

      if (friendshipCheckError) {
        console.error(
          'CHECK FRIENDSHIP ERROR:',
          friendshipCheckError,
        );

        setFriendError(
          'Could not check the friendship.',
        );

        setSendingRequestId(
          null,
        );

        return;
      }

      if (alreadyFriend) {
        setFriendError(
          'You are already friends with this person.',
        );

        setSendingRequestId(
          null,
        );

        return;
      }

      /* -----------------------------------------------
         Create request
      ------------------------------------------------ */

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
        console.error(
          'SEND FRIEND REQUEST ERROR:',
          requestError,
        );

        setFriendError(
          requestError.message ||
            'Could not send friend request.',
        );

        setSendingRequestId(
          null,
        );

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

      setSendingRequestId(
        null,
      );
    };

  /* =========================================================
     ACCEPT FRIEND REQUEST
  ========================================================= */

  const acceptFriendRequest = async (
    request: IncomingRequest,
  ) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
  
    if (!user) {
      setFriendError('You must be logged in.');
      return;
    }
  
    setRequestActionId(request.id);
    setFriendError(null);
  
    const { error: acceptError } =
      await supabase.rpc(
        'accept_friend_request',
        {
          request_id: request.id,
        },
      );
  
    if (acceptError) {
      console.error(
        'ACCEPT FRIEND REQUEST ERROR:',
        acceptError,
      );
  
      setFriendError(
        `Could not accept friend request: ${acceptError.message}`,
      );
  
      setRequestActionId(null);
      return;
    }
  
    setIncomingRequests((previous) =>
      previous.filter(
        (item) => item.id !== request.id,
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
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();

      if (!user) {
        return;
      }

      setRequestActionId(
        request.id,
      );

      const {
        error: updateError,
      } = await supabase
        .from('friend_requests')
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

      if (updateError) {
        console.error(
          'DECLINE FRIEND REQUEST ERROR:',
          updateError,
        );

        setFriendError(
          updateError.message ||
            'Could not decline the request.',
        );

        setRequestActionId(
          null,
        );

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

      setRequestActionId(
        null,
      );
    };

  /* =========================================================
     OPEN CHAT
  ========================================================= */

  const openChat = (
    chat: ChatItem,
  ) => {
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
     RENDER
  ========================================================= */

  return (
    <SafeAreaView
      style={[
        styles.safe,
        isDark &&
          styles.safeDark,
      ]}
    >
      {/* =====================================================
          HEADER
      ===================================================== */}

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
              isDark &&
                styles.darkMuted,
            ]}
          >
            What would you like
            to take care of
            today?
          </Text>
        </View>

        {/* Search + Add Friend */}

        <View
          style={
            styles.searchRow
          }
        >
          <View
            style={[
              styles.search,
              isDark &&
                styles.searchDark,
              {
                flex: 1,
              },
            ]}
          >
            <Search
              color={
                isDark
                  ? '#BDB9B1'
                  : '#8D8B86'
              }
              size={18}
            />

            <TextInput
              value={query}
              onChangeText={
                setQuery
              }
              placeholder="Search conversations..."
              placeholderTextColor={
                isDark
                  ? '#8C8982'
                  : '#A4A09A'
              }
              style={[
                styles.searchInput,
                isDark &&
                  styles.darkText,
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

        {/* Filters */}

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
                  setFilter(item)
                }
                style={[
                  styles.filter,
                  isDark &&
                    styles.filterDark,
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
                    isDark &&
                      styles.darkMuted,
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

        {filter === 'Groups' && (
          <Pressable
            onPress={() => {
              setCreateGroupOpen(true);
              setNewGroupName('');
              setCreateGroupError(null);
            }}
            style={[
              styles.addGroupBtn,
              isDark && styles.addGroupBtnDark,
              { borderColor: accentForeground },
            ]}
          >
            <Plus color={accentForeground} size={16} />
            <Text style={[styles.addGroupBtnText, { color: accentForeground }]}>
              Add Group
            </Text>
          </Pressable>
        )}
      </View>

      {/* =====================================================
          CONTENT
      ===================================================== */}

      <ScrollView
        contentContainerStyle={
          styles.chatScrollContent
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* =================================================
            FRIEND REQUESTS
        ================================================= */}

        {incomingRequests.length >
          0 && (
          <View
            style={[
              styles.requestsCard,
              isDark &&
                styles.requestsCardDark,
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
                    isDark &&
                      styles.darkText,
                  ]}
                >
                  FRIEND REQUESTS
                </Text>

                <Text
                  style={[
                    styles.requestsSubtitle,
                    isDark &&
                      styles.darkMuted,
                  ]}
                >
                  People who want to
                  connect with you
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
                    isDark &&
                      styles.requestRowDark,
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
                        request.sender
                          ?.display_name ||
                        '?'
                      )
                        .slice(0, 1)
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
                        isDark &&
                          styles.darkText,
                      ]}
                    >
                      {request.sender
                        ?.display_name ||
                        'Unknown user'}
                    </Text>

                    <Text
                      style={[
                        styles.requestUsername,
                        isDark &&
                          styles.darkMuted,
                      ]}
                    >
                      @
                      {request.sender
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
                        requestActionId ===
                          request.id &&
                          styles.disabledBtn,
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
                        isDark &&
                          styles.declineBtnDark,
                        requestActionId ===
                          request.id &&
                          styles.disabledBtn,
                      ]}
                    >
                      <X
                        color={
                          isDark
                            ? '#DDD8D0'
                            : '#706C65'
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

        {/* =================================================
            GROUP INVITES
        ================================================= */}

        {incomingGroupInvites.length > 0 && (
          <View
            style={[
              styles.requestsCard,
              isDark && styles.requestsCardDark,
            ]}
          >
            <View style={styles.requestsHeader}>
              <View>
                <Text style={[styles.requestsTitle, isDark && styles.darkText]}>
                  GROUP INVITES
                </Text>
                <Text style={[styles.requestsSubtitle, isDark && styles.darkMuted]}>
                  Groups you've been invited to
                </Text>
              </View>

              <View style={[styles.requestCount, { backgroundColor: accentForeground }]}>
                <Text style={styles.requestCountText}>{incomingGroupInvites.length}</Text>
              </View>
            </View>

            {incomingGroupInvites.map((invite) => (
              <View key={invite.id} style={[styles.requestRow, isDark && styles.requestRowDark]}>
                <View style={[styles.friendAvatar, { backgroundColor: accentForeground }]}>
                  <Text style={styles.friendAvatarText}>
                    {invite.group_name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.requestCopy}>
                  <Text style={[styles.requestName, isDark && styles.darkText]}>
                    {invite.group_name}
                  </Text>
                  <Text style={[styles.requestUsername, isDark && styles.darkMuted]}>
                    Invited by {invite.inviter_name}
                  </Text>
                </View>

                <View style={styles.requestButtons}>
                  <Pressable
                    disabled={groupInviteActionId === invite.id}
                    onPress={() => acceptGroupInvite(invite)}
                    style={[
                      styles.acceptBtn,
                      { backgroundColor: accentForeground },
                      groupInviteActionId === invite.id && styles.disabledBtn,
                    ]}
                  >
                    {groupInviteActionId === invite.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Check color="#FFFFFF" size={15} />
                    )}
                  </Pressable>

                  <Pressable
                    disabled={groupInviteActionId === invite.id}
                    onPress={() => declineGroupInvite(invite)}
                    style={[
                      styles.declineBtn,
                      isDark && styles.declineBtnDark,
                      groupInviteActionId === invite.id && styles.disabledBtn,
                    ]}
                  >
                    <X color={isDark ? '#DDD8D0' : '#706C65'} size={15} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* =================================================
            CONVERSATION LIST
        ================================================= */}

        <View
          style={[
            styles.chatList,
            isDark &&
              styles.chatListDark,
          ]}
        >
          {filteredChats.map(
            (chat) => (
              <Pressable
                key={chat.id}
                onPress={() =>
                  openChat(chat)
                }
                style={({
                  pressed,
                }) => [
                  styles.chatRow,
                  isDark &&
                    styles.chatRowDark,
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
                    {chat.icon}
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
                        isDark &&
                          styles.darkText,
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
                      isDark &&
                        styles.darkMuted,
                    ]}
                    numberOfLines={1}
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
                      isDark &&
                        styles.darkMuted,
                    ]}
                  >
                    {chat.time}
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

        {filteredChats.length ===
          0 && (
          <Text
            style={[
              styles.empty,
              isDark &&
                styles.darkMuted,
            ]}
          >
            No conversations match
            that filter.
          </Text>
        )}
      </ScrollView>

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
            isDark &&
              styles.friendSheetDark,
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
                isDark &&
                  styles.darkText,
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
                color={
                  isDark
                    ? '#AAA59D'
                    : '#8D8B86'
                }
                size={22}
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.search,
              isDark &&
                styles.searchDark,
            ]}
          >
            <Search
              color={
                isDark
                  ? '#BDB9B1'
                  : '#8D8B86'
              }
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
                isDark
                  ? '#8C8982'
                  : '#A4A09A'
              }
              style={[
                styles.searchInput,
                isDark &&
                  styles.darkText,
              ]}
              autoCapitalize="none"
              autoCorrect={
                false
              }
              autoFocus
            />
          </View>

          {friendError && (
            <Text
              style={
                styles.friendError
              }
            >
              {friendError}
            </Text>
          )}

          {friendSearching && (
            <ActivityIndicator
              color={
                accentForeground
              }
              style={{
                marginTop: 16,
              }}
            />
          )}

          {!friendSearching &&
            friendResults.length ===
              0 &&
            friendQuery.trim().length >
              0 && (
              <Text
                style={[
                  styles.friendHint,
                  isDark &&
                    styles.darkMuted,
                ]}
              >
                No users found with
                that username.
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
                    isDark &&
                      styles.friendResultRowDark,
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
                      {profile.display_name
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
                        isDark &&
                          styles.darkText,
                      ]}
                    >
                      {
                        profile.display_name
                      }
                    </Text>

                    <Text
                      style={[
                        styles.friendUsername,
                        isDark &&
                          styles.darkMuted,
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
                      sendingRequestId ===
                        profile.user_id &&
                        styles.disabledBtn,
                    ]}
                    hitSlop={8}
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
        visible={createGroupOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateGroupOpen(false)}
      >
        <Pressable
          style={styles.friendModalShade}
          onPress={() => setCreateGroupOpen(false)}
        />

        <View
          style={[
            styles.friendSheet,
            isDark && styles.friendSheetDark,
          ]}
        >
          <View style={styles.friendSheetHeader}>
            <Text
              style={[
                styles.friendSheetTitle,
                isDark && styles.darkText,
              ]}
            >
              Create a group
            </Text>

            <Pressable
              onPress={() => setCreateGroupOpen(false)}
              hitSlop={12}
            >
              <X color={isDark ? '#AAA59D' : '#8D8B86'} size={22} />
            </Pressable>
          </View>

          <View
            style={[
              styles.search,
              isDark && styles.searchDark,
            ]}
          >
            <TextInput
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Group name"
              placeholderTextColor={isDark ? '#8C8982' : '#A4A09A'}
              style={[
                styles.searchInput,
                isDark && styles.darkText,
              ]}
              autoFocus
              onSubmitEditing={handleCreateGroup}
            />
          </View>

          {createGroupError && (
            <Text style={styles.friendError}>{createGroupError}</Text>
          )}

          <Pressable
            onPress={handleCreateGroup}
            disabled={creatingGroup || !newGroupName.trim()}
            style={[
              styles.createGroupBtn,
              { backgroundColor: accentForeground },
              (creatingGroup || !newGroupName.trim()) && { opacity: 0.5 },
            ]}
          >
            {creatingGroup ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.createGroupBtnText}>Create Group</Text>
            )}
          </Pressable>

          <Text
            style={[
              styles.friendHint,
              isDark && styles.darkMuted,
              { marginTop: 4 },
            ]}
          >
            You'll be the admin. Invite friends and add subgroups once it's created.
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

const FONT_XB =
  'Poppins_700Bold';

const styles =
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor:
        '#FBFAF8',
    },

    safeDark: {
      backgroundColor:
        '#090909',
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
        FONT_XB,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing:
        -0.8,
      color: '#27241F',
    },

    heroSubtitle: {
      fontFamily:
        FONT,
      color: '#908B83',
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },

    darkMuted: {
      color: '#AAA59D',
    },

    darkText: {
      color: '#F4F2EE',
    },

    searchRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 10,
    },

    search: {
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        '#E1DED8',
      backgroundColor:
        '#FFF',
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 14,
      gap: 10,
    },

    searchDark: {
      backgroundColor:
        '#171717',
      borderColor:
        '#363636',
    },

    searchInput: {
      flex: 1,
      fontFamily: FONT,
      fontSize: 14,
      color: '#282724',
    },

    addFriendBtn: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    filters: {
      gap: 8,
      paddingVertical: 14,
      paddingRight: 0,
    },

    filter: {
      paddingHorizontal: 18,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        '#E2DFD9',
      justifyContent:
        'center',
      backgroundColor:
        '#FFF',
    },

    filterDark: {
      backgroundColor:
        '#171717',
      borderColor:
        '#363636',
    },

    filterText: {
      fontFamily:
        FONT_MED,
      color: '#77746E',
      fontSize: 12,
    },

    chatScrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 30,
    },

    chatList: {
      backgroundColor:
        '#FFF',
      borderRadius: 18,
      borderWidth: 1,
      borderColor:
        '#ECE9E4',
      paddingHorizontal: 14,
    },

    chatListDark: {
      backgroundColor:
        '#111',
      borderColor:
        '#2A2A2A',
    },

    chatRow: {
      minHeight: 78,
      flexDirection:
        'row',
      alignItems:
        'center',
      borderBottomWidth: 1,
      borderBottomColor:
        '#F0EEEA',
      gap: 12,
    },

    chatRowDark: {
      borderBottomColor:
        '#292929',
    },

    pressed: {
      opacity: 0.7,
    },

    avatar: {
      width: 42,
      height: 42,
      borderRadius: 15,
      alignItems:
        'center',
      justifyContent:
        'center',
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
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 7,
    },

    chatName: {
      fontFamily:
        FONT_SEMI,
      fontSize: 14,
      color: '#292824',
    },

    chatDetail: {
      fontFamily:
        FONT,
      fontSize: 12,
      color: '#88857E',
    },

    chatMeta: {
      height: 40,
      justifyContent:
        'space-between',
      alignItems:
        'flex-end',
    },

    time: {
      fontFamily:
        FONT,
      color:
        '#A5A19A',
      fontSize: 10,
    },

    unread: {
      minWidth: 17,
      height: 17,
      borderRadius: 8.5,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    unreadText: {
      color: '#FFF',
      fontFamily:
        FONT_BOLD,
      fontSize: 10,
    },

    empty: {
      textAlign: 'center',
      fontFamily:
        FONT,
      color: '#8E8A83',
      marginTop: 30,
    },

    /* -----------------------------------------------------
       Friend request card
    ----------------------------------------------------- */

    requestsCard: {
      backgroundColor:
        '#FFF',
      borderRadius: 18,
      borderWidth: 1,
      borderColor:
        '#ECE9E4',
      padding: 14,
      marginBottom: 14,
    },

    requestsCardDark: {
      backgroundColor:
        '#111',
      borderColor:
        '#2A2A2A',
    },

    requestsHeader: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginBottom: 8,
    },

    requestsTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 11,
      letterSpacing: 1.2,
      color: '#292824',
    },

    requestsSubtitle: {
      fontFamily:
        FONT,
      fontSize: 11,
      color: '#88857E',
      marginTop: 3,
    },

    requestCount: {
      minWidth: 26,
      height: 26,
      borderRadius: 13,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    requestCountText: {
      color: '#FFF',
      fontFamily:
        FONT_BOLD,
      fontSize: 11,
    },

    requestRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor:
        '#F0EEEA',
    },

    requestRowDark: {
      borderTopColor:
        '#292929',
    },

    requestCopy: {
      flex: 1,
    },

    requestName: {
      fontFamily:
        FONT_SEMI,
      fontSize: 13.5,
      color: '#292824',
    },

    requestUsername: {
      fontFamily:
        FONT,
      fontSize: 11.5,
      color: '#88857E',
      marginTop: 2,
    },

    requestButtons: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 6,
    },

    acceptBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    declineBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        '#DDD9D2',
      backgroundColor:
        '#FFF',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    declineBtnDark: {
      backgroundColor:
        '#171717',
      borderColor:
        '#363636',
    },

    disabledBtn: {
      opacity: 0.55,
    },

    requestLoading: {
      paddingVertical: 12,
      alignItems:
        'center',
    },

    /* -----------------------------------------------------
       Friend modal
    ----------------------------------------------------- */

    addGroupBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 10,
      marginHorizontal: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      backgroundColor: '#FFFFFF',
    },

    addGroupBtnDark: {
      backgroundColor: '#151515',
    },

    addGroupBtnText: {
      fontFamily: FONT_MED,
      fontSize: 13,
    },

    createGroupBtn: {
      marginTop: 16,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },

    createGroupBtnText: {
      fontFamily: FONT_BOLD,
      fontSize: 15,
      color: '#FFFFFF',
    },

    friendModalShade: {
      flex: 1,
      backgroundColor:
        'rgba(0,0,0,0.4)',
    },

    friendSheet: {
      backgroundColor:
        '#FFF',
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      padding: 24,
      paddingBottom: 34,
      maxHeight: '85%',
    },

    friendSheetDark: {
      backgroundColor:
        '#111',
    },

    friendSheetHeader: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginBottom: 16,
    },

    friendSheetTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 18,
      color: '#27241F',
    },

    friendError: {
      color: '#E05252',
      fontFamily:
        FONT,
      fontSize: 13,
      marginTop: 8,
      lineHeight: 18,
    },

    friendHint: {
      fontFamily:
        FONT,
      color: '#8E8A83',
      fontSize: 13,
      marginTop: 12,
      textAlign:
        'center',
    },

    friendResults: {
      marginTop: 12,
    },

    friendResultRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor:
        '#F0EEEA',
      gap: 12,
    },

    friendResultRowDark: {
      borderBottomColor:
        '#292929',
    },

    friendAvatar: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    friendAvatarText: {
      fontFamily:
        FONT_BOLD,
      fontSize: 15,
      color: '#FFFFFF',
    },

    friendName: {
      fontFamily:
        FONT_SEMI,
      fontSize: 14,
      color: '#292824',
    },

    friendUsername: {
      fontFamily:
        FONT,
      fontSize: 12,
      color: '#88857E',
      marginTop: 2,
    },

    sendFriendBtn: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'center',
      gap: 5,
      paddingHorizontal: 12,
      minWidth: 64,
      height: 32,
      borderRadius: 10,
    },

    sendFriendText: {
      color: '#FFF',
      fontFamily:
        FONT_SEMI,
      fontSize: 12,
    },
  });