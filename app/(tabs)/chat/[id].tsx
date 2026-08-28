import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import {
  BarChart3,
  Calendar,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  Mic,
  MoreVertical,
  Pause,
  Paperclip,
  Play,
  Send,
  Square,
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
  attachment_url?: string | null;
  attachment_type?: 'image' | 'audio' | 'document' | null;
  attachment_name?: string | null;
};

type AttachmentOption = {
  key: string;
  label: string;
  Icon: typeof ImageIcon;
};

const ATTACHMENT_OPTIONS: AttachmentOption[] = [
  {
    key: 'image',
    label: 'Photo',
    Icon: ImageIcon,
  },
  {
    key: 'audio',
    label: 'Audio',
    Icon: Mic,
  },
  {
    key: 'document',
    label: 'Document',
    Icon: FileText,
  },
  {
    key: 'poll',
    label: 'Poll',
    Icon: BarChart3,
  },
  {
    key: 'event',
    label: 'Event',
    Icon: Calendar,
  },
];

const SYSTEM_CHAT_TITLES: Record<string, string> = {
  sidekick: 'Sidekick',
};

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    isDark,
    accentForeground,
    accentWash,
    onAccent,
  } = useApp();

  const normalizedId = (id ?? '').toLowerCase();

  /*
   * IMPORTANT:
   * Sidekick is a special AI chat.
   *
   * It does NOT use social_messages.
   * Messages are sent to the sidekick-chat Edge Function.
   */
  const isSidekick = normalizedId === 'sidekick';

  const colors = isDark
    ? {
        bg: '#090909',
        card: '#151515',
        border: '#2A2A2A',
        text: '#F4F2EE',
        muted: '#AAA59D',
      }
    : {
        bg: '#FBFAF8',
        card: '#FFFFFF',
        border: '#ECE9E4',
        text: '#27241F',
        muted: '#8F8A82',
      };

  const [profile, setProfile] = useState<Profile>(null);
  const [profileLoading, setProfileLoading] = useState(!isSidekick);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [myId, setMyId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(!isSidekick);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

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
  const [pollOptions, setPollOptions] = useState<string[]>([
    '',
    '',
  ]);

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventDesc, setEventDesc] = useState('');

  const [toast, setToast] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const listRef = useRef<FlatList<Message>>(null);

  const conversationId = `direct:${id}`;

  const showToast = useCallback((msg: string) => {
    setToast(msg);

    setTimeout(() => {
      setToast(null);
    }, 2500);
  }, []);

  /*
   * Load profile only for normal user chats.
   */
  const loadProfile = useCallback(async () => {
    if (isSidekick) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    if (SYSTEM_CHAT_TITLES[normalizedId]) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    if (!id) {
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

    if (error) {
      console.error('Profile load error:', error);
      setProfileError('Could not load profile.');
    } else {
      setProfile(data as Profile);
    }

    setProfileLoading(false);
  }, [id, isSidekick, normalizedId]);

  /*
   * Load normal chat messages.
   *
   * Sidekick intentionally skips this.
   */
  const loadMessages = useCallback(async () => {
    if (isSidekick) {
      setMessages([]);
      setMessagesLoading(false);
      setMessagesError(null);
      return;
    }

    if (!id) {
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);
    setMessagesError(null);

    const { data, error } = await supabase
      .from('social_messages')
      .select(
        'id, conversation_id, sender_id, content, created_at, attachment_url, attachment_type, attachment_name',
      )
      .eq('conversation_id', conversationId)
      .order('created_at', {
        ascending: true,
      });

    if (error) {
      console.error('Messages load error:', error);
      setMessagesError('Could not load messages.');
    } else {
      setMessages((data ?? []) as Message[]);
    }

    setMessagesLoading(false);
  }, [conversationId, id, isSidekick]);

  useEffect(() => {
    loadProfile();
    loadMessages();

    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        setMyId(user?.id ?? null);
      });
  }, [loadProfile, loadMessages]);

  /*
   * Scroll to the latest message.
   */
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({
          animated: false,
        });
      }, 60);
    }
  }, [messages.length]);

  /*
   * SIDEKICK SEND
   *
   * Sends the message to:
   * supabase/functions/sidekick-chat/index.ts
   */
  const handleSendSidekick = async (text: string) => {
    if (!text || sending) {
      return;
    }

    setSending(true);
    setMessagesError(null);

    const userId =
      myId ?? `user-${Date.now()}`;

    const optimisticUserMessage: Message = {
      id: `local-user-${Date.now()}`,
      conversation_id: 'sidekick',
      sender_id: userId,
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [
      ...prev,
      optimisticUserMessage,
    ]);

    setDraft('');

    setTimeout(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });
    }, 60);

    try {
      const {
        data,
        error,
      } = await supabase.functions.invoke(
        'sidekick-chat',
        {
          body: {
            message: text,
          },
        },
      );

      if (error) {
        console.error(
          'Sidekick Edge Function error:',
          error,
        );

        setMessages((prev) =>
          prev.filter(
            (message) =>
              message.id !==
              optimisticUserMessage.id,
          ),
        );

        showToast(
          'Sidekick is unavailable right now. Please try again later.',
        );

        return;
      }

      const reply =
        typeof data?.reply === 'string'
          ? data.reply.trim()
          : '';

      if (!reply) {
        console.error(
          'Sidekick returned no reply:',
          data,
        );

        setMessages((prev) =>
          prev.filter(
            (message) =>
              message.id !==
              optimisticUserMessage.id,
          ),
        );

        showToast(
          'Sidekick is unavailable right now. Please try again later.',
        );

        return;
      }

      const sidekickMessage: Message = {
        id: `sidekick-${Date.now()}`,
        conversation_id: 'sidekick',
        sender_id: 'sidekick',
        content: reply,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [
        ...prev,
        sidekickMessage,
      ]);

      setTimeout(() => {
        listRef.current?.scrollToEnd({
          animated: true,
        });
      }, 60);
    } catch (error) {
      console.error(
        'Sidekick request failed:',
        error,
      );

      setMessages((prev) =>
        prev.filter(
          (message) =>
            message.id !==
            optimisticUserMessage.id,
        ),
      );

      showToast(
        'Sidekick is unavailable right now. Please try again later.',
      );
    } finally {
      setSending(false);
    }
  };

  /*
   * NORMAL CHAT SEND
   */
  const handleSendNormalChat = async (
    text: string,
  ) => {
    if (!text || sending || !myId) {
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

    setMessages((prev) => [
      ...prev,
      optimistic,
    ]);

    setDraft('');

    setTimeout(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });
    }, 60);

    const { error } = await supabase
      .from('social_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: myId,
        content: text,
      });

    if (error) {
      console.error(
        'Send message error:',
        error,
      );

      setMessages((prev) =>
        prev.filter(
          (message) =>
            message.id !== optimistic.id,
        ),
      );

      showToast('Failed to send message.');
    } else {
      await loadMessages();
    }

    setSending(false);
  };

  /*
   * Main send handler.
   */
  const handleSend = async () => {
    const text = draft.trim();

    if (!text || sending) {
      return;
    }

    if (isSidekick) {
      await handleSendSidekick(text);
    } else {
      await handleSendNormalChat(text);
    }
  };

  /*
   * Attachments
   */
  /*
   * Attachments — upload helper
   * Reads the local file at `uri`, uploads it to the
   * `chat-attachments` storage bucket under this user's own
   * folder (required by the storage RLS policy), and returns a
   * public URL. Returns null on any failure.
   */
  const uploadAttachment = async (
    uri: string,
    type: 'image' | 'audio' | 'document',
    fileName: string,
    mimeType: string,
  ): Promise<string | null> => {
    if (!myId) return null;
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const path = `${myId}/${Date.now()}-${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(path, blob, { contentType: mimeType, upsert: false });

      if (uploadError) {
        console.error('ATTACHMENT UPLOAD ERROR:', uploadError);
        return null;
      }

      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      console.error('ATTACHMENT UPLOAD EXCEPTION:', err);
      return null;
    }
  };

  const sendAttachmentMessage = async (
    type: 'image' | 'audio' | 'document',
    url: string,
    fileName: string,
  ) => {
    if (!myId) return;

    const fallbackContent =
      type === 'image' ? '📷 Photo' : type === 'audio' ? '🎤 Voice message' : `📄 ${fileName}`;

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: myId,
      content: fallbackContent,
      created_at: new Date().toISOString(),
      attachment_url: url,
      attachment_type: type,
      attachment_name: fileName,
    };

    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    const { error } = await supabase.from('social_messages').insert({
      conversation_id: conversationId,
      sender_id: myId,
      content: fallbackContent,
      attachment_url: url,
      attachment_type: type,
      attachment_name: fileName,
    });

    if (error) {
      console.error('SEND ATTACHMENT MESSAGE ERROR:', error);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      showToast('Failed to send attachment.');
    } else {
      await loadMessages();
    }
  };

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast('Photo library access is needed to attach a photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const fileName = asset.fileName ?? `photo-${Date.now()}.jpg`;
    const mimeType = asset.mimeType ?? 'image/jpeg';

    setUploadingAttachment(true);
    const url = await uploadAttachment(asset.uri, 'image', fileName, mimeType);
    setUploadingAttachment(false);

    if (!url) {
      showToast('Could not upload photo.');
      return;
    }
    await sendAttachmentMessage('image', url, fileName);
  };

  const handlePickDocument = async (filterAudioOnly: boolean) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: filterAudioOnly ? 'audio/*' : '*/*',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const fileName = asset.name ?? `file-${Date.now()}`;
    const mimeType = asset.mimeType ?? 'application/octet-stream';
    const type: 'audio' | 'document' = filterAudioOnly ? 'audio' : 'document';

    setUploadingAttachment(true);
    const url = await uploadAttachment(asset.uri, type, fileName, mimeType);
    setUploadingAttachment(false);

    if (!url) {
      showToast('Could not upload file.');
      return;
    }
    await sendAttachmentMessage(type, url, fileName);
  };

  /*
   * Voice notes — live recording via the composer mic button
   */
  const startRecording = async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      showToast('Microphone access is needed to record a voice note.');
      return;
    }

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('START RECORDING ERROR:', err);
      showToast('Could not start recording.');
    }
  };

  const cancelRecording = async () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingSeconds(0);
    try {
      await recordingRef.current?.stopAndUnloadAsync();
    } catch {
      // already stopped — nothing to clean up
    }
    recordingRef.current = null;
  };

  const stopRecordingAndSend = async () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);

    const recording = recordingRef.current;
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      setRecordingSeconds(0);

      if (!uri) return;

      const fileName = `voice-${Date.now()}.m4a`;
      setUploadingAttachment(true);
      const url = await uploadAttachment(uri, 'audio', fileName, 'audio/m4a');
      setUploadingAttachment(false);

      if (!url) {
        showToast('Could not upload voice note.');
        return;
      }
      await sendAttachmentMessage('audio', url, fileName);
    } catch (err) {
      console.error('STOP RECORDING ERROR:', err);
      showToast('Could not save voice note.');
    }
  };

  const togglePlayback = async (message: Message) => {
    if (!message.attachment_url) return;

    if (playingMessageId === message.id) {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setPlayingMessageId(null);
      return;
    }

    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: message.attachment_url },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      setPlayingMessageId(message.id);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingMessageId(null);
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (err) {
      console.error('PLAYBACK ERROR:', err);
      showToast('Could not play voice note.');
    }
  };

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const handleAttachment = (
    option: AttachmentOption,
  ) => {
    setAttachOpen(false);

    if (option.key === 'poll') {
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollOpen(true);
      return;
    }

    if (option.key === 'event') {
      setEventTitle('');
      setEventDate('');
      setEventTime('');
      setEventDesc('');
      setEventOpen(true);
      return;
    }

    if (option.key === 'image') {
      handlePickImage();
      return;
    }

    if (option.key === 'audio') {
      handlePickDocument(true);
      return;
    }

    if (option.key === 'document') {
      handlePickDocument(false);
      return;
    }
  };

  /*
   * Poll
   */
  const sendPoll = async () => {
    const q = pollQuestion.trim();

    const opts = pollOptions
      .map((option) => option.trim())
      .filter(Boolean);

    if (!q || opts.length < 2 || !myId) {
      return;
    }

    const content =
      `📊 Poll: ${q}\n` +
      opts
        .map(
          (option, index) =>
            `${index + 1}. ${option}`,
        )
        .join('\n');

    setPollOpen(false);

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: myId,
      content,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [
      ...prev,
      optimistic,
    ]);

    setTimeout(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });
    }, 60);

    const { error } = await supabase
      .from('social_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: myId,
        content,
      });

    if (error) {
      setMessages((prev) =>
        prev.filter(
          (message) =>
            message.id !== optimistic.id,
        ),
      );

      showToast('Failed to send poll.');
    }
  };

  /*
   * Event
   */
  const sendEvent = async () => {
    const title = eventTitle.trim();

    if (!title || !myId) {
      return;
    }

    let content = `📅 Event: ${title}`;

    if (eventDate) {
      content += `\nDate: ${eventDate}`;
    }

    if (eventTime) {
      content += `\nTime: ${eventTime}`;
    }

    if (eventDesc.trim()) {
      content += `\n${eventDesc.trim()}`;
    }

    content +=
      '\nReply YES to add to calendar';

    setEventOpen(false);

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: myId,
      content,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [
      ...prev,
      optimistic,
    ]);

    setTimeout(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });
    }, 60);

    const { error } = await supabase
      .from('social_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: myId,
        content,
      });

    if (error) {
      setMessages((prev) =>
        prev.filter(
          (message) =>
            message.id !== optimistic.id,
        ),
      );

      showToast('Failed to send event.');
    }
  };

  /*
   * Report
   */
  const handleReport = async () => {
    const reason = reportReason.trim();

    if (
      !reason ||
      reportSubmitting ||
      !myId
    ) {
      return;
    }

    setReportSubmitting(true);

    const { error } = await supabase
      .from('social_reports')
      .insert({
        reporter_id: myId,
        reported_id: id,
        reason,
      });

    setReportSubmitting(false);

    if (error) {
      showToast(
        'Could not submit report.',
      );
      return;
    }

    setReportSuccess(true);
    setReportReason('');

    setTimeout(() => {
      setReportSuccess(false);
      setReportOpen(false);
    }, 1600);
  };

  /*
   * Block
   */
  const handleBlock = async () => {
    if (!myId || isSidekick) {
      return;
    }

    setActionLoading('block');

    const { error } = await supabase
      .from('social_blocks')
      .insert({
        blocker_id: myId,
        blocked_id: id,
      });

    setActionLoading(null);

    if (error) {
      showToast('Could not block user.');
      return;
    }

    showToast(
      `Blocked ${
        profile?.display_name ?? 'user'
      }`,
    );

    setTimeout(() => {
      router.replace('/chat' as never);
    }, 700);
  };

  /*
   * Clear chat
   */
  const handleClearChat = async () => {
    if (isSidekick) {
      setActionLoading('clear');
      const { error } = await supabase
        .from('system_messages')
        .delete()
        .eq('user_id', myId)
        .eq('module_key', 'sidekick');
      setActionLoading(null);
      if (error) {
        showToast('Could not clear Sidekick chat.');
        return;
      }
      setMessages([]);
      showToast('Sidekick chat cleared.');
      return;
    }

    setActionLoading('clear');

    const { error } = await supabase
      .from('social_messages')
      .delete()
      .eq(
        'conversation_id',
        conversationId,
      );

    setActionLoading(null);

    if (error) {
      showToast(
        'Could not clear chat.',
      );
      return;
    }

    setMessages([]);
    showToast('Chat cleared.');
  };

  /*
   * Create group
   */
  const handleCreateGroup = async () => {
    const name = groupName.trim();

    if (
      !name ||
      groupSubmitting ||
      !myId ||
      isSidekick
    ) {
      return;
    }

    setGroupSubmitting(true);

    const {
      data: groupData,
      error: groupErr,
    } = await supabase
      .from('social_groups')
      .insert({
        name,
        created_by: myId,
      })
      .select('id')
      .single();

    if (groupErr || !groupData) {
      setGroupSubmitting(false);
      showToast(
        'Could not create group.',
      );
      return;
    }

    const groupId = (
      groupData as { id: string }
    ).id;

    const { error: memberErr } =
      await supabase
        .from('social_group_members')
        .insert({
          group_id: groupId,
          profile_id: myId,
          role: 'admin',
        });

    if (memberErr) {
      setGroupSubmitting(false);
      showToast(
        'Could not add you to group.',
      );
      return;
    }

    const { error: inviteErr } =
      await supabase
        .from('social_group_invites')
        .insert({
          group_id: groupId,
          inviter_id: myId,
          invitee_id: id,
          status: 'pending',
        });

    setGroupSubmitting(false);

    if (inviteErr) {
      showToast(
        'Group created, but invite failed.',
      );
      return;
    }

    setGroupSuccess(
      `Group invite sent to ${
        profile?.display_name ?? 'user'
      }`,
    );

    setGroupName('');

    setTimeout(() => {
      setGroupSuccess(null);
      setGroupOpen(false);
    }, 1800);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const closeAttach = () => {
    setAttachOpen(false);
  };

  /*
   * Render message
   */
  const renderMessage = ({
    item,
  }: {
    item: Message;
  }) => {
    const isMine =
      item.sender_id === myId;

    const isSidekickReply =
      isSidekick &&
      item.sender_id === 'sidekick';

    const time = new Date(
      item.created_at,
    ).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View
        style={[
          styles.msgRow,
          isMine
            ? styles.msgRowMine
            : styles.msgRowTheirs,
        ]}
      >
        <View
          style={[
            styles.bubble,

            isSidekickReply
              ? {
                  backgroundColor:
                    colors.card,
                  borderColor:
                    colors.border,
                  borderWidth: 1,
                  borderBottomLeftRadius: 6,
                }
              : isMine
                ? {
                    backgroundColor:
                      accentForeground,
                    borderBottomRightRadius: 6,
                  }
                : {
                    backgroundColor:
                      colors.card,
                    borderColor:
                      colors.border,
                    borderWidth: 1,
                    borderBottomLeftRadius: 6,
                  },
          ]}
        >
          {isSidekickReply ? (
            <Text
              style={[
                styles.sidekickLabel,
                {
                  color:
                    accentForeground,
                },
              ]}
            >
              SIDEKICK
            </Text>
          ) : null}

          {item.attachment_type === 'image' && item.attachment_url ? (
            <Image
              source={{ uri: item.attachment_url }}
              style={styles.attachmentImage}
              resizeMode="cover"
            />
          ) : null}

          {item.attachment_type === 'audio' && item.attachment_url ? (
            <Pressable
              onPress={() => togglePlayback(item)}
              style={[
                styles.audioBubble,
                { borderColor: isMine && !isSidekickReply ? 'rgba(255,255,255,0.4)' : colors.border },
              ]}
            >
              {playingMessageId === item.id ? (
                <Pause color={isMine && !isSidekickReply ? onAccent : colors.text} size={18} />
              ) : (
                <Play color={isMine && !isSidekickReply ? onAccent : colors.text} size={18} />
              )}
              <Text
                style={[
                  styles.audioBubbleText,
                  { color: isMine && !isSidekickReply ? onAccent : colors.text },
                ]}
              >
                Voice message
              </Text>
            </Pressable>
          ) : null}

          {item.attachment_type === 'document' && item.attachment_url ? (
            <Pressable
              onPress={() => item.attachment_url && Linking.openURL(item.attachment_url)}
              style={[
                styles.docBubble,
                { borderColor: isMine && !isSidekickReply ? 'rgba(255,255,255,0.4)' : colors.border },
              ]}
            >
              <FileText color={isMine && !isSidekickReply ? onAccent : colors.text} size={18} />
              <Text
                numberOfLines={1}
                style={[
                  styles.docBubbleText,
                  { color: isMine && !isSidekickReply ? onAccent : colors.text },
                ]}
              >
                {item.attachment_name ?? 'Document'}
              </Text>
            </Pressable>
          ) : null}

          <Text
            style={[
              styles.bubbleText,
              {
                color:
                  isMine && !isSidekickReply
                    ? onAccent
                    : colors.text,
              },
              item.attachment_type ? { display: 'none' } : undefined,
            ]}
          >
            {item.content}
          </Text>

          <Text
            style={[
              styles.bubbleTime,
              {
                color:
                  isMine && !isSidekickReply
                    ? 'rgba(255,255,255,0.75)'
                    : colors.muted,
              },
            ]}
          >
            {time}
          </Text>
        </View>
      </View>
    );
  };

  const headerName = isSidekick
    ? 'SIDEKICK'
    : (
        profile?.display_name ??
        SYSTEM_CHAT_TITLES[
          normalizedId
        ] ??
        'Chat'
      ).toUpperCase();

  const showProfileButton =
    !isSidekick &&
    !SYSTEM_CHAT_TITLES[
      normalizedId
    ];

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor: colors.bg,
        },
      ]}
    >
      {/* HEADER */}

      <View
        style={[
          styles.header,
          {
            borderBottomColor:
              colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.replace('/chat' as never)}
          hitSlop={12}
          style={styles.headerBtn}
        >
          <ChevronLeft
            color={colors.text}
            size={26}
          />
        </Pressable>

        <View
          style={styles.headerTitleWrap}
        >
          {profileLoading ? (
            <ActivityIndicator
              color={colors.muted}
              size="small"
            />
          ) : (
            <Pressable
              disabled={!showProfileButton}
              onPress={() =>
                setProfileViewOpen(true)
              }
              style={
                styles.headerTitleWrap
              }
            >
              <Text
                style={[
                  styles.headerTitle,
                  {
                    color:
                      accentForeground,
                  },
                ]}
                numberOfLines={1}
              >
                {headerName}
              </Text>

              {isSidekick ? null : (
                <View
                  style={styles.activeRow}
                >
                  <View
                    style={styles.activeDot}
                  />

                  <Text
                    style={[
                      styles.activeText,
                      {
                        color:
                          colors.muted,
                      },
                    ]}
                  >
                    Active now
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() =>
            setMenuOpen(true)
          }
          hitSlop={12}
          style={styles.headerBtn}
        >
          <MoreVertical
            color={colors.text}
            size={24}
          />
        </Pressable>
      </View>

      {/* MESSAGES */}

      <View style={styles.body}>
        {messagesLoading ? (
          <View
            style={styles.centerState}
          >
            <ActivityIndicator
              color={accentForeground}
              size="large"
            />

            <Text
              style={[
                styles.stateText,
                {
                  color: colors.muted,
                },
              ]}
            >
              Loading messages…
            </Text>
          </View>
        ) : messagesError ? (
          <View
            style={styles.centerState}
          >
            <Text
              style={[
                styles.stateText,
                {
                  color: colors.text,
                },
              ]}
            >
              {messagesError}
            </Text>

            <Pressable
              onPress={loadMessages}
              style={[
                styles.retryBtn,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <Text
                style={
                  styles.retryBtnText
                }
              >
                Retry
              </Text>
            </Pressable>
          </View>
        ) : messages.length === 0 ? (
          <View
            style={styles.centerState}
          >
            {isSidekick ? (
              <>
                <Text
                  style={[
                    styles.sidekickGreeting,
                    {
                      color: colors.text,
                    },
                  ]}
                >
                  Hi! I’m your Sidekick 👋
                </Text>

                <Text
                  style={[
                    styles.sidekickGreetingSecond,
                    {
                      color: colors.text,
                    },
                  ]}
                >
                  How can I help you today?
                </Text>
              </>
            ) : (
              <Text
                style={[
                  styles.stateText,
                  {
                    color: colors.muted,
                  },
                ]}
              >
                No messages yet. Say
                hello 👋
              </Text>
            )}
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) =>
              item.id
            }
            renderItem={
              renderMessage
            }
            contentContainerStyle={
              styles.listContent
            }
            showsVerticalScrollIndicator={
              false
            }
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd(
                {
                  animated: false,
                },
              )
            }
          />
        )}
      </View>

      {/* COMPOSER */}

      <KeyboardAvoidingView
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.composer,
            {
              backgroundColor:
                colors.card,
              borderTopColor:
                colors.border,
            },
          ]}
        >
          {!isSidekick && !isRecording && (
            <Pressable
              onPress={() =>
                setAttachOpen(true)
              }
              hitSlop={8}
              style={[
                styles.attachBtn,
                {
                  backgroundColor:
                    colors.card,
                  borderColor:
                    colors.border,
                },
              ]}
            >
              <Paperclip
                color={colors.muted}
                size={20}
              />
            </Pressable>
          )}

          {isRecording ? (
            <View style={[styles.recordingRow, { borderColor: colors.border, backgroundColor: colors.bg }]}>
              <View style={styles.recordingDot} />
              <Text style={[styles.recordingText, { color: colors.text }]}>
                Recording… {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
              </Text>
              <Pressable onPress={cancelRecording} hitSlop={8} style={styles.recordingCancelBtn}>
                <X color={colors.muted} size={18} />
              </Pressable>
            </View>
          ) : (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={
                isSidekick
                  ? 'Message Sidekick…'
                  : 'Type a message…'
              }
              placeholderTextColor={
                colors.muted
              }
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor:
                    colors.bg,
                  borderColor:
                    colors.border,
                },
              ]}
              multiline
              maxLength={2000}
              scrollEnabled={false}
              editable={!sending}
            />
          )}

          {isRecording ? (
            <Pressable
              onPress={stopRecordingAndSend}
              hitSlop={8}
              style={[styles.sendBtn, { backgroundColor: accentForeground }]}
            >
              {uploadingAttachment ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Square color="#FFFFFF" size={16} />
              )}
            </Pressable>
          ) : !isSidekick && !draft.trim() ? (
            <Pressable
              onPress={startRecording}
              disabled={uploadingAttachment}
              hitSlop={8}
              style={[
                styles.sendBtn,
                { backgroundColor: accentForeground },
                uploadingAttachment && styles.sendBtnDisabled,
              ]}
            >
              {uploadingAttachment ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Mic color="#FFFFFF" size={18} />
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSend}
              disabled={
                !draft.trim() || sending
              }
              hitSlop={8}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    accentForeground,
                },
                (!draft.trim() ||
                  sending) &&
                  styles.sendBtnDisabled,
              ]}
            >
              {sending ? (
                <ActivityIndicator
                  color="#FFFFFF"
                  size="small"
                />
              ) : (
                <Send
                  color="#FFFFFF"
                  size={18}
                />
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* TOAST */}

      {toast ? (
        <View
          style={styles.toastWrap}
        >
          <View
            style={[
              styles.toast,
              {
                backgroundColor:
                  colors.card,
                borderColor:
                  colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.toastText,
                {
                  color:
                    colors.text,
                },
              ]}
            >
              {toast}
            </Text>
          </View>
        </View>
      ) : null}

      {/* ATTACHMENT SHEET */}

      <Modal
        visible={attachOpen}
        transparent
        animationType="slide"
        onRequestClose={
          closeAttach
        }
      >
        <Pressable
          style={styles.sheetShade}
          onPress={closeAttach}
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor:
                colors.card,
              borderTopColor:
                colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.sheetHandle,
              {
                backgroundColor:
                  colors.border,
              },
            ]}
          />

          <View
            style={styles.sheetHeader}
          >
            <Text
              style={[
                styles.sheetTitle,
                {
                  color: colors.text,
                },
              ]}
            >
              Attach
            </Text>

            <Pressable
              onPress={
                closeAttach
              }
              hitSlop={12}
            >
              <X
                color={colors.muted}
                size={22}
              />
            </Pressable>
          </View>

          <View
            style={styles.attachGrid}
          >
            {ATTACHMENT_OPTIONS.map(
              (option) => {
                const { Icon } =
                  option;

                return (
                  <Pressable
                    key={
                      option.key
                    }
                    style={
                      styles.attachItem
                    }
                    onPress={() =>
                      handleAttachment(
                        option,
                      )
                    }
                  >
                    <View
                      style={[
                        styles.attachIcon,
                        {
                          backgroundColor:
                            accentWash,
                        },
                      ]}
                    >
                      <Icon
                        color={
                          accentForeground
                        }
                        size={22}
                      />
                    </View>

                    <Text
                      style={[
                        styles.attachLabel,
                        {
                          color:
                            colors.text,
                        },
                      ]}
                    >
                      {
                        option.label
                      }
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>
        </View>
      </Modal>

      {/* CHAT OPTIONS */}

      <Modal
        visible={menuOpen}
        transparent
        animationType="slide"
        onRequestClose={
          closeMenu
        }
      >
        <Pressable
          style={styles.sheetShade}
          onPress={closeMenu}
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor:
                colors.card,
              borderTopColor:
                colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.sheetHandle,
              {
                backgroundColor:
                  colors.border,
              },
            ]}
          />

          <View
            style={styles.sheetHeader}
          >
            <Text
              style={[
                styles.sheetTitle,
                {
                  color: colors.text,
                },
              ]}
            >
              Chat options
            </Text>

            <Pressable
              onPress={closeMenu}
              hitSlop={12}
            >
              <X
                color={colors.muted}
                size={22}
              />
            </Pressable>
          </View>

          {!isSidekick && (
            <>
              <Pressable
                style={[
                  styles.menuItem,
                  {
                    borderBottomColor:
                      colors.border,
                  },
                ]}
                onPress={() => {
                  closeMenu();
                  setReportOpen(true);
                }}
              >
                <Text
                  style={[
                    styles.menuItemText,
                    {
                      color:
                        colors.text,
                    },
                  ]}
                >
                  Report
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.menuItem,
                  {
                    borderBottomColor:
                      colors.border,
                  },
                ]}
                onPress={
                  handleBlock
                }
                disabled={
                  actionLoading ===
                  'block'
                }
              >
                <Text
                  style={[
                    styles.menuItemText,
                    {
                      color:
                        colors.text,
                    },
                  ]}
                >
                  {actionLoading ===
                  'block'
                    ? 'Blocking…'
                    : 'Block'}
                </Text>
              </Pressable>
            </>
          )}

          <Pressable
            style={[
              styles.menuItem,
              {
                borderBottomColor:
                  colors.border,
              },
            ]}
            onPress={
              handleClearChat
            }
            disabled={
              actionLoading ===
              'clear'
            }
          >
            <Text
              style={[
                styles.menuItemText,
                {
                  color:
                    colors.text,
                },
              ]}
            >
              {actionLoading ===
              'clear'
                ? 'Clearing…'
                : 'Clear Chat'}
            </Text>
          </Pressable>

          {!isSidekick && (
            <Pressable
              style={
                styles.menuItem
              }
              onPress={() => {
                closeMenu();
                setGroupOpen(true);
              }}
            >
              <Text
                style={[
                  styles.menuItemText,
                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Add to Group
              </Text>
            </Pressable>
          )}
        </View>
      </Modal>

      {/* REPORT */}

      <Modal
        visible={reportOpen}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setReportOpen(false)
        }
      >
        <View
          style={styles.subShade}
        >
          <View
            style={[
              styles.subSheet,
              {
                backgroundColor:
                  colors.card,
                borderColor:
                  colors.border,
              },
            ]}
          >
            <View
              style={styles.subHeader}
            >
              <Text
                style={[
                  styles.subTitle,
                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Report{' '}
                {profile?.display_name ??
                  'user'}
              </Text>

              <Pressable
                onPress={() =>
                  setReportOpen(
                    false,
                  )
                }
                hitSlop={12}
              >
                <X
                  color={
                    colors.muted
                  }
                  size={22}
                />
              </Pressable>
            </View>

            {reportSuccess ? (
              <View
                style={
                  styles.successWrap
                }
              >
                <Text
                  style={[
                    styles.successText,
                    {
                      color:
                        accentForeground,
                    },
                  ]}
                >
                  Report submitted.
                  Thank you.
                </Text>
              </View>
            ) : (
              <>
                <TextInput
                  value={
                    reportReason
                  }
                  onChangeText={
                    setReportReason
                  }
                  placeholder="Describe the reason for reporting…"
                  placeholderTextColor={
                    colors.muted
                  }
                  style={[
                    styles.subInput,
                    {
                      color:
                        colors.text,
                      backgroundColor:
                        colors.bg,
                      borderColor:
                        colors.border,
                    },
                  ]}
                  multiline
                  autoFocus
                />

                <Pressable
                  onPress={
                    handleReport
                  }
                  disabled={
                    !reportReason.trim() ||
                    reportSubmitting
                  }
                  style={[
                    styles.subAction,
                    {
                      backgroundColor:
                        accentForeground,
                    },
                    (!reportReason.trim() ||
                      reportSubmitting) &&
                      styles.sendBtnDisabled,
                  ]}
                >
                  {reportSubmitting ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                      size="small"
                    />
                  ) : (
                    <Text
                      style={
                        styles.subActionText
                      }
                    >
                      Submit Report
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ADD TO GROUP */}

      <Modal
        visible={groupOpen}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setGroupOpen(false)
        }
      >
        <View
          style={styles.subShade}
        >
          <View
            style={[
              styles.subSheet,
              {
                backgroundColor:
                  colors.card,
                borderColor:
                  colors.border,
              },
            ]}
          >
            <View
              style={styles.subHeader}
            >
              <Text
                style={[
                  styles.subTitle,
                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Add to Group
              </Text>

              <Pressable
                onPress={() =>
                  setGroupOpen(
                    false,
                  )
                }
                hitSlop={12}
              >
                <X
                  color={
                    colors.muted
                  }
                  size={22}
                />
              </Pressable>
            </View>

            {groupSuccess ? (
              <View
                style={
                  styles.successWrap
                }
              >
                <Text
                  style={[
                    styles.successText,
                    {
                      color:
                        accentForeground,
                    },
                  ]}
                >
                  {groupSuccess}
                </Text>
              </View>
            ) : (
              <>
                <Text
                  style={[
                    styles.subHint,
                    {
                      color:
                        colors.muted,
                    },
                  ]}
                >
                  Create a new group
                  and invite{' '}
                  {profile?.display_name ??
                    'this user'}.
                </Text>

                <TextInput
                  value={groupName}
                  onChangeText={
                    setGroupName
                  }
                  placeholder="Group name"
                  placeholderTextColor={
                    colors.muted
                  }
                  style={[
                    styles.subInput,
                    {
                      color:
                        colors.text,
                      backgroundColor:
                        colors.bg,
                      borderColor:
                        colors.border,
                    },
                  ]}
                  autoFocus
                />

                <Pressable
                  onPress={
                    handleCreateGroup
                  }
                  disabled={
                    !groupName.trim() ||
                    groupSubmitting
                  }
                  style={[
                    styles.subAction,
                    {
                      backgroundColor:
                        accentForeground,
                    },
                    (!groupName.trim() ||
                      groupSubmitting) &&
                      styles.sendBtnDisabled,
                  ]}
                >
                  {groupSubmitting ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                      size="small"
                    />
                  ) : (
                    <Text
                      style={
                        styles.subActionText
                      }
                    >
                      Create Group
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* POLL */}

      <Modal
        visible={pollOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setPollOpen(false)
        }
      >
        <View
          style={styles.modalShade}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor:
                  colors.card,
                borderTopColor:
                  colors.border,
              },
            ]}
          >
            <View
              style={styles.sheetHeader}
            >
              <Text
                style={[
                  styles.sheetTitle,
                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Create poll
              </Text>

              <Pressable
                onPress={() =>
                  setPollOpen(
                    false,
                  )
                }
                hitSlop={12}
              >
                <X
                  color={
                    colors.muted
                  }
                  size={22}
                />
              </Pressable>
            </View>

            <TextInput
              value={pollQuestion}
              onChangeText={
                setPollQuestion
              }
              placeholder="Ask a question"
              placeholderTextColor={
                colors.muted
              }
              style={[
                styles.subInput,
                {
                  color:
                    colors.text,
                  backgroundColor:
                    colors.bg,
                  borderColor:
                    colors.border,
                },
              ]}
              autoFocus
            />

            {pollOptions.map(
              (option, index) => (
                <View
                  key={index}
                  style={
                    styles.pollOptionRow
                  }
                >
                  <TextInput
                    value={option}
                    onChangeText={(
                      text,
                    ) => {
                      setPollOptions(
                        (prev) =>
                          prev.map(
                            (
                              item,
                              itemIndex,
                            ) =>
                              itemIndex ===
                              index
                                ? text
                                : item,
                          ),
                      );
                    }}
                    placeholder={`Option ${
                      index + 1
                    }`}
                    placeholderTextColor={
                      colors.muted
                    }
                    style={[
                      styles.subInput,
                      {
                        color:
                          colors.text,
                        backgroundColor:
                          colors.bg,
                        borderColor:
                          colors.border,
                        marginBottom: 0,
                      },
                    ]}
                  />

                  {pollOptions.length >
                    2 && (
                    <Pressable
                      onPress={() =>
                        setPollOptions(
                          (prev) =>
                            prev.filter(
                              (
                                _,
                                itemIndex,
                              ) =>
                                itemIndex !==
                                index,
                            ),
                        )
                      }
                      hitSlop={8}
                    >
                      <X
                        color={
                          colors.muted
                        }
                        size={18}
                      />
                    </Pressable>
                  )}
                </View>
              ),
            )}

            <Pressable
              onPress={() =>
                setPollOptions(
                  (prev) => [
                    ...prev,
                    '',
                  ],
                )
              }
              style={
                styles.addOptionBtn
              }
            >
              <Text
                style={[
                  styles.addOptionText,
                  {
                    color:
                      accentForeground,
                  },
                ]}
              >
                + Add option
              </Text>
            </Pressable>

            <Pressable
              onPress={sendPoll}
              disabled={
                !pollQuestion.trim() ||
                pollOptions.filter(
                  (option) =>
                    option.trim(),
                ).length < 2
              }
              style={[
                styles.subAction,
                {
                  backgroundColor:
                    accentForeground,
                },
                (!pollQuestion.trim() ||
                  pollOptions.filter(
                    (option) =>
                      option.trim(),
                  ).length < 2) &&
                  styles.sendBtnDisabled,
              ]}
            >
              <Text
                style={
                  styles.subActionText
                }
              >
                Send poll
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* EVENT */}

      <Modal
        visible={eventOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setEventOpen(false)
        }
      >
        <View
          style={styles.modalShade}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor:
                  colors.card,
                borderTopColor:
                  colors.border,
              },
            ]}
          >
            <View
              style={styles.sheetHeader}
            >
              <Text
                style={[
                  styles.sheetTitle,
                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Create event
              </Text>

              <Pressable
                onPress={() =>
                  setEventOpen(
                    false,
                  )
                }
                hitSlop={12}
              >
                <X
                  color={
                    colors.muted
                  }
                  size={22}
                />
              </Pressable>
            </View>

            <TextInput
              value={eventTitle}
              onChangeText={
                setEventTitle
              }
              placeholder="Event title"
              placeholderTextColor={
                colors.muted
              }
              style={[
                styles.subInput,
                {
                  color:
                    colors.text,
                  backgroundColor:
                    colors.bg,
                  borderColor:
                    colors.border,
                },
              ]}
              autoFocus
            />

            <View
              style={styles.eventRow}
            >
              <TextInput
                value={eventDate}
                onChangeText={
                  setEventDate
                }
                placeholder="Date (YYYY-MM-DD)"
                placeholderTextColor={
                  colors.muted
                }
                style={[
                  styles.subInput,
                  {
                    color:
                      colors.text,
                    backgroundColor:
                      colors.bg,
                    borderColor:
                      colors.border,
                    flex: 1,
                    marginBottom: 0,
                  },
                ]}
              />

              <TextInput
                value={eventTime}
                onChangeText={
                  setEventTime
                }
                placeholder="Time"
                placeholderTextColor={
                  colors.muted
                }
                style={[
                  styles.subInput,
                  {
                    color:
                      colors.text,
                    backgroundColor:
                      colors.bg,
                    borderColor:
                      colors.border,
                    flex: 1,
                    marginBottom: 0,
                  },
                ]}
              />
            </View>

            <TextInput
              value={eventDesc}
              onChangeText={
                setEventDesc
              }
              placeholder="Description (optional)"
              placeholderTextColor={
                colors.muted
              }
              style={[
                styles.subInput,
                {
                  color:
                    colors.text,
                  backgroundColor:
                    colors.bg,
                  borderColor:
                    colors.border,
                },
              ]}
              multiline
            />

            <Text
              style={[
                styles.subHint,
                {
                  color:
                    colors.muted,
                },
              ]}
            >
              Recipients who reply YES
              will have this event added
              to their calendar.
            </Text>

            <Pressable
              onPress={sendEvent}
              disabled={
                !eventTitle.trim()
              }
              style={[
                styles.subAction,
                {
                  backgroundColor:
                    accentForeground,
                },
                !eventTitle.trim() &&
                  styles.sendBtnDisabled,
              ]}
            >
              <Text
                style={
                  styles.subActionText
                }
              >
                Send event
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* PROFILE */}

      <Modal
        visible={profileViewOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setProfileViewOpen(
            false,
          )
        }
      >
        <View
          style={styles.modalShade}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor:
                  colors.card,
                borderTopColor:
                  colors.border,
              },
            ]}
          >
            <View
              style={styles.sheetHeader}
            >
              <Text
                style={[
                  styles.sheetTitle,
                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Profile
              </Text>

              <Pressable
                onPress={() =>
                  setProfileViewOpen(
                    false,
                  )
                }
                hitSlop={12}
              >
                <X
                  color={
                    colors.muted
                  }
                  size={22}
                />
              </Pressable>
            </View>

            {profile ? (
              <View
                style={
                  styles.profileViewBody
                }
              >
                <View
                  style={[
                    styles.profileViewAvatar,
                    {
                      backgroundColor:
                        accentForeground,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.profileViewAvatarText,
                      {
                        color:
                          '#FFFFFF',
                      },
                    ]}
                  >
                    {profile.display_name
                      .slice(0, 1)
                      .toUpperCase()}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.profileName,
                    {
                      color:
                        colors.text,
                    },
                  ]}
                >
                  {
                    profile.display_name
                  }
                </Text>

                <Text
                  style={[
                    styles.profileUsername,
                    {
                      color:
                        colors.muted,
                    },
                  ]}
                >
                  @{profile.username}
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.subHint,
                  {
                    color:
                      colors.muted,
                  },
                ]}
              >
                Profile not
                available.
              </Text>
            )}

            <Pressable
              onPress={() =>
                setProfileViewOpen(
                  false,
                )
              }
              style={[
                styles.subAction,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <Text
                style={
                  styles.subActionText
                }
              >
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 28,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },

  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

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

  body: {
    flex: 1,
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },

  stateText: {
    fontFamily: FONT,
    fontSize: 14,
    textAlign: 'center',
  },

  sidekickGreeting: {
    fontFamily: FONT_SEMI,
    fontSize: 20,
    lineHeight: 28,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  sidekickGreetingSecond: {
    fontFamily: FONT,
    fontSize: 17,
    lineHeight: 25,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  retryBtn: {
    paddingHorizontal: 20,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  retryBtnText: {
    color: '#FFFFFF',
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 10,
  },

  msgRow: {
    flexDirection: 'row',
    marginVertical: 3,
  },

  msgRowMine: {
    justifyContent: 'flex-end',
  },

  msgRowTheirs: {
    justifyContent: 'flex-start',
  },

  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  bubbleText: {
    fontFamily: FONT,
    fontSize: 15,
    lineHeight: 21,
  },

  attachmentImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
    marginBottom: 6,
  },

  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
    minWidth: 160,
  },

  audioBubbleText: {
    fontFamily: FONT_MED,
    fontSize: 14,
  },

  docBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
    maxWidth: 220,
  },

  docBubbleText: {
    fontFamily: FONT_MED,
    fontSize: 13,
    flexShrink: 1,
  },

  bubbleTime: {
    fontFamily: FONT,
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },

  sidekickLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 5,
  },

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

  recordingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
  },

  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B6B',
  },

  recordingText: {
    flex: 1,
    fontFamily: FONT_MED,
    fontSize: 14,
  },

  recordingCancelBtn: {
    padding: 4,
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

  sendBtnDisabled: {
    opacity: 0.45,
  },

  toastWrap: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  toast: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },

  toastText: {
    fontFamily: FONT_MED,
    fontSize: 13,
    textAlign: 'center',
  },

  sheetShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 34,
    borderTopWidth: 1,
  },

  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  sheetTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
  },

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

  menuItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },

  menuItemText: {
    fontFamily: FONT_MED,
    fontSize: 16,
  },

  subShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  subSheet: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },

  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  subTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 17,
  },

  subHint: {
    fontFamily: FONT,
    fontSize: 13,
    marginBottom: 12,
  },

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

  subAction: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  subActionText: {
    color: '#FFFFFF',
    fontFamily: FONT_SEMI,
    fontSize: 15,
  },

  successWrap: {
    paddingVertical: 16,
    alignItems: 'center',
  },

  successText: {
    fontFamily: FONT_SEMI,
    fontSize: 15,
    textAlign: 'center',
  },

  modalShade: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  pollOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },

  addOptionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },

  addOptionText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  eventRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },

  profileViewBody: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },

  profileViewAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  profileViewAvatarText: {
    fontFamily: FONT_BOLD,
    fontSize: 26,
  },

  profileName: {
    fontFamily: FONT_BOLD,
    fontSize: 20,
  },

  profileUsername: {
    fontFamily: FONT,
    fontSize: 14,
  },
});