import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import {
  ChevronLeft,
  MoreVertical,
  Paperclip,
  Search,
  Send,
  Shield,
  UserPlus,
  X,
  File,
  Image as ImageIcon,
  Mic,
  Pause,
  Play,
  Tag,
} from 'lucide-react-native';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { ensureGroupConversation, loadChatMessages, sendChatMessage } from '../chatHelpers';

// ─── Types ───────────────────────────────────────────────────────────────────

type Group = {
  id: string;
  name: string;
  description: string;
};

type Member = {
  user_id: string;
  profile_id: string;
  role: 'member' | 'admin' | 'owner';
  display_name: string;
  username: string;
  title?: string | null;
  tag?: string | null;
  profile_title?: string | null;
};

type Friend = {
  id: string;
  display_name: string;
  username: string;
  title?: string | null;
  tag?: string | null;
  profile_title?: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
};

type MenuAction = 'clear' | 'delete' | 'exit' | 'edit' | 'tag';

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

const ATTACHMENT_BUCKET = 'chat-attachments';

// ─── Component ───────────────────────────────────────────────────────────────

export default function GroupScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const appContext = useApp() as any;
  const { isDark, accentForeground, onAccent } = appContext;
  const isBlackDark = isDark && appContext.accent_family === 'black';

  const colors = isDark
    ? {
        bg: '#090909',
        card: '#151515',
        border: '#2A2A2A',
        text: '#F4F2EE',
        muted: '#AAA59D',
        input: '#1B1B1B',
        danger: '#E06B6B',
        overlay: 'rgba(0,0,0,0.65)',
      }
    : {
        bg: '#FBFAF8',
        card: '#FFFFFF',
        border: '#ECE9E4',
        text: '#27241F',
        muted: '#8F8A82',
        input: '#F7F5F1',
        danger: '#C84D4D',
        overlay: 'rgba(0,0,0,0.45)',
      };

  const [conversationId, setConversationId] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [editingGroup, setEditingGroup] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // ── Main state ────────────────────────────────────────────────────────────

  const [myId, setMyId] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'info'>('chat');

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);

  const [infoLoading, setInfoLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);

  // ── Menu ─────────────────────────────────────────────────────────────────

  const [menuOpen, setMenuOpen] = useState(false);

  // ── Invite state ──────────────────────────────────────────────────────────

  const [pendingInviteIds, setPendingInviteIds] = useState<Set<string>>(
    new Set(),
  );
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitingId, setInvitingId] = useState<string | null>(null);

  // ── Messages ──────────────────────────────────────────────────────────────

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [selectedAttachment, setSelectedAttachment] = useState<{
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
  } | null>(null);

  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [chatTags, setChatTags] = useState<any[]>([]);
  const [chatTagAssignments, setChatTagAssignments] = useState<any[]>([]);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  const listRef = useRef<FlatList<Message>>(null);

  const myRole = members.find((m) => m.profile_id === myId)?.role;
  const isAdmin = myRole === 'admin' || myRole === 'owner';
  const MAX_MEMBERS = 100;

  // ── Load group ────────────────────────────────────────────────────────────

  const loadGroup = useCallback(async () => {
    if (!groupId) return;

    const { data, error } = await supabase
      .from('chat_groups')
      .select('id, name, description')
      .eq('id', groupId)
      .maybeSingle();

    if (error) {
      console.error('LOAD GROUP ERROR:', error);
      return;
    }

    setGroup(
      data
        ? {
            id: data.id,
            name: data.name ?? 'Group',
            description: data.description ?? '',
          }
        : null,
    );
  }, [groupId]);

  // ── Load members ──────────────────────────────────────────────────────────

  const loadMembers = useCallback(async () => {
    if (!groupId) return;

    const { data: memberRows, error: memberError } = await supabase
      .from('chat_group_members')
      .select('user_id, role')
      .eq('group_id', groupId);

    if (memberError) {
      console.error('LOAD GROUP MEMBERS ERROR:', memberError);
      setMembers([]);
      return;
    }

    const ids = (memberRows ?? []).map((r) => r.user_id);

    if (!ids.length) {
      setMembers([]);
      return;
    }

    const { data: profileRows, error: profileError } = await supabase
      .from('social_profiles')
      .select('*')
      .in('user_id', ids);

    if (profileError) {
      console.error('LOAD GROUP MEMBER PROFILES ERROR:', profileError);
      setMembers([]);
      return;
    }

    const profileMap = new Map(
      (profileRows ?? []).map((p: any) => [
        p.user_id,
        {
          display_name: p.display_name ?? 'Member',
          username: p.username ?? '',
          title: p.title ?? null,
          tag: p.tag ?? null,
          profile_title: p.profile_title ?? null,
        },
      ]),
    );

    setMembers(
      (memberRows ?? []).map((r) => ({
        user_id: r.user_id,
        profile_id: r.user_id,
        role: r.role,
        display_name:
          profileMap.get(r.user_id)?.display_name ?? 'Member',
        username: profileMap.get(r.user_id)?.username ?? '',
        title: profileMap.get(r.user_id)?.title ?? null,
        tag: profileMap.get(r.user_id)?.tag ?? null,
        profile_title: profileMap.get(r.user_id)?.profile_title ?? null,
      })),
    );
  }, [groupId]);

  // ── Load friends ──────────────────────────────────────────────────────────

  const loadFriends = useCallback(async () => {
    if (!myId) return;

    const { data: friendshipRows, error: friendshipError } = await supabase
      .from('friendships')
      .select('user_id, friend_user_id')
      .or(`user_id.eq.${myId},friend_user_id.eq.${myId}`);

    if (friendshipError) {
      console.error('LOAD FRIENDSHIPS ERROR:', friendshipError);
      setFriends([]);
      return;
    }

    const friendIds = [
      ...new Set(
        (friendshipRows ?? []).map((r) =>
          r.user_id === myId ? r.friend_user_id : r.user_id,
        ),
      ),
    ];

    if (!friendIds.length) {
      setFriends([]);
      return;
    }

    const { data: profileRows, error: profileError } = await supabase
      .from('social_profiles')
      .select('*')
      .in('user_id', friendIds);

    if (profileError) {
      console.error('LOAD FRIEND PROFILES ERROR:', profileError);
      setFriends([]);
      return;
    }

    setFriends(
      (profileRows ?? []).map((p) => ({
        id: p.user_id,
        display_name: p.display_name ?? 'Friend',
        username: p.username ?? '',
        title: p.title ?? null,
        tag: p.tag ?? null,
        profile_title: p.profile_title ?? null,
      })),
    );
  }, [myId]);

  // ── Load pending group invites ────────────────────────────────────────────

  const loadPendingInvites = useCallback(async () => {
    if (!groupId) return;

    const { data, error } = await supabase
      .from('chat_group_invitations')
      .select('invitee_id')
      .eq('group_id', groupId)
      .eq('status', 'pending');

    if (error) {
      console.error('LOAD GROUP INVITES ERROR:', error);
      return;
    }

    setPendingInviteIds(
      new Set((data ?? []).map((row) => row.invitee_id)),
    );
  }, [groupId]);

  // ── Load messages ─────────────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!conversationId) { setMessages([]); setMessagesLoading(false); return; }
    setMessagesLoading(true);
    const result = await loadChatMessages(conversationId);
    if (result.error) {
      console.error('LOAD GROUP MESSAGES ERROR:', result.error);
      setMessages([]);
    } else {
      setMessages(result.messages as Message[]);
    }
    setMessagesLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
  }, [conversationId]);

  // ── Initial loading ───────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted || !user || !groupId) return;
      setMyId(user.id);
      await loadGroup();
      const result = await ensureGroupConversation(groupId, user.id);
      if (!mounted) return;
      if (result.error || !result.id) {
        console.error('ENSURE GROUP CONVERSATION ERROR:', result.error);
      } else {
        setConversationId(result.id);
      }
    };
    void initialize();
    return () => { mounted = false; };
  }, [groupId, loadGroup]);

  useEffect(() => {
    if (conversationId) void loadMessages();
  }, [conversationId, loadMessages]);

  useEffect(() => {
    if (!myId || !groupId) return;
    const loadTags = async () => {
      const [{ data: tags }, { data: assignments }] = await Promise.all([
        supabase.from('social_chat_tags').select('id,name').eq('user_id', myId).order('name'),
        supabase.from('social_chat_tag_assignments').select('tag_id').eq('user_id', myId).eq('chat_id', groupId),
      ]);
      setChatTags(tags ?? []);
      setChatTagAssignments(assignments ?? []);
    };
    void loadTags();
  }, [myId, groupId]);

  useEffect(() => {
    if (!myId) return;

    setInfoLoading(true);

    Promise.all([
      loadMembers(),
      loadFriends(),
      loadPendingInvites(),
    ]).finally(() => {
      setInfoLoading(false);
    });
  }, [myId, loadMembers, loadFriends, loadPendingInvites]);

  // ── Filtered friends ──────────────────────────────────────────────────────

  const invitableFriends = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.profile_id));
    const query = inviteSearch.trim().toLowerCase();

    return friends.filter((friend) => {
      if (memberIds.has(friend.id)) return false;

      if (!query) return true;

      return (
        friend.display_name.toLowerCase().includes(query) ||
        friend.username.toLowerCase().includes(query)
      );
    });
  }, [friends, members, inviteSearch]);

  // ── Invite friend ─────────────────────────────────────────────────────────

  const handleInviteFriend = async (friendId: string) => {
    if (!myId || !groupId || invitingId === friendId || !isAdmin) return;
    if (members.length >= MAX_MEMBERS) { Alert.alert('Group is full', 'A group can have up to 100 members.'); return; }

    setInvitingId(friendId);

    const { error } = await supabase
      .from('chat_group_invitations')
      .insert({
        group_id: groupId,
        inviter_id: myId,
        invitee_id: friendId,
        status: 'pending',
      });

    if (error) {
      console.error('INVITE FRIEND ERROR:', error);

      Alert.alert(
        'Could not invite friend',
        error.message || 'Please try again.',
      );
    } else {
      setPendingInviteIds((previous) => {
        const next = new Set(previous);
        next.add(friendId);
        return next;
      });
    }

    setInvitingId(null);
  };

  // ── Promote member ────────────────────────────────────────────────────────

  const handlePromote = async (profileId: string) => {
    if (!isAdmin || profileId === myId || !groupId) return;

    Alert.alert('Make admin?', 'This member will become an admin of the group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Make Admin',
        onPress: async () => {
          let { error } = await supabase.rpc('chat_group_set_member_role', {
            p_group_id: groupId,
            p_user_id: profileId,
            p_role: 'admin',
          });

          if (error) {
            const fallback = await supabase
              .from('chat_group_members')
              .update({ role: 'admin' })
              .eq('group_id', groupId)
              .eq('user_id', profileId);
            error = fallback.error;
          }

          if (error) {
            console.error('MAKE ADMIN ERROR:', error);
            Alert.alert('Could not make admin', error.message || 'The admin action could not be completed.');
            return;
          }

          await loadMembers();
        },
      },
    ]);
  };

  const handleRemoveMember = (profileId: string, name: string) => {
    if (!isAdmin || profileId === myId || !groupId) return;

    Alert.alert('Remove member?', `Remove ${name} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          let { error } = await supabase.rpc('chat_group_remove_member', {
            p_group_id: groupId,
            p_user_id: profileId,
          });

          if (error) {
            const fallback = await supabase
              .from('chat_group_members')
              .delete()
              .eq('group_id', groupId)
              .eq('user_id', profileId);
            error = fallback.error;
          }

          if (error) {
            console.error('REMOVE MEMBER ERROR:', error);
            Alert.alert('Could not remove member', error.message || 'The remove action could not be completed.');
            return;
          }

          setMembers(previous => previous.filter(member => member.user_id !== profileId));
          await loadMembers();
        },
      },
    ]);
  };

  const openEditGroup = () => {
    if (!isAdmin || !group) return;
    setEditName(group.name);
    setEditDescription(group.description);
    setEditingGroup(true);
    setMenuOpen(false);
  };

  const saveGroupEdits = async () => {
    const name = editName.trim();
    if (!name) return;
    const { error } = await supabase.from('chat_groups').update({ name, description: editDescription.trim(), updated_at: new Date().toISOString() }).eq('id', groupId);
    if (error) { Alert.alert('Could not update group', error.message); return; }
    await supabase.from('chat_channels').update({ name, description: editDescription.trim(), updated_at: new Date().toISOString() }).eq('group_id', groupId).eq('is_default', true);
    setGroup({ id: groupId!, name, description: editDescription.trim() });
    setEditingGroup(false);
  };

  const handleSend = async () => {
    const text = draft.trim();

    if (
      !text ||
      sending ||
      uploadingAttachment ||
      !conversationId ||
      !myId
    ) {
      return;
    }

    setSending(true);

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: myId,
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((previous) => [...previous, optimistic]);
    setDraft('');

    try {
      const result = await sendChatMessage(
        conversationId,
        myId,
        text,
      );

      if (result.error || !result.message) {
        console.error(
          'SEND GROUP MESSAGE ERROR:',
          result.error,
        );

        setMessages((previous) =>
          previous.filter(
            (message) => message.id !== optimistic.id,
          ),
        );

        Alert.alert(
          'Message not sent',
          result.error?.message ||
            'Could not send the message.',
        );
      } else {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === optimistic.id
              ? (result.message as Message)
              : message,
          ),
        );
      }
    } catch (error: any) {
      console.error(
        'SEND GROUP MESSAGE ERROR:',
        error,
      );

      setMessages((previous) =>
        previous.filter(
          (message) => message.id !== optimistic.id,
        ),
      );

      Alert.alert(
        'Message not sent',
        error?.message ||
          'Could not send the message.',
      );
    } finally {
      setSending(false);
    }
  };

  // ── Attachments + voice notes ─────────────────────────────────────────────
  const uploadGroupAttachment = async (uri: string, name: string, mimeType: string) => {
    if (!myId) return null;
    try {
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${groupId}/${myId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, arrayBuffer, { contentType: mimeType, upsert: false });
      if (error) throw error;
      return supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (error: any) {
      Alert.alert('Attachment upload failed', error?.message || 'Could not upload the attachment.');
      return null;
    }
  };

  const handlePickAttachment = async () => {
    if (!conversationId || !myId || uploadingAttachment) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      setSelectedAttachment({
        uri: file.uri,
        name: file.name || `file-${Date.now()}`,
        mimeType: file.mimeType || 'application/octet-stream',
        size: file.size,
      });
    } catch (error: any) {
      Alert.alert('Could not select attachment', error?.message || 'Please try again.');
    }
  };

  const sendSelectedAttachment = async () => {
    if (!selectedAttachment || !conversationId || !myId || uploadingAttachment) return;
    setUploadingAttachment(true);
    try {
      const url = await uploadGroupAttachment(
        selectedAttachment.uri,
        selectedAttachment.name,
        selectedAttachment.mimeType,
      );
      if (!url) return;
      const mime = selectedAttachment.mimeType;
      const content = mime.startsWith('image/') ? '📷 Photo' : mime.startsWith('video/') ? '🎬 Video' : mime.startsWith('audio/') ? '🎤 Voice message' : `📄 ${selectedAttachment.name}`;
      const result = await sendChatMessage(conversationId, myId, content, {
        url,
        name: selectedAttachment.name,
        type: mime,
      });
      if (result.error || !result.message) {
        console.error('GROUP ATTACHMENT SEND ERROR:', result.error);
        Alert.alert(
          'Attachment not sent',
          result.error?.message || 'Could not save the attachment. Make sure chat_message_attachments and its RLS policies exist in Supabase.',
        );
        return;
      }
      setMessages(prev => [...prev, result.message as Message]);
      setSelectedAttachment(null);
    } catch (error: any) {
      Alert.alert('Attachment upload failed', error?.message || 'Could not send the attachment.');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const startRecording = async () => {
    if (!conversationId || !myId || isRecording) return;
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) { Alert.alert('Microphone permission', 'Microphone access is needed for voice notes.'); return; }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true); setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (error) { console.error('START GROUP RECORDING ERROR:', error); }
  };

  const cancelRecording = async () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsRecording(false); setRecordingSeconds(0);
    try { await recordingRef.current?.stopAndUnloadAsync(); } catch {}
    recordingRef.current = null;
  };

  const stopRecordingAndSend = async () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    const recording = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false); setRecordingSeconds(0);
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) return;
      const fileName = `voice-${Date.now()}.m4a`;
      setSelectedAttachment({ uri, name: fileName, mimeType: 'audio/m4a' });
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true, playThroughEarpieceAndroid: false });
    } catch (error) { console.error('STOP GROUP RECORDING ERROR:', error); }
  };

  const togglePlayback = async (url: string, messageId: string) => {
    try {
      if (playingMessageId === messageId) {
        await soundRef.current?.pauseAsync();
        setPlayingMessageId(null);
        return;
      }
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true, playThroughEarpieceAndroid: false });
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
      soundRef.current = sound;
      setPlayingMessageId(messageId);
      sound.setOnPlaybackStatusUpdate(status => {
        if ('didJustFinish' in status && status.didJustFinish) setPlayingMessageId(null);
      });
    } catch (error) {
      console.error('GROUP AUDIO PLAYBACK ERROR:', error);
      setPlayingMessageId(null);
    }
  };

  const handleUnsend = async (message: Message) => {
    if (!myId || message.sender_id !== myId || message.id.startsWith('local-')) return;

    const age = Date.now() - new Date(message.created_at).getTime();
    if (age > 10 * 60 * 1000) {
      Alert.alert('Cannot unsend', 'Messages can only be unsent within 10 minutes.');
      return;
    }

    Alert.alert(
      'Message options',
      'Choose an action for this message.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unsend',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('chat_unsend_message', {
              p_message_id: message.id,
            });
            if (error) {
              console.error('UNSEND GROUP MESSAGE ERROR:', error);
              Alert.alert('Could not unsend message', error.message || 'Please try again.');
              return;
            }
            setMessages(prev => prev.filter(m => m.id !== message.id));
          },
        },
      ],
    );
  };

  // ── Clear chat ────────────────────────────────────────────────────────────

  const handleClearChat = () => {
    setMenuOpen(false);

    Alert.alert(
      'Clear chat?',
      'This will permanently delete all messages in this group chat.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear Chat',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('chat_messages')
              .delete()
              .eq('conversation_id', conversationId);

            if (error) {
              console.error('CLEAR GROUP CHAT ERROR:', error);

              Alert.alert(
                'Could not clear chat',
                error.message || 'Please try again.',
              );

              return;
            }

            setMessages([]);
          },
        },
      ],
    );
  };

  // ── Delete group ──────────────────────────────────────────────────────────

  const handleDeleteGroup = () => {
    setMenuOpen(false);

    if (!isAdmin) return;

    Alert.alert(
      'Delete group?',
      'This will permanently delete the group, its members, invites and chat history. This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete Group',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete messages first.
              const { error: messageError } = await supabase
                .from('chat_messages')
                .delete()
                .eq('conversation_id', conversationId);

              if (messageError) {
                throw messageError;
              }

              // Delete group invites.
              const { error: inviteError } = await supabase
                .from('chat_group_invitations')
                .delete()
                .eq('group_id', groupId);

              if (inviteError) {
                throw inviteError;
              }

              // Delete group memberships.
              const { error: memberError } = await supabase
                .from('chat_group_members')
                .delete()
                .eq('group_id', groupId);

              if (memberError) {
                throw memberError;
              }

              // Finally delete the group.
              const { error: groupError } = await supabase
                .from('chat_groups')
                .delete()
                .eq('id', groupId);

              if (groupError) {
                throw groupError;
              }

              router.replace('/(tabs)' as never);
            } catch (error: any) {
              console.error('DELETE GROUP ERROR:', error);

              Alert.alert(
                'Could not delete group',
                error?.message ||
                  'The group could not be deleted. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  // ── Exit group ────────────────────────────────────────────────────────────

  const handleExitGroup = () => {
    setMenuOpen(false);
    setExitModalOpen(true);
  };

  const confirmExitGroup = async () => {
    if (!myId) return;
    const adminCount = members.filter(member => member.role === 'admin' || member.role === 'owner').length;
    if (isAdmin && adminCount === 1 && members.length > 1) {
      setExitModalOpen(false);
      Alert.alert('You are the only admin', 'Please make another member an admin before leaving the group.');
      return;
    }
    const { error } = await supabase.from('chat_group_members').delete().eq('group_id', groupId).eq('user_id', myId);
    if (error) {
      Alert.alert('Could not leave group', error.message || 'Please try again.');
      return;
    }
    setExitModalOpen(false);
    router.replace('/(tabs)' as never);
  };

  // ── Menu action ───────────────────────────────────────────────────────────

  const handleMenuAction = (action: MenuAction) => {
    if (action === 'clear') {
      handleClearChat();
      return;
    }

    if (action === 'delete') {
      handleDeleteGroup();
      return;
    }

    if (action === 'exit') { handleExitGroup(); return; }
    if (action === 'tag') { setMenuOpen(false); setTagModalOpen(true); return; }
    if (action === 'edit') { openEditGroup(); }
  };

  // ── Message renderer ──────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.sender_id === myId;

    const sender = members.find(
      (member) => member.user_id === item.sender_id,
    );

    const author = sender?.username
      ? `@${sender.username}`
      : sender?.display_name ?? 'Member';

    const isImage = item.attachment_type === 'image' || item.attachment_type?.startsWith('image/') === true;
    const isAudio = item.attachment_type === 'audio' || item.attachment_type?.startsWith('audio/') === true;
    const isVideo = item.attachment_type === 'video' || item.attachment_type?.startsWith('video/') === true;
    const hasAttachment = Boolean(item.attachment_url);

    return (
      <View
        style={[
          styles.bubbleRow,
          isMine && styles.bubbleRowMine,
        ]}
      >
        <Pressable
          onLongPress={() => handleUnsend(item)}
          delayLongPress={450}
          style={[styles.messagePressable, isMine && styles.messagePressableMine]}
        >
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
            isMine && {
              backgroundColor: accentForeground,
              borderBottomRightRadius: 6,
            },
          ]}
        >
          {!isMine && (
            <Text
              style={[
                styles.bubbleAuthor,
                { color: colors.muted },
              ]}
            >
              {author}
            </Text>
          )}

          {item.content ? (
            <Text
              style={[
                styles.bubbleText,
                {
                  color: isMine
                    ? onAccent
                    : colors.text,
                },
              ]}
            >
              {item.content}
            </Text>
          ) : null}

          {hasAttachment && item.attachment_url && (
            <View style={[styles.attachmentMessage, { borderTopColor: isMine ? 'rgba(255,255,255,0.25)' : colors.border }]}> 
              {isImage ? (
                <Pressable onPress={() => Linking.openURL(item.attachment_url!)} style={{ width: 190, height: 150, borderRadius: 12, overflow: 'hidden' }}>
                  <Image source={{ uri: item.attachment_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                </Pressable>
              ) : isAudio ? (
                <Pressable onPress={() => togglePlayback(item.attachment_url!, item.id)} style={[styles.audioAttachment, { borderColor: isMine ? 'rgba(255,255,255,0.25)' : colors.border }]}> 
                  {playingMessageId === item.id ? <Pause size={18} color={isMine ? onAccent : accentForeground} /> : <Play size={18} color={isMine ? onAccent : accentForeground} />}
                  <Text style={[styles.attachmentName, { color: isMine ? onAccent : colors.text }]} numberOfLines={1}>{item.attachment_name || 'Voice note'}</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => Linking.openURL(item.attachment_url!)} style={styles.audioAttachment}>
                  {isVideo ? <Play size={20} color={isMine ? onAccent : accentForeground} /> : <File size={20} color={isMine ? onAccent : accentForeground} />}
                  <Text numberOfLines={2} style={[styles.attachmentName, { color: isMine ? onAccent : colors.text }]}>{item.attachment_name || 'Attachment'}</Text>
                </Pressable>
              )}
            </View>
          )}

          <Text
            style={[
              styles.messageTime,
              {
                color: isMine
                  ? 'rgba(255,255,255,0.72)'
                  : colors.muted,
              },
            ]}
          >
            {formatTime(item.created_at)}
          </Text>
        </View>
        </Pressable>
      </View>
    );
  };

  // ── Header ────────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.bg,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Pressable
        onPress={() => router.replace('/(tabs)' as never)}
        style={styles.headerSide}
        hitSlop={10}
      >
        <ChevronLeft
          color={colors.text}
          size={24}
          strokeWidth={2.2}
        />
      </Pressable>

      <Pressable
        onPress={() => {
          setMenuOpen(false);
          setView('info');
        }}
        style={styles.headerTitleButton}
        hitSlop={6}
      >
        <Text
          style={[
            styles.headerTitle,
            { color: isBlackDark ? '#FFFFFF' : accentForeground },
          ]}
          numberOfLines={1}
        >
          {group?.name ?? 'Group'}
        </Text>

        <Text
          style={[
            styles.headerSubtitle,
            { color: colors.muted },
          ]}
        >
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setMenuOpen((previous) => !previous)}
        style={styles.headerSide}
        hitSlop={10}
      >
        <MoreVertical
          color={colors.text}
          size={22}
        />
      </Pressable>

      {menuOpen && (
        <View
          style={[
            styles.menu,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {isAdmin && (
            <Pressable onPress={() => handleMenuAction('edit')} style={styles.menuItem}>
              <Text style={[styles.menuText, { color: colors.text }]}>Edit group</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => handleMenuAction('clear')}
            style={styles.menuItem}
          >
            <Text
              style={[
                styles.menuText,
                { color: colors.text },
              ]}
            >
              Clear chat
            </Text>
          </Pressable>

          {isAdmin && (
            <Pressable
              onPress={() => handleMenuAction('delete')}
              style={styles.menuItem}
            >
              <Text
                style={[
                  styles.menuText,
                  { color: colors.danger },
                ]}
              >
                Delete group
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => handleMenuAction('exit')}
            style={styles.menuItem}
          >
            <Text
              style={[
                styles.menuText,
                { color: colors.danger },
              ]}
            >
              Exit group
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  // ── Info screen ───────────────────────────────────────────────────────────

  const renderInfo = () => {
    const firstFiveFriends = invitableFriends.slice(0, 5);
    const remainingFriends = invitableFriends.slice(5);

    return (
      <View style={styles.infoContainer}>
        <View
          style={[
            styles.infoHeader,
            { borderBottomColor: colors.border },
          ]}
        >
          <Pressable
            onPress={() => setView('chat')}
            style={styles.infoBack}
            hitSlop={10}
          >
            <ChevronLeft
              color={colors.text}
              size={24}
            />
          </Pressable>

          <Text
            style={[
              styles.infoTitle,
              { color: colors.text },
            ]}
          >
            Group Info
          </Text>

          <View style={styles.infoBack} />
        </View>

        {infoLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator
              color={accentForeground}
            />
          </View>
        ) : (
          <ScrollView
            style={styles.infoScroll}
            contentContainerStyle={styles.infoBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Group name + description */}

            <View style={styles.groupIntro}>
              <View
                style={[
                  styles.groupAvatar,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.groupAvatarText,
                    { color: onAccent },
                  ]}
                >
                  {(group?.name || 'G')
                    .slice(0, 1)
                    .toUpperCase()}
                </Text>
              </View>

              <Text
                style={[
                  styles.groupInfoName,
                  { color: colors.text },
                ]}
              >
                {group?.name ?? 'Group'}
              </Text>

              {group?.description ? (
                <Text
                  style={[
                    styles.groupDescription,
                    { color: colors.muted },
                  ]}
                >
                  {group.description}
                </Text>
              ) : (
                <Text
                  style={[
                    styles.groupDescriptionEmpty,
                    { color: colors.muted },
                  ]}
                >
                  No group description yet.
                </Text>
              )}
            </View>

            {/* Invite friends */}

            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionLabel,
                  { color: colors.muted },
                ]}
              >
                INVITE FRIENDS
              </Text>

              <View
                style={[
                  styles.searchBox,
                  {
                    backgroundColor: colors.input,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Search
                  color={colors.muted}
                  size={18}
                />

                <TextInput
                  value={inviteSearch}
                  onChangeText={setInviteSearch}
                  placeholder="Search friends..."
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.searchInput,
                    { color: colors.text },
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {!friends.length ? (
                <Text
                  style={[
                    styles.emptyText,
                    { color: colors.muted },
                  ]}
                >
                  You don't have any friends to invite yet.
                </Text>
              ) : !invitableFriends.length ? (
                <Text
                  style={[
                    styles.emptyText,
                    { color: colors.muted },
                  ]}
                >
                  No friends match your search.
                </Text>
              ) : (
                <>
                  {firstFiveFriends.map(renderFriendRow)}

                  {remainingFriends.length > 0 && (
                    <View
                      style={[
                        styles.friendOverflow,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.bg,
                        },
                      ]}
                    >
                      <ScrollView
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                        style={styles.friendOverflowScroll}
                      >
                        {remainingFriends.map(
                          renderFriendRow,
                        )}
                      </ScrollView>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Members */}

            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionLabel,
                  { color: colors.muted },
                ]}
              >
                MEMBERS · {members.length}
              </Text>

              {members.map((member) => (
                <View
                  key={member.user_id}
                  style={[
                    styles.memberRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.memberAvatar,
                      {
                        backgroundColor:
                          accentForeground,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.memberAvatarText,
                        { color: onAccent },
                      ]}
                    >
                      {(member.display_name || 'M')
                        .slice(0, 1)
                        .toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.memberDetails}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: colors.text },
                      ]}
                    >
                      {member.display_name}
                      {member.user_id === myId
                        ? ' (You)'
                        : ''}
                    </Text>

                    {!!member.username && (
                      <Text style={[styles.rowSub, { color: colors.muted }]}>@{member.username}</Text>
                    )}
                    {(member as any).title || (member as any).tag || (member as any).profile_title ? (
                      <Text style={[styles.rowSub, { color: accentForeground }]}>{(member as any).title || (member as any).tag || (member as any).profile_title}</Text>
                    ) : null}
                  </View>

                  {member.role === 'admin' || member.role === 'owner' ? (
                    <View
                      style={[
                        styles.adminPill,
                        {
                          borderColor: accentForeground,
                          backgroundColor:
                            isBlackDark ? '#252525' : colors.card,
                        },
                      ]}
                    >
                      <Shield
                        color={isBlackDark ? '#FFFFFF' : accentForeground}
                        size={12}
                      />

                      <Text
                        style={[
                          styles.adminPillText,
                          {
                            color: isBlackDark
                              ? '#FFFFFF'
                              : accentForeground,
                          },
                        ]}
                      >
                        Admin
                      </Text>
                    </View>
                  ) : null}

                  {isAdmin && member.user_id !== myId && member.role !== 'owner' ? (
                    <>
                      <Pressable
                        onPress={() => handlePromote(member.user_id)}
                        style={[
                          styles.makeAdminButton,
                          {
                            borderColor: accentForeground,
                            backgroundColor:
                              isBlackDark ? '#252525' : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.makeAdminText,
                            {
                              color: isBlackDark
                                ? '#FFFFFF'
                                : accentForeground,
                            },
                          ]}
                        >
                          Make Admin
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          handleRemoveMember(
                            member.user_id,
                            member.display_name,
                          )
                        }
                        style={[
                          styles.makeAdminButton,
                          {
                            borderColor: colors.danger,
                            backgroundColor:
                              isBlackDark ? '#252525' : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.makeAdminText,
                            {
                              color: isBlackDark
                                ? '#FFFFFF'
                                : colors.danger,
                            },
                          ]}
                        >
                          Remove
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    );
  };

  // ── Friend row ────────────────────────────────────────────────────────────

  function renderFriendRow(friend: Friend) {
    const alreadyInvited = pendingInviteIds.has(friend.id);
    const isInviting = invitingId === friend.id;

    return (
      <View
        key={friend.id}
        style={[
          styles.friendRow,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
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
            style={[
              styles.friendAvatarText,
              { color: onAccent },
            ]}
          >
            {(friend.display_name || 'F')
              .slice(0, 1)
              .toUpperCase()}
          </Text>
        </View>

        <View style={styles.friendDetails}>
          <Text
            style={[
              styles.rowTitle,
              { color: colors.text },
            ]}
            numberOfLines={1}
          >
            {friend.display_name}
          </Text>

          {!!friend.username && (
            <Text
              style={[
                styles.rowSub,
                { color: colors.muted },
              ]}
              numberOfLines={1}
            >
              @{friend.username}
            </Text>
          )}
        </View>

        {alreadyInvited ? (
          <View
            style={[
              styles.invitedPill,
              { borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.invitedText,
                { color: colors.muted },
              ]}
            >
              Invited
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() =>
              handleInviteFriend(friend.id)
            }
            disabled={isInviting}
            style={[
              styles.inviteButton,
              {
                backgroundColor:
                  accentForeground,
              },
              isInviting && {
                opacity: 0.55,
              },
            ]}
          >
            {isInviting ? (
              <ActivityIndicator
                size="small"
                color={onAccent}
              />
            ) : (
              <>
                <UserPlus
                  color={onAccent}
                  size={14}
                />

                <Text
                  style={[
                    styles.inviteButtonText,
                    { color: onAccent },
                  ]}
                >
                  Invite
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    );
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  const renderChat = () => (
    <KeyboardAvoidingView
      style={styles.chatContainer}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      {messagesLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator
            color={accentForeground}
          />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          renderItem={renderMessage}
          contentContainerStyle={[
            styles.messageList,
            messages.length === 0 &&
              styles.messageListEmpty,
          ]}
          onContentSizeChange={() => {
            listRef.current?.scrollToEnd({
              animated: false,
            });
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text
                style={[
                  styles.emptyChatTitle,
                  { color: colors.text },
                ]}
              >
                No messages yet
              </Text>

              <Text
                style={[
                  styles.emptyChatText,
                  { color: colors.muted },
                ]}
              >
                Start the conversation.
              </Text>
            </View>
          }
        />
      )}

      {selectedAttachment && (
        <View style={[styles.attachmentPreview, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          {selectedAttachment.mimeType.startsWith('image/') ? (
            <Image source={{ uri: selectedAttachment.uri }} style={styles.reviewImage} resizeMode="cover" />
          ) : (
            <View style={[styles.attachmentPreviewIcon, { backgroundColor: accentForeground }]}>
              {selectedAttachment.mimeType.startsWith('audio/') ? <Mic size={18} color={onAccent} /> : <File size={18} color={onAccent} />}
            </View>
          )}
          <View style={styles.attachmentPreviewDetails}>
            <Text numberOfLines={1} style={[styles.attachmentPreviewName, { color: colors.text }]}>{selectedAttachment.name}</Text>
            <Text style={[styles.reviewLabel, { color: colors.muted }]}>Review before sending</Text>
            {selectedAttachment.size ? <Text style={[styles.attachmentPreviewSize, { color: colors.muted }]}>{formatFileSize(selectedAttachment.size)}</Text> : null}
          </View>
          <Pressable onPress={() => setSelectedAttachment(null)} hitSlop={10} style={styles.reviewCancel}>
            <X color={colors.muted} size={20} />
          </Pressable>
          <Pressable onPress={sendSelectedAttachment} disabled={uploadingAttachment} style={[styles.reviewSend, { backgroundColor: accentForeground }, uploadingAttachment && { opacity: 0.5 }]}>
            {uploadingAttachment ? <ActivityIndicator size="small" color={onAccent} /> : <Send color={onAccent} size={17} />}
          </Pressable>
        </View>
      )}

      <View
        style={[styles.composer, { backgroundColor: colors.bg, borderTopColor: colors.border }]}
      >
        <Pressable onPress={handlePickAttachment} disabled={uploadingAttachment || sending} style={[styles.attachButton, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {uploadingAttachment ? <ActivityIndicator size="small" color={accentForeground} /> : <Paperclip color={colors.text} size={19} />}
        </Pressable>

        {isRecording ? (
          <>
            <View style={[styles.recordingRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.recordingDot} />
              <Text style={[styles.recordingText, { color: colors.text }]}>Recording {recordingSeconds}s</Text>
              <Pressable onPress={cancelRecording} style={styles.recordingCancelBtn}><X color={colors.muted} size={18} /></Pressable>
            </View>
            <Pressable onPress={stopRecordingAndSend} style={[styles.sendButton, { backgroundColor: accentForeground }]}><Send color={onAccent} size={18} /></Pressable>
          </>
        ) : (
          <>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Message the group..." placeholderTextColor={colors.muted} style={[styles.composerInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]} multiline maxLength={5000} />
            <Pressable
              onPress={draft.trim() ? handleSend : startRecording}
              disabled={sending || uploadingAttachment}
              style={[styles.sendButton, { backgroundColor: accentForeground }, (sending || uploadingAttachment) && { opacity: 0.45 }]}
            >
              {sending || uploadingAttachment ? <ActivityIndicator size="small" color={onAccent} /> : draft.trim() ? <Send color={onAccent} size={18} /> : <Mic color={onAccent} size={19} />}
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );

  const tagModal = tagModalOpen ? (
    <Modal visible transparent animationType="fade" onRequestClose={() => setTagModalOpen(false)}>
      <View style={styles.subShade}>
        <View style={[styles.subSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Add tag</Text>
            <Pressable onPress={() => setTagModalOpen(false)}><X color={colors.muted} size={22} /></Pressable>
          </View>
          {chatTags.length ? chatTags.map(tag => (
            <Pressable key={tag.id} onPress={async () => {
              if (!myId) return;
              const exists = chatTagAssignments.some(a => a.tag_id === tag.id);
              if (!exists) await supabase.from('social_chat_tag_assignments').insert({ user_id: myId, chat_id: groupId, tag_id: tag.id });
              setTagModalOpen(false);
            }} style={[styles.tagOption, { borderColor: colors.border }]}>
              <Tag size={16} color={accentForeground} />
              <Text style={{ color: colors.text, fontFamily: FONT_MED }}>{tag.name}</Text>
            </Pressable>
          )) : <Text style={{ color: colors.muted, fontFamily: FONT }}>No tags created yet.</Text>}
        </View>
      </View>
    </Modal>
  ) : null;

  // ── Edit group modal ───────────────────────────────────────────────────────
  const editGroupModal = editingGroup ? (
    <Modal visible transparent animationType="fade" onRequestClose={() => setEditingGroup(false)}>
      <View style={styles.subShade}>
        <View style={[styles.subSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.infoTitle, { color: colors.text, marginBottom: 14 }]}>Edit group</Text>
          <TextInput value={editName} onChangeText={setEditName} placeholder="Group name" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 }]} />
          <TextInput value={editDescription} onChangeText={setEditDescription} placeholder="Description" placeholderTextColor={colors.muted} multiline style={[styles.searchInput, { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 90 }]} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <Pressable onPress={() => setEditingGroup(false)}><Text style={[styles.menuText, { color: colors.muted }]}>Cancel</Text></Pressable>
            <Pressable onPress={saveGroupEdits}><Text style={[styles.menuText, { color: accentForeground }]}>Save</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  ) : null;

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      soundRef.current?.unloadAsync();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: colors.bg },
      ]}
    >
      {view === 'chat' ? (
        <>
          {renderHeader()}
          {renderChat()}
        </>
      ) : (
        renderInfo()
      )}
      {editGroupModal}
      {tagModal}
      {exitModalOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setExitModalOpen(false)}>
          <View style={styles.subShade}>
            <View style={[styles.subSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.infoTitle, { color: colors.text }]}>Exit group?</Text>
              <Text style={[styles.modalBodyText, { color: colors.muted }]}>You will leave this group and will no longer receive its messages.</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 18 }}>
                <Pressable onPress={() => setExitModalOpen(false)}><Text style={[styles.menuText, { color: colors.muted }]}>Cancel</Text></Pressable>
                <Pressable onPress={confirmExitGroup}><Text style={[styles.menuText, { color: colors.danger }]}>Exit Group</Text></Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(value: string) {
  const date = new Date(value);

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },

  // Header

  header: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderBottomWidth: 1,
    position: 'relative',
    zIndex: 20,
  },

  headerSide: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitleButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  headerTitle: {
    fontFamily: FONT_SEMI,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },

  headerSubtitle: {
    fontFamily: FONT,
    fontSize: 10,
    marginTop: 1,
  },

  // Three-dot menu

  menu: {
    position: 'absolute',
    right: 12,
    top: 60,
    width: 190,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 6,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },

  menuItem: {
    minHeight: 46,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },

  menuText: {
    fontFamily: FONT_MED,
    fontSize: 14,
  },

  // Chat

  chatContainer: {
    flex: 1,
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  messageList: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 8,
  },

  messageListEmpty: {
    flexGrow: 1,
  },

  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },

  emptyChatTitle: {
    fontFamily: FONT_SEMI,
    fontSize: 16,
  },

  emptyChatText: {
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 4,
  },

  bubbleRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },

  bubbleRowMine: {
    justifyContent: 'flex-end',
  },

  messagePressable: {
    maxWidth: '82%',
    minWidth: 50,
    alignSelf: 'flex-start',
  },

  messagePressableMine: {
    alignSelf: 'flex-end',
  },

  bubble: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 7,
  },

  bubbleAuthor: {
    fontFamily: FONT_SEMI,
    fontSize: 11,
    marginBottom: 3,
  },

  bubbleText: {
    flexShrink: 1,
    fontFamily: FONT,
    fontSize: 15,
    lineHeight: 21,
  },

  messageTime: {
    fontFamily: FONT,
    fontSize: 9,
    marginTop: 5,
    textAlign: 'right',
  },

  // Message attachment

  attachmentMessage: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  audioAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 9,
    borderWidth: 1,
    borderRadius: 10,
    minWidth: 150,
  },

  attachmentName: {
    flex: 1,
    fontFamily: FONT_MED,
    fontSize: 12,
    lineHeight: 16,
  },

  // Composer

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
  },

  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontFamily: FONT,
    fontSize: 14,
  },

  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Attachment preview
  reviewImage: {
    width: 54,
    height: 54,
    borderRadius: 10,
  },

  reviewLabel: {
    fontFamily: FONT,
    fontSize: 10,
    marginTop: 2,
  },

  reviewCancel: {
    padding: 5,
  },

  reviewSend: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },


  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 10,
    borderTopWidth: 1,
  },

  attachmentPreviewIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  attachmentPreviewDetails: {
    flex: 1,
  },

  attachmentPreviewName: {
    fontFamily: FONT_MED,
    fontSize: 12,
  },

  attachmentPreviewSize: {
    fontFamily: FONT,
    fontSize: 10,
    marginTop: 2,
  },

  modalBodyText: {
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },

  tagOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
  },

  // Info screen

  infoContainer: {
    flex: 1,
  },

  infoHeader: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },

  infoBack: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  infoTitle: {
    fontFamily: FONT_SEMI,
    fontSize: 17,
  },

  infoScroll: {
    flex: 1,
  },

  infoBody: {
    padding: 16,
    paddingBottom: 40,
    gap: 26,
  },

  // Group intro

  groupIntro: {
    alignItems: 'center',
    paddingTop: 8,
  },

  groupAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  groupAvatarText: {
    fontFamily: FONT_BOLD,
    fontSize: 30,
  },

  groupInfoName: {
    fontFamily: FONT_BOLD,
    fontSize: 22,
    textAlign: 'center',
  },

  groupDescription: {
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 340,
  },

  groupDescriptionEmpty: {
    fontFamily: FONT,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 6,
  },

  // Sections

  section: {
    gap: 8,
  },

  sectionLabel: {
    fontFamily: FONT_SEMI,
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 2,
  },

  // Search

  searchBox: {
    height: 46,
    borderWidth: 1,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 9,
    marginBottom: 3,
  },

  searchInput: {
    flex: 1,
    fontFamily: FONT,
    fontSize: 13,
    paddingVertical: 0,
  },

  // Friends

  friendRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  friendAvatarText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  friendDetails: {
    flex: 1,
  },

  rowTitle: {
    fontFamily: FONT_MED,
    fontSize: 13,
  },

  rowSub: {
    fontFamily: FONT,
    fontSize: 11,
    marginTop: 1,
  },

  inviteButton: {
    minWidth: 76,
    height: 32,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },

  inviteButtonText: {
    fontFamily: FONT_MED,
    fontSize: 11,
  },

  invitedPill: {
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  invitedText: {
    fontFamily: FONT_MED,
    fontSize: 11,
  },

  friendOverflow: {
    height: 260,
    borderWidth: 1,
    borderRadius: 13,
    overflow: 'hidden',
  },

  friendOverflowScroll: {
    flex: 1,
  },

  // Members

  memberRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },

  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  memberAvatarText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  memberDetails: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },

  adminPill: {
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  adminPillText: {
    fontFamily: FONT_MED,
    fontSize: 10,
  },

  makeAdminButton: {
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  makeAdminText: {
    fontFamily: FONT_MED,
    fontSize: 10,
  },

  // Recording

  recordingRow: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  recordingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },

  recordingText: {
    flex: 1,
    fontFamily: FONT_MED,
    fontSize: 13,
  },

  recordingCancelBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Secondary bottom-sheet overlay

  subShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },

  subSheet: {
    width: '100%',
    maxHeight: '82%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },

  // Empty states

  emptyText: {
    fontFamily: FONT,
    fontSize: 12,
    paddingVertical: 5,
  },
});