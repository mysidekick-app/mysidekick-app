import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
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
import * as DocumentPicker from 'expo-document-picker';

import {
  BarChart3,
  Calendar,
  CheckCheck,
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
  Tag,
  X,
} from 'lucide-react-native';

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import {
  ensureDirectConversation,
  getConversationReadMap,
  loadChatMessages,
  markConversationRead,
  sendChatMessage,
} from './chatHelpers';

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

type Profile = {
  user_id: string;
  display_name: string;
  username: string;
  bio?: string | null;
  badge?: string | null;
  avatar_url?: string | null;
  title?: string | null;
  tag?: string | null;
  profile_title?: string | null;
} | null;

type AttachmentType = 'image' | 'video' | 'audio' | 'document';

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachment_url?: string | null;
  attachment_type?: AttachmentType | null;
  attachment_name?: string | null;
};

type AttachmentOption = {
  key: 'image' | 'audio' | 'document' | 'poll' | 'event';
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
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();

  const {
    isDark,
    accentForeground,
    accentWash,
    onAccent,
  } = useApp();

  const normalizedId = (id ?? '').toLowerCase();

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

  const [playingMessageId, setPlayingMessageId] = useState<string | null>(
    null,
  );

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const soundRef = useRef<Audio.Sound | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);

  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [groupSuccess, setGroupSuccess] = useState<string | null>(null);

  const [pollOpen, setPollOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [profileViewOpen, setProfileViewOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [chatTags, setChatTags] = useState<{ id: string; name: string }[]>([]);
  const [assignedTagIds, setAssignedTagIds] = useState<string[]>([]);

  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventDesc, setEventDesc] = useState('');

  const [toast, setToast] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const listRef = useRef<FlatList<Message>>(null);

  const [conversationId, setConversationId] = useState<string>('');

  const showToast = useCallback((message: string) => {
    setToast(message);

    setTimeout(() => {
      setToast(null);
    }, 2500);
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
    }, 60);
  }, []);

  const loadChatTags = useCallback(async () => {
    if (!myId) return;
    const [{ data: tags }, { data: assignments }] = await Promise.all([
      supabase.from('social_chat_tags').select('id, name').eq('user_id', myId).order('created_at', { ascending: true }),
      supabase.from('social_chat_tag_assignments').select('tag_id').eq('user_id', myId).eq('chat_id', id ?? ''),
    ]);
    setChatTags((tags ?? []) as { id: string; name: string }[]);
    setAssignedTagIds((assignments ?? []).map((row: any) => row.tag_id));
  }, [myId, id]);

  const toggleChatTag = async (tagId: string) => {
    if (!myId || !id) return;
    const assigned = assignedTagIds.includes(tagId);
    if (assigned) {
      const { error } = await supabase.from('social_chat_tag_assignments').delete().eq('user_id', myId).eq('chat_id', id).eq('tag_id', tagId);
      if (error) { showToast(error.message || 'Could not remove tag.'); return; }
      setAssignedTagIds((previous) => previous.filter((value) => value !== tagId));
    } else {
      const { error } = await supabase.from('social_chat_tag_assignments').insert({ user_id: myId, chat_id: id, tag_id: tagId });
      if (error && error.code !== '23505') { showToast(error.message || 'Could not add tag.'); return; }
      setAssignedTagIds((previous) => previous.includes(tagId) ? previous : [...previous, tagId]);
    }
  };

  /*
   * Load the person being chatted with.
   */
  const loadProfile = useCallback(async () => {
    if (isSidekick || SYSTEM_CHAT_TITLES[normalizedId]) {
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
      .select('*')
      .eq('user_id', id)
      .maybeSingle();

    if (error) {
      console.error('Profile load error:', error);
      setProfile(null);
      setProfileError('Could not load profile.');
    } else {
      setProfile(data as Profile);
    }

    setProfileLoading(false);
  }, [id, isSidekick, normalizedId]);

  /*
   * Load direct messages.
   *
   * Sidekick does not use social_messages.
   */
  const loadMessages = useCallback(async () => {
    if (isSidekick) {
      setMessages([]);
      setMessagesLoading(false);
      setMessagesError(null);
      return;
    }

    if (!conversationId) {
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);
    setMessagesError(null);
    const result = await loadChatMessages(conversationId);
    if (result.error) {
      console.error('Messages load error:', result.error);
      setMessagesError('Could not load messages.');
    } else {
      setMessages(result.messages as Message[]);
    }
    setMessagesLoading(false);
  }, [conversationId, isSidekick]);

  /*
   * Load current authenticated user.
   */
  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted) {
        setMyId(user?.id ?? null);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!myId || !id || isSidekick) return;
    let cancelled = false;
    (async () => {
      const result = await ensureDirectConversation(myId, id);
      if (!cancelled) {
        if (result.error || !result.id) {
          setMessagesError(result.error?.message || 'Could not open conversation.');
          setConversationId('');
        } else {
          setConversationId(result.id);
          await markConversationRead(result.id, myId);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [myId, id, isSidekick]);

  /*
   * Load profile and messages.
   */
  useEffect(() => {
    loadProfile();
    loadMessages();
  }, [loadProfile, loadMessages]);

  useEffect(() => {
    if (myId && !isSidekick) void loadChatTags();
  }, [myId, isSidekick, loadChatTags]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(false);
    }
  }, [messages.length, scrollToBottom]);

  /*
   * SIDEKICK
   */
  const handleSendSidekick = async (text: string) => {
    if (!text || sending) {
      return;
    }

    setSending(true);
    setMessagesError(null);

    const userId = myId ?? `user-${Date.now()}`;

    const optimisticUserMessage: Message = {
      id: `local-user-${Date.now()}`,
      conversation_id: 'sidekick',
      sender_id: userId,
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((previous) => [
      ...previous,
      optimisticUserMessage,
    ]);

    setDraft('');
    scrollToBottom();

    try {
      const { data, error } = await supabase.functions.invoke(
        'sidekick-chat',
        {
          body: {
            message: text,
          },
        },
      );

      if (error) {
        console.error('Sidekick Edge Function error:', error);

        setMessages((previous) =>
          previous.filter(
            (message) =>
              message.id !== optimisticUserMessage.id,
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
        console.error('Sidekick returned no reply:', data);

        setMessages((previous) =>
          previous.filter(
            (message) =>
              message.id !== optimisticUserMessage.id,
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

      setMessages((previous) => [
        ...previous,
        sidekickMessage,
      ]);

      scrollToBottom();
    } catch (error) {
      console.error('Sidekick request failed:', error);

      setMessages((previous) =>
        previous.filter(
          (message) =>
            message.id !== optimisticUserMessage.id,
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
   * NORMAL CHAT
   */
  const handleSendNormalChat = async (text: string) => {
    if (!text || sending || !myId || !conversationId) return;
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
    scrollToBottom();
    const result = await sendChatMessage(conversationId, myId, text);
    if (result.error) {
      console.error('Send message error:', result.error);
      setMessages((previous) => previous.filter((message) => message.id !== optimistic.id));
      showToast('Failed to send message.');
    } else if (result.message) {
      setMessages((previous) => previous.map((message) => message.id === optimistic.id ? result.message as Message : message));
    }
    setSending(false);
  };

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
   * ATTACHMENTS
   */
  const uploadAttachment = async (
    uri: string,
    type: AttachmentType,
    fileName: string,
    mimeType: string,
  ): Promise<string | null> => {
    if (!myId) {
      return null;
    }

    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const path = `${myId}/${Date.now()}-${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(path, blob, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        console.error(
          'ATTACHMENT UPLOAD ERROR:',
          uploadError,
        );

        return null;
      }

      const { data } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(path);

      return data.publicUrl;
    } catch (error) {
      console.error(
        'ATTACHMENT UPLOAD EXCEPTION:',
        error,
      );

      return null;
    }
  };

  const sendAttachmentMessage = async (
    type: AttachmentType,
    url: string,
    fileName: string,
  ) => {
    if (!myId || !conversationId) return;
    const fallbackContent = type === 'image' ? '📷 Photo' : type === 'video' ? '🎬 Video' : type === 'audio' ? '🎤 Voice message' : `📄 ${fileName}`;
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
    setMessages((previous) => [...previous, optimistic]);
    scrollToBottom();
    const result = await sendChatMessage(conversationId, myId, fallbackContent, { url, name: fileName, type: type === 'image' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/m4a' : 'application/octet-stream' });
    if (result.error) {
      console.error('SEND ATTACHMENT MESSAGE ERROR:', result.error);
      setMessages((previous) => previous.filter((message) => message.id !== optimistic.id));
      showToast('Failed to send attachment.');
    } else if (result.message) {
      setMessages((previous) => previous.map((message) => message.id === optimistic.id ? result.message as Message : message));
    }
  };

  const handlePickDocument = async (
    audioOnly: boolean,
  ) => {
    const result =
      await DocumentPicker.getDocumentAsync({
        type: audioOnly ? 'audio/*' : '*/*',
        copyToCacheDirectory: true,
      });

    if (
      result.canceled ||
      !result.assets?.length
    ) {
      return;
    }

    const asset = result.assets[0];

    const fileName =
      asset.name ??
      `file-${Date.now()}`;

    const mimeType =
      asset.mimeType ??
      'application/octet-stream';

    const type: AttachmentType =
      audioOnly
        ? 'audio'
        : 'document';

    setUploadingAttachment(true);

    const url = await uploadAttachment(
      asset.uri,
      type,
      fileName,
      mimeType,
    );

    setUploadingAttachment(false);

    if (!url) {
      showToast('Could not upload file.');
      return;
    }

    await sendAttachmentMessage(
      type,
      url,
      fileName,
    );
  };

  /*
   * VOICE RECORDING
   */
  const startRecording = async () => {
    const permission =
      await Audio.requestPermissionsAsync();

    if (!permission.granted) {
      showToast(
        'Microphone access is needed to record a voice note.',
      );

      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } =
        await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );

      recordingRef.current = recording;

      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current =
        setInterval(() => {
          setRecordingSeconds(
            (seconds) => seconds + 1,
          );
        }, 1000);
    } catch (error) {
      console.error(
        'START RECORDING ERROR:',
        error,
      );

      showToast(
        'Could not start recording.',
      );
    }
  };

  const cancelRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(
        recordingTimerRef.current,
      );

      recordingTimerRef.current = null;
    }

    setIsRecording(false);
    setRecordingSeconds(0);

    try {
      await recordingRef.current?.stopAndUnloadAsync();
    } catch {
      // Recording may already have stopped.
    }

    recordingRef.current = null;
  };

  const stopRecordingAndSend = async () => {
    if (recordingTimerRef.current) {
      clearInterval(
        recordingTimerRef.current,
      );

      recordingTimerRef.current = null;
    }

    setIsRecording(false);

    const recording =
      recordingRef.current;

    if (!recording) {
      return;
    }

    try {
      await recording.stopAndUnloadAsync();

      const uri =
        recording.getURI();

      recordingRef.current = null;
      setRecordingSeconds(0);

      if (!uri) {
        return;
      }

      const fileName =
        `voice-${Date.now()}.m4a`;

      setUploadingAttachment(true);

      const url =
        await uploadAttachment(
          uri,
          'audio',
          fileName,
          'audio/m4a',
        );

      setUploadingAttachment(false);

      if (!url) {
        showToast(
          'Could not upload voice note.',
        );

        return;
      }

      await sendAttachmentMessage(
        'audio',
        url,
        fileName,
      );
    } catch (error) {
      console.error(
        'STOP RECORDING ERROR:',
        error,
      );

      setUploadingAttachment(false);

      showToast(
        'Could not save voice note.',
      );
    }
  };

  const togglePlayback = async (
    message: Message,
  ) => {
    if (!message.attachment_url) {
      return;
    }

    if (
      playingMessageId === message.id
    ) {
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
      const { sound } =
        await Audio.Sound.createAsync(
          {
            uri: message.attachment_url,
          },
          {
            shouldPlay: true,
          },
        );

      soundRef.current = sound;
      setPlayingMessageId(message.id);

      sound.setOnPlaybackStatusUpdate(
        (status) => {
          if (
            status.isLoaded &&
            status.didJustFinish
          ) {
            setPlayingMessageId(null);

            sound.unloadAsync();
            soundRef.current = null;
          }
        },
      );
    } catch (error) {
      console.error(
        'PLAYBACK ERROR:',
        error,
      );

      showToast(
        'Could not play voice note.',
      );
    }
  };

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();

      if (recordingTimerRef.current) {
        clearInterval(
          recordingTimerRef.current,
        );
      }

      recordingRef.current
        ?.stopAndUnloadAsync()
        .catch(() => {});
    };
  }, []);

  /*
   * ATTACHMENTS
   * Open the device file picker directly. No bottom attachment sheet.
   */
  const handlePickAttachment = async () => {
    if (uploadingAttachment || !myId || !conversationId) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const fileName = asset.name ?? `file-${Date.now()}`;
      const mimeType = asset.mimeType ?? 'application/octet-stream';
      const type: AttachmentType = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('video/')
          ? 'video'
          : mimeType.startsWith('audio/')
            ? 'audio'
            : 'document';

      setUploadingAttachment(true);
      const url = await uploadAttachment(asset.uri, type, fileName, mimeType);
      setUploadingAttachment(false);

      if (!url) {
        showToast('Could not upload attachment.');
        return;
      }

      await sendAttachmentMessage(type, url, fileName);
    } catch (error) {
      setUploadingAttachment(false);
      console.error('PICK ATTACHMENT ERROR:', error);
      showToast('Could not select attachment.');
    }
  };

  /*
   * POLL
   */
  const sendPoll = async () => {
    const question =
      pollQuestion.trim();

    const options =
      pollOptions
        .map((option) => option.trim())
        .filter(Boolean);

    if (
      !question ||
      options.length < 2 ||
      !myId
    ) {
      return;
    }

    const content =
      `📊 Poll: ${question}\n` +
      options
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

    setMessages((previous) => [
      ...previous,
      optimistic,
    ]);

    scrollToBottom();

    const { error } = await sendChatMessage(conversationId, myId, content).then((r) => ({ error: r.error }));

    if (error) {
      console.error(
        'SEND POLL ERROR:',
        error,
      );

      setMessages((previous) =>
        previous.filter(
          (message) =>
            message.id !==
            optimistic.id,
        ),
      );

      showToast(
        'Failed to send poll.',
      );
    }
  };

  /*
   * EVENT
   */
  const sendEvent = async () => {
    const title =
      eventTitle.trim();

    if (!title || !myId) {
      return;
    }

    let content =
      `📅 Event: ${title}`;

    if (eventDate.trim()) {
      content +=
        `\nDate: ${eventDate.trim()}`;
    }

    if (eventTime.trim()) {
      content +=
        `\nTime: ${eventTime.trim()}`;
    }

    if (eventDesc.trim()) {
      content +=
        `\n${eventDesc.trim()}`;
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

    setMessages((previous) => [
      ...previous,
      optimistic,
    ]);

    scrollToBottom();

    const { error } = await sendChatMessage(conversationId, myId, content).then((r) => ({ error: r.error }));

    if (error) {
      console.error(
        'SEND EVENT ERROR:',
        error,
      );

      setMessages((previous) =>
        previous.filter(
          (message) =>
            message.id !==
            optimistic.id,
        ),
      );

      showToast(
        'Failed to send event.',
      );
    }
  };

  /*
   * REPORT
   */
  const handleReport = async () => {
    const reason =
      reportReason.trim();

    if (
      !reason ||
      reportSubmitting ||
      !myId ||
      !id ||
      isSidekick
    ) {
      return;
    }

    setReportSubmitting(true);

    const { error } =
      await supabase
        .from('social_reports')
        .insert({
          reporter_id: myId,
          reported_id: id,
          reason,
        });

    setReportSubmitting(false);

    if (error) {
      console.error(
        'REPORT ERROR:',
        error,
      );

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
   * BLOCK
   */
  const handleBlock = async () => {
    if (
      !myId ||
      !id ||
      isSidekick
    ) {
      return;
    }

    setActionLoading('block');

    const { error } =
      await supabase
        .from('social_blocks')
        .insert({
          blocker_id: myId,
          blocked_id: id,
        });

    setActionLoading(null);

    if (error) {
      console.error(
        'BLOCK ERROR:',
        error,
      );

      showToast(
        'Could not block user.',
      );

      return;
    }

    showToast(
      `Blocked ${
        profile?.display_name ??
        'user'
      }`,
    );

    setTimeout(() => {
      router.replace('/chat' as never);
    }, 700);
  };

  const handleDeleteChat = async () => {
    if (!myId || !conversationId || isSidekick) return;
    setActionLoading('delete');
    const { error } = await supabase
      .from('chat_conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', myId);
    setActionLoading(null);
    if (error) { showToast('Could not delete chat.'); return; }
    router.replace('/chat' as never);
  };

  /*
   * CLEAR CHAT
   */
  const handleClearChat = async () => {
    if (!myId) {
      showToast(
        'Could not identify your account.',
      );

      return;
    }

    setActionLoading('clear');

    if (isSidekick) {
      const { error } =
        await supabase
          .from('system_messages')
          .delete()
          .eq('user_id', myId)
          .eq(
            'module_key',
            'sidekick',
          );

      setActionLoading(null);

      if (error) {
        console.error(
          'CLEAR SIDEKICK ERROR:',
          error,
        );

        showToast(
          'Could not clear Sidekick chat.',
        );

        return;
      }

      setMessages([]);
      showToast(
        'Sidekick chat cleared.',
      );

      return;
    }

    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('sender_id', myId);

    setActionLoading(null);

    if (error) {
      console.error(
        'CLEAR CHAT ERROR:',
        error,
      );

      showToast(
        'Could not clear chat.',
      );

      return;
    }

    setMessages([]);
    showToast('Chat cleared.');
  };

  /*
   * CREATE GROUP
   */
  const handleCreateGroup = async () => {
    const name = groupName.trim();
    if (!name || groupSubmitting || !myId || !id || isSidekick) return;
    setGroupSubmitting(true);

    try {
      const { data: groupData, error: groupError } = await supabase
        .from('chat_groups')
        .insert({ name, description: '', visibility: 'private', owner_id: myId })
        .select('id')
        .single();
      if (groupError || !groupData) throw groupError ?? new Error('Could not create group.');
      const groupId = groupData.id;

      const { error: memberError } = await supabase
        .from('chat_group_members')
        .insert({ group_id: groupId, user_id: myId, role: 'owner' });
      if (memberError) throw memberError;

      const { data: channelData, error: channelError } = await supabase
        .from('chat_channels')
        .insert({ group_id: groupId, name, description: '', position: 0, is_default: true, created_by: myId })
        .select('id')
        .single();
      if (channelError || !channelData) throw channelError ?? new Error('Could not create group channel.');

      const { data: conversationData, error: conversationError } = await supabase
        .from('chat_conversations')
        .insert({ type: 'channel', group_id: groupId, channel_id: channelData.id, created_by: myId })
        .select('id')
        .single();
      if (conversationError || !conversationData) throw conversationError ?? new Error('Could not create group conversation.');

      const { error: conversationMemberError } = await supabase
        .from('chat_conversation_members')
        .insert({ conversation_id: conversationData.id, user_id: myId });
      if (conversationMemberError) throw conversationMemberError;

      const { data: inviteData, error: inviteError } = await supabase
        .from('chat_group_invitations')
        .insert({ group_id: groupId, inviter_id: myId, invitee_id: id, status: 'pending' })
        .select('id')
        .single();
      if (inviteError) throw inviteError;

      setGroupSuccess(`Group created${inviteData ? ` and invite sent to ${profile?.display_name ?? 'user'}` : ''}`);
      setGroupName('');
    } catch (error: any) {
      console.error('CREATE GROUP ERROR:', error);
      showToast(error?.message || 'Could not create group.');
    } finally {
      setGroupSubmitting(false);
    }
  };

  /*
   * MESSAGE RENDERING
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

    const time =
      new Date(
        item.created_at,
      ).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

    const outgoing =
      isMine &&
      !isSidekickReply;

    const contentColor =
      outgoing
        ? onAccent
        : colors.text;

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
              : outgoing
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

          {item.attachment_type ===
            'image' &&
          item.attachment_url ? (
            <Image
              source={{
                uri: item.attachment_url,
              }}
              style={
                styles.attachmentImage
              }
              resizeMode="cover"
            />
          ) : null}

          {item.attachment_type ===
            'video' &&
          item.attachment_url ? (
            <Pressable
              onPress={() => Linking.openURL(item.attachment_url!)}
              style={[styles.docBubble, { borderColor: outgoing ? 'rgba(255,255,255,0.4)' : colors.border }]}
            >
              <Text style={[styles.docBubbleText, { color: outgoing ? onAccent : colors.text }]}>🎬 Video</Text>
            </Pressable>
          ) : null}

          {item.attachment_type ===
            'audio' &&
          item.attachment_url ? (
            <Pressable
              onPress={() =>
                togglePlayback(item)
              }
              style={[
                styles.audioBubble,
                {
                  borderColor:
                    outgoing
                      ? 'rgba(255,255,255,0.4)'
                      : colors.border,
                },
              ]}
            >
              {playingMessageId ===
              item.id ? (
                <Pause
                  color={
                    outgoing
                      ? onAccent
                      : colors.text
                  }
                  size={18}
                />
              ) : (
                <Play
                  color={
                    outgoing
                      ? onAccent
                      : colors.text
                  }
                  size={18}
                />
              )}

              <Text
                style={[
                  styles.audioBubbleText,
                  {
                    color:
                      outgoing
                        ? onAccent
                        : colors.text,
                  },
                ]}
              >
                Voice message
              </Text>
            </Pressable>
          ) : null}

          {item.attachment_type ===
            'document' &&
          item.attachment_url ? (
            <Pressable
              onPress={() =>
                Linking.openURL(
                  item.attachment_url!,
                )
              }
              style={[
                styles.docBubble,
                {
                  borderColor:
                    outgoing
                      ? 'rgba(255,255,255,0.4)'
                      : colors.border,
                },
              ]}
            >
              <FileText
                color={
                  outgoing
                    ? onAccent
                    : colors.text
                }
                size={18}
              />

              <Text
                numberOfLines={1}
                style={[
                  styles.docBubbleText,
                  {
                    color:
                      outgoing
                        ? onAccent
                        : colors.text,
                  },
                ]}
              >
                {item.attachment_name ??
                  'Document'}
              </Text>
            </Pressable>
          ) : null}

          {!item.attachment_type ? (
            <Text
              style={[
                styles.bubbleText,
                {
                  color:
                    contentColor,
                },
              ]}
            >
              {item.content}
            </Text>
          ) : null}

          <Text
            style={[
              styles.bubbleTime,
              {
                color: outgoing
                  ? 'rgba(255,255,255,0.75)'
                  : colors.muted,
              },
            ]}
          >
            {time}
          </Text>
          {outgoing ? (
            <CheckCheck color={accentForeground} size={14} strokeWidth={2.2} style={{ marginLeft: 4 }} />
          ) : null}
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

  const closeMenu = () =>
    setMenuOpen(false);

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor:
            colors.bg,
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
              disabled={
                !showProfileButton
              }
              onPress={() =>
                setProfileViewOpen(
                  true,
                )
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

              {!isSidekick ? (
                <View
                  style={
                    styles.activeRow
                  }
                >
                  <View
                    style={
                      styles.activeDot
                    }
                  />

                  <Text
                    style={[
                      styles.activeText,
                      { color: colors.muted },
                    ]}
                  >
                    {profile?.title || profile?.tag || profile?.profile_title || 'Friend'}
                  </Text>
                </View>
              ) : null}
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
              color={
                accentForeground
              }
              size="large"
            />

            <Text
              style={[
                styles.stateText,
                {
                  color:
                    colors.muted,
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
                  color:
                    colors.text,
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
                      color:
                        colors.text,
                    },
                  ]}
                >
                  Hi! I’m your Sidekick 👣
                </Text>

                <Text
                  style={[
                    styles.sidekickGreetingSecond,
                    {
                      color:
                        colors.text,
                    },
                  ]}
                >
                  I'm here to help you improve your life, one atomic habit at a time!
                </Text>
              </>
            ) : (
              <Text
                style={[
                  styles.stateText,
                  {
                    color:
                      colors.muted,
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          {!isSidekick && !isRecording ? (
            <Pressable
              onPress={handlePickAttachment}
              disabled={uploadingAttachment || sending}
              hitSlop={8}
              style={[styles.attachBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              {uploadingAttachment ? <ActivityIndicator color={accentForeground} size="small" /> : <Paperclip color={colors.muted} size={20} />}
            </Pressable>
          ) : null}

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
              placeholder={isSidekick ? 'Message Sidekick…' : 'Type a message…'}
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]}
              multiline
              maxLength={2000}
              scrollEnabled={false}
              editable={!sending}
            />
          )}

          {isRecording ? (
            <Pressable onPress={stopRecordingAndSend} disabled={uploadingAttachment} hitSlop={8} style={[styles.sendBtn, { backgroundColor: accentForeground }]}>
              {uploadingAttachment ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Square color="#FFFFFF" size={16} />}
            </Pressable>
          ) : !isSidekick && !draft.trim() ? (
            <Pressable onPress={startRecording} disabled={uploadingAttachment} hitSlop={8} style={[styles.sendBtn, { backgroundColor: accentForeground }, uploadingAttachment && styles.sendBtnDisabled]}>
              <Mic color="#FFFFFF" size={18} />
            </Pressable>
          ) : (
            <Pressable onPress={handleSend} disabled={!draft.trim() || sending} hitSlop={8} style={[styles.sendBtn, { backgroundColor: accentForeground }, (!draft.trim() || sending) && styles.sendBtnDisabled]}>
              {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Send color="#FFFFFF" size={18} />}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* TOAST */}

      {toast ? (
        <View
          style={
            styles.toastWrap
          }
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

      {/* CHAT OPTIONS — top-right dropdown */}
      {menuOpen ? (
        <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
          <View style={[styles.dropdownMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {!isSidekick ? (
              <>
                <Pressable style={styles.menuItem} onPress={() => { closeMenu(); setReportOpen(true); }}>
                  <Text style={[styles.menuItemText, { color: colors.text }]}>Report</Text>
                </Pressable>
                <Pressable style={styles.menuItem} onPress={handleBlock} disabled={actionLoading === 'block'}>
                  <Text style={[styles.menuItemText, { color: colors.text }]}>{actionLoading === 'block' ? 'Blocking…' : 'Block'}</Text>
                </Pressable>
                <Pressable style={styles.menuItem} onPress={() => { closeMenu(); setTagModalOpen(true); void loadChatTags(); }}>
                  <Text style={[styles.menuItemText, { color: colors.text }]}>Add Tag</Text>
                </Pressable>
                <Pressable style={styles.menuItem} onPress={() => { closeMenu(); Alert.alert('Delete chat?', 'This removes the conversation from your chat list.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: handleDeleteChat }]); }}>
                  <Text style={[styles.menuItemText, { color: '#C84D4D' }]}>Delete Chat</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable style={styles.menuItem} onPress={handleClearChat} disabled={actionLoading === 'clear'}>
              <Text style={[styles.menuItemText, { color: colors.text }]}>{actionLoading === 'clear' ? 'Clearing…' : 'Clear Chat'}</Text>
            </Pressable>
          </View>
        </Pressable>
      ) : null}

      <Modal visible={tagModalOpen} transparent animationType="fade" onRequestClose={() => setTagModalOpen(false)}>
        <View style={styles.subShade}>
          <View style={[styles.subSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.subHeader}>
              <Text style={[styles.subTitle, { color: colors.text }]}>Add Tag</Text>
              <Pressable onPress={() => setTagModalOpen(false)} hitSlop={12}><X color={colors.muted} size={22} /></Pressable>
            </View>
            {chatTags.length === 0 ? (
              <Text style={[styles.subHint, { color: colors.muted }]}>You haven't created any tags yet.</Text>
            ) : chatTags.map((tag) => {
              const selected = assignedTagIds.includes(tag.id);
              return (
                <Pressable key={tag.id} onPress={() => toggleChatTag(tag.id)} style={[styles.menuItem, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.menuItemText, { color: selected ? accentForeground : colors.text }]}>{selected ? '✓ ' : ''}{tag.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal visible={profileViewOpen} transparent animationType="fade" onRequestClose={() => setProfileViewOpen(false)}>
        <View style={styles.subShade}>
          <View style={[styles.subSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.subHeader}>
              <Text style={[styles.subTitle, { color: colors.text }]}>Profile</Text>
              <Pressable onPress={() => setProfileViewOpen(false)} hitSlop={12}><X color={colors.muted} size={22} /></Pressable>
            </View>
            {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.profileViewAvatarImage} /> : <View style={[styles.profileViewAvatar, { backgroundColor: accentForeground }]}><Text style={[styles.profileViewAvatarText, { color: '#FFFFFF' }]}>{(profile?.display_name || '?').slice(0,1).toUpperCase()}</Text></View>}
            <Text style={[styles.profileName, { color: colors.text }]}>{profile?.display_name || 'User'}</Text>
            <Text style={[styles.profileUsername, { color: colors.muted }]}>@{profile?.username || ''}</Text>
            {(profile?.title || profile?.tag || profile?.profile_title) ? <Text style={[styles.profileBadge, { color: accentForeground }]}>{profile.title || profile.tag || profile.profile_title}</Text> : null}
            {profile?.badge ? <Text style={[styles.profileBadge, { color: accentForeground }]}>{profile.badge}</Text> : null}
            {profile?.bio ? <Text style={[styles.profileBio, { color: colors.muted }]}>{profile.bio}</Text> : null}
          </View>
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
          style={
            styles.subShade
          }
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
              style={
                styles.subHeader
              }
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
    paddingTop: 36,
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
    backgroundColor:
      'rgba(0,0,0,0.45)',
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

  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },

  dropdownMenu: {
    position: 'absolute',
    top: 82,
    right: 12,
    width: 190,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 4,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
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
    backgroundColor:
      'rgba(0,0,0,0.5)',
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
    backgroundColor:
      'rgba(0,0,0,0.45)',
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
    profileViewAvatarImage: { width: 78, height: 78, borderRadius: 39 },
    profileBadge: { fontFamily: FONT_MED, fontSize: 13, marginTop: 8 },
    profileBio: { fontFamily: FONT, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 300 },
});