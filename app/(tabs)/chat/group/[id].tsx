import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Check,
  ChevronLeft,
  Info,
  MessageCircle,
  Plus,
  Send,
  Shield,
  UserPlus,
  X,
} from 'lucide-react-native';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

type Group = { id: string; name: string };

type Member = {
  profile_id: string;
  role: 'member' | 'admin';
  display_name: string;
  username: string;
};

type Subgroup = {
  id: string;
  name: string;
  isMember: boolean;
  hasPendingRequest: boolean;
};

type PendingRequest = {
  id: string;
  subgroup_id: string;
  subgroup_name: string;
  requester_id: string;
  requester_name: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

// ─── Component ────────────────────────────────────────────────────────────────

export default function GroupScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const { isDark, accentForeground, onAccent } = useApp();

  const colors = isDark
    ? { bg: '#090909', card: '#151515', border: '#2A2A2A', text: '#F4F2EE', muted: '#AAA59D' }
    : { bg: '#FBFAF8', card: '#FFF', border: '#ECE9E4', text: '#27241F', muted: '#8F8A82' };

  const conversationId = `group:${groupId}`;

  const [myId, setMyId] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'info'>('chat');

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [infoLoading, setInfoLoading] = useState(true);

  const [newSubgroupName, setNewSubgroupName] = useState('');
  const [creatingSubgroup, setCreatingSubgroup] = useState(false);
  const [subgroupActionId, setSubgroupActionId] = useState<string | null>(null);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);

  const [friends, setFriends] = useState<{ id: string; display_name: string; username: string }[]>([]);
  const [pendingInviteIds, setPendingInviteIds] = useState<Set<string>>(new Set());
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const myRole = members.find((m) => m.profile_id === myId)?.role;
  const isAdmin = myRole === 'admin';

  /* ── Loaders ────────────────────────────────────────────────────────── */

  const loadGroup = useCallback(async () => {
    const { data } = await supabase
      .from('social_groups')
      .select('id, name')
      .eq('id', groupId)
      .maybeSingle();
    setGroup(data as Group | null);
  }, [groupId]);

  const loadMembers = useCallback(async () => {
    const { data: memberRows } = await supabase
      .from('social_group_members')
      .select('profile_id, role')
      .eq('group_id', groupId);

    const ids = (memberRows ?? []).map((r) => r.profile_id);
    if (!ids.length) { setMembers([]); return; }

    const { data: profileRows } = await supabase
      .from('social_profiles')
      .select('user_id, display_name, username')
      .in('user_id', ids);

    const nameById = new Map(
      (profileRows ?? []).map((p) => [p.user_id, { display_name: p.display_name, username: p.username }])
    );

    setMembers(
      (memberRows ?? []).map((r) => ({
        profile_id: r.profile_id,
        role: r.role,
        display_name: nameById.get(r.profile_id)?.display_name ?? 'Member',
        username: nameById.get(r.profile_id)?.username ?? '',
      }))
    );
  }, [groupId]);

  const loadSubgroups = useCallback(async () => {
    if (!myId) return;
    const { data: subgroupRows } = await supabase
      .from('social_subgroups')
      .select('id, name')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    const subgroupIds = (subgroupRows ?? []).map((s) => s.id);
    if (!subgroupIds.length) { setSubgroups([]); return; }

    const { data: myMemberships } = await supabase
      .from('social_subgroup_members')
      .select('subgroup_id')
      .eq('profile_id', myId)
      .in('subgroup_id', subgroupIds);

    const { data: myPending } = await supabase
      .from('social_subgroup_join_requests')
      .select('subgroup_id')
      .eq('requester_id', myId)
      .eq('status', 'pending')
      .in('subgroup_id', subgroupIds);

    const memberSet = new Set((myMemberships ?? []).map((m) => m.subgroup_id));
    const pendingSet = new Set((myPending ?? []).map((p) => p.subgroup_id));

    setSubgroups(
      (subgroupRows ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        isMember: memberSet.has(s.id),
        hasPendingRequest: pendingSet.has(s.id),
      }))
    );
  }, [groupId, myId]);

  const loadPendingRequests = useCallback(async () => {
    if (!isAdmin) { setPendingRequests([]); return; }

    const { data: subgroupRows } = await supabase
      .from('social_subgroups')
      .select('id, name')
      .eq('group_id', groupId);

    const subgroupIds = (subgroupRows ?? []).map((s) => s.id);
    if (!subgroupIds.length) { setPendingRequests([]); return; }

    const subgroupNameById = new Map((subgroupRows ?? []).map((s) => [s.id, s.name]));

    const { data: requestRows } = await supabase
      .from('social_subgroup_join_requests')
      .select('id, subgroup_id, requester_id')
      .in('subgroup_id', subgroupIds)
      .eq('status', 'pending');

    const requesterIds = (requestRows ?? []).map((r) => r.requester_id);
    if (!requesterIds.length) { setPendingRequests([]); return; }

    const { data: profileRows } = await supabase
      .from('social_profiles')
      .select('user_id, display_name')
      .in('user_id', requesterIds);

    const nameById = new Map((profileRows ?? []).map((p) => [p.user_id, p.display_name]));

    setPendingRequests(
      (requestRows ?? []).map((r) => ({
        id: r.id,
        subgroup_id: r.subgroup_id,
        subgroup_name: subgroupNameById.get(r.subgroup_id) ?? 'Subgroup',
        requester_id: r.requester_id,
        requester_name: nameById.get(r.requester_id) ?? 'Member',
      }))
    );
  }, [groupId, isAdmin]);

  const loadMessages = useCallback(async () => {
    setMessagesLoading(true);
    const { data } = await supabase
      .from('social_messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as Message[]);
    setMessagesLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 60);
  }, [conversationId]);

  const loadFriends = useCallback(async () => {
    if (!myId) return;
    const { data: friendRows } = await supabase
      .from('friendships')
      .select('user_id, friend_user_id')
      .or(`user_id.eq.${myId},friend_user_id.eq.${myId}`);

    const friendIds = [...new Set((friendRows ?? []).map((r) =>
      r.user_id === myId ? r.friend_user_id : r.user_id
    ))];
    if (!friendIds.length) { setFriends([]); return; }

    const { data: profileRows } = await supabase
      .from('social_profiles')
      .select('user_id, display_name, username')
      .in('user_id', friendIds);

    setFriends(
      (profileRows ?? []).map((p) => ({
        id: p.user_id,
        display_name: p.display_name ?? 'Friend',
        username: p.username ?? '',
      }))
    );
  }, [myId]);

  const loadPendingInvites = useCallback(async () => {
    const { data } = await supabase
      .from('social_group_invites')
      .select('invitee_id')
      .eq('group_id', groupId)
      .eq('status', 'pending');
    setPendingInviteIds(new Set((data ?? []).map((r) => r.invitee_id)));
  }, [groupId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMyId(user?.id ?? null));
    loadGroup();
    loadMessages();
  }, [loadGroup, loadMessages]);

  useEffect(() => {
    if (!myId) return;
    setInfoLoading(true);
    Promise.all([loadMembers(), loadSubgroups(), loadFriends(), loadPendingInvites()]).finally(() =>
      setInfoLoading(false)
    );
  }, [myId, loadMembers, loadSubgroups, loadFriends, loadPendingInvites]);

  useEffect(() => { loadPendingRequests(); }, [loadPendingRequests, members]);

  /* ── Actions ────────────────────────────────────────────────────────── */

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending || !myId) return;
    setSending(true);
    const optimistic: Message = {
      id: `local-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: myId,
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    const { error } = await supabase.from('social_messages').insert({
      conversation_id: conversationId,
      sender_id: myId,
      content: text,
    });
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } else {
      await loadMessages();
    }
    setSending(false);
  };

  const handleCreateSubgroup = async () => {
    const name = newSubgroupName.trim();
    if (!name || creatingSubgroup || !myId) return;
    setCreatingSubgroup(true);
    const { error } = await supabase.from('social_subgroups').insert({
      group_id: groupId,
      name,
      created_by: myId,
    });
    setCreatingSubgroup(false);
    if (!error) {
      setNewSubgroupName('');
      await loadSubgroups();
    }
  };

  const handleRequestJoin = async (subgroupId: string) => {
    if (!myId) return;
    setSubgroupActionId(subgroupId);
    await supabase.from('social_subgroup_join_requests').insert({
      subgroup_id: subgroupId,
      requester_id: myId,
    });
    await loadSubgroups();
    setSubgroupActionId(null);
  };

  const handleApproveRequest = async (requestId: string) => {
    setSubgroupActionId(requestId);
    await supabase.rpc('approve_subgroup_join_request', { request_id: requestId });
    await Promise.all([loadPendingRequests(), loadSubgroups()]);
    setSubgroupActionId(null);
  };

  const handleRejectRequest = async (requestId: string) => {
    setSubgroupActionId(requestId);
    await supabase
      .from('social_subgroup_join_requests')
      .update({ status: 'rejected', decided_by: myId, decided_at: new Date().toISOString() })
      .eq('id', requestId);
    await loadPendingRequests();
    setSubgroupActionId(null);
  };

  const handlePromote = async (profileId: string) => {
    setMemberActionId(profileId);
    await supabase
      .from('social_group_members')
      .update({ role: 'admin' })
      .eq('group_id', groupId)
      .eq('profile_id', profileId);
    await loadMembers();
    setMemberActionId(null);
  };

  const handleInviteFriend = async (friendId: string) => {
    if (!myId) return;
    setInvitingId(friendId);
    const { error } = await supabase.from('social_group_invites').insert({
      group_id: groupId,
      inviter_id: myId,
      invitee_id: friendId,
      status: 'pending',
    });
    if (!error) {
      setPendingInviteIds((prev) => new Set(prev).add(friendId));
    }
    setInvitingId(null);
  };

  /* ── Render ─────────────────────────────────────────────────────────── */

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.sender_id === myId;
    const author = members.find((m) => m.profile_id === item.sender_id)?.display_name ?? 'Member';
    return (
      <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
        <View
          style={[
            styles.bubble,
            { backgroundColor: colors.card, borderColor: colors.border },
            isMine && { backgroundColor: accentForeground, borderBottomRightRadius: 6 },
          ]}
        >
          {!isMine && <Text style={[styles.bubbleAuthor, { color: colors.muted }]}>{author}</Text>}
          <Text style={[styles.bubbleText, { color: isMine ? onAccent : colors.text }]}>{item.content}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.headerBack, { backgroundColor: accentForeground }]} hitSlop={10}>
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: accentForeground }]} numberOfLines={1}>
          {group?.name ?? 'Group'}
        </Text>
        <Pressable
          onPress={() => setView((v) => (v === 'chat' ? 'info' : 'chat'))}
          style={styles.headerToggle}
          hitSlop={10}
        >
          {view === 'chat' ? (
            <Info color={colors.text} size={22} />
          ) : (
            <MessageCircle color={colors.text} size={22} />
          )}
        </Pressable>
      </View>

      {view === 'chat' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {messagesLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={accentForeground} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.messageList}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />
          )}
          <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the group..."
              placeholderTextColor={colors.muted}
              style={[styles.composerInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              multiline
            />
            <Pressable
              onPress={handleSend}
              disabled={sending || !draft.trim()}
              style={[styles.sendBtn, { backgroundColor: accentForeground }, (sending || !draft.trim()) && { opacity: 0.5 }]}
            >
              <Send color="#FFFFFF" size={18} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <FlatList
          data={[{ key: 'info' }]}
          keyExtractor={(i) => i.key}
          renderItem={() => (
            <View style={styles.infoBody}>
              {infoLoading ? (
                <ActivityIndicator color={accentForeground} style={{ marginTop: 24 }} />
              ) : (
                <>
                  {/* ── Pending requests (admin only) ── */}
                  {isAdmin && pendingRequests.length > 0 && (
                    <View style={styles.section}>
                      <Text style={[styles.sectionLabel, { color: colors.muted }]}>PENDING REQUESTS</Text>
                      {pendingRequests.map((r) => (
                        <View key={r.id} style={[styles.requestRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.rowTitle, { color: colors.text }]}>{r.requester_name}</Text>
                            <Text style={[styles.rowSub, { color: colors.muted }]}>wants to join {r.subgroup_name}</Text>
                          </View>
                          <Pressable
                            onPress={() => handleApproveRequest(r.id)}
                            disabled={subgroupActionId === r.id}
                            style={[styles.iconBtn, { backgroundColor: accentForeground }]}
                          >
                            <Check color="#FFFFFF" size={16} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleRejectRequest(r.id)}
                            disabled={subgroupActionId === r.id}
                            style={[styles.iconBtn, { backgroundColor: colors.border }]}
                          >
                            <X color={colors.text} size={16} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* ── Subgroups ── */}
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>SUBGROUPS</Text>
                    {subgroups.length === 0 && (
                      <Text style={[styles.emptyText, { color: colors.muted }]}>No subgroups yet.</Text>
                    )}
                    {subgroups.map((s) => (
                      <View key={s.id} style={[styles.requestRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>{s.name}</Text>
                        {s.isMember ? (
                          <View style={[styles.pill, { borderColor: accentForeground }]}>
                            <Text style={[styles.pillText, { color: accentForeground }]}>Joined</Text>
                          </View>
                        ) : s.hasPendingRequest ? (
                          <View style={[styles.pill, { borderColor: colors.border }]}>
                            <Text style={[styles.pillText, { color: colors.muted }]}>Pending</Text>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => handleRequestJoin(s.id)}
                            disabled={subgroupActionId === s.id}
                            style={[styles.smallBtn, { borderColor: accentForeground }]}
                          >
                            <Text style={[styles.smallBtnText, { color: accentForeground }]}>Request to Join</Text>
                          </Pressable>
                        )}
                      </View>
                    ))}

                    <View style={[styles.newSubgroupRow, { borderColor: colors.border }]}>
                      <TextInput
                        value={newSubgroupName}
                        onChangeText={setNewSubgroupName}
                        placeholder="New subgroup name"
                        placeholderTextColor={colors.muted}
                        style={[styles.newSubgroupInput, { color: colors.text }]}
                        onSubmitEditing={handleCreateSubgroup}
                      />
                      <Pressable
                        onPress={handleCreateSubgroup}
                        disabled={creatingSubgroup || !newSubgroupName.trim()}
                        style={[styles.iconBtn, { backgroundColor: accentForeground }, (creatingSubgroup || !newSubgroupName.trim()) && { opacity: 0.5 }]}
                      >
                        <Plus color="#FFFFFF" size={16} />
                      </Pressable>
                    </View>
                  </View>

                  {/* ── Invite Friends ── */}
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>INVITE FRIENDS</Text>
                    <View style={[styles.newSubgroupRow, { borderColor: colors.border }]}>
                      <TextInput
                        value={inviteSearch}
                        onChangeText={setInviteSearch}
                        placeholder="Search friends by name..."
                        placeholderTextColor={colors.muted}
                        style={[styles.newSubgroupInput, { color: colors.text }]}
                        autoCapitalize="none"
                      />
                    </View>
                    {(() => {
                      const memberIds = new Set(members.map((m) => m.profile_id));
                      const invitable = friends.filter(
                        (f) =>
                          !memberIds.has(f.id) &&
                          f.display_name.toLowerCase().includes(inviteSearch.trim().toLowerCase())
                      );
                      if (!friends.length) {
                        return <Text style={[styles.emptyText, { color: colors.muted }]}>No friends to invite yet.</Text>;
                      }
                      if (!invitable.length) {
                        return <Text style={[styles.emptyText, { color: colors.muted }]}>No matches.</Text>;
                      }
                      return invitable.map((f) => {
                        const alreadyInvited = pendingInviteIds.has(f.id);
                        return (
                          <View key={f.id} style={[styles.requestRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.rowTitle, { color: colors.text }]}>{f.display_name}</Text>
                              <Text style={[styles.rowSub, { color: colors.muted }]}>@{f.username}</Text>
                            </View>
                            {alreadyInvited ? (
                              <View style={[styles.pill, { borderColor: colors.border }]}>
                                <Text style={[styles.pillText, { color: colors.muted }]}>Invited</Text>
                              </View>
                            ) : (
                              <Pressable
                                onPress={() => handleInviteFriend(f.id)}
                                disabled={invitingId === f.id}
                                style={[styles.smallBtn, { borderColor: accentForeground, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                              >
                                <UserPlus color={accentForeground} size={14} />
                                <Text style={[styles.smallBtnText, { color: accentForeground }]}>Invite</Text>
                              </Pressable>
                            )}
                          </View>
                        );
                      });
                    })()}
                  </View>

                  {/* ── Members ── */}
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>MEMBERS · {members.length}</Text>
                    {members.map((m) => (
                      <View key={m.profile_id} style={[styles.requestRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowTitle, { color: colors.text }]}>{m.display_name}</Text>
                          <Text style={[styles.rowSub, { color: colors.muted }]}>@{m.username}</Text>
                        </View>
                        {m.role === 'admin' ? (
                          <View style={[styles.pill, { borderColor: accentForeground }]}>
                            <Shield color={accentForeground} size={12} />
                            <Text style={[styles.pillText, { color: accentForeground }]}>Admin</Text>
                          </View>
                        ) : (
                          isAdmin && (
                            <Pressable
                              onPress={() => handlePromote(m.profile_id)}
                              disabled={memberActionId === m.profile_id}
                              style={[styles.smallBtn, { borderColor: accentForeground }]}
                            >
                              <Text style={[styles.smallBtnText, { color: accentForeground }]}>Make Admin</Text>
                            </Pressable>
                          )
                        )}
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 28, paddingVertical: 12, borderBottomWidth: 1 },
  headerBack: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, marginHorizontal: 12, fontFamily: FONT_BOLD, fontSize: 16 },
  headerToggle: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { padding: 16, gap: 8 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleAuthor: { fontFamily: FONT_SEMI, fontSize: 11, marginBottom: 2 },
  bubbleText: { fontFamily: FONT, fontSize: 15, lineHeight: 20 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
  composerInput: { flex: 1, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontFamily: FONT, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  infoBody: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionLabel: { fontFamily: FONT_SEMI, fontSize: 11, letterSpacing: 1.5 },
  emptyText: { fontFamily: FONT, fontSize: 13 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  rowTitle: { fontFamily: FONT_MED, fontSize: 14 },
  rowSub: { fontFamily: FONT, fontSize: 12, marginTop: 1 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontFamily: FONT_MED, fontSize: 11 },
  smallBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  smallBtnText: { fontFamily: FONT_MED, fontSize: 12 },
  newSubgroupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 },
  newSubgroupInput: { flex: 1, fontFamily: FONT, fontSize: 14, paddingVertical: 4 },
});