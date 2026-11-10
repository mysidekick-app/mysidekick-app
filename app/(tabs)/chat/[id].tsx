import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';

import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import {
  router,
  useLocalSearchParams,
  useNavigation,
} from 'expo-router';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';

import {
  ChevronLeft,
  FileText,
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

import {
  ensureDirectConversation,
  clearChatForUser,
  deleteConversationForUser,
  deleteMessageForUser,
  getDeletedMessageIds,
  getChatClearedAt,
  loadChatMessages,
  markConversationRead,
  sendChatMessage,
} from './chatHelpers';

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

type AttachmentType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'game_invite';

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

const SYSTEM_CHAT_TITLES: Record<string, string> = {
  sidekick: 'Sidekick',
};

const getSidekickReadKey = (userId: string) =>
  `mysidekick:sidekick-read-at:${userId}`;

const markSidekickRead = async (userId: string, readAt: string) => {
  try {
    await AsyncStorage.setItem(getSidekickReadKey(userId), readAt);
  } catch (error) {
    console.error('MARK SIDEKICK READ ERROR:', error);
  }
};

function renderSidekickFormattedText(
  content: string,
  color: string,
) {
  const parts = content.split(/(\*\*[\s\S]*?\*\*)/g);

  return parts.map((part, index) => {
    const isBold =
      part.startsWith('**') &&
      part.endsWith('**') &&
      part.length >= 4;

    return (
      <Text
        key={`sidekick-text-${index}`}
        style={isBold ? { fontFamily: 'Poppins-Bold', color } : { color }}
      >
        {isBold ? part.slice(2, -2) : part}
      </Text>
    );
  });
}

const SIDEKICK_MODULE_CHOICES = [
  { label: 'Planner', route: '/planner' },
  { label: 'Habits', route: '/habits' },
  { label: 'Finance', route: '/modules/finances' },
  { label: 'Lists', route: '/modules/lists' },
  { label: 'Reminders', route: '/reminders' },
  { label: 'Bookmarks', route: '/bookmarks' },
  { label: 'Plants', route: '/plants' },
  { label: 'Well-being', route: '/modules/wellbeing' },
  { label: 'Games', route: '/modules/games' },
] as const;

function getLocalDateKey(value: string): string {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatMessageDateLabel(value: string): string {
  const date = new Date(value);
  const now = new Date();

  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const messageStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  const dayDifference = Math.round(
    (todayStart.getTime() - messageStart.getTime()) /
      (24 * 60 * 60 * 1000),
  );

  if (dayDifference === 0) {
    return 'Today';
  }

  if (dayDifference === 1) {
    return 'Yesterday';
  }

  if (dayDifference >= 2 && dayDifference <= 6) {
    return date.toLocaleDateString([], {
      weekday: 'long',
    });
  }

  return date.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type DirectConversationResult = {
  id: string | null;
  error: any;
};

async function findExistingDirectConversation(
  myUserId: string,
  otherUserId: string,
): Promise<DirectConversationResult> {
  const cacheKey = `mysidekick:direct-conversation:${myUserId}:${otherUserId}`;

  try {
    const cachedConversationId = await AsyncStorage.getItem(cacheKey);
    if (cachedConversationId) {
      return {
        id: cachedConversationId,
        error: null,
      };
    }
  } catch {
    // Local cache is best-effort.
  }

  const [myMembershipResult, otherMembershipResult] = await Promise.all([
    supabase
      .from('chat_conversation_members')
      .select('conversation_id')
      .eq('user_id', myUserId),
    supabase
      .from('chat_conversation_members')
      .select('conversation_id')
      .eq('user_id', otherUserId),
  ]);

  if (myMembershipResult.error) {
    return {
      id: null,
      error: myMembershipResult.error,
    };
  }

  if (otherMembershipResult.error) {
    return {
      id: null,
      error: otherMembershipResult.error,
    };
  }

  const myIds = new Set(
    (myMembershipResult.data ?? [])
      .map((row: any) => row.conversation_id)
      .filter(Boolean),
  );

  const candidateIds = [
    ...new Set(
      (otherMembershipResult.data ?? [])
        .map((row: any) => row.conversation_id)
        .filter((conversationId: any) => conversationId && myIds.has(conversationId)),
    ),
  ];

  if (candidateIds.length === 0) {
    return { id: null, error: null };
  }

  const { data: directConversations, error: directError } =
    await supabase
      .from('chat_conversations')
      .select('id')
      .eq('type', 'direct')
      .in('id', candidateIds);

  if (directError) {
    return {
      id: null,
      error: directError,
    };
  }

  const directIds = new Set(
    (directConversations ?? [])
      .map((row: any) => row.id)
      .filter(Boolean),
  );

  const conversationId = candidateIds.find(id => directIds.has(id)) ?? null;

  if (conversationId) {
    try {
      await AsyncStorage.setItem(cacheKey, conversationId);
    } catch {
      // Local cache is best-effort.
    }
  }

  return {
    id: conversationId,
    error: null,
  };
}

async function ensureDirectConversationForSend(
  myUserId: string,
  otherUserId: string,
): Promise<DirectConversationResult> {
  const existing = await findExistingDirectConversation(
    myUserId,
    otherUserId,
  );

  if (existing.id || existing.error) {
    return existing;
  }

  const rpcResult = await ensureDirectConversation(
    myUserId,
    otherUserId,
  );

  if (rpcResult.id) {
    try {
      await AsyncStorage.setItem(
        `mysidekick:direct-conversation:${myUserId}:${otherUserId}`,
        rpcResult.id,
      );
    } catch {
      // Local cache is best-effort.
    }

    return {
      id: rpcResult.id,
      error: null,
    };
  }

  const { data: conversation, error: createError } =
    await supabase
      .from('chat_conversations')
      .insert({
        type: 'direct',
        group_id: null,
        channel_id: null,
        created_by: myUserId,
      })
      .select('id')
      .single();

  if (createError || !conversation?.id) {
    return {
      id: null,
      error: createError ?? rpcResult.error ?? new Error('Unable to create direct conversation.'),
    };
  }

  const { error: memberError } = await supabase
    .from('chat_conversation_members')
    .insert([
      {
        conversation_id: conversation.id,
        user_id: myUserId,
      },
      {
        conversation_id: conversation.id,
        user_id: otherUserId,
      },
    ]);

  if (memberError) {
    await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', conversation.id);

    return {
      id: null,
      error: memberError,
    };
  }

  try {
    await AsyncStorage.setItem(
      `mysidekick:direct-conversation:${myUserId}:${otherUserId}`,
      conversation.id,
    );
  } catch {
    // Local cache is best-effort.
  }

  return {
    id: conversation.id,
    error: null,
  };
}

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

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener(
      'beforeRemove',
      (event) => {
        const action = event.data.action;
        if (action.type !== 'GO_BACK' && action.type !== 'POP') {
          return;
        }
        event.preventDefault();
        router.replace('/(tabs)' as never);
      },
    );
    return unsubscribe;
  }, [navigation]);

  const appContext = useApp() as any;
  const {
    isDark,
    accentForeground,
    accentColor: rawAccent,
  } = appContext;

  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);

  const normalizedId = (id ?? '').toLowerCase();
  const isSidekick = normalizedId === 'sidekick';

  const [profile, setProfile] = useState<Profile>(null);
  const [profileLoading, setProfileLoading] = useState(!isSidekick);
  const [myId, setMyId] = useState<string | null>(null);

  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlockedByOther, setIsBlockedByOther] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(!isSidekick);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    type: AttachmentType;
    name: string;
    mimeType: string;
  } | null>(null);

  const [attachmentReviewOpen, setAttachmentReviewOpen] = useState(false);
  const [attachmentSending, setAttachmentSending] = useState(false);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [reviewPosition, setReviewPosition] = useState(0);
  const [reviewDuration, setReviewDuration] = useState(1);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(1);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [chatTags, setChatTags] = useState<{ id: string; name: string }[]>([]);
  const [assignedTagIds, setAssignedTagIds] = useState<string[]>([]);

  const [toast, setToast] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [gameInviteStates, setGameInviteStates] = useState<Record<string, string>>({});
  const [gameInviteActionId, setGameInviteActionId] = useState<string | null>(null);
  const [messageAction, setMessageAction] = useState<Message | null>(null);
  const [messageActionLoading, setMessageActionLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const listRef = useRef<FlatList<Message>>(null);
  const [conversationId, setConversationId] = useState('');
  const [chatScreenFocused, setChatScreenFocused] = useState(false);

  useEffect(() => {
    const handleFocus = () => setChatScreenFocused(true);
    const handleBlur = () => setChatScreenFocused(false);

    setChatScreenFocused(navigation.isFocused());
    const unsubscribeFocus = navigation.addListener('focus', handleFocus);
    const unsubscribeBlur = navigation.addListener('blur', handleBlur);

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

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
      supabase
        .from('social_chat_tags')
        .select('id, name')
        .eq('user_id', myId)
        .order('created_at', { ascending: true }),
      supabase
        .from('social_chat_tag_assignments')
        .select('tag_id')
        .eq('user_id', myId)
        .eq('chat_id', id ?? ''),
    ]);

    setChatTags((tags ?? []) as { id: string; name: string }[]);
    setAssignedTagIds((assignments ?? []).map((row: any) => row.tag_id));
  }, [myId, id]);

  const toggleChatTag = async (tagId: string) => {
    if (!myId || !id) return;
    const assigned = assignedTagIds.includes(tagId);

    if (assigned) {
      const { error } = await supabase
        .from('social_chat_tag_assignments')
        .delete()
        .eq('user_id', myId)
        .eq('chat_id', id)
        .eq('tag_id', tagId);

      if (error) {
        showToast(error.message || 'Could not remove tag.');
        return;
      }
      setAssignedTagIds(previous => previous.filter(value => value !== tagId));
    } else {
      const { error } = await supabase
        .from('social_chat_tag_assignments')
        .insert({ user_id: myId, chat_id: id, tag_id: tagId });

      if (error && error.code !== '23505') {
        showToast(error.message || 'Could not add tag.');
        return;
      }
      setAssignedTagIds(previous =>
        previous.includes(tagId) ? previous : [...previous, tagId],
      );
    }
  };

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
    const { data, error } = await supabase
      .from('social_profiles')
      .select('*')
      .eq('user_id', id)
      .maybeSingle();

    if (!error) {
      setProfile(data as Profile);
    }
    setProfileLoading(false);
  }, [id, isSidekick, normalizedId]);

  const handleSidekickModulePress = useCallback((route: string) => {
    router.push(route as never);
  }, []);

  const loadMessages = useCallback(async () => {
    if (isSidekick) {
      if (!myId) {
        setMessages([]);
        setMessagesLoading(false);
        setMessagesError(null);
        return;
      }

      setMessagesLoading(true);
      setMessagesError(null);

      const { data, error } = await supabase
        .from('system_messages')
        .select('id, user_id, module_key, sender, content, created_at')
        .eq('user_id', myId)
        .eq('module_key', 'sidekick')
        .order('created_at', { ascending: true });

      if (error) {
        setMessagesError('Could not load Sidekick messages.');
        setMessages([]);
      } else {
        let loadedMessages: Message[] = (data ?? []).map((row: any) => ({
          id: row.id,
          conversation_id: 'sidekick',
          sender_id: row.sender === 'sidekick' ? 'sidekick' : myId,
          content: row.content,
          created_at: row.created_at,
        }));

        if (loadedMessages.length === 0) {
          const starterText =
            'Welcome to Sidekick. Where would you like to start?';
          const { data: starterMessage } = await supabase
            .from('system_messages')
            .insert({
              user_id: myId,
              module_key: 'sidekick',
              sender: 'sidekick',
              content: starterText,
            })
            .select('id, user_id, module_key, sender, content, created_at')
            .single();

          loadedMessages = [
            {
              id: starterMessage?.id ?? `sidekick-starter-${Date.now()}`,
              conversation_id: 'sidekick',
              sender_id: 'sidekick',
              content: starterMessage?.content ?? starterText,
              created_at: starterMessage?.created_at ?? new Date().toISOString(),
            },
          ];
        }

        setMessages(loadedMessages);
        const newestSidekickMessage = [...loadedMessages]
          .reverse()
          .find(message => message.sender_id === 'sidekick');

        if (myId && newestSidekickMessage) {
          await markSidekickRead(myId, newestSidekickMessage.created_at);
        }
      }

      setMessagesLoading(false);
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
      setMessagesError('Could not load messages.');
    } else {
      const clearedAt = myId ? await getChatClearedAt(myId, conversationId) : null;
      let loadedMessages = (result.messages as Message[]).filter((message) => {
        if (!clearedAt) return true;
        return new Date(message.created_at).getTime() > new Date(clearedAt).getTime();
      });

      if (myId && loadedMessages.length > 0) {
        const deletedResult = await getDeletedMessageIds(
          loadedMessages.map(message => message.id),
          myId,
        );
        if (!deletedResult.error) {
          loadedMessages = loadedMessages.filter(
            message => !deletedResult.ids.has(message.id),
          );
        }
      }

      const inviteSessionIds = loadedMessages
        .filter(message => message.attachment_type === 'game_invite')
        .map(message => message.attachment_url?.match(/[?&]sessionId=([^&]+)/i)?.[1])
        .filter(Boolean)
        .map(value => decodeURIComponent(value as string));
      if (inviteSessionIds.length > 0) {
        const { data: inviteSessions } = await supabase
          .from('game_sessions')
          .select('id, status')
          .in('id', inviteSessionIds);
        if (inviteSessions?.length) {
          const statusByMessage: Record<string, string> = {};
          loadedMessages.forEach(message => {
            const rawId = message.attachment_url?.match(/[?&]sessionId=([^&]+)/i)?.[1];
            const sessionId = rawId ? decodeURIComponent(rawId) : null;
            const session = inviteSessions.find((row: any) => row.id === sessionId);
            if (session?.status) statusByMessage[message.id] = session.status;
          });
          setGameInviteStates(previous => ({ ...previous, ...statusByMessage }));
        }
      }

      setMessages(previous => {
        const byId = new Map<string, Message>();
        for (const message of previous) byId.set(message.id, message);
        for (const message of loadedMessages) byId.set(message.id, message);
        return Array.from(byId.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      });

      if (myId && chatScreenFocused && loadedMessages.length > 0) {
        const newestReadMessage = loadedMessages[loadedMessages.length - 1];
        await markConversationRead(conversationId, myId, newestReadMessage?.created_at);
      }
    }

    setMessagesLoading(false);
  }, [chatScreenFocused, conversationId, isSidekick, myId]);

  useEffect(() => {
    if (isSidekick || !conversationId || !chatScreenFocused) return;

    let cancelled = false;
    const channel = supabase
      .channel(`chat-messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (cancelled) return;
          const row = payload.new as any;
          if (!row?.id || row.conversation_id !== conversationId || row.deleted_at) return;
          if (myId && row.sender_id === myId) return;

          const incomingMessage: Message = {
            id: row.id,
            conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            content: row.body ?? '',
            created_at: row.created_at,
          };

          setMessages(previous => {
            if (previous.some(message => message.id === incomingMessage.id)) return previous;
            return [...previous, incomingMessage].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
          });
          scrollToBottom();

          if (myId) {
            const clearedAt = await getChatClearedAt(myId, conversationId);
            if (clearedAt && new Date(row.created_at).getTime() <= new Date(clearedAt).getTime()) {
              setMessages(previous => previous.filter(m => m.id !== row.id));
              return;
            }
            const deletedResult = await getDeletedMessageIds([row.id], myId);
            if (deletedResult.ids.has(row.id)) {
              setMessages(previous => previous.filter(m => m.id !== row.id));
              return;
            }
          }

          try {
            const { data: attachmentRow } = await supabase
              .from('chat_message_attachments')
              .select('message_id, url, name, mime_type, attachment_type')
              .eq('message_id', row.id)
              .maybeSingle();

            if (!cancelled && attachmentRow) {
              setMessages(previous =>
                previous.map(message =>
                  message.id === row.id
                    ? {
                        ...message,
                        attachment_url: attachmentRow.url ?? null,
                        attachment_name: attachmentRow.name ?? null,
                        attachment_type:
                          attachmentRow.attachment_type ??
                          attachmentRow.mime_type ??
                          null,
                      }
                    : message,
                ),
              );
            }
          } catch {}

          if (!cancelled && myId && chatScreenFocused) {
            await markConversationRead(conversationId, myId, incomingMessage.created_at);
          }
          scrollToBottom();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [chatScreenFocused, conversationId, isSidekick, myId, scrollToBottom]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted) setMyId(user?.id ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!myId || !conversationId || isSidekick) return;
    const channel = supabase
      .channel(`game-invite-status:${conversationId}:${myId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_sessions',
        filter: `created_by=eq.${myId}`,
      }, payload => {
        const row = payload.new as any;
        if (!row?.id || !row?.status) return;
        const matching = messages.filter(message =>
          message.attachment_type === 'game_invite' &&
          getGameInviteSessionId(message) === row.id
        );
        if (matching.length) {
          setGameInviteStates(previous => {
            const next = { ...previous };
            matching.forEach(message => { next[message.id] = row.status; });
            return next;
          });
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [myId, conversationId, isSidekick, messages]);

  useEffect(() => {
    if (!myId || !id || isSidekick) {
      setIsBlocked(false);
      setIsBlockedByOther(false);
      return;
    }

    let cancelled = false;
    const loadBlockState = async () => {
      const [{ data: blockedByMe }, { data: blockedByOther }] = await Promise.all([
        supabase
          .from('social_blocks')
          .select('id')
          .eq('blocker_id', myId)
          .eq('blocked_id', id)
          .maybeSingle(),
        supabase
          .from('social_blocks')
          .select('id')
          .eq('blocker_id', id)
          .eq('blocked_id', myId)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      setIsBlocked(Boolean(blockedByMe));
      setIsBlockedByOther(Boolean(blockedByOther));
    };

    void loadBlockState();
    return () => {
      cancelled = true;
    };
  }, [myId, id, isSidekick]);

  useEffect(() => {
    if (!myId || !id || isSidekick) return;

    let cancelled = false;
    (async () => {
      const result = await findExistingDirectConversation(myId, id);
      if (cancelled) return;

      if (result.error) {
        setConversationId('');
        setMessages([]);
        setMessagesError('Could not open conversation.');
        setMessagesLoading(false);
        return;
      }
      if (!result.id) {
        setConversationId('');
        setMessages([]);
        setMessagesError(null);
        setMessagesLoading(false);
        return;
      }
      setConversationId(result.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [myId, id, isSidekick]);

  useEffect(() => {
    void loadProfile();
    void loadMessages();
  }, [loadProfile, loadMessages]);

  useEffect(() => {
    if (myId && !isSidekick) {
      void loadChatTags();
    }
  }, [myId, isSidekick, loadChatTags]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(false);
    }
  }, [messages.length, scrollToBottom]);

  const loadSidekickAppData = async () => {
    if (!myId) return {};
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const safeQuery = async (query: PromiseLike<{ data: unknown; error: unknown }>) => {
      try {
        const result = await query;
        if (result.error) return [];
        return Array.isArray(result.data) ? result.data : [];
      } catch {
        return [];
      }
    };

    const [plannerRows, habitsRows, habitCompletionRows, reminderRows, listRows, financeRows, bookmarkRows, plantRows, wellbeingRows, gameRows] = await Promise.all([
      safeQuery(supabase.from('planner_tasks').select('*').eq('user_id', myId)),
      safeQuery(supabase.from('habits').select('*').eq('user_id', myId)),
      safeQuery(supabase.from('habit_completions').select('*').eq('user_id', myId).eq('completed_on', todayKey)),
      safeQuery(supabase.from('reminders').select('*').eq('user_id', myId)),
      safeQuery(supabase.from('list_items').select('*').eq('user_id', myId).eq('completed', false)),
      safeQuery(supabase.from('finance_transactions').select('*').eq('user_id', myId).order('transaction_date', { ascending: false }).limit(100)),
      safeQuery(supabase.from('bookmarks').select('*').eq('user_id', myId).order('created_at', { ascending: false }).limit(100)),
      safeQuery(supabase.from('plants').select('*').eq('user_id', myId)),
      safeQuery(supabase.from('wellbeing_entries').select('*').eq('user_id', myId).order('entry_date', { ascending: false }).limit(100)),
      safeQuery(supabase.from('game_scores').select('*').eq('player_id', myId).order('created_at', { ascending: false }).limit(100)),
    ]);

    const completedHabitIds = new Set(
      habitCompletionRows.map((row: any) => row?.habit_id).filter(Boolean),
    );

    const activeHabits = habitsRows.filter((habit: any) => {
      const startsTodayOrEarlier = !habit?.start_date || habit.start_date <= todayKey;
      const hasNotEnded = !habit?.end_date || habit.end_date >= todayKey;
      return startsTodayOrEarlier && hasNotEnded && !completedHabitIds.has(habit?.id);
    });

    return {
      today: todayKey,
      planner: { today: plannerRows.filter((t: any) => !t.completed && todayKey >= t.start_date && todayKey <= (t.end_date || t.start_date)), all: plannerRows },
      habits: { today_incomplete: activeHabits, completions_today: habitCompletionRows, all: habitsRows },
      reminders: { today: reminderRows.filter((r: any) => r?.due_date === todayKey && !r?.completed), all_incomplete: reminderRows.filter((r: any) => !r?.completed) },
      lists: { incomplete: listRows },
      finance: financeRows,
      bookmarks: bookmarkRows,
      plants: plantRows,
      wellbeing: { recent: wellbeingRows, today: wellbeingRows.filter((e: any) => e?.entry_date === todayKey) },
      games: { recent: gameRows },
    };
  };

  const handleSendSidekick = async (text: string) => {
    if (!text || sending || !myId) return;
    setSending(true);
    setMessagesError(null);

    const optimisticUserMessage: Message = {
      id: `local-user-${Date.now()}`,
      conversation_id: 'sidekick',
      sender_id: myId,
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages(previous => [...previous, optimisticUserMessage]);
    setDraft('');
    scrollToBottom();

    try {
      const { data: savedUserMessage } = await supabase
        .from('system_messages')
        .insert({
          user_id: myId,
          module_key: 'sidekick',
          sender: 'user',
          content: text,
        })
        .select('id, user_id, module_key, sender, content, created_at')
        .single();

      if (savedUserMessage) {
        setMessages(previous =>
          previous.map(m =>
            m.id === optimisticUserMessage.id
              ? {
                  id: savedUserMessage.id,
                  conversation_id: 'sidekick',
                  sender_id: myId,
                  content: savedUserMessage.content,
                  created_at: savedUserMessage.created_at,
                }
              : m,
          ),
        );
      }

      const sidekickAppData = await loadSidekickAppData();
      const { data } = await supabase.functions.invoke('sidekick-chat', {
        body: { message: text, appData: sidekickAppData },
      });

      const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
      if (!reply) {
        showToast('Sidekick did not return a reply.');
        return;
      }

      const localSidekickMessage: Message = {
        id: `sidekick-${Date.now()}`,
        conversation_id: 'sidekick',
        sender_id: 'sidekick',
        content: reply,
        created_at: new Date().toISOString(),
      };

      setMessages(previous => [...previous, localSidekickMessage]);
      scrollToBottom();

      await supabase.from('system_messages').insert({
        user_id: myId,
        module_key: 'sidekick',
        sender: 'sidekick',
        content: reply,
      });

      await markSidekickRead(myId, localSidekickMessage.created_at);
    } catch {
      showToast('Sidekick request failed.');
    } finally {
      setSending(false);
    }
  };

  const handleSendNormalChat = async (text: string) => {
    if (!text || sending || !myId || !id || isBlocked) return;
    setSending(true);

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const conversationResult = await ensureDirectConversationForSend(myId, id);
      if (conversationResult.error || !conversationResult.id) {
        showToast(conversationResult.error?.message || 'Could not start conversation.');
        setSending(false);
        return;
      }
      activeConversationId = conversationResult.id;
      setConversationId(activeConversationId);
      await markConversationRead(activeConversationId, myId);
    }

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      conversation_id: activeConversationId,
      sender_id: myId,
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages(previous => [...previous, optimistic]);
    setDraft('');
    scrollToBottom();

    const result = await sendChatMessage(activeConversationId, myId, text);
    if (result.error) {
      setMessages(previous => previous.filter(m => m.id !== optimistic.id));
      showToast('Failed to send message.');
    } else if (result.message) {
      setMessages(previous =>
        previous.map(m => (m.id === optimistic.id ? (result.message as Message) : m)),
      );
    }
    setSending(false);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (isSidekick) {
      await handleSendSidekick(text);
    } else {
      await handleSendNormalChat(text);
    }
  };

  const uploadAttachment = async (
    uri: string,
    type: AttachmentType,
    fileName: string,
    mimeType: string,
  ): Promise<string | null> => {
    if (!myId) return null;
    try {
      const response = await fetch(uri);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength) return null;

      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${myId}/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(path, arrayBuffer, {
          contentType: mimeType || 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) return null;
      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path);
      return data.publicUrl;
    } catch {
      return null;
    }
  };

  const sendAttachmentMessage = async (
    type: AttachmentType,
    url: string,
    fileName: string,
  ) => {
    if (!myId || !conversationId) return;

    const fallbackContent =
      type === 'image'
        ? '📷 Photo'
        : type === 'video'
          ? '🎬 Video'
          : type === 'audio'
            ? '🎤 Voice message'
            : type === 'game_invite'
              ? '🎮 Game Challenge'
              : `📄 ${fileName}`;

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

    setMessages(previous => [...previous, optimistic]);
    scrollToBottom();

    const result = await sendChatMessage(conversationId, myId, fallbackContent, {
      url,
      name: fileName,
      type:
        type === 'image'
          ? 'image/jpeg'
          : type === 'video'
            ? 'video/mp4'
            : type === 'audio'
              ? 'audio/m4a'
              : type === 'game_invite'
                ? 'application/json'
                : 'application/octet-stream',
    });

    if (result.error) {
      setMessages(previous => previous.filter(m => m.id !== optimistic.id));
      showToast('Failed to send attachment.');
    } else if (result.message) {
      setMessages(previous =>
        previous.map(m => (m.id === optimistic.id ? (result.message as Message) : m)),
      );
    }
  };

  const startRecording = async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      showToast('Microphone access is needed.');
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch {
      showToast('Could not start recording.');
    }
  };

  const cancelRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    try {
      await recordingRef.current?.stopAndUnloadAsync();
    } catch {}
    recordingRef.current = null;
  };

  const stopRecordingAndSend = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
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
      setPendingAttachment({
        uri,
        type: 'audio',
        name: fileName,
        mimeType: 'audio/m4a',
      });
      setReviewPosition(0);
      setReviewDuration(1);
      setAttachmentReviewOpen(true);
    } catch {
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: message.attachment_url },
        { shouldPlay: true, volume: 1.0, isMuted: false },
      );

      soundRef.current = sound;
      setPlayingMessageId(message.id);

      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded) {
          setPlaybackPosition(status.positionMillis);
          setPlaybackDuration(status.durationMillis || 1);
          if (status.didJustFinish) {
            setPlayingMessageId(null);
            setPlaybackPosition(0);
            void sound.unloadAsync();
            soundRef.current = null;
          }
        }
      });
    } catch {
      showToast('Could not play voice note.');
    }
  };

  const seekPlayback = async (positionMillis: number) => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.setPositionAsync(positionMillis);
      setPlaybackPosition(positionMillis);
    } catch {}
  };

  const seekReview = async (positionMillis: number) => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.setPositionAsync(positionMillis);
      setReviewPosition(positionMillis);
    } catch {}
  };

  const handlePickAttachment = async () => {
    if (uploadingAttachment || attachmentSending || !myId || !conversationId) return;

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

      setPendingAttachment({ uri: asset.uri, type, name: fileName, mimeType });
      setReviewPosition(0);
      setReviewDuration(1);
      setAttachmentReviewOpen(true);
    } catch {
      showToast('Could not select attachment.');
    }
  };

  const closeAttachmentReview = async () => {
    setAttachmentReviewOpen(false);
    setPendingAttachment(null);
    setReviewPlaying(false);
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
    } catch {}
    soundRef.current = null;
  };

  const toggleReviewAudio = async () => {
    if (!pendingAttachment || pendingAttachment.type !== 'audio') return;
    if (reviewPlaying) {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setReviewPlaying(false);
      return;
    }

    try {
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      const { sound } = await Audio.Sound.createAsync(
        { uri: pendingAttachment.uri },
        { shouldPlay: true, volume: 1.0, isMuted: false },
      );
      soundRef.current = sound;
      setReviewPlaying(true);

      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded) {
          setReviewPosition(status.positionMillis);
          setReviewDuration(status.durationMillis || 1);
          if (status.didJustFinish) {
            setReviewPlaying(false);
            setReviewPosition(0);
            void sound.unloadAsync();
            soundRef.current = null;
          }
        }
      });
    } catch {
      showToast('Could not play voice preview.');
    }
  };

  const sendPendingAttachment = async () => {
    if (!pendingAttachment || !myId || !conversationId || attachmentSending) return;
    setAttachmentSending(true);
    setUploadingAttachment(true);

    try {
      const url = await uploadAttachment(
        pendingAttachment.uri,
        pendingAttachment.type,
        pendingAttachment.name,
        pendingAttachment.mimeType,
      );

      if (!url) {
        showToast('Could not upload attachment.');
        return;
      }

      await sendAttachmentMessage(
        pendingAttachment.type,
        url,
        pendingAttachment.name,
      );

      try { await soundRef.current?.stopAsync(); } catch {}
      try { await soundRef.current?.unloadAsync(); } catch {}
      soundRef.current = null;
      setReviewPlaying(false);
      setAttachmentReviewOpen(false);
      setPendingAttachment(null);
    } catch {
      showToast('Failed to send attachment.');
    } finally {
      setUploadingAttachment(false);
      setAttachmentSending(false);
    }
  };

  const handleBlock = async () => {
    if (!myId || !id || isSidekick) return;
    setActionLoading('block');
    const { error } = await supabase
      .from('social_blocks')
      .insert({ blocker_id: myId, blocked_id: id });
    setActionLoading(null);

    if (error) {
      showToast('Could not block user.');
      return;
    }
    setIsBlocked(true);
    setDraft('');
    setPendingAttachment(null);
    setAttachmentReviewOpen(false);
    showToast(`Blocked ${profile?.display_name ?? 'user'}`);
  };

  const handleUnblock = async () => {
    if (!myId || !id || isSidekick) return;
    setActionLoading('unblock');
    const { error } = await supabase
      .from('social_blocks')
      .delete()
      .eq('blocker_id', myId)
      .eq('blocked_id', id);
    setActionLoading(null);

    if (error) {
      showToast('Could not unblock user.');
      return;
    }
    setIsBlocked(false);
    showToast('User unblocked.');
  };

  const handleDeleteChat = async () => {
    if (!myId || !id || isSidekick) return;
    let targetConversationId = conversationId;
    if (!targetConversationId) {
      const lookup = await findExistingDirectConversation(myId, id);
      targetConversationId = lookup.id ?? '';
    }

    if (!targetConversationId) {
      showToast('Chat is already deleted.');
      return;
    }

    setActionLoading('delete');
    const { error } = await deleteConversationForUser(
      targetConversationId,
      myId,
      id,
    );
    setActionLoading(null);

    if (error) {
      showToast('Could not delete chat.');
      return;
    }
    router.replace('/(tabs)' as never);
  };

  const handleClearChat = async () => {
    if (!myId) return;
    setActionLoading('clear');

    if (isSidekick) {
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
      await markSidekickRead(myId, new Date().toISOString());
      showToast('Sidekick chat cleared.');
      return;
    }

    const clearedAt = new Date().toISOString();
    const { error } = await clearChatForUser(myId, conversationId, clearedAt);
    setActionLoading(null);

    if (error) {
      showToast('Could not clear chat.');
      return;
    }
    await markConversationRead(conversationId, myId, clearedAt);
    setMessages([]);
    showToast('Chat cleared.');
  };

  const getGameInviteSessionId = (message: Message) => {
    const match = message.attachment_url?.match(/[?&]sessionId=([^&]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  };

  const handleGameInviteResponse = async (message: Message, accept: boolean) => {
    const sessionId = getGameInviteSessionId(message);
    if (!myId || !sessionId || gameInviteActionId) {
      showToast('This game invitation is missing its session details.');
      return;
    }
    setGameInviteActionId(message.id);
    const { data, error } = await (supabase as any).rpc('respond_to_game_challenge', {
      p_session_id: sessionId,
      p_accept: accept,
    });
    setGameInviteActionId(null);
    if (error || !data?.id) {
      showToast(error?.message ?? 'This challenge is no longer available.');
      const { data: session } = await supabase.from('game_sessions')
        .select('status').eq('id', sessionId).maybeSingle();
      if (session?.status) setGameInviteStates(previous => ({ ...previous, [message.id]: session.status }));
      return;
    }
    setGameInviteStates(previous => ({ ...previous, [message.id]: accept ? 'active' : 'declined' }));
    if (accept) {
      const difficulty = message.attachment_url?.match(/[?&]difficulty=([^&]+)/i)?.[1] ?? 'easy';
      router.push({
        pathname: `/modules/games/${message.attachment_name || 'tictactoe'}`,
        params: { sessionId, opponent: 'friend', difficulty: decodeURIComponent(difficulty) },
      });
    } else {
      showToast('Challenge declined.');
    }
  };

  const handleCopyMessage = async () => {
    if (!messageAction) return;
    try {
      await Clipboard.setStringAsync(messageAction.content ?? '');
      setMessageAction(null);
      showToast('Message copied.');
    } catch {
      showToast('Could not copy message.');
    }
  };

  const handleDeleteMessageForMe = async () => {
    if (!messageAction || !myId) return;
    setMessageActionLoading(true);
    const { error } = await deleteMessageForUser(messageAction.id, myId);
    setMessageActionLoading(false);

    if (error) {
      showToast('Could not delete message.');
      return;
    }
    setMessages(previous => previous.filter(m => m.id !== messageAction.id));
    setMessageAction(null);
    showToast('Message deleted for you.');
  };

  const renderMessage = ({
    item,
    index,
  }: {
    item: Message;
    index: number;
  }) => {
    const isMine = item.sender_id === myId;
    const isSidekickReply = isSidekick && item.sender_id === 'sidekick';
    const time = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const previousMessage = index > 0 ? messages[index - 1] : null;
    const showDateSeparator =
      !previousMessage ||
      getLocalDateKey(previousMessage.created_at) !==
        getLocalDateKey(item.created_at);

    const outgoing = isMine && !isSidekickReply;
    const contentColor = outgoing ? '#000000' : isDark ? '#FFFFFF' : '#000000';
    const isThisPlaying = playingMessageId === item.id;

    return (
      <>
        {showDateSeparator ? (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>
              {formatMessageDateLabel(item.created_at)}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.msgRow,
            isMine ? styles.msgRowMine : styles.msgRowTheirs,
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.messagePressable,
              pressed && styles.messagePressed,
            ]}
            onLongPress={() => setMessageAction(item)}
            delayLongPress={350}
          >
            <View style={styles.cardShadowBackdrop} />
            <View
              style={[
                styles.bubble,
                {
                  backgroundColor: isSidekickReply
                    ? isDark
                      ? '#121212'
                      : '#FFFFFF'
                    : outgoing
                      ? pageBg
                      : isDark
                        ? '#121212'
                        : '#FFFFFF',
                  borderColor: '#000000',
                },
              ]}
            >
              {isSidekickReply ? (
                <Text
                  style={[
                    styles.sidekickLabel,
                    { color: isDark ? pageBg : '#000000' },
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

              {item.attachment_type === 'video' && item.attachment_url ? (
                <Pressable
                  onPress={() => Linking.openURL(item.attachment_url!)}
                  style={[
                    styles.docBubble,
                    { borderColor: '#000000' },
                  ]}
                >
                  <Text style={[styles.docBubbleText, { color: contentColor }]}>
                    🎬 Video
                  </Text>
                </Pressable>
              ) : null}

              {item.attachment_type === 'audio' && item.attachment_url ? (
                <View
                  style={[
                    styles.audioBubbleContainer,
                    { borderColor: '#000000' },
                  ]}
                >
                  <View style={styles.audioBubbleTop}>
                    <Pressable
                      onPress={() => togglePlayback(item)}
                      style={[styles.audioPlayButton, { backgroundColor: contentColor }]}
                    >
                      {isThisPlaying ? (
                        <Pause color={outgoing ? pageBg : isDark ? '#000000' : '#FFFFFF'} size={14} />
                      ) : (
                        <Play color={outgoing ? pageBg : isDark ? '#000000' : '#FFFFFF'} size={14} />
                      )}
                    </Pressable>
                    <Text style={[styles.audioBubbleText, { color: contentColor }]}>
                      {isThisPlaying
                        ? `${Math.floor((playbackPosition / 1000) / 60)}:${String(
                            Math.floor((playbackPosition / 1000) % 60),
                          ).padStart(2, '0')} / ${Math.floor(
                            (playbackDuration / 1000) / 60,
                          )}:${String(Math.floor((playbackDuration / 1000) % 60)).padStart(2, '0')}`
                        : 'Voice message'}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.audioSliderTrack}
                    onPress={(e) => {
                      const nativeX = e.nativeEvent.locationX;
                      const trackWidth = 200; // estimated bubble inner width
                      const ratio = Math.max(0, Math.min(1, nativeX / trackWidth));
                      void seekPlayback(ratio * playbackDuration);
                    }}
                  >
                    <View
                      style={[
                        styles.audioSliderFill,
                        {
                          width: `${
                            isThisPlaying
                              ? Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    (playbackPosition / playbackDuration) * 100,
                                  ),
                                )
                              : 0
                          }%`,
                          backgroundColor: contentColor,
                        },
                      ]}
                    />
                  </Pressable>
                </View>
              ) : null}

              {item.attachment_type === 'document' && item.attachment_url ? (
                <Pressable
                  onPress={() => Linking.openURL(item.attachment_url!)}
                  style={[
                    styles.docBubble,
                    { borderColor: '#000000' },
                  ]}
                >
                  <FileText color={contentColor} size={18} />
                  <Text
                    numberOfLines={1}
                    style={[styles.docBubbleText, { color: contentColor }]}
                  >
                    {item.attachment_name ?? 'Document'}
                  </Text>
                </Pressable>
              ) : null}

              {item.attachment_type === 'game_invite' ? (
                <View style={styles.gameInviteCard}>
                  <Text style={[styles.bubbleText, { color: contentColor, fontFamily: 'Poppins-Bold' }]}>
                    🎮 {(item.attachment_name ?? 'GAME').replace(/[_-]/g, ' ').toUpperCase()} CHALLENGE
                  </Text>
                  <Text style={[styles.bubbleText, { color: contentColor, fontSize: 13, marginVertical: 4 }]}>
                    {item.content}
                  </Text>
                  {(() => {
                    const status = gameInviteStates[item.id] ?? 'pending';
                    const busy = gameInviteActionId === item.id;
                    if (['declined', 'cancelled', 'expired', 'completed'].includes(status)) {
                      return <Text style={[styles.bubbleText, { color: contentColor, fontFamily: 'Poppins-Bold' }]}>Challenge {status}.</Text>;
                    }
                    if (status === 'active' || status === 'accepted') {
                      return (
                        <Pressable onPress={() => {
                          const sessionId = getGameInviteSessionId(item);
                          if (!sessionId) return;
                          const difficulty = item.attachment_url?.match(/[?&]difficulty=([^&]+)/i)?.[1] ?? 'easy';
                          router.push({ pathname: `/modules/games/${item.attachment_name || 'tictactoe'}`, params: { sessionId, opponent: 'friend', difficulty: decodeURIComponent(difficulty) } });
                        }} style={styles.joinGameBtn}>
                          <Text style={styles.joinGameBtnText}>Open Match</Text>
                        </Pressable>
                      );
                    }
                    if (status !== 'pending') {
                      return <Text style={[styles.bubbleText, { color: contentColor, fontSize: 12 }]}>Challenge status: {status}.</Text>;
                    }
                    if (isMine) return <Text style={[styles.bubbleText, { color: contentColor, fontSize: 12 }]}>Waiting for their response…</Text>;
                    return (
                      <View style={styles.gameInviteActions}>
                        <Pressable disabled={busy} onPress={() => void handleGameInviteResponse(item, true)} style={[styles.joinGameBtn, busy && { opacity: 0.55 }]}>
                          <Text style={styles.joinGameBtnText}>{busy ? 'Please wait…' : 'Accept'}</Text>
                        </Pressable>
                        <Pressable disabled={busy} onPress={() => void handleGameInviteResponse(item, false)} style={[styles.declineGameBtn, busy && { opacity: 0.55 }]}>
                          <Text style={styles.declineGameBtnText}>Decline</Text>
                        </Pressable>
                      </View>
                    );
                  })()}
                </View>
              ) : null}

              {!item.attachment_type ? (
                <Text style={[styles.bubbleText, { color: contentColor }]}>
                  {isSidekickReply
                    ? renderSidekickFormattedText(item.content, contentColor)
                    : item.content}
                </Text>
              ) : null}

              <Text
                style={[
                  styles.bubbleTime,
                  { color: isDark ? '#A1A1AA' : '#52525B' },
                ]}
              >
                {time}
              </Text>
            </View>
          </Pressable>
        </View>
      </>
    );
  };

  const headerName = isSidekick
    ? 'SIDEKICK'
    : (
        profile?.display_name ??
        SYSTEM_CHAT_TITLES[normalizedId] ??
        'Chat'
      ).toUpperCase();

  const showProfileButton = !isSidekick && !SYSTEM_CHAT_TITLES[normalizedId];

  const isSidekickStarterMessage =
    isSidekick &&
    messages.length === 1 &&
    messages[0].sender_id === 'sidekick' &&
    messages[0].content === 'Welcome to Sidekick. Where would you like to start?';

  const sidekickChoicesFooter = isSidekickStarterMessage ? (
    <View style={styles.sidekickChoicesFooter}>
      <Text style={[styles.sidekickChoicesPrompt, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
        Choose a place to start.
      </Text>
      <View style={styles.sidekickModuleChoices}>
        {SIDEKICK_MODULE_CHOICES.map(module => (
          <Pressable
            key={module.label}
            onPress={() => handleSidekickModulePress(module.route)}
            style={({ pressed }) => [
              styles.sidekickModuleChoice,
              {
                backgroundColor: isDark ? '#121212' : '#FFFFFF',
                borderColor: '#000000',
              },
              pressed && styles.pressedBtn,
            ]}
          >
            <Text
              style={[
                styles.sidekickModuleChoiceText,
                { color: isDark ? '#FFFFFF' : '#000000' },
              ]}
            >
              {module.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  ) : null;

  const closeMenu = () => setMenuOpen(false);

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor: pageBg,
        },
      ]}
    >
      <StatusBar
        barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
        backgroundColor={pageBg}
      />

      {/* HEADER */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/(tabs)' as never)}
          style={({ pressed }) => [
            styles.headerBack,
            pressed && styles.pressedBtn,
          ]}
          hitSlop={12}
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.8}
          />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          {profileLoading ? (
            <ActivityIndicator color="#000000" size="small" />
          ) : (
            <Pressable
              disabled={!showProfileButton}
              onPress={() =>
                router.push({
                  pathname: '/chat/profile/[id]',
                  params: { id },
                } as never)
              }
            >
              <Text style={styles.headerTitle} numberOfLines={1}>
                {headerName}
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && styles.pressedBtn,
          ]}
          hitSlop={12}
        >
          <MoreVertical
            color="#000000"
            size={22}
            strokeWidth={2.5}
          />
        </Pressable>
      </View>

      {/* MENU MODAL */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuShade} onPress={() => setMenuOpen(false)}>
          <Pressable
            style={[
              styles.menuCard,
              {
                backgroundColor: isDark ? '#121212' : '#FFFFFF',
                borderColor: '#000000',
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            {!isSidekick ? (
              <>
                <Pressable
                  onPress={() => {
                    closeMenu();
                    isBlocked ? handleUnblock() : handleBlock();
                  }}
                  style={styles.menuItem}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      { color: isDark ? '#FFFFFF' : '#000000' },
                    ]}
                  >
                    {isBlocked ? 'Unblock user' : 'Block user'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    closeMenu();
                    setTagModalOpen(true);
                    void loadChatTags();
                  }}
                  style={styles.menuItem}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      { color: isDark ? '#FFFFFF' : '#000000' },
                    ]}
                  >
                    Add Tag
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    closeMenu();
                    setDeleteConfirmOpen(true);
                  }}
                  style={styles.menuItem}
                >
                  <Text style={[styles.menuItemText, { color: '#EF4444' }]}>
                    Delete Chat
                  </Text>
                </Pressable>
              </>
            ) : null}

            <Pressable
              onPress={() => {
                closeMenu();
                void handleClearChat();
              }}
              style={styles.menuItem}
            >
              <Text
                style={[
                  styles.menuItemText,
                  { color: isDark ? '#FFFFFF' : '#000000' },
                ]}
              >
                Clear Chat
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* MESSAGES LIST */}
      <KeyboardAvoidingView
        style={styles.keyboardScreen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.body}>
          {messagesLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color="#000000" size="large" />
              <Text style={styles.stateText}>Loading messages…</Text>
            </View>
          ) : messagesError ? (
            <View style={styles.centerState}>
              <Text style={styles.stateText}>{messagesError}</Text>
              <Pressable
                onPress={loadMessages}
                style={[styles.retryBtn, { backgroundColor: '#000000', borderColor: pageBg }]}
              >
                <Text style={[styles.retryBtnText, { color: pageBg }]}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={renderMessage}
              ListFooterComponent={sidekickChoicesFooter}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() =>
                listRef.current?.scrollToEnd({ animated: false })
              }
            />
          )}
        </View>

        {/* COMPOSER */}
        {isBlocked || isBlockedByOther ? (
          <View
            style={[
              styles.blockedBar,
              {
                backgroundColor: isDark ? '#121212' : '#FFFFFF',
                borderTopColor: '#000000',
              },
            ]}
          >
            <Text style={[styles.blockedBarText, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
              {isBlocked ? 'You blocked this user.' : 'Cannot send messages.'}
            </Text>
            {isBlocked ? (
              <Pressable onPress={handleUnblock} hitSlop={8}>
                <Text style={styles.blockedBarLink}>Tap here to unblock</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View
            style={[
              styles.composer,
              {
                backgroundColor: pageBg,
                borderTopColor: '#000000',
              },
            ]}
          >
            {!isSidekick && !isRecording ? (
              <Pressable
                onPress={handlePickAttachment}
                disabled={uploadingAttachment || sending}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.attachBtn,
                  {
                    backgroundColor: isDark ? '#121212' : '#FFFFFF',
                    borderColor: '#000000',
                  },
                  pressed && styles.pressedBtn,
                ]}
              >
                {uploadingAttachment ? (
                  <ActivityIndicator color={isDark ? '#FFFFFF' : '#000000'} size="small" />
                ) : (
                  <Paperclip color={isDark ? '#FFFFFF' : '#000000'} size={20} />
                )}
              </Pressable>
            ) : null}

            {isRecording ? (
              <View
                style={[
                  styles.recordingRow,
                  {
                    borderColor: '#000000',
                    backgroundColor: isDark ? '#121212' : '#FFFFFF',
                  },
                ]}
              >
                <View style={styles.recordingDot} />
                <Text style={[styles.recordingText, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                  Recording… {Math.floor(recordingSeconds / 60)}:
                  {String(recordingSeconds % 60).padStart(2, '0')}
                </Text>
                <Pressable
                  onPress={cancelRecording}
                  hitSlop={8}
                  style={styles.recordingCancelBtn}
                >
                  <X color={isDark ? '#FFFFFF' : '#000000'} size={18} />
                </Pressable>
              </View>
            ) : (
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={isSidekick ? 'Message Sidekick…' : 'Type a message…'}
                placeholderTextColor={isDark ? '#71717A' : '#A1A1AA'}
                style={[
                  styles.input,
                  {
                    color: isDark ? '#FFFFFF' : '#000000',
                    backgroundColor: isDark ? '#121212' : '#FFFFFF',
                    borderColor: '#000000',
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
                disabled={uploadingAttachment}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: '#000000',
                    borderColor: pageBg,
                  },
                  pressed && styles.pressedBtn,
                ]}
              >
                {uploadingAttachment ? (
                  <ActivityIndicator color={pageBg} size="small" />
                ) : (
                  <Square color={pageBg} size={16} />
                )}
              </Pressable>
            ) : !isSidekick && !draft.trim() ? (
              <Pressable
                onPress={startRecording}
                disabled={uploadingAttachment}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: '#000000',
                    borderColor: pageBg,
                    shadowColor: '#000000',
                    shadowOffset: { width: 3, height: 3 },
                    shadowOpacity: 1,
                    shadowRadius: 0,
                    elevation: 4,
                  },
                  uploadingAttachment && styles.sendBtnDisabled,
                  pressed && styles.pressedBtn,
                ]}
              >
                <Mic color={pageBg} size={18} />
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSend}
                disabled={!draft.trim() || sending}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: '#000000',
                    borderColor: pageBg,
                  },
                  (!draft.trim() || sending) && styles.sendBtnDisabled,
                  pressed && !sending && draft.trim() && styles.pressedBtn,
                ]}
              >
                {sending ? (
                  <ActivityIndicator color={pageBg} size="small" />
                ) : (
                  <Send color={pageBg} size={18} />
                )}
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* TOAST NOTIFICATION */}
      {toast ? (
        <View style={styles.toastWrap}>
          <View
            style={[
              styles.toast,
              {
                backgroundColor: isDark ? '#121212' : '#FFFFFF',
                borderColor: '#000000',
              },
            ]}
          >
            <Text style={[styles.toastText, { color: isDark ? '#FFFFFF' : '#000000' }]}>
              {toast}
            </Text>
          </View>
        </View>
      ) : null}

      {/* DELETE CHAT CONFIRMATION MODAL */}
      <Modal
        visible={deleteConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmOpen(false)}
      >
        <Pressable
          style={styles.centeredModalBackdrop}
          onPress={() => setDeleteConfirmOpen(false)}
        >
          <Pressable
            style={[
              styles.centeredModalCard,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.confirmTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
              Delete chat?
            </Text>
            <Text style={[styles.confirmText, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
              This removes the conversation from your chat list.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setDeleteConfirmOpen(false)}
                style={({ pressed }) => [
                  styles.confirmButton,
                  {
                    backgroundColor: isDark ? '#27272A' : '#F4F4F5',
                    borderWidth: 2,
                    borderColor: '#000000',
                  },
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text style={[styles.confirmCancelText, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDeleteConfirmOpen(false);
                  void handleDeleteChat();
                }}
                style={({ pressed }) => [
                  styles.confirmButton,
                  {
                    backgroundColor: '#000000',
                    borderWidth: 2,
                    borderColor: '#EF4444',
                  },
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text style={[styles.confirmDeleteText, { color: '#EF4444' }]}>
                  Delete
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* MESSAGE ACTIONS MODAL */}
      <Modal
        visible={!!messageAction}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageAction(null)}
      >
        <Pressable
          style={styles.centeredModalBackdrop}
          onPress={() => setMessageAction(null)}
        >
          <Pressable
            style={[
              styles.centeredModalCard,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.confirmTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
              Message actions
            </Text>
            {messageAction?.content ? (
              <Text
                style={[
                  styles.confirmText,
                  { color: isDark ? '#A1A1AA' : '#52525B', marginBottom: 16 },
                ]}
                numberOfLines={3}
              >
                {messageAction.content}
              </Text>
            ) : null}

            <View style={{ gap: 10 }}>
              <Pressable
                onPress={handleCopyMessage}
                disabled={messageActionLoading}
                style={({ pressed }) => [
                  styles.confirmButton,
                  {
                    backgroundColor: pageBg,
                    borderWidth: 2,
                    borderColor: '#000000',
                  },
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text style={[styles.confirmCancelText, { color: '#000000' }]}>
                  Copy text
                </Text>
              </Pressable>

              {!isSidekick ? (
                <Pressable
                  onPress={handleDeleteMessageForMe}
                  disabled={messageActionLoading}
                  style={({ pressed }) => [
                    styles.confirmButton,
                    {
                      backgroundColor: '#000000',
                      borderWidth: 2,
                      borderColor: '#EF4444',
                    },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={[styles.confirmDeleteText, { color: '#EF4444' }]}>
                    {messageActionLoading ? 'Deleting…' : 'Delete for me'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* CHAT TAG MODAL */}
      <Modal
        visible={tagModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTagModalOpen(false)}
      >
        <Pressable
          style={styles.centeredModalBackdrop}
          onPress={() => setTagModalOpen(false)}
        >
          <Pressable
            style={[
              styles.centeredModalCard,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: pageBg }]}>Add Tag</Text>
              <Pressable onPress={() => setTagModalOpen(false)} hitSlop={12}>
                <X color={isDark ? '#FFFFFF' : '#000000'} size={21} strokeWidth={2.5} />
              </Pressable>
            </View>

            {chatTags.length === 0 ? (
              <Text style={[styles.confirmText, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
                You haven't created any tags yet.
              </Text>
            ) : (
              <View style={{ gap: 8, marginTop: 8 }}>
                {chatTags.map(tag => {
                  const selected = assignedTagIds.includes(tag.id);
                  return (
                    <Pressable
                      key={tag.id}
                      onPress={() => toggleChatTag(tag.id)}
                      style={[
                        styles.menuItem,
                        {
                          borderWidth: 2,
                          borderColor: '#000000',
                          borderRadius: 10,
                          backgroundColor: selected ? pageBg : isDark ? '#27272A' : '#F4F4F5',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.menuItemText,
                          { color: selected ? '#000000' : isDark ? '#FFFFFF' : '#000000' },
                        ]}
                      >
                        {selected ? '✓ ' : ''}
                        {tag.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ATTACHMENT REVIEW MODAL */}
      <Modal
        visible={attachmentReviewOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAttachmentReview}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={closeAttachmentReview}>
          <Pressable
            style={[
              styles.centeredModalCard,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: pageBg }]}>Review attachment</Text>
              <Pressable onPress={closeAttachmentReview} disabled={attachmentSending} hitSlop={12}>
                <X color={isDark ? '#FFFFFF' : '#000000'} size={21} strokeWidth={2.5} />
              </Pressable>
            </View>

            {pendingAttachment?.type === 'image' ? (
              <Image
                source={{ uri: pendingAttachment.uri }}
                style={styles.attachmentReviewImage}
                resizeMode="contain"
              />
            ) : pendingAttachment?.type === 'audio' ? (
              <View
                style={[
                  styles.attachmentReviewAudioContainer,
                  { borderColor: '#000000', backgroundColor: isDark ? '#27272A' : '#F4F4F5' },
                ]}
              >
                <View style={styles.attachmentReviewAudioTop}>
                  <Pressable
                    onPress={toggleReviewAudio}
                    style={[styles.reviewPlayButton, { backgroundColor: pageBg }]}
                  >
                    {reviewPlaying ? (
                      <Pause color="#000000" size={18} />
                    ) : (
                      <Play color="#000000" size={18} />
                    )}
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.reviewFileName, { color: isDark ? '#FFFFFF' : '#000000' }]}
                      numberOfLines={1}
                    >
                      {pendingAttachment.name}
                    </Text>
                    <Text style={[styles.confirmText, { color: isDark ? '#A1A1AA' : '#52525B', marginBottom: 0 }]}>
                      {reviewPlaying
                        ? `${Math.floor((reviewPosition / 1000) / 60)}:${String(
                            Math.floor((reviewPosition / 1000) % 60),
                          ).padStart(2, '0')} / ${Math.floor(
                            (reviewDuration / 1000) / 60,
                          )}:${String(Math.floor((reviewDuration / 1000) % 60)).padStart(2, '0')}`
                        : 'Voice note ready to send'}
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={styles.audioSliderTrack}
                  onPress={(e) => {
                    const nativeX = e.nativeEvent.locationX;
                    const trackWidth = 260;
                    const ratio = Math.max(0, Math.min(1, nativeX / trackWidth));
                    void seekReview(ratio * reviewDuration);
                  }}
                >
                  <View
                    style={[
                      styles.audioSliderFill,
                      {
                        width: `${Math.min(
                          100,
                          Math.max(0, (reviewPosition / reviewDuration) * 100),
                        )}%`,
                        backgroundColor: pageBg,
                      },
                    ]}
                  />
                </Pressable>
              </View>
            ) : (
              <View
                style={[
                  styles.attachmentReviewFile,
                  { borderColor: '#000000', backgroundColor: isDark ? '#27272A' : '#F4F4F5' },
                ]}
              >
                <FileText color={pageBg} size={30} />
                <Text
                  style={[styles.reviewFileName, { color: isDark ? '#FFFFFF' : '#000000' }]}
                  numberOfLines={3}
                >
                  {pendingAttachment?.name || 'Attachment'}
                </Text>
                <Text style={[styles.confirmText, { color: isDark ? '#A1A1AA' : '#52525B', marginBottom: 0 }]}>
                  Ready to send
                </Text>
              </View>
            )}

            <View style={styles.confirmActions}>
              <Pressable
                onPress={closeAttachmentReview}
                disabled={attachmentSending}
                style={({ pressed }) => [
                  styles.confirmButton,
                  {
                    backgroundColor: isDark ? '#27272A' : '#F4F4F5',
                    borderWidth: 2,
                    borderColor: '#000000',
                  },
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text style={[styles.confirmCancelText, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={sendPendingAttachment}
                disabled={!pendingAttachment || attachmentSending}
                style={({ pressed }) => [
                  styles.confirmButton,
                  {
                    backgroundColor: '#000000',
                    borderWidth: 2,
                    borderColor: pageBg,
                  },
                  attachmentSending && { opacity: 0.55 },
                  pressed && !attachmentSending && styles.pressedBtn,
                ]}
              >
                {attachmentSending ? (
                  <ActivityIndicator color={pageBg} size="small" />
                ) : (
                  <Text style={[styles.confirmDeleteText, { color: pageBg }]}>
                    Send
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  pressedBtn: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    zIndex: 100,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
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
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 18,
    letterSpacing: 1,
    color: '#000000',
  },
  menuShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingRight: 20,
  },
  menuCard: {
    borderRadius: 12,
    borderWidth: 3,
    paddingVertical: 6,
    minWidth: 170,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
  },
  keyboardScreen: {
    flex: 1,
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
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    height: 40,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  retryBtnText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  dateSeparator: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  dateSeparatorText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: '#000000',
  },
  msgRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  msgRowMine: {
    justifyContent: 'flex-end',
  },
  msgRowTheirs: {
    justifyContent: 'flex-start',
  },
  messagePressable: {
    maxWidth: '82%',
    position: 'relative',
  },
  messagePressed: {
    opacity: 0.82,
  },
  cardShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: '#000000',
    borderRadius: 14,
  },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
  },
  bubbleText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 15,
    lineHeight: 21,
  },
  sidekickLabel: {
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  attachmentImage: {
    width: 220,
    height: 220,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 2,
    borderColor: '#000000',
  },
  audioBubbleContainer: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
    minWidth: 180,
    gap: 8,
  },
  audioBubbleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  audioPlayButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioBubbleText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
  },
  audioSliderTrack: {
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  audioSliderFill: {
    height: '100%',
    borderRadius: 3,
  },
  docBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
    maxWidth: 220,
  },
  docBubbleText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    flexShrink: 1,
  },
  gameInviteCard: {
    padding: 4,
    gap: 4,
  },
  gameInviteActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  declineGameBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  declineGameBtnText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: '#000000',
  },
  joinGameBtn: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  joinGameBtnText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  bubbleTime: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  sidekickChoicesFooter: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
  },
  sidekickChoicesPrompt: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    marginBottom: 10,
  },
  sidekickModuleChoices: {
    width: '100%',
    maxWidth: 420,
    gap: 8,
  },
  sidekickModuleChoice: {
    minHeight: 44,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  sidekickModuleChoiceText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    textAlign: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  attachBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  recordingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 12,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  recordingText: {
    flex: 1,
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
  },
  recordingCancelBtn: {
    padding: 4,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Poppins-Regular',
    fontSize: 15,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  blockedBar: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  blockedBarText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    textAlign: 'center',
  },
  blockedBarLink: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
  },
  toastWrap: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 999,
  },
  toast: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  toastText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    textAlign: 'center',
  },
  centeredModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  centeredModalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#000000',
    paddingTop: 22,
    paddingBottom: 26,
    paddingHorizontal: 22,
    maxHeight: '85%',
    shadowColor: '#000000',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
  },
  modalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 20,
    flex: 1,
    marginRight: 12,
  },
  confirmTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 19,
    marginBottom: 8,
  },
  confirmText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 22,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 14,
  },
  confirmDeleteText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 14,
  },
  attachmentReviewImage: {
    width: '100%',
    height: 260,
    borderRadius: 12,
    marginVertical: 12,
    borderWidth: 2,
    borderColor: '#000000',
    backgroundColor: '#000000',
  },
  attachmentReviewAudioContainer: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    marginVertical: 14,
    gap: 10,
  },
  attachmentReviewAudioTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  attachmentReviewFile: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
    borderWidth: 2,
    borderRadius: 12,
    padding: 18,
    marginVertical: 14,
    gap: 8,
  },
  reviewPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewFileName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
  },
});
