import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
  BarChart3,
  Calendar,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  Mic,
  MoreVertical,
  Paperclip,
  Send,
  X,
} from 'lucide-react-native';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

type Profile = {
  user_id: string;
  display_name: string;
  username: string;
} | null;

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type AttachmentOption = {
  key: string;
  label: string;
  Icon: typeof ImageIcon;
};

const ATTACHMENT_OPTIONS: AttachmentOption[] = [
  { key: 'image', label: 'Photo', Icon: ImageIcon },
  { key: 'audio', label: 'Audio', Icon: Mic },
  { key: 'document', label: 'Document', Icon: FileText },
  { key: 'poll', label: 'Poll', Icon: BarChart3 },
  { key: 'event', label: 'Event', Icon: Calendar },
];

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark, accentForeground, accentWash, onAccent } = useApp();

  const colors = isDark
    ? { bg: '#090909', card: '#151515', border: '#2A2A2A', text: '#F4F2EE', muted: '#AAA59D' }
    : { bg: '#FBFAF8', card: '#FFF', border: '#ECE9E4', text: '#27241F', muted: '#8F8A82' };

  const [profile, setProfile] = useState<Profile>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [groupSuccess, setGroupSuccess] = useState<string | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [profileViewOpen, setProfileViewOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventDesc, setEventDesc] = useState('');

  const [toast, setToast] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const listRef = useRef<FlatList<Message>>(null);

  const conversationId = `direct:${id}`;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const SYSTEM_CHAT_TITLES: Record<string, string> = {
    sidekick: 'Sidekick',
    planner: 'Planner',
    habits: 'Habits',
    finances: 'Finances',
    lists: 'Lists',
    reminders: 'Reminders',
    bookmark: 'Bookmark',
    plants: 'Plants',
    'well-being': 'Well-being',
    games: 'Games',
  };

  const loadProfile = useCallback(async () => {
    // System chats (e.g. 'habits', 'planner') aren't real profile
    // rows — querying a uuid column with a non-uuid string like
    // 'habits' would throw a Postgres cast error, so skip entirely.
    if (SYSTEM_CHAT_TITLES[id?.toLowerCase() ?? '']) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    const { data, error } = await supabase
      .from('social_profiles')
      .select('user_id, display_name, username')
      .eq('user_id', id)
      .maybeSingle();
    if (error) setProfileError('Could not load profile.');
    else setProfile(data as Profile);
    setProfileLoading(false);
  }, [id]);

  const loadMessages = useCallback(async () => {
    setMessagesLoading(true);
    setMessagesError(null);
    const { data, error } = await supabase
      .from('social_messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) setMessagesError('Could not load messages.');
    else setMessages((data ?? []) as Message[]);
    setMessagesLoading(false);
  }, [conversationId]);

  useEffect(() => {
    loadProfile();
    loadMessages();
    supabase.auth.getUser().then(({ data: { user } }) => setMyId(user?.id ?? null));
  }, [loadProfile, loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 60);
    }
  }, [messages.length]);

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
      showToast('Failed to send message.');
    } else {
      await loadMessages();
    }
    setSending(false);
  };

  const handleAttachment = (option: AttachmentOption) => {
    setAttachOpen(false);
    if (option.key === 'poll') { setPollQuestion(''); setPollOptions(['', '']); setPollOpen(true); return; }
    if (option.key === 'event') { setEventTitle(''); setEventDate(''); setEventTime(''); setEventDesc(''); setEventOpen(true); return; }
    const label = option.label.charAt(0).toUpperCase() + option.label.slice(1);
    showToast(`${label} attachment coming soon`);
  };

  const sendPoll = async () => {
    const q = pollQuestion.trim();
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!q || opts.length < 2 || !myId) return;
    const content = `📊 Poll: ${q}\n${opts.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;
    setPollOpen(false);
    const optimistic: Message = { id: `local-${Date.now()}`, conversation_id: conversationId, sender_id: myId, content, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    const { error } = await supabase.from('social_messages').insert({ conversation_id: conversationId, sender_id: myId, content });
    if (error) { setMessages((prev) => prev.filter((m) => m.id !== optimistic.id)); showToast('Failed to send poll.'); }
  };

  const sendEvent = async () => {
    const t = eventTitle.trim();
    if (!t || !myId) return;
    let content = `📅 Event: ${t}`;
    if (eventDate) content += `\nDate: ${eventDate}`;
    if (eventTime) content += `\nTime: ${eventTime}`;
    if (eventDesc.trim()) content += `\n${eventDesc.trim()}`;
    content += '\nReply YES to add to calendar';
    setEventOpen(false);
    const optimistic: Message = { id: `local-${Date.now()}`, conversation_id: conversationId, sender_id: myId, content, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    const { error } = await supabase.from('social_messages').insert({ conversation_id: conversationId, sender_id: myId, content });
    if (error) { setMessages((prev) => prev.filter((m) => m.id !== optimistic.id)); showToast('Failed to send event.'); }
  };

  const handleReport = async () => {
    const reason = reportReason.trim();
    if (!reason || reportSubmitting || !myId) return;
    setReportSubmitting(true);
    const { error } = await supabase.from('social_reports').insert({
      reporter_id: myId,
      reported_id: id,
      reason,
    });
    setReportSubmitting(false);
    if (error) {
      showToast('Could not submit report.');
      return;
    }
    setReportSuccess(true);
    setReportReason('');
    setTimeout(() => {
      setReportSuccess(false);
      setReportOpen(false);
    }, 1600);
  };

  const handleBlock = async () => {
    if (!myId) return;
    setActionLoading('block');
    const { error } = await supabase.from('social_blocks').insert({
      blocker_id: myId,
      blocked_id: id,
    });
    setActionLoading(null);
    if (error) {
      showToast('Could not block user.');
      return;
    }
    showToast(`Blocked ${profile?.display_name ?? 'user'}`);
    setTimeout(() => router.back(), 700);
  };

  const handleClearChat = async () => {
    setActionLoading('clear');
    const { error } = await supabase
      .from('social_messages')
      .delete()
      .eq('conversation_id', conversationId);
    setActionLoading(null);
    if (error) {
      showToast('Could not clear chat.');
      return;
    }
    setMessages([]);
    showToast('Chat cleared.');
  };

  const handleCreateGroup = async () => {
    const name = groupName.trim();
    if (!name || groupSubmitting || !myId) return;
    setGroupSubmitting(true);
    const { data: groupData, error: groupErr } = await supabase
      .from('social_groups')
      .insert({ name, created_by: myId })
      .select('id')
      .single();
    if (groupErr || !groupData) {
      setGroupSubmitting(false);
      showToast('Could not create group.');
      return;
    }
    const groupId = (groupData as { id: string }).id;
    const { error: memberErr } = await supabase
      .from('social_group_members')
      .insert({ group_id: groupId, profile_id: myId });
    if (memberErr) {
      setGroupSubmitting(false);
      showToast('Could not add you to group.');
      return;
    }
    const { error: inviteErr } = await supabase
      .from('social_group_invites')
      .insert({
        group_id: groupId,
        inviter_id: myId,
        invitee_id: id,
        status: 'pending',
      });
    setGroupSubmitting(false);
    if (inviteErr) {
      showToast('Group created, but invite failed.');
      return;
    }
    setGroupSuccess(`Group invite sent to ${profile?.display_name ?? 'user'}`);
    setGroupName('');
    setTimeout(() => {
      setGroupSuccess(null);
      setGroupOpen(false);
    }, 1800);
  };

  const closeMenu = () => setMenuOpen(false);
  const closeAttach = () => setAttachOpen(false);

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.sender_id === myId;
    const time = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
        <View
          style={[
            styles.bubble,
            isMine
              ? { backgroundColor: accentForeground, borderBottomRightRadius: 6 }
              : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 6 },
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              { color: isMine ? onAccent : colors.text },
            ]}
          >
            {item.content}
          </Text>
          <Text
            style={[
              styles.bubbleTime,
              { color: isMine ? 'rgba(255,255,255,0.75)' : colors.muted },
            ]}
          >
            {time}
          </Text>
        </View>
      </View>
    );
  };

  const headerName = (profile?.display_name ?? SYSTEM_CHAT_TITLES[id?.toLowerCase() ?? ''] ?? 'Chat').toUpperCase();
  const isSystemChat = !profile && !!SYSTEM_CHAT_TITLES[id?.toLowerCase() ?? ''];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.dismiss()} hitSlop={12} style={styles.headerBtn}>
          <ChevronLeft color={colors.text} size={26} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          {profileLoading ? (
            <ActivityIndicator color={colors.muted} size="small" />
          ) : (
            <Pressable onPress={() => setProfileViewOpen(true)} style={styles.headerTitleWrap}>
              <Text style={[styles.headerTitle, { color: accentForeground }]} numberOfLines={1}>
                {headerName}
              </Text>
              <View style={styles.activeRow}>
                <View style={styles.activeDot} />
                <Text style={[styles.activeText, { color: colors.muted }]}>Active now</Text>
              </View>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} style={styles.headerBtn}>
          <MoreVertical color={colors.text} size={24} />
        </Pressable>
      </View>

      {/* Messages */}
      <View style={styles.body}>
        {messagesLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={accentForeground} size="large" />
            <Text style={[styles.stateText, { color: colors.muted }]}>Loading messages…</Text>
          </View>
        ) : messagesError ? (
          <View style={styles.centerState}>
            <Text style={[styles.stateText, { color: colors.text }]}>{messagesError}</Text>
            <Pressable onPress={loadMessages} style={[styles.retryBtn, { backgroundColor: accentForeground }]}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={[styles.stateText, { color: colors.muted }]}>No messages yet. Say hello 👋</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}
      </View>

      {/* Composer */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          {/* Attachment button */}
          <Pressable
            onPress={() => setAttachOpen(true)}
            hitSlop={8}
            style={[styles.attachBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Paperclip color={colors.muted} size={20} />
          </Pressable>

          {/* Text input */}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]}
            multiline
            maxLength={2000}
            scrollEnabled={false}
            editable={!sending}
          />

          {/* Send button */}
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            hitSlop={8}
            style={[
              styles.sendBtn,
              { backgroundColor: accentForeground },
              (!draft.trim() || sending) && styles.sendBtnDisabled,
            ]}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Send color="#FFFFFF" size={18} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Toast */}
      {toast ? (
        <View style={styles.toastWrap}>
          <View style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.toastText, { color: colors.text }]}>{toast}</Text>
          </View>
        </View>
      ) : null}

      {/* Attachment bottom sheet */}
      <Modal visible={attachOpen} transparent animationType="slide" onRequestClose={closeAttach}>
        <Pressable style={styles.sheetShade} onPress={closeAttach} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Attach</Text>
            <Pressable onPress={closeAttach} hitSlop={12}>
              <X color={colors.muted} size={22} />
            </Pressable>
          </View>
          <View style={styles.attachGrid}>
            {ATTACHMENT_OPTIONS.map((option) => {
              const { Icon } = option;
              return (
                <Pressable
                  key={option.key}
                  style={styles.attachItem}
                  onPress={() => handleAttachment(option)}
                >
                  <View style={[styles.attachIcon, { backgroundColor: accentWash }]}>
                    <Icon color={accentForeground} size={22} />
                  </View>
                  <Text style={[styles.attachLabel, { color: colors.text }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* Main menu bottom sheet */}
      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={closeMenu}>
        <Pressable style={styles.sheetShade} onPress={closeMenu} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Chat options</Text>
            <Pressable onPress={closeMenu} hitSlop={12}>
              <X color={colors.muted} size={22} />
            </Pressable>
          </View>

          <Pressable
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => { closeMenu(); setReportOpen(true); }}
          >
            <Text style={[styles.menuItemText, { color: colors.text }]}>Report</Text>
          </Pressable>
          <Pressable
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={handleBlock}
            disabled={actionLoading === 'block'}
          >
            <Text style={[styles.menuItemText, { color: colors.text }]}>
              {actionLoading === 'block' ? 'Blocking…' : 'Block'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={handleClearChat}
            disabled={actionLoading === 'clear'}
          >
            <Text style={[styles.menuItemText, { color: colors.text }]}>
              {actionLoading === 'clear' ? 'Clearing…' : 'Clear Chat'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.menuItem}
            onPress={() => { closeMenu(); setGroupOpen(true); }}
          >
            <Text style={[styles.menuItemText, { color: colors.text }]}>Add to Group</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Report sub-modal */}
      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <View style={styles.subShade}>
          <View style={[styles.subSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.subHeader}>
              <Text style={[styles.subTitle, { color: colors.text }]}>Report {profile?.display_name ?? 'user'}</Text>
              <Pressable onPress={() => setReportOpen(false)} hitSlop={12}>
                <X color={colors.muted} size={22} />
              </Pressable>
            </View>
            {reportSuccess ? (
              <View style={styles.successWrap}>
                <Text style={[styles.successText, { color: accentForeground }]}>Report submitted. Thank you.</Text>
              </View>
            ) : (
              <>
                <TextInput
                  value={reportReason}
                  onChangeText={setReportReason}
                  placeholder="Describe the reason for reporting…"
                  placeholderTextColor={colors.muted}
                  style={[styles.subInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]}
                  multiline
                  autoFocus
                />
                <Pressable
                  onPress={handleReport}
                  disabled={!reportReason.trim() || reportSubmitting}
                  style={[
                    styles.subAction,
                    { backgroundColor: accentForeground },
                    (!reportReason.trim() || reportSubmitting) && styles.sendBtnDisabled,
                  ]}
                >
                  {reportSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.subActionText}>Submit Report</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Add to Group sub-modal */}
      <Modal visible={groupOpen} transparent animationType="fade" onRequestClose={() => setGroupOpen(false)}>
        <View style={styles.subShade}>
          <View style={[styles.subSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.subHeader}>
              <Text style={[styles.subTitle, { color: colors.text }]}>Add to Group</Text>
              <Pressable onPress={() => setGroupOpen(false)} hitSlop={12}>
                <X color={colors.muted} size={22} />
              </Pressable>
            </View>
            {groupSuccess ? (
              <View style={styles.successWrap}>
                <Text style={[styles.successText, { color: accentForeground }]}>{groupSuccess}</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.subHint, { color: colors.muted }]}>
                  Create a new group and invite {profile?.display_name ?? 'this user'}.
                </Text>
                <TextInput
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="Group name"
                  placeholderTextColor={colors.muted}
                  style={[styles.subInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]}
                  autoFocus
                />
                <Pressable
                  onPress={handleCreateGroup}
                  disabled={!groupName.trim() || groupSubmitting}
                  style={[
                    styles.subAction,
                    { backgroundColor: accentForeground },
                    (!groupName.trim() || groupSubmitting) && styles.sendBtnDisabled,
                  ]}
                >
                  {groupSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.subActionText}>Create Group</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Poll bottom sheet */}
      <Modal visible={pollOpen} transparent animationType="slide" onRequestClose={() => setPollOpen(false)}>
        <View style={styles.modalShade}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Create poll</Text>
              <Pressable onPress={() => setPollOpen(false)} hitSlop={12}><X color={colors.muted} size={22} /></Pressable>
            </View>
            <TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder="Ask a question" placeholderTextColor={colors.muted} style={[styles.subInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]} autoFocus />
            {pollOptions.map((opt, i) => (
              <View key={i} style={styles.pollOptionRow}>
                <TextInput value={opt} onChangeText={(t) => setPollOptions((prev) => prev.map((o, idx) => idx === i ? t : o))} placeholder={`Option ${i + 1}`} placeholderTextColor={colors.muted} style={[styles.subInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border, marginBottom: 0 }]} />
                {pollOptions.length > 2 && <Pressable onPress={() => setPollOptions((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={8}><X color={colors.muted} size={18} /></Pressable>}
              </View>
            ))}
            <Pressable onPress={() => setPollOptions((prev) => [...prev, ''])} style={styles.addOptionBtn}>
              <Text style={[styles.addOptionText, { color: accentForeground }]}>+ Add option</Text>
            </Pressable>
            <Pressable onPress={sendPoll} disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2} style={[styles.subAction, { backgroundColor: accentForeground }, (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2) && styles.sendBtnDisabled]}>
              <Text style={styles.subActionText}>Send poll</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Event bottom sheet */}
      <Modal visible={eventOpen} transparent animationType="slide" onRequestClose={() => setEventOpen(false)}>
        <View style={styles.modalShade}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Create event</Text>
              <Pressable onPress={() => setEventOpen(false)} hitSlop={12}><X color={colors.muted} size={22} /></Pressable>
            </View>
            <TextInput value={eventTitle} onChangeText={setEventTitle} placeholder="Event title" placeholderTextColor={colors.muted} style={[styles.subInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]} autoFocus />
            <View style={styles.eventRow}>
              <TextInput value={eventDate} onChangeText={setEventDate} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={colors.muted} style={[styles.subInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border, flex: 1, marginBottom: 0 }]} />
              <TextInput value={eventTime} onChangeText={setEventTime} placeholder="Time" placeholderTextColor={colors.muted} style={[styles.subInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border, flex: 1, marginBottom: 0 }]} />
            </View>
            <TextInput value={eventDesc} onChangeText={setEventDesc} placeholder="Description (optional)" placeholderTextColor={colors.muted} style={[styles.subInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]} multiline />
            <Text style={[styles.subHint, { color: colors.muted }]}>Recipients who reply YES will have this event added to their calendar.</Text>
            <Pressable onPress={sendEvent} disabled={!eventTitle.trim()} style={[styles.subAction, { backgroundColor: accentForeground }, !eventTitle.trim() && styles.sendBtnDisabled]}>
              <Text style={styles.subActionText}>Send event</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Profile view bottom sheet */}
      <Modal visible={profileViewOpen} transparent animationType="slide" onRequestClose={() => setProfileViewOpen(false)}>
        <View style={styles.modalShade}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Profile</Text>
              <Pressable onPress={() => setProfileViewOpen(false)} hitSlop={12}><X color={colors.muted} size={22} /></Pressable>
            </View>
            {profile ? (
              <View style={styles.profileViewBody}>
                <View style={[styles.profileViewAvatar, { backgroundColor: accentForeground }]}>
                  <Text style={[styles.profileViewAvatarText, { color: '#FFFFFF' }]}>{profile.display_name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <Text style={[styles.profileName, { color: colors.text }]}>{profile.display_name}</Text>
                <Text style={[styles.profileUsername, { color: colors.muted }]}>@{profile.username}</Text>
              </View>
            ) : (
              <Text style={[styles.subHint, { color: colors.muted }]}>Profile not available.</Text>
            )}
            <Pressable onPress={() => setProfileViewOpen(false)} style={[styles.subAction, { backgroundColor: accentForeground }]}>
              <Text style={styles.subActionText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 28,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  activeText: {
    fontFamily: FONT,
    fontSize: 11,
  },
  body: { flex: 1 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  stateText: { fontFamily: FONT, fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  retryBtnText: { color: '#FFF', fontFamily: FONT_SEMI, fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 24, gap: 10 },
  msgRow: { flexDirection: 'row', marginVertical: 3 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontFamily: FONT, fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontFamily: FONT, fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: FONT,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },
  toastWrap: { position: 'absolute', bottom: 90, left: 0, right: 0, alignItems: 'center' },
  toast: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  toastText: { fontFamily: FONT_MED, fontSize: 13 },
  sheetShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 0,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 34,
    borderTopWidth: 1,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontFamily: FONT_BOLD, fontSize: 18 },
  attachGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  attachItem: {
    width: '32%',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  attachIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachLabel: {
    fontFamily: FONT_MED,
    fontSize: 13,
  },
  menuItem: { paddingVertical: 16, borderBottomWidth: 1 },
  menuItemText: { fontFamily: FONT_MED, fontSize: 16 },
  subShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  subSheet: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 20 },
  subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  subTitle: { fontFamily: FONT_BOLD, fontSize: 17 },
  subHint: { fontFamily: FONT, fontSize: 13, marginBottom: 12 },
  subInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONT,
    fontSize: 14,
    marginBottom: 14,
  },
  subAction: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  subActionText: { color: '#FFFFFF', fontFamily: FONT_SEMI, fontSize: 15 },
  successWrap: { paddingVertical: 16, alignItems: 'center' },
  successText: { fontFamily: FONT_SEMI, fontSize: 15, textAlign: 'center' },
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  addOptionBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
  addOptionText: { fontFamily: FONT_SEMI, fontSize: 14 },
  eventRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  profileViewBody: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  profileViewAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  profileViewAvatarText: { fontFamily: FONT_BOLD, fontSize: 26 },
  profileName: { fontFamily: FONT_BOLD, fontSize: 20 },
  profileUsername: { fontFamily: FONT, fontSize: 14 },
});