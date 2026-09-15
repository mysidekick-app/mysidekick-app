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

import {
  ensureDirectConversation,
  clearChatForUser,
  deleteConversationForUser,
  getChatClearedAt,
  loadChatMessages,
  markConversationRead,
  sendChatMessage,
} from './chatHelpers';

/*
 * Poppins
 *
 * These names match the font aliases registered in app/_layout.tsx.
 */
const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_EXTRA_BOLD = 'Poppins-ExtraBold';

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
  | 'document';

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
        style={isBold ? { fontFamily: FONT_BOLD, color } : { color }}
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

/**
 * Find a direct conversation that the current user already belongs to.
 * This is intentionally lookup-only: opening a deleted contact must not
 * recreate the chat and put it back in the chat list.
 */
async function findExistingDirectConversation(
  myUserId: string,
  otherUserId: string,
): Promise<DirectConversationResult> {
  const { data: myMemberships, error: myMembershipError } =
    await supabase
      .from('chat_conversation_members')
      .select('conversation_id')
      .eq('user_id', myUserId);

  if (myMembershipError) {
    return {
      id: null,
      error: myMembershipError,
    };
  }

  const candidateIds = [
    ...new Set(
      (myMemberships ?? [])
        .map((row: any) => row.conversation_id)
        .filter(Boolean),
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

  const directIds = (directConversations ?? []).map(
    (row: any) => row.id,
  );

  if (directIds.length === 0) {
    return { id: null, error: null };
  }

  const { data: otherMemberships, error: otherMembershipError } =
    await supabase
      .from('chat_conversation_members')
      .select('conversation_id')
      .in('conversation_id', directIds)
      .eq('user_id', otherUserId);

  if (otherMembershipError) {
    return {
      id: null,
      error: otherMembershipError,
    };
  }

  const existing = (otherMemberships ?? []).find((row: any) =>
    directIds.includes(row.conversation_id),
  );

  return {
    id: existing?.conversation_id ?? null,
    error: null,
  };
}

/**
 * Find an existing direct chat first. When the user is intentionally
 * sending a message to someone who was previously deleted from the chat
 * list, create a fresh direct conversation only at send time.
 *
 * The normal RPC remains the first choice. The client-side fallback exists
 * so this screen also works when the RPC is unavailable in the current
 * Supabase schema.
 */
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

  return {
    id: conversation.id,
    error: null,
  };
}

export default function ChatDetailScreen() {
  const { id, from } =
    useLocalSearchParams<{
      id: string;
      from?: string;
    }>();

  const navigation = useNavigation();

  /*
   * SYSTEM BACK / SWIPE
   *
   * When the user swipes back on iOS, uses the Android back
   * gesture/button, or triggers the native GO_BACK/POP action,
   * always return to the Chat list.
   *
   * The existing in-app back arrow is left unchanged.
   */
  useEffect(() => {
    const unsubscribe = navigation.addListener(
      'beforeRemove',
      (event) => {
        const action = event.data.action;

        if (
          action.type !== 'GO_BACK' &&
          action.type !== 'POP'
        ) {
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
    onAccent,
  } = appContext;

  const isBlackDark =
    isDark &&
    appContext.accent_family === 'black';

  const normalizedId =
    (id ?? '').toLowerCase();

  const isSidekick =
    normalizedId === 'sidekick';

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

  const [profile, setProfile] =
    useState<Profile>(null);

  const [profileLoading, setProfileLoading] =
    useState(!isSidekick);

  const [profileError, setProfileError] =
    useState<string | null>(null);

  const [myId, setMyId] =
    useState<string | null>(null);

  const [isBlocked, setIsBlocked] =
    useState(false);

  const [isBlockedByOther, setIsBlockedByOther] =
    useState(false);

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [messagesLoading, setMessagesLoading] =
    useState(!isSidekick);

  const [messagesError, setMessagesError] =
    useState<string | null>(null);

  const [draft, setDraft] =
    useState('');

  const [sending, setSending] =
    useState(false);

  const [uploadingAttachment, setUploadingAttachment] =
    useState(false);

  const [pendingAttachment, setPendingAttachment] =
    useState<{
      uri: string;
      type: AttachmentType;
      name: string;
      mimeType: string;
    } | null>(null);

  const [attachmentReviewOpen, setAttachmentReviewOpen] =
    useState(false);

  const [attachmentSending, setAttachmentSending] =
    useState(false);

  const [reviewPlaying, setReviewPlaying] =
    useState(false);

  const [isRecording, setIsRecording] =
    useState(false);

  const [recordingSeconds, setRecordingSeconds] =
    useState(0);

  const [playingMessageId, setPlayingMessageId] =
    useState<string | null>(null);

  const recordingRef =
    useRef<Audio.Recording | null>(null);

  const recordingTimerRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null,
    );

  const soundRef =
    useRef<Audio.Sound | null>(null);

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [reportOpen, setReportOpen] =
    useState(false);

  const [reportReason, setReportReason] =
    useState('');

  const [reportSubmitting, setReportSubmitting] =
    useState(false);

  const [reportSuccess, setReportSuccess] =
    useState(false);

  const [groupName, setGroupName] =
    useState('');

  const [groupSubmitting, setGroupSubmitting] =
    useState(false);

  const [groupSuccess, setGroupSuccess] =
    useState<string | null>(null);

  const [pollOpen, setPollOpen] =
    useState(false);

  const [eventOpen, setEventOpen] =
    useState(false);

  const [tagModalOpen, setTagModalOpen] =
    useState(false);

  const [chatTags, setChatTags] =
    useState<
      {
        id: string;
        name: string;
      }[]
    >([]);

  const [assignedTagIds, setAssignedTagIds] =
    useState<string[]>([]);

  const [pollQuestion, setPollQuestion] =
    useState('');

  const [pollOptions, setPollOptions] =
    useState<string[]>(['', '']);

  const [eventTitle, setEventTitle] =
    useState('');

  const [eventDate, setEventDate] =
    useState('');

  const [eventTime, setEventTime] =
    useState('');

  const [eventDesc, setEventDesc] =
    useState('');

  const [toast, setToast] =
    useState<string | null>(null);

  const [actionLoading, setActionLoading] =
    useState<string | null>(null);

  const listRef =
    useRef<FlatList<Message>>(null);

  const [conversationId, setConversationId] =
    useState('');

  const showToast = useCallback(
    (message: string) => {
      setToast(message);

      setTimeout(() => {
        setToast(null);
      }, 2500);
    },
    [],
  );

  const scrollToBottom =
    useCallback((animated = true) => {
      setTimeout(() => {
        listRef.current?.scrollToEnd({
          animated,
        });
      }, 60);
    }, []);

  /*
   * TAGS
   */
  const loadChatTags = useCallback(
    async () => {
      if (!myId) return;

      const [
        { data: tags },
        { data: assignments },
      ] = await Promise.all([
        supabase
          .from('social_chat_tags')
          .select('id, name')
          .eq('user_id', myId)
          .order('created_at', {
            ascending: true,
          }),

        supabase
          .from('social_chat_tag_assignments')
          .select('tag_id')
          .eq('user_id', myId)
          .eq('chat_id', id ?? ''),
      ]);

      setChatTags(
        (tags ?? []) as {
          id: string;
          name: string;
        }[],
      );

      setAssignedTagIds(
        (assignments ?? []).map(
          (row: any) => row.tag_id,
        ),
      );
    },
    [myId, id],
  );

  const toggleChatTag =
    async (tagId: string) => {
      if (!myId || !id) return;

      const assigned =
        assignedTagIds.includes(tagId);

      if (assigned) {
        const { error } =
          await supabase
            .from(
              'social_chat_tag_assignments',
            )
            .delete()
            .eq('user_id', myId)
            .eq('chat_id', id)
            .eq('tag_id', tagId);

        if (error) {
          showToast(
            error.message ||
              'Could not remove tag.',
          );
          return;
        }

        setAssignedTagIds(
          previous =>
            previous.filter(
              value => value !== tagId,
            ),
        );
      } else {
        const { error } =
          await supabase
            .from(
              'social_chat_tag_assignments',
            )
            .insert({
              user_id: myId,
              chat_id: id,
              tag_id: tagId,
            });

        if (
          error &&
          error.code !== '23505'
        ) {
          showToast(
            error.message ||
              'Could not add tag.',
          );
          return;
        }

        setAssignedTagIds(
          previous =>
            previous.includes(tagId)
              ? previous
              : [...previous, tagId],
        );
      }
    };

  /*
   * PROFILE
   */
  const loadProfile =
    useCallback(async () => {
      if (
        isSidekick ||
        SYSTEM_CHAT_TITLES[
          normalizedId
        ]
      ) {
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

      const { data, error } =
        await supabase
          .from('social_profiles')
          .select('*')
          .eq('user_id', id)
          .maybeSingle();

      if (error) {
        console.error(
          'Profile load error:',
          error,
        );

        setProfile(null);
        setProfileError(
          'Could not load profile.',
        );
      } else {
        setProfile(
          data as Profile,
        );
      }

      setProfileLoading(false);
    }, [
      id,
      isSidekick,
      normalizedId,
    ]);

  const handleSidekickModulePress = useCallback(
    (route: string) => {
      router.push(route as never);
    },
    [],
  );

  /*
   * MESSAGES
   */
  const loadMessages =
    useCallback(async () => {
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
          console.error(
            'Sidekick messages load error:',
            error,
          );

          setMessagesError(
            'Could not load Sidekick messages.',
          );
          setMessages([]);
        } else {
          let loadedMessages: Message[] = (data ?? []).map((row: any) => ({
            id: row.id,
            conversation_id: 'sidekick',
            sender_id: row.sender === 'sidekick' ? 'sidekick' : myId,
            content: row.content,
            created_at: row.created_at,
          }));

          // The first Sidekick greeting is a real persisted message, not
          // an empty-state placeholder. This keeps it in chat history.
          if (loadedMessages.length === 0) {
            const starterText =
              'Welcome to Sidekick. Where would you like to start?';

            const { data: starterMessage, error: starterError } =
              await supabase
                .from('system_messages')
                .insert({
                  user_id: myId,
                  module_key: 'sidekick',
                  sender: 'sidekick',
                  content: starterText,
                })
                .select('id, user_id, module_key, sender, content, created_at')
                .single();

            if (starterError || !starterMessage) {
              console.error(
                'CREATE SIDEKICK STARTER MESSAGE ERROR:',
                starterError,
              );

              // Still show the starter locally if the insert temporarily
              // fails, without blocking the rest of the Sidekick screen.
              loadedMessages = [{
                id: `sidekick-starter-${Date.now()}`,
                conversation_id: 'sidekick',
                sender_id: 'sidekick',
                content: starterText,
                created_at: new Date().toISOString(),
              }];
            } else {
              loadedMessages = [{
                id: starterMessage.id,
                conversation_id: 'sidekick',
                sender_id: 'sidekick',
                content: starterMessage.content,
                created_at: starterMessage.created_at,
              }];
            }
          }

          setMessages(loadedMessages);
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

      const result =
        await loadChatMessages(
          conversationId,
        );

      if (result.error) {
        console.error(
          'Messages load error:',
          result.error,
        );

        setMessagesError(
          'Could not load messages.',
        );
      } else {
        const clearedAt = myId
          ? await getChatClearedAt(myId, conversationId)
          : null;

        const loadedMessages = (result.messages as Message[]).filter((message) => {
          if (!clearedAt) return true;
          return new Date(message.created_at).getTime() > new Date(clearedAt).getTime();
        });

        setMessages(loadedMessages);

        if (myId) {
          const newestReadMessage = loadedMessages[loadedMessages.length - 1];
          await markConversationRead(
            conversationId,
            myId,
            newestReadMessage?.created_at,
          );
        }
      }

      setMessagesLoading(false);
    }, [
      conversationId,
      isSidekick,
      myId,
    ]);

  /*
   * CURRENT USER
   */
  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getUser()
      .then(
        ({
          data: { user },
        }) => {
          if (mounted) {
            setMyId(
              user?.id ?? null,
            );
          }
        },
      );

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * BLOCK STATE
   */
  useEffect(() => {
    if (!myId || !id || isSidekick) {
      setIsBlocked(false);
      setIsBlockedByOther(false);
      return;
    }

    let cancelled = false;

    const loadBlockState = async () => {
      const [{ data: blockedByMe, error: blockedByMeError }, { data: blockedByOther, error: blockedByOtherError }] =
        await Promise.all([
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

      if (blockedByMeError) {
        console.error('BLOCK STATE ERROR (MY BLOCK):', blockedByMeError);
      }

      if (blockedByOtherError) {
        console.error('BLOCK STATE ERROR (OTHER BLOCK):', blockedByOtherError);
      }

      setIsBlocked(Boolean(blockedByMe));
      setIsBlockedByOther(Boolean(blockedByOther));
    };

    void loadBlockState();

    return () => {
      cancelled = true;
    };
  }, [myId, id, isSidekick]);

  /*
   * DIRECT CONVERSATION
   *
   * Lookup only. A deleted chat must stay out of the chat list until the
   * user actually sends a new message.
   */
  useEffect(() => {
    if (!myId || !id || isSidekick) {
      return;
    }

    let cancelled = false;

    (async () => {
      const result = await findExistingDirectConversation(
        myId,
        id,
      );

      if (cancelled) return;

      if (result.error) {
        console.error(
          'DIRECT CONVERSATION LOOKUP ERROR:',
          result.error,
        );

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
  }, [
    myId,
    id,
    isSidekick,
  ]);

  useEffect(() => {
    void loadProfile();
    void loadMessages();
  }, [
    loadProfile,
    loadMessages,
  ]);

  useEffect(() => {
    if (
      myId &&
      !isSidekick
    ) {
      void loadChatTags();
    }
  }, [
    myId,
    isSidekick,
    loadChatTags,
  ]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(false);
    }
  }, [
    messages.length,
    scrollToBottom,
  ]);

  /*
   * SIDEKICK APP DATA
   *
   * Collect the user's real current module data before asking Claude for a
   * reply. The Edge Function is intentionally kept read-only; this client
   * sends only data the authenticated user can already read.
   */
  const loadSidekickAppData = async () => {
    if (!myId) {
      return {};
    }

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const safeQuery = async (
      label: string,
      query: PromiseLike<{ data: unknown; error: unknown }>,
    ) => {
      try {
        const result = await query;

        if (result.error) {
          console.error(`SIDEKICK ${label} DATA ERROR:`, result.error);
          return [];
        }

        return Array.isArray(result.data) ? result.data : [];
      } catch (error) {
        console.error(`SIDEKICK ${label} DATA EXCEPTION:`, error);
        return [];
      }
    };

    const [
      plannerRows,
      habitsRows,
      habitCompletionRows,
      reminderRows,
      listRows,
      financeRows,
      bookmarkRows,
      plantRows,
      wellbeingRows,
      gameRows,
    ] = await Promise.all([
      safeQuery(
        'PLANNER',
        supabase
          .from('planner_tasks')
          .select('*')
          .eq('user_id', myId),
      ),
      safeQuery(
        'HABITS',
        supabase
          .from('habits')
          .select('*')
          .eq('user_id', myId),
      ),
      safeQuery(
        'HABIT COMPLETIONS',
        supabase
          .from('habit_completions')
          .select('*')
          .eq('user_id', myId)
          .eq('completed_on', todayKey),
      ),
      safeQuery(
        'REMINDERS',
        supabase
          .from('reminders')
          .select('*')
          .eq('user_id', myId),
      ),
      safeQuery(
        'LISTS',
        supabase
          .from('list_items')
          .select('*')
          .eq('user_id', myId)
          .eq('completed', false),
      ),
      safeQuery(
        'FINANCE',
        supabase
          .from('finance_transactions')
          .select('*')
          .eq('user_id', myId)
          .order('transaction_date', { ascending: false })
          .limit(100),
      ),
      safeQuery(
        'BOOKMARKS',
        supabase
          .from('bookmarks')
          .select('*')
          .eq('user_id', myId)
          .order('created_at', { ascending: false })
          .limit(100),
      ),
      safeQuery(
        'PLANTS',
        supabase
          .from('plants')
          .select('*')
          .eq('user_id', myId),
      ),
      safeQuery(
        'WELL-BEING',
        supabase
          .from('wellbeing_entries')
          .select('*')
          .eq('user_id', myId)
          .order('entry_date', { ascending: false })
          .limit(100),
      ),
      safeQuery(
        'GAMES',
        supabase
          .from('game_scores')
          .select('*')
          .eq('player_id', myId)
          .order('created_at', { ascending: false })
          .limit(100),
      ),
    ]);

    const completedHabitIds = new Set(
      habitCompletionRows
        .map((row: any) => row?.habit_id)
        .filter(Boolean),
    );

    const activeHabits = habitsRows.filter((habit: any) => {
      const startsTodayOrEarlier =
        !habit?.start_date || habit.start_date <= todayKey;
      const hasNotEnded =
        !habit?.end_date || habit.end_date >= todayKey;

      return (
        startsTodayOrEarlier &&
        hasNotEnded &&
        !completedHabitIds.has(habit?.id)
      );
    });

    const plannerToday = plannerRows.filter((task: any) => {
      if (!task || task.completed) {
        return false;
      }

      const startDate = task.start_date;
      const endDate = task.end_date || startDate;

      if (!startDate) {
        return false;
      }

      const repeat = task.repeat ?? 'none';

      if (repeat === 'none') {
        return todayKey >= startDate && todayKey <= endDate;
      }

      if (todayKey < startDate) {
        return false;
      }

      const start = new Date(`${startDate}T00:00:00`);
      const current = new Date(`${todayKey}T00:00:00`);
      const diff = Math.round(
        (current.getTime() - start.getTime()) / 86400000,
      );
      const interval = Math.max(1, Number(task.repeat_interval) || 1);

      if (repeat === 'daily' || repeat === 'custom') {
        return diff % interval === 0;
      }

      if (repeat === 'weekly') {
        return diff % (7 * interval) === 0;
      }

      if (repeat === 'monthly') {
        const monthDiff =
          (current.getFullYear() - start.getFullYear()) * 12 +
          (current.getMonth() - start.getMonth());

        return (
          monthDiff >= 0 &&
          monthDiff % interval === 0 &&
          current.getDate() === start.getDate()
        );
      }

      if (repeat === 'yearly') {
        const yearDiff = current.getFullYear() - start.getFullYear();

        return (
          yearDiff >= 0 &&
          yearDiff % interval === 0 &&
          current.getMonth() === start.getMonth() &&
          current.getDate() === start.getDate()
        );
      }

      return false;
    });

    const remindersToday = reminderRows.filter(
      (reminder: any) =>
        reminder?.due_date === todayKey &&
        reminder?.completed === false,
    );

    return {
      today: todayKey,
      planner: {
        today: plannerToday,
        all: plannerRows,
      },
      habits: {
        today_incomplete: activeHabits,
        completions_today: habitCompletionRows,
        all: habitsRows,
      },
      reminders: {
        today: remindersToday,
        all_incomplete: reminderRows.filter(
          (reminder: any) => reminder?.completed === false,
        ),
      },
      lists: {
        incomplete: listRows,
      },
      finance: financeRows,
      bookmarks: bookmarkRows,
      plants: plantRows,
      wellbeing: {
        recent: wellbeingRows,
        today: wellbeingRows.filter(
          (entry: any) => entry?.entry_date === todayKey,
        ),
      },
      games: {
        recent: gameRows,
        today: gameRows.filter((game: any) => {
          const createdAt = game?.created_at;
          if (!createdAt) return false;
          return new Date(createdAt).toLocaleDateString() === today.toLocaleDateString();
        }),
      },
    };
  };

  /*
   * SIDEKICK
   */
  const handleSendSidekick =
    async (text: string) => {
      if (!text || sending || !myId) {
        return;
      }

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
        // -------------------------------------------------------
        // 1. SAVE THE USER'S MESSAGE FIRST
        // -------------------------------------------------------
        const {
          data: savedUserMessage,
          error: saveUserError,
        } = await supabase
          .from('system_messages')
          .insert({
            user_id: myId,
            module_key: 'sidekick',
            sender: 'user',
            content: text,
          })
          .select('id, user_id, module_key, sender, content, created_at')
          .single();

        if (saveUserError || !savedUserMessage) {
          console.error(
            'SAVE SIDEKICK USER MESSAGE ERROR:',
            saveUserError,
          );

          setMessages(previous =>
            previous.filter(
              message => message.id !== optimisticUserMessage.id,
            ),
          );

          showToast(
            'Could not save your Sidekick message. Please try again.',
          );
          return;
        }

        const savedUserAsMessage: Message = {
          id: savedUserMessage.id,
          conversation_id: 'sidekick',
          sender_id: myId,
          content: savedUserMessage.content,
          created_at: savedUserMessage.created_at,
        };

        setMessages(previous =>
          previous.map(message =>
            message.id === optimisticUserMessage.id
              ? savedUserAsMessage
              : message,
          ),
        );

        // -------------------------------------------------------
        // 2. ASK SIDEKICK FOR A REPLY
        // -------------------------------------------------------
        // Load the actual current app data and send it with the user's message.
        // Without this, Claude receives empty arrays and can incorrectly say
        // that the user's day is clear.
        const sidekickAppData = await loadSidekickAppData();

        console.log(
          'SIDEKICK APP DATA SUMMARY:',
          {
            plannerToday: sidekickAppData?.planner?.today?.length ?? 0,
            habitsToday: sidekickAppData?.habits?.today_incomplete?.length ?? 0,
            remindersToday: sidekickAppData?.reminders?.today?.length ?? 0,
            listsIncomplete: sidekickAppData?.lists?.incomplete?.length ?? 0,
          },
        );

        const { data, error } = await supabase.functions.invoke(
          'sidekick-chat',
          {
            body: {
              message: text,
              appData: sidekickAppData,
            },
          },
        );

        if (error) {
          console.error(
            'SIDEKICK EDGE FUNCTION ERROR:',
            error,
          );

          showToast(
            'Sidekick could not reply right now. Your message was saved.',
          );
          return;
        }

        console.log('SIDEKICK RESPONSE:', data);

        const reply =
          typeof data?.reply === 'string'
            ? data.reply.trim()
            : '';

        if (!reply) {
          const diagnostic =
            typeof data?.error === 'string'
              ? data.error
              : typeof data?.message === 'string'
                ? data.message
                : '';

          console.error(
            'SIDEKICK RETURNED NO REPLY:',
            data,
          );

          showToast(
            diagnostic
              ? diagnostic.slice(0, 180)
              : 'Sidekick did not return a reply. Your message was saved.',
          );
          return;
        }

        // -------------------------------------------------------
        // 3. SHOW SIDEKICK'S REPLY IMMEDIATELY
        // -------------------------------------------------------
        const localSidekickMessage: Message = {
          id: `sidekick-${Date.now()}`,
          conversation_id: 'sidekick',
          sender_id: 'sidekick',
          content: reply,
          created_at: new Date().toISOString(),
        };

        setMessages(previous => [
          ...previous,
          localSidekickMessage,
        ]);

        scrollToBottom();

        // -------------------------------------------------------
        // -------------------------------------------------------
        // 4. SAVE SIDEKICK REPLY DIRECTLY FROM THE APP
        // -------------------------------------------------------
        // The Edge Function only generates the Claude response.
        // The authenticated app client saves the Sidekick reply.
        // This uses the same authenticated Supabase client that
        // successfully saves the user's Sidekick messages.
        //
        // We intentionally do not depend on data.saved from the
        // Edge Function and do not reload messages immediately.
        // -------------------------------------------------------
        const { error: saveSidekickError } = await supabase
          .from('system_messages')
          .insert({
            user_id: myId,
            module_key: 'sidekick',
            sender: 'sidekick',
            content: reply,
          });

        if (saveSidekickError) {
          console.error(
            'SAVE SIDEKICK REPLY ERROR:',
            JSON.stringify({
              message: saveSidekickError.message,
              details: saveSidekickError.details,
              hint: saveSidekickError.hint,
              code: saveSidekickError.code,
            }),
          );

          showToast(
            'Sidekick replied, but the reply could not be saved.',
          );
          return;
        }

        // The database INSERT has succeeded. Keep the local message
        // exactly as displayed; there is no SELECT/read-back here.
        // This prevents a SELECT/RLS issue from making a successfully
        // inserted Sidekick reply disappear from the screen.
        console.log(
          'SIDEKICK REPLY SAVED SUCCESSFULLY',
        );

      } catch (error) {
        console.error(
          'SIDEKICK REQUEST FAILED:',
          error,
        );

        showToast(
          'Sidekick could not reply right now. Your message was saved.',
        );
      } finally {
        setSending(false);
      }
    };

  /*
   * NORMAL CHAT
   */
  const handleSendNormalChat =
    async (text: string) => {
      if (
        !text ||
        sending ||
        !myId ||
        !id ||
        isBlocked
      ) {
        return;
      }

      setSending(true);

      let activeConversationId =
        conversationId;

      /*
       * A contact that was deleted from the chat list has no membership
       * anymore. Recreate the conversation only when the user actually
       * sends a message.
       */
      if (!activeConversationId) {
        const conversationResult =
          await ensureDirectConversationForSend(
            myId,
            id,
          );

        if (
          conversationResult.error ||
          !conversationResult.id
        ) {
          console.error(
            'CREATE DIRECT CONVERSATION ERROR:',
            conversationResult.error,
          );

          showToast(
            conversationResult.error?.message ||
              'Could not start the conversation.',
          );
          setSending(false);
          return;
        }

        activeConversationId =
          conversationResult.id;
        setConversationId(
          activeConversationId,
        );

        await markConversationRead(
          activeConversationId,
          myId,
        );
      }

      const optimistic: Message = {
        id: `local-${Date.now()}`,
        conversation_id:
          activeConversationId,
        sender_id: myId,
        content: text,
        created_at:
          new Date().toISOString(),
      };

      setMessages(previous => [
        ...previous,
        optimistic,
      ]);

      setDraft('');
      scrollToBottom();

      const result =
        await sendChatMessage(
          activeConversationId,
          myId,
          text,
        );

      if (result.error) {
        console.error(
          'Send message error:',
          result.error,
        );

        setMessages(
          previous =>
            previous.filter(
              message =>
                message.id !==
                optimistic.id,
            ),
        );

        showToast(
          'Failed to send message.',
        );
      } else if (
        result.message
      ) {
        setMessages(
          previous =>
            previous.map(
              message =>
                message.id ===
                optimistic.id
                  ? result.message as Message
                  : message,
            ),
        );
      }

      setSending(false);
    };

  const handleSend =
    async () => {
      const text =
        draft.trim();

      if (
        !text ||
        sending
      ) {
        return;
      }

      if (isSidekick) {
        await handleSendSidekick(
          text,
        );
      } else {
        await handleSendNormalChat(
          text,
        );
      }
    };

  /*
   * ATTACHMENTS
   */
  const uploadAttachment =
    async (
      uri: string,
      type: AttachmentType,
      fileName: string,
      mimeType: string,
    ): Promise<string | null> => {
      if (!myId) {
        return null;
      }

      try {
        const response =
          await fetch(uri);

        const blob =
          await response.blob();

        const path =
          `${myId}/${Date.now()}-${fileName}`;

        const {
          error: uploadError,
        } =
          await supabase.storage
            .from(
              'chat-attachments',
            )
            .upload(
              path,
              blob,
              {
                contentType:
                  mimeType,
                upsert: false,
              },
            );

        if (uploadError) {
          console.error(
            'ATTACHMENT UPLOAD ERROR:',
            uploadError,
          );

          return null;
        }

        const { data } =
          supabase.storage
            .from(
              'chat-attachments',
            )
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

  const sendAttachmentMessage =
    async (
      type: AttachmentType,
      url: string,
      fileName: string,
    ) => {
      if (
        !myId ||
        !conversationId
      ) {
        return;
      }

      const fallbackContent =
        type === 'image'
          ? '📷 Photo'
          : type === 'video'
            ? '🎬 Video'
            : type === 'audio'
              ? '🎤 Voice message'
              : `📄 ${fileName}`;

      const optimistic: Message = {
        id: `local-${Date.now()}`,
        conversation_id:
          conversationId,
        sender_id: myId,
        content:
          fallbackContent,
        created_at:
          new Date().toISOString(),
        attachment_url: url,
        attachment_type:
          type,
        attachment_name:
          fileName,
      };

      setMessages(previous => [
        ...previous,
        optimistic,
      ]);

      scrollToBottom();

      const result =
        await sendChatMessage(
          conversationId,
          myId,
          fallbackContent,
          {
            url,
            name: fileName,
            type:
              type === 'image'
                ? 'image/jpeg'
                : type === 'video'
                  ? 'video/mp4'
                  : type === 'audio'
                    ? 'audio/m4a'
                    : 'application/octet-stream',
          },
        );

      if (result.error) {
        console.error(
          'SEND ATTACHMENT MESSAGE ERROR:',
          result.error,
        );

        setMessages(
          previous =>
            previous.filter(
              message =>
                message.id !==
                optimistic.id,
            ),
        );

        showToast(
          'Failed to send attachment.',
        );
      } else if (
        result.message
      ) {
        setMessages(
          previous =>
            previous.map(
              message =>
                message.id ===
                optimistic.id
                  ? result.message as Message
                  : message,
            ),
        );
      }
    };

  const handlePickDocument =
    async (
      audioOnly: boolean,
    ) => {
      if (
        !myId ||
        !conversationId ||
        uploadingAttachment ||
        attachmentSending
      ) {
        return;
      }

      try {
        const result =
          await DocumentPicker.getDocumentAsync(
            {
              type: audioOnly
                ? 'audio/*'
                : '*/*',
              copyToCacheDirectory:
                true,
              multiple: false,
            },
          );

        if (
          result.canceled ||
          !result.assets?.length
        ) {
          return;
        }

        const asset =
          result.assets[0];

        const fileName =
          asset.name ??
          `file-${Date.now()}`;

        const mimeType =
          asset.mimeType ??
          'application/octet-stream';

        const type: AttachmentType =
          audioOnly
            ? 'audio'
            : mimeType.startsWith(
                'image/',
              )
              ? 'image'
              : mimeType.startsWith(
                  'video/',
                )
                ? 'video'
                : mimeType.startsWith(
                    'audio/',
                  )
                  ? 'audio'
                  : 'document';

        setPendingAttachment({
          uri: asset.uri,
          type,
          name: fileName,
          mimeType,
        });

        setAttachmentReviewOpen(
          true,
        );
      } catch (error) {
        console.error(
          'PICK DOCUMENT ERROR:',
          error,
        );

        showToast(
          'Could not select attachment.',
        );
      }
    };

  /*
   * VOICE RECORDING
   */
  const startRecording =
    async () => {
      const permission =
        await Audio.requestPermissionsAsync();

      if (!permission.granted) {
        showToast(
          'Microphone access is needed to record a voice note.',
        );

        return;
      }

      try {
        await Audio.setAudioModeAsync(
          {
            allowsRecordingIOS:
              true,
            playsInSilentModeIOS:
              true,
          },
        );

        const { recording } =
          await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets
              .HIGH_QUALITY,
          );

        recordingRef.current =
          recording;

        setIsRecording(true);
        setRecordingSeconds(0);

        recordingTimerRef.current =
          setInterval(() => {
            setRecordingSeconds(
              seconds =>
                seconds + 1,
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

  const cancelRecording =
    async () => {
      if (
        recordingTimerRef.current
      ) {
        clearInterval(
          recordingTimerRef.current,
        );

        recordingTimerRef.current =
          null;
      }

      setIsRecording(false);
      setRecordingSeconds(0);

      try {
        await recordingRef.current?.stopAndUnloadAsync();
      } catch {}

      recordingRef.current =
        null;
    };

  const stopRecordingAndSend =
    async () => {
      if (
        recordingTimerRef.current
      ) {
        clearInterval(
          recordingTimerRef.current,
        );

        recordingTimerRef.current =
          null;
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

        recordingRef.current =
          null;

        setRecordingSeconds(0);

        if (!uri) return;

        const fileName =
          `voice-${Date.now()}.m4a`;

        setPendingAttachment({
          uri,
          type: 'audio',
          name: fileName,
          mimeType:
            'audio/m4a',
        });

        setAttachmentReviewOpen(
          true,
        );
      } catch (error) {
        console.error(
          'STOP RECORDING ERROR:',
          error,
        );

        showToast(
          'Could not save voice note.',
        );
      }
    };

  const togglePlayback =
    async (
      message: Message,
    ) => {
      if (
        !message.attachment_url
      ) {
        return;
      }

      if (
        playingMessageId ===
        message.id
      ) {
        await soundRef.current?.stopAsync();
        await soundRef.current?.unloadAsync();

        soundRef.current =
          null;

        setPlayingMessageId(
          null,
        );

        return;
      }

      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();

        soundRef.current =
          null;
      }

      try {
        await Audio.setAudioModeAsync(
          {
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          },
        );

        const { sound } =
          await Audio.Sound.createAsync(
            {
              uri: message.attachment_url,
            },
            {
              shouldPlay: false,
              volume: 1.0,
              isMuted: false,
            },
          );

        await sound.setVolumeAsync(1.0);
        await sound.setIsMutedAsync(false);
        await sound.playAsync();

        soundRef.current =
          sound;

        setPlayingMessageId(
          message.id,
        );

        sound.setOnPlaybackStatusUpdate(
          status => {
            if (
              status.isLoaded &&
              status.didJustFinish
            ) {
              setPlayingMessageId(
                null,
              );

              void sound.unloadAsync();

              soundRef.current =
                null;
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
      void soundRef.current?.unloadAsync();

      if (
        recordingTimerRef.current
      ) {
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
   * ATTACHMENT PICKER
   */
  const handlePickAttachment =
    async () => {
      if (
        uploadingAttachment ||
        attachmentSending ||
        !myId ||
        !conversationId
      ) {
        return;
      }

      try {
        const result =
          await DocumentPicker.getDocumentAsync(
            {
              type: '*/*',
              copyToCacheDirectory:
                true,
              multiple: false,
            },
          );

        if (
          result.canceled ||
          !result.assets?.length
        ) {
          return;
        }

        const asset =
          result.assets[0];

        const fileName =
          asset.name ??
          `file-${Date.now()}`;

        const mimeType =
          asset.mimeType ??
          'application/octet-stream';

        const type: AttachmentType =
          mimeType.startsWith(
            'image/',
          )
            ? 'image'
            : mimeType.startsWith(
                'video/',
              )
              ? 'video'
              : mimeType.startsWith(
                  'audio/',
                )
                ? 'audio'
                : 'document';

        setPendingAttachment({
          uri: asset.uri,
          type,
          name: fileName,
          mimeType,
        });

        setAttachmentReviewOpen(
          true,
        );
      } catch (error) {
        console.error(
          'PICK ATTACHMENT ERROR:',
          error,
        );

        showToast(
          'Could not select attachment.',
        );
      }
    };

  const closeAttachmentReview =
    async () => {
      setAttachmentReviewOpen(
        false,
      );

      setPendingAttachment(
        null,
      );

      setReviewPlaying(false);
    };

  const toggleReviewAudio =
    async () => {
      if (
        !pendingAttachment ||
        pendingAttachment.type !==
          'audio'
      ) {
        return;
      }

      if (reviewPlaying) {
        await soundRef.current?.stopAsync();
        await soundRef.current?.unloadAsync();

        soundRef.current =
          null;

        setReviewPlaying(false);

        return;
      }

      try {
        await soundRef.current?.unloadAsync();

        soundRef.current =
          null;

        await Audio.setAudioModeAsync(
          {
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          },
        );

        const { sound } =
          await Audio.Sound.createAsync(
            {
              uri: pendingAttachment.uri,
            },
            {
              shouldPlay: false,
              volume: 1.0,
              isMuted: false,
            },
          );

        await sound.setVolumeAsync(1.0);
        await sound.setIsMutedAsync(false);
        await sound.playAsync();

        soundRef.current =
          sound;

        setReviewPlaying(true);

        sound.setOnPlaybackStatusUpdate(
          status => {
            if (
              status.isLoaded &&
              status.didJustFinish
            ) {
              setReviewPlaying(
                false,
              );

              void sound.unloadAsync();

              soundRef.current =
                null;
            }
          },
        );
      } catch (error) {
        console.error(
          'REVIEW AUDIO ERROR:',
          error,
        );

        showToast(
          'Could not play voice note preview.',
        );
      }
    };

  const sendPendingAttachment =
    async () => {
      if (
        !pendingAttachment ||
        !myId ||
        !conversationId ||
        attachmentSending
      ) {
        return;
      }

      setAttachmentSending(
        true,
      );

      setUploadingAttachment(
        true,
      );

      try {
        const url =
          await uploadAttachment(
            pendingAttachment.uri,
            pendingAttachment.type,
            pendingAttachment.name,
            pendingAttachment.mimeType,
          );

        if (!url) {
          showToast(
            'Could not upload attachment.',
          );

          return;
        }

        await sendAttachmentMessage(
          pendingAttachment.type,
          url,
          pendingAttachment.name,
        );

        try {
          await soundRef.current?.stopAsync();
        } catch {}

        try {
          await soundRef.current?.unloadAsync();
        } catch {}

        soundRef.current =
          null;

        setReviewPlaying(
          false,
        );

        setAttachmentReviewOpen(
          false,
        );

        setPendingAttachment(
          null,
        );
      } catch (error) {
        console.error(
          'SEND PENDING ATTACHMENT ERROR:',
          error,
        );

        showToast(
          'Failed to send attachment.',
        );
      } finally {
        setUploadingAttachment(
          false,
        );

        setAttachmentSending(
          false,
        );
      }
    };

  /*
   * POLL
   */
  const sendPoll =
    async () => {
      const question =
        pollQuestion.trim();

      const options =
        pollOptions
          .map(
            option =>
              option.trim(),
          )
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
            (
              option,
              index,
            ) =>
              `${index + 1}. ${option}`,
          )
          .join('\n');

      setPollOpen(false);

      const optimistic: Message =
        {
          id: `local-${Date.now()}`,
          conversation_id:
            conversationId,
          sender_id: myId,
          content,
          created_at:
            new Date().toISOString(),
        };

      setMessages(previous => [
        ...previous,
        optimistic,
      ]);

      scrollToBottom();

      const result =
        await sendChatMessage(
          conversationId,
          myId,
          content,
        );

      if (result.error) {
        console.error(
          'SEND POLL ERROR:',
          result.error,
        );

        setMessages(
          previous =>
            previous.filter(
              message =>
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
  const sendEvent =
    async () => {
      const title =
        eventTitle.trim();

      if (!title || !myId) {
        return;
      }

      let content =
        `📅 Event: ${title}`;

      if (
        eventDate.trim()
      ) {
        content +=
          `\nDate: ${eventDate.trim()}`;
      }

      if (
        eventTime.trim()
      ) {
        content +=
          `\nTime: ${eventTime.trim()}`;
      }

      if (
        eventDesc.trim()
      ) {
        content +=
          `\n${eventDesc.trim()}`;
      }

      content +=
        '\nReply YES to add to calendar';

      setEventOpen(false);

      const optimistic: Message =
        {
          id: `local-${Date.now()}`,
          conversation_id:
            conversationId,
          sender_id: myId,
          content,
          created_at:
            new Date().toISOString(),
        };

      setMessages(previous => [
        ...previous,
        optimistic,
      ]);

      scrollToBottom();

      const result =
        await sendChatMessage(
          conversationId,
          myId,
          content,
        );

      if (result.error) {
        console.error(
          'SEND EVENT ERROR:',
          result.error,
        );

        setMessages(
          previous =>
            previous.filter(
              message =>
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
  const handleReport =
    async () => {
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

      setReportSubmitting(
        true,
      );

      const { error } =
        await supabase
          .from('social_reports')
          .insert({
            reporter_id: myId,
            reported_id: id,
            reason,
          });

      setReportSubmitting(
        false,
      );

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
  const handleBlock =
    async () => {
      if (!myId || !id || isSidekick) return;

      setActionLoading('block');

      const { error } = await supabase
        .from('social_blocks')
        .insert({ blocker_id: myId, blocked_id: id });

      setActionLoading(null);

      if (error) {
        console.error('BLOCK ERROR:', error);
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
      console.error('UNBLOCK ERROR:', error);
      showToast('Could not unblock user.');
      return;
    }

    setIsBlocked(false);
    showToast('User unblocked.');
  };

  /*
   * DELETE CHAT
   */
  const handleDeleteChat =
    async () => {
      if (
        !myId ||
        !id ||
        isSidekick
      ) {
        return;
      }

      let targetConversationId = conversationId;

      if (!targetConversationId) {
        const lookup = await findExistingDirectConversation(
          myId,
          id,
        );
        targetConversationId = lookup.id ?? '';
      }

      if (!targetConversationId) {
        showToast('Chat is already deleted.');
        return;
      }

      setActionLoading(
        'delete',
      );

      const { error } = await deleteConversationForUser(
        targetConversationId,
        myId,
        id,
      );

      setActionLoading(null);

      if (error) {
        console.error(
          'DELETE CHAT ERROR:',
          error,
        );

        showToast(
          'Could not delete chat.',
        );
        return;
      }

      /*
       * The current user's membership is the only thing removed.
       * The other person's membership and the conversation itself remain,
       * allowing the chat to be reopened later by sending a new message.
       */

      /* Remove the local chat immediately as well. */
      setConversationId('');
      setMessages([]);
      setDraft('');
      setPendingAttachment(null);
      setAttachmentReviewOpen(false);

      router.replace(
        '/(tabs)' as never,
      );
    };

  /*
   * UNSEND
   */
  const handleUnsendMessage =
    async (
      message: Message,
    ) => {
      if (
        !myId ||
        message.sender_id !==
          myId ||
        message.id.startsWith(
          'local-',
        )
      ) {
        return;
      }

      const age =
        Date.now() -
        new Date(
          message.created_at,
        ).getTime();

      const fiveMinutes =
        5 * 60 * 1000;

      if (
        age >
        fiveMinutes
      ) {
        Alert.alert(
          'Unsend unavailable',
          'Messages can only be unsent within 5 minutes of sending.',
        );

        return;
      }

      Alert.alert(
        'Message options',
        'What would you like to do with this message?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Unsend',
            style: 'destructive',
            onPress:
              async () => {
                const {
                  error,
                } =
                  await supabase.rpc(
                    'chat_unsend_direct_message',
                    {
                      p_message_id:
                        message.id,
                    },
                  );

                if (error) {
                  console.error(
                    'UNSEND DIRECT MESSAGE ERROR:',
                    error,
                  );

                  Alert.alert(
                    'Could not unsend message',
                    error.message ||
                      'Please try again.',
                  );

                  return;
                }

                setMessages(
                  previous =>
                    previous.filter(
                      item =>
                        item.id !==
                        message.id,
                    ),
                );
              },
          },
        ],
      );
    };

  /*
   * CLEAR CHAT
   */
  const handleClearChat =
    async () => {
      if (!myId) {
        showToast(
          'Could not identify your account.',
        );

        return;
      }

      setActionLoading(
        'clear',
      );

      if (isSidekick) {
        const { error } =
          await supabase
            .from('system_messages')
            .delete()
            .eq(
              'user_id',
              myId,
            )
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

      const clearedAt = new Date().toISOString();
      const { error } = await clearChatForUser(
        myId,
        conversationId,
        clearedAt,
      );

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

      await markConversationRead(
        conversationId,
        myId,
        clearedAt,
      );

      setMessages([]);

      showToast(
        'Chat cleared.',
      );
    };

  /*
   * CREATE GROUP
   */
  const handleCreateGroup =
    async () => {
      const name =
        groupName.trim();

      if (
        !name ||
        groupSubmitting ||
        !myId ||
        !id ||
        isSidekick
      ) {
        return;
      }

      setGroupSubmitting(
        true,
      );

      try {
        const {
          data: groupData,
          error: groupError,
        } =
          await supabase
            .from('chat_groups')
            .insert({
              name,
              description: '',
              visibility:
                'private',
              owner_id: myId,
            })
            .select('id')
            .single();

        if (
          groupError ||
          !groupData
        ) {
          throw (
            groupError ??
            new Error(
              'Could not create group.',
            )
          );
        }

        const groupId =
          groupData.id;

        const {
          error: memberError,
        } =
          await supabase
            .from(
              'chat_group_members',
            )
            .insert({
              group_id: groupId,
              user_id: myId,
              role: 'owner',
            });

        if (memberError) {
          throw memberError;
        }

        const {
          data: channelData,
          error: channelError,
        } =
          await supabase
            .from(
              'chat_channels',
            )
            .insert({
              group_id: groupId,
              name,
              description: '',
              position: 0,
              is_default: true,
              created_by: myId,
            })
            .select('id')
            .single();

        if (
          channelError ||
          !channelData
        ) {
          throw (
            channelError ??
            new Error(
              'Could not create group channel.',
            )
          );
        }

        const {
          data: conversationData,
          error:
            conversationError,
        } =
          await supabase
            .from(
              'chat_conversations',
            )
            .insert({
              type: 'channel',
              group_id:
                groupId,
              channel_id:
                channelData.id,
              created_by: myId,
            })
            .select('id')
            .single();

        if (
          conversationError ||
          !conversationData
        ) {
          throw (
            conversationError ??
            new Error(
              'Could not create group conversation.',
            )
          );
        }

        const {
          error:
            conversationMemberError,
        } =
          await supabase
            .from(
              'chat_conversation_members',
            )
            .insert({
              conversation_id:
                conversationData.id,
              user_id: myId,
            });

        if (
          conversationMemberError
        ) {
          throw conversationMemberError;
        }

        const {
          data: inviteData,
          error: inviteError,
        } =
          await supabase
            .from(
              'chat_group_invitations',
            )
            .insert({
              group_id: groupId,
              inviter_id: myId,
              invitee_id: id,
              status:
                'pending',
            })
            .select('id')
            .single();

        if (inviteError) {
          throw inviteError;
        }

        setGroupSuccess(
          `Group created${
            inviteData
              ? ` and invite sent to ${
                  profile?.display_name ??
                  'user'
                }`
              : ''
          }`,
        );

        setGroupName('');
      } catch (error: any) {
        console.error(
          'CREATE GROUP ERROR:',
          error,
        );

        showToast(
          error?.message ||
            'Could not create group.',
        );
      } finally {
        setGroupSubmitting(
          false,
        );
      }
    };

  /*
   * MESSAGE RENDERING
   */
  const renderMessage = ({
    item,
    index,
  }: {
    item: Message;
    index: number;
  }) => {
    const isMine =
      item.sender_id ===
      myId;

    const isSidekickReply =
      isSidekick &&
      item.sender_id ===
        'sidekick';

    const time =
      new Date(
        item.created_at,
      ).toLocaleTimeString(
        [],
        {
          hour: '2-digit',
          minute: '2-digit',
        },
      );

    const previousMessage =
      index > 0 ? messages[index - 1] : null;

    const showDateSeparator =
      !previousMessage ||
      getLocalDateKey(previousMessage.created_at) !==
        getLocalDateKey(item.created_at);

    const outgoing =
      isMine &&
      !isSidekickReply;

    const contentColor =
      outgoing
        ? onAccent
        : colors.text;

    return (
      <>
        {showDateSeparator ? (
          <View style={styles.dateSeparator}>
            <Text
              style={[
                styles.dateSeparatorText,
                { color: colors.muted },
              ]}
            >
              {formatMessageDateLabel(item.created_at)}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.msgRow,
          isMine
            ? styles.msgRowMine
            : styles.msgRowTheirs,
        ]}
      >
        <Pressable
          onLongPress={() => {
            if (
              isMine &&
              !isSidekickReply
            ) {
              void handleUnsendMessage(
                item,
              );
            }
          }}
          delayLongPress={350}
          disabled={
            !isMine ||
            isSidekickReply
          }
          style={({ pressed }) => [
            styles.messagePressable,
            pressed &&
              isMine &&
              !isSidekickReply &&
              styles.messagePressed,
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
                <Text
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
                  🎬 Video
                </Text>
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
                    color: contentColor,
                  },
                ]}
              >
                {isSidekickReply
                  ? renderSidekickFormattedText(
                      item.content,
                      contentColor,
                    )
                  : item.content}
              </Text>
            ) : null}

            <Text
              style={[
                styles.bubbleTime,
                {
                  color:
                    outgoing
                      ? 'rgba(255,255,255,0.75)'
                      : colors.muted,
                },
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

  const headerName =
    isSidekick
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

  const isSidekickStarterMessage =
    isSidekick &&
    messages.length === 1 &&
    messages[0].sender_id === 'sidekick' &&
    messages[0].content ===
      'Welcome to Sidekick. Where would you like to start?';

  const sidekickChoicesFooter = isSidekickStarterMessage ? (
    <View style={styles.sidekickChoicesFooter}>
      <Text
        style={[
          styles.sidekickChoicesPrompt,
          { color: colors.muted },
        ]}
      >
        Choose a place to start.
      </Text>

      <View style={styles.sidekickModuleChoices}>
        {SIDEKICK_MODULE_CHOICES.map(module => (
          <Pressable
            key={module.label}
            onPress={() =>
              handleSidekickModulePress(module.route)
            }
            style={[
              styles.sidekickModuleChoice,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.sidekickModuleChoiceText,
                { color: colors.text },
              ]}
            >
              {module.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  ) : null;

  const closeMenu =
    () => {
      setMenuOpen(false);
    };

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
          onPress={() =>
            router.replace(
              '/(tabs)' as never,
            )
          }
          hitSlop={12}
          style={styles.headerBtn}
        >
          <ChevronLeft
            color={
              colors.text
            }
            size={26}
          />
        </Pressable>

        <View
          style={
            styles.headerTitleWrap
          }
        >
          {profileLoading ? (
            <ActivityIndicator
              color={
                colors.muted
              }
              size="small"
            />
          ) : (
            <Pressable
              disabled={
                !showProfileButton
              }
              onPress={() =>
                router.push({
                  pathname:
                    '/chat/profile/[id]',
                  params: { id },
                } as never)
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
                      isBlackDark
                        ? '#FFFFFF'
                        : accentForeground,
                  },
                ]}
                numberOfLines={1}
              >
                {headerName}
              </Text>

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
            color={
              colors.text
            }
            size={24}
          />
        </Pressable>
      </View>

      {/* MESSAGES */}

      <View style={styles.body}>
        {messagesLoading ? (
          <View
            style={
              styles.centerState
            }
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
            style={
              styles.centerState
            }
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
              onPress={
                loadMessages
              }
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
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item =>
              item.id
            }
            renderItem={
              renderMessage
            }
            ListFooterComponent={
              sidekickChoicesFooter
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
                  animated:
                    false,
                },
              )
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
              backgroundColor: colors.card,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.blockedBarText,
              { color: colors.muted },
            ]}
          >
            {isBlocked
              ? `You blocked ${profile?.display_name ?? 'this user'}.`
              : 'Cannot send messages.'}
          </Text>

          {isBlocked ? (
            <Pressable
              onPress={handleUnblock}
              disabled={actionLoading === 'unblock'}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.blockedBarLink,
                  { color: accentForeground },
                ]}
              >
                {actionLoading === 'unblock'
                  ? 'Unblocking…'
                  : 'Tap here to unblock'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
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
          {!isSidekick &&
          !isRecording ? (
            <Pressable
              onPress={
                handlePickAttachment
              }
              disabled={
                uploadingAttachment ||
                sending
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
              {uploadingAttachment ? (
                <ActivityIndicator
                  color={
                    accentForeground
                  }
                  size="small"
                />
              ) : (
                <Paperclip
                  color={
                    colors.muted
                  }
                  size={20}
                />
              )}
            </Pressable>
          ) : null}

          {isRecording ? (
            <View
              style={[
                styles.recordingRow,
                {
                  borderColor:
                    colors.border,
                  backgroundColor:
                    colors.bg,
                },
              ]}
            >
              <View
                style={
                  styles.recordingDot
                }
              />

              <Text
                style={[
                  styles.recordingText,
                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Recording…{' '}
                {Math.floor(
                  recordingSeconds /
                    60,
                )}
                :
                {String(
                  recordingSeconds %
                    60,
                ).padStart(2, '0')}
              </Text>

              <Pressable
                onPress={
                  cancelRecording
                }
                hitSlop={8}
                style={
                  styles.recordingCancelBtn
                }
              >
                <X
                  color={
                    colors.muted
                  }
                  size={18}
                />
              </Pressable>
            </View>
          ) : (
            <TextInput
              value={draft}
              onChangeText={
                setDraft
              }
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
                  color:
                    colors.text,
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
              onPress={
                stopRecordingAndSend
              }
              disabled={
                uploadingAttachment
              }
              hitSlop={8}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              {uploadingAttachment ? (
                <ActivityIndicator
                  color="#FFFFFF"
                  size="small"
                />
              ) : (
                <Square
                  color="#FFFFFF"
                  size={16}
                />
              )}
            </Pressable>
          ) : !isSidekick &&
            !draft.trim() ? (
            <Pressable
              onPress={
                startRecording
              }
              disabled={
                uploadingAttachment
              }
              hitSlop={8}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    accentForeground,
                },
                uploadingAttachment &&
                  styles.sendBtnDisabled,
              ]}
            >
              <Mic
                color="#FFFFFF"
                size={18}
              />
            </Pressable>
          ) : (
            <Pressable
              onPress={
                handleSend
              }
              disabled={
                !draft.trim() ||
                sending
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
      )}

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

      {/* CHAT OPTIONS */}

      {menuOpen ? (
        <Pressable
          style={
            styles.menuBackdrop
          }
          onPress={closeMenu}
        >
          <View
            style={[
              styles.dropdownMenu,
              {
                backgroundColor:
                  colors.card,
                borderColor:
                  colors.border,
              },
            ]}
          >
            {!isSidekick ? (
              <>
                <Pressable
                  style={
                    styles.menuItem
                  }
                  onPress={
                    isBlocked ? handleUnblock : handleBlock
                  }
                  disabled={
                    actionLoading === 'block' ||
                    actionLoading === 'unblock'
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
                    {actionLoading === 'block'
                      ? 'Blocking…'
                      : actionLoading === 'unblock'
                        ? 'Unblocking…'
                        : isBlocked
                          ? 'Unblock'
                          : 'Block'}
                  </Text>
                </Pressable>

                <Pressable
                  style={
                    styles.menuItem
                  }
                  onPress={() => {
                    closeMenu();
                    setTagModalOpen(
                      true,
                    );
                    void loadChatTags();
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
                    Add Tag
                  </Text>
                </Pressable>

                <Pressable
                  style={
                    styles.menuItem
                  }
                  onPress={() => {
                    closeMenu();

                    Alert.alert(
                      'Delete chat?',
                      'This removes the conversation from your chat list.',
                      [
                        {
                          text: 'Cancel',
                          style: 'cancel',
                        },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress:
                            handleDeleteChat,
                        },
                      ],
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      {
                        color:
                          '#C84D4D',
                      },
                    ]}
                  >
                    Delete Chat
                  </Text>
                </Pressable>
              </>
            ) : null}

            <Pressable
              style={
                styles.menuItem
              }
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
          </View>
        </Pressable>
      ) : null}

      {/* TAG MODAL */}

      <Modal
        visible={
          tagModalOpen
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setTagModalOpen(
            false,
          )
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
                Add Tag
              </Text>

              <Pressable
                onPress={() =>
                  setTagModalOpen(
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

            {chatTags.length ===
            0 ? (
              <Text
                style={[
                  styles.subHint,
                  {
                    color:
                      colors.muted,
                  },
                ]}
              >
                You haven't created
                any tags yet.
              </Text>
            ) : (
              chatTags.map(tag => {
                const selected =
                  assignedTagIds.includes(
                    tag.id,
                  );

                return (
                  <Pressable
                    key={tag.id}
                    onPress={() =>
                      toggleChatTag(
                        tag.id,
                      )
                    }
                    style={[
                      styles.menuItem,
                      {
                        borderBottomColor:
                          colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.menuItemText,
                        {
                          color:
                            selected
                              ? accentForeground
                              : colors.text,
                        },
                      ]}
                    >
                      {selected
                        ? '✓ '
                        : ''}
                      {tag.name}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      </Modal>

      {/* ATTACHMENT REVIEW */}

      <Modal
        visible={
          attachmentReviewOpen
        }
        transparent
        animationType="fade"
        onRequestClose={
          closeAttachmentReview
        }
      >
        <View
          style={
            styles.subShade
          }
        >
          <View
            style={[
              styles.attachmentReviewSheet,
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
                Review attachment
              </Text>

              <Pressable
                onPress={
                  closeAttachmentReview
                }
                hitSlop={12}
                disabled={
                  attachmentSending
                }
              >
                <X
                  color={
                    colors.muted
                  }
                  size={22}
                />
              </Pressable>
            </View>

            {pendingAttachment?.type ===
            'image' ? (
              <Image
                source={{
                  uri: pendingAttachment.uri,
                }}
                style={
                  styles.attachmentReviewImage
                }
                resizeMode="contain"
              />
            ) : pendingAttachment?.type ===
              'audio' ? (
              <View
                style={[
                  styles.attachmentReviewAudio,
                  {
                    borderColor:
                      colors.border,
                  },
                ]}
              >
                <Pressable
                  onPress={
                    toggleReviewAudio
                  }
                  style={[
                    styles.reviewPlayButton,
                    {
                      backgroundColor:
                        accentForeground,
                    },
                  ]}
                >
                  {reviewPlaying ? (
                    <Pause
                      color="#FFFFFF"
                      size={20}
                    />
                  ) : (
                    <Play
                      color="#FFFFFF"
                      size={20}
                    />
                  )}
                </Pressable>

                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={[
                      styles.reviewFileName,
                      {
                        color:
                          colors.text,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {
                      pendingAttachment.name
                    }
                  </Text>

                  <Text
                    style={[
                      styles.subHint,
                      {
                        color:
                          colors.muted,
                      },
                    ]}
                  >
                    Voice note ready
                    to send
                  </Text>
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.attachmentReviewFile,
                  {
                    borderColor:
                      colors.border,
                  },
                ]}
              >
                <FileText
                  color={
                    accentForeground
                  }
                  size={30}
                />

                <Text
                  style={[
                    styles.reviewFileName,
                    {
                      color:
                        colors.text,
                    },
                  ]}
                  numberOfLines={3}
                >
                  {pendingAttachment?.name ||
                    'Attachment'}
                </Text>

                <Text
                  style={[
                    styles.subHint,
                    {
                      color:
                        colors.muted,
                    },
                  ]}
                >
                  Ready to send
                </Text>
              </View>
            )}

            <View
              style={
                styles.reviewActions
              }
            >
              <Pressable
                onPress={
                  closeAttachmentReview
                }
                disabled={
                  attachmentSending
                }
                style={[
                  styles.reviewCancelButton,
                  {
                    borderColor:
                      colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.reviewCancelText,
                    {
                      color:
                        colors.text,
                    },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={
                  sendPendingAttachment
                }
                disabled={
                  !pendingAttachment ||
                  attachmentSending
                }
                style={[
                  styles.reviewSendButton,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                  attachmentSending &&
                    styles.sendBtnDisabled,
                ]}
              >
                {attachmentSending ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                    size="small"
                  />
                ) : (
                  <Send
                    color="#FFFFFF"
                    size={17}
                  />
                )}

                <Text
                  style={
                    styles.reviewSendText
                  }
                >
                  {attachmentSending
                    ? 'Sending…'
                    : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* REPORT */}

      <Modal
        visible={
          reportOpen
        }
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
  /*
   * Every text-bearing style below explicitly specifies
   * a Poppins family. This prevents React Native/web from
   * falling back to the platform default for this screen.
   */

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

  sidekickChoicesFooter: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
  },

  sidekickChoicesPrompt: {
    fontFamily: FONT,
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
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sidekickModuleChoiceText: {
    fontFamily: FONT_MED,
    fontSize: 14,
    textAlign: 'center',
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

  dateSeparator: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },

  dateSeparatorText: {
    fontFamily: FONT_MED,
    fontSize: 11,
    letterSpacing: 0.15,
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

  messagePressable: {
    maxWidth: '82%',
    flexShrink: 1,
  },

  messagePressed: {
    opacity: 0.82,
  },

  bubble: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  bubbleText: {
    fontFamily: FONT,
    fontSize: 15,
    lineHeight: 21,
    flexShrink: 1,
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

  blockedBar: {
    minHeight: 68,
    borderTopWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    bottom: 70,
  },

  blockedBarText: {
    fontFamily: FONT_MED,
    fontSize: 12,
  },

  blockedBarLink: {
    fontFamily: FONT_SEMI,
    fontSize: 12,
    marginTop: 3,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 9,
    paddingBottom: 70,
    paddingTop: 10,
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
    backgroundColor:
      '#FF6B6B',
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
    fontWeight: '400',
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
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 8,
  },

  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
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
    fontWeight: '400',
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

  attachmentReviewSheet: {
    width: '92%',
    maxWidth: 460,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },

  attachmentReviewImage: {
    width: '100%',
    height: 300,
    borderRadius: 16,
    marginVertical: 12,
    backgroundColor:
      '#111111',
  },

  attachmentReviewAudio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginVertical: 16,
  },

  attachmentReviewFile: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginVertical: 16,
    gap: 8,
  },

  reviewPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  reviewFileName: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  reviewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },

  reviewCancelButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  reviewCancelText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  reviewSendButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  reviewSendText: {
    color: '#FFFFFF',
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  successTextAlt: {
    fontFamily:
      FONT_EXTRA_BOLD,
  },
});