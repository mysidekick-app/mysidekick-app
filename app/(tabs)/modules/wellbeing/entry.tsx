import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { router, useLocalSearchParams } from 'expo-router';
import { Bell, ChevronLeft, Sparkles } from 'lucide-react-native';

import { useApp } from '@/components/AppProvider';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

import {
  WellbeingCalendar,
  parseDate,
  todayDate,
} from '@/components/WellbeingCalendar';

/* ------------------------------------------------------------------ */
/* Palettes                                                           */
/* ------------------------------------------------------------------ */

const DARK_PALETTE = {
  bg: '#090909',
  card: '#151515',
  cardBorder: '#2A2A2A',
  text: '#F4F2EE',
  muted: '#AAA59D',
  divider: '#262626',
  danger: '#E05252',
  inputBg: '#1C1C1C',
};

const LIGHT_PALETTE = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  cardBorder: '#ECE9E4',
  text: '#27241F',
  muted: '#8F8A82',
  divider: '#F0EEEA',
  danger: '#E05252',
  inputBg: '#F5F3EF',
};

const FONT = 'Poppins-Regular';
const FONT_MEDIUM = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

/* ------------------------------------------------------------------ */
/* Module config                                                      */
/* ------------------------------------------------------------------ */

type ModuleKey =
  | 'journaling'
  | 'morning_pages'
  | 'shadow_work';

type ModuleConfig = {
  key: ModuleKey;
  label: string;
  title: string;
  placeholder: string;
  hasPrompt: boolean;
};

const MODULE_CONFIG: Record<ModuleKey, ModuleConfig> = {
  journaling: {
    key: 'journaling',
    label: 'JOURNALING',
    title: 'JOURNAL',
    placeholder: 'Start writing...',
    hasPrompt: true,
  },

  morning_pages: {
    key: 'morning_pages',
    label: 'MORNING PAGES',
    title: 'BLANK PAGES',
    placeholder:
      "Let your mind wander onto the page...",
    hasPrompt: false,
  },

  shadow_work: {
    key: 'shadow_work',
    label: 'SHADOW WORK',
    title: 'SHADOW WORK',
    placeholder: 'Start writing...',
    hasPrompt: true,
  },
};

function isModuleKey(value: unknown): value is ModuleKey {
  return (
    value === 'journaling' ||
    value === 'morning_pages' ||
    value === 'shadow_work'
  );
}

/* ------------------------------------------------------------------ */
/* Daily prompts                                                      */
/* ------------------------------------------------------------------ */

const JOURNAL_PROMPTS: string[] = [
  'What is something that went well today, and why?',
  'Describe a moment you felt fully present.',
  'What is a thought you keep returning to, and what is it asking of you?',
  'Where did you hold back today, and what would it look like to not?',
  'What part of today do you want to remember a year from now?',
  'What is something you are carrying that no longer belongs to you?',
  'Who came to mind today, and what did they stir up?',
  "What did your body need today that you did or didn't give it?",
  'What is a small win you keep forgetting to credit yourself for?',
  'What would you say to yourself one year ago today?',
  'What is a pattern you are ready to interrupt?',
  'Where did you feel most like yourself today?',
  'What is something you are avoiding, and what is it protecting you from?',
  'Describe today in three words, then explain each one.',
];

const SHADOW_PROMPTS: string[] = [
  'What part of yourself do you hide from others, and what would happen if you didn’t?',
  'Describe an emotion you were taught to suppress. Where does it live in your body now?',
  'What trait in others triggers a strong reaction in you — and where does it live in you?',
  'What is a belief you inherited that you have never questioned?',
  'When do you feel the smallest, and who is in the room when it happens?',
  'What is something you do that you are ashamed of, and what need is it trying to meet?',
  'Describe a part of you that you have disowned. What does it want to say?',
  'What is a story you tell about yourself that might no longer be true?',
  'Where did you learn that you had to earn love, and how does that shape you today?',
  'What is something you judge harshly in others that you are afraid to see in yourself?',
  'What is a secret you keep from yourself?',
  'Describe a time you betrayed yourself to stay safe. What would honesty have cost?',
  'What is the oldest wound you carry, and how do you tend to it now?',
  'What part of you feels unlovable, and what would it take to sit with it without fixing it?',
];

const PROMPT_LISTS: Record<ModuleKey, string[]> = {
  journaling: JOURNAL_PROMPTS,
  morning_pages: [],
  shadow_work: SHADOW_PROMPTS,
};

/* ------------------------------------------------------------------ */
/* Prompt helper                                                      */
/* ------------------------------------------------------------------ */

function promptFor(
  moduleKey: ModuleKey,
  dateStr: string,
): string | null {
  const list = PROMPT_LISTS[moduleKey];

  if (list.length === 0) {
    return null;
  }

  const dayIndex =
    parseDate(dateStr).getTime() / 86_400_000;

  const idx =
    Math.floor(Math.abs(dayIndex)) % list.length;

  return list[idx];
}

/* ------------------------------------------------------------------ */
/* Date helper                                                        */
/* ------------------------------------------------------------------ */

function prettyDateLabel(dateStr: string): string {
  const d = parseDate(dateStr);

  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/* ------------------------------------------------------------------ */
/* Entry row                                                          */
/* ------------------------------------------------------------------ */

type EntryRow = {
  id: string;
  content: string | null;
};

/* ================================================================== */
/* Screen                                                             */
/* ================================================================== */

export default function WellbeingEntryScreen() {
  const params =
    useLocalSearchParams<{ module?: string }>();

  const moduleKey = isModuleKey(params.module)
    ? params.module
    : 'journaling';

  const config = MODULE_CONFIG[moduleKey];

  const { isDark, accentForeground, onAccent } = useApp();

  const { user } = useAuth();

  const accent = accentForeground;

  const COLORS = isDark
    ? DARK_PALETTE
    : LIGHT_PALETTE;

  const styles = makeStyles(COLORS);

  const today = todayDate();

  const [selectedDate, setSelectedDate] =
    useState<string>(today);

  const [content, setContent] =
    useState<string>('');

  const [entryId, setEntryId] =
    useState<string | null>(null);

  const [isEditing, setIsEditing] =
    useState<boolean>(false);

  const [allEntryDates, setAllEntryDates] =
    useState<Set<string>>(new Set());

  const [loading, setLoading] =
    useState<boolean>(true);

  const [saving, setSaving] =
    useState<boolean>(false);

  const [error, setError] =
    useState<string | null>(null);

  const [saveMsg, setSaveMsg] =
    useState<string | null>(null);

  const isFuture = useMemo(
    () => selectedDate > today,
    [selectedDate, today],
  );

  const dailyPrompt = useMemo(
    () => promptFor(moduleKey, selectedDate),
    [moduleKey, selectedDate],
  );

  /* -------------------------------------------------------------- */
  /* Load one entry                                                 */
  /* -------------------------------------------------------------- */

  const loadEntry = useCallback(
    async (dateStr: string) => {
      setLoading(true);
      setError(null);
      setSaveMsg(null);
      setIsEditing(false);

      if (!user) {
        setError(
          'You must be signed in to use this module.',
        );
        setContent('');
        setEntryId(null);
        setLoading(false);
        return;
      }

      const {
        data,
        error: fetchErr,
      } = await supabase
        .from('wellbeing_entries')
        .select('id, content')
        .eq('user_id', user.id)
        .eq('module_key', moduleKey)
        .eq('entry_date', dateStr)
        .maybeSingle();
      
      if (fetchErr) {
        console.error('FAILED WELLBEING ENTRY LOAD:', {
          message: fetchErr.message,
          code: fetchErr.code,
          details: fetchErr.details,
          hint: fetchErr.hint,
          moduleKey,
          dateStr,
          userId: user.id,
        });
      
        setError(
          `Could not load entry: ${fetchErr.message}`,
        );
      
        setLoading(false);
        return;
      }
      
      const row = data as EntryRow | null;

      setContent(row?.content ?? '');
      setEntryId(row?.id ?? null);
      setLoading(false);
    },
    [moduleKey, user],
  );

  /* -------------------------------------------------------------- */
  /* Load dates for calendar                                        */
  /* -------------------------------------------------------------- */

  const loadEntryDates = useCallback(
    async () => {
      if (!user) {
        setAllEntryDates(new Set());
        return;
      }

      const {
        data,
        error: datesErr,
      } = await supabase
        .from('wellbeing_entries')
        .select('entry_date')
        .eq('user_id', user.id)
        .eq('module_key', moduleKey);

      if (datesErr) {
        console.error(
          'Failed to load wellbeing entry dates:',
          datesErr.message,
        );
        return;
      }

      if (data) {
        setAllEntryDates(
          new Set(
            data.map(
              (r: { entry_date: string }) =>
                r.entry_date,
            ),
          ),
        );
      }
    },
    [moduleKey, user],
  );

  /* -------------------------------------------------------------- */
  /* Initial entry load                                             */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    loadEntry(selectedDate);
  }, [loadEntry, selectedDate]);

  /* -------------------------------------------------------------- */
  /* Calendar dots                                                   */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    loadEntryDates();
  }, [loadEntryDates]);

  /* -------------------------------------------------------------- */
  /* Date selection                                                  */
  /* -------------------------------------------------------------- */

  const onSelectDate = useCallback(
    (date: string) => {
      if (date > today) {
        return;
      }

      setSelectedDate(date);
    },
    [today],
  );

  /* -------------------------------------------------------------- */
  /* Save entry                                                      */
  /* -------------------------------------------------------------- */

  const onSave = useCallback(
    async () => {
      if (isFuture) {
        setSaveMsg(
          'You cannot save an entry for a future date.',
        );
        return;
      }

      if (!user) {
        setError(
          'You must be signed in to save an entry.',
        );
        return;
      }

      setSaving(true);
      setSaveMsg(null);
      setError(null);

      const {
        data,
        error: upsertErr,
      } = await supabase
        .from('wellbeing_entries')
        .upsert(
          {
            user_id: user.id,
            module_key: moduleKey,
            entry_date: selectedDate,
            content,
          },
          {
            onConflict:
              'user_id,module_key,entry_date',
          },
        )
        .select('id, content')
        .single();

        if (upsertErr) {
          console.error('FAILED WELLBEING ENTRY SAVE:', {
            message: upsertErr.message,
            code: upsertErr.code,
            details: upsertErr.details,
            hint: upsertErr.hint,
            moduleKey,
            selectedDate,
            userId: user.id,
          });
        
          setError(
            `Could not save entry: ${upsertErr.message}`,
          );
        
          setSaving(false);
          return;
        }

      if (data) {
        const savedRow =
          data as EntryRow;

        setEntryId(savedRow.id);
        setContent(savedRow.content ?? '');
      }

      setSaveMsg('Saved.');
      setIsEditing(false);

      setAllEntryDates(prev => {
        const next = new Set(prev);
        next.add(selectedDate);
        return next;
      });

      await loadEntryDates();

      setSaving(false);
    },
    [
      content,
      isFuture,
      moduleKey,
      selectedDate,
      user,
      loadEntryDates,
    ],
  );

  /* ---------------------------------------------------------------- */
  /* Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <View style={styles.safe}>

      {/* Header */}

      <View
        style={[
          styles.header,
          { paddingTop: 28 },
        ]}
      >

        <Pressable
          onPress={() => router.back()}
          style={[
            styles.backBtn,
            { backgroundColor: accent },
          ]}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <ChevronLeft
            color={COLORS.text}
            size={22}
            strokeWidth={2.4}
          />
        </Pressable>

        <Text style={styles.headerTitle}>
          {config.title}
        </Text>

        <Pressable
          style={styles.bellBtn}
          hitSlop={12}
          accessibilityLabel="Notifications"
        >
          <Bell
            color={COLORS.text}
            size={20}
          />
        </Pressable>

      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
        keyboardVerticalOffset={0}
      >

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* Date */}

          <Text
            style={[
              styles.dateLabel,
              { color: accent },
            ]}
          >
            {prettyDateLabel(selectedDate)}
          </Text>

          {/* Calendar */}

          <WellbeingCalendar
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            accent={accent}
            isDark={isDark}
            entryDates={allEntryDates}
          />

          {/* Future notice */}

          {isFuture ? (
            <View
              style={styles.futureNotice}
            >
              <Text
                style={styles.futureText}
              >
                You can only write for today or earlier.
                Pick a past date to continue.
              </Text>
            </View>
          ) : null}

          {/* Loading */}

          {loading ? (
            <View
              style={styles.centerState}
            >
              <ActivityIndicator
                size="large"
                color={accent}
              />

              <Text
                style={styles.stateText}
              >
                Loading your entry…
              </Text>
            </View>
          ) : error ? (

            /* Error */

            <View
              style={styles.centerState}
            >
              <Text
                style={styles.errorText}
              >
                {error}
              </Text>

              <Pressable
                onPress={() =>
                  loadEntry(selectedDate)
                }
                style={[
                  styles.retryBtn,
                  {
                    backgroundColor:
                      accent,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.retryText,
                    { color: onAccent },
                  ]}
                >
                  Retry
                </Text>
              </Pressable>
            </View>

          ) : (

            /* Editor */

            <>
              {/* Prompt */}

              {config.hasPrompt &&
              dailyPrompt ? (
                <View
                  style={styles.promptCard}
                >

                  <View
                    style={[
                      styles.promptIcon,
                      {
                        backgroundColor:
                          accent,
                      },
                    ]}
                  >
                    <Sparkles
                      color={onAccent}
                      size={14}
                      strokeWidth={2.4}
                    />
                  </View>

                  <View
                    style={{ flex: 1 }}
                  >
                    <Text
                      style={
                        styles.promptEyebrow
                      }
                    >
                      TODAY'S PROMPT
                    </Text>

                    <Text
                      style={
                        styles.promptText
                      }
                    >
                      {dailyPrompt}
                    </Text>
                  </View>

                </View>
              ) : null}

              {/* Existing entry */}

              {entryId && !isEditing ? (

                <Pressable
                  onPress={() =>
                    setIsEditing(true)
                  }
                  style={
                    styles.savedEntryCard
                  }
                >
                  <Text
                    style={
                      styles.savedEntryText
                    }
                  >
                    {content}
                  </Text>

                  <Text
                    style={[
                      styles.editHint,
                      { color: accent },
                    ]}
                  >
                    Tap to edit
                  </Text>
                </Pressable>

              ) : (

                /* New/editing entry */

                <View
                  style={
                    styles.editorCard
                  }
                >
                  <TextInput
                    value={content}
                    onChangeText={setContent}
                    placeholder={
                      config.placeholder
                    }
                    placeholderTextColor={
                      COLORS.muted
                    }
                    multiline
                    autoFocus={
                      entryId
                        ? true
                        : false
                    }
                    editable={!isFuture}
                    style={[
                      styles.editor,
                      moduleKey ===
                        'morning_pages' &&
                        styles.editorLarge,
                      isFuture &&
                        styles.editorDisabled,
                    ]}
                    textAlignVertical="top"
                  />
                </View>
              )}

              {/* Save feedback */}

              {saveMsg ? (
                <Text
                  style={[
                    styles.saveMsg,
                    { color: accent },
                  ]}
                >
                  {saveMsg}
                </Text>
              ) : null}

              {/* Save button */}

              {(isEditing || !entryId) && (
                <Pressable
                  onPress={onSave}
                  disabled={
                    saving || isFuture
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.saveBtn,
                    {
                      backgroundColor:
                        accent,
                    },
                    (saving ||
                      isFuture) &&
                      styles.saveBtnDisabled,
                    pressed &&
                      styles.saveBtnPressed,
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator
                      size="small"
                      color={onAccent}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.saveBtnText,
                        {
                          color:
                            onAccent,
                        },
                      ]}
                    >
                      {entryId
                        ? 'UPDATE ENTRY'
                        : 'SAVE ENTRY'}
                    </Text>
                  )}
                </Pressable>
              )}

            </>
          )}

        </ScrollView>

      </KeyboardAvoidingView>

    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

type Palette = typeof DARK_PALETTE;

function makeStyles(C: Palette) {
  return StyleSheet.create({

    safe: {
      flex: 1,
      backgroundColor: C.bg,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
    },

    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },

    headerTitle: {
      fontFamily: FONT_XB,
      fontSize: 16,
      letterSpacing: 1.4,
      color: C.text,
    },

    bellBtn: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },

    scroll: {
      padding: 16,
      paddingBottom: 48,
    },

    dateLabel: {
      fontFamily: FONT_SEMI,
      fontSize: 13,
      letterSpacing: 0.4,
      marginBottom: 14,
      textTransform: 'uppercase',
    },

    futureNotice: {
      backgroundColor:
        'rgba(224,82,82,0.08)',
      borderWidth: 1,
      borderColor:
        'rgba(224,82,82,0.35)',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 16,
    },

    futureText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 12.5,
      lineHeight: 18,
      color: C.danger,
    },

    promptCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
    },

    promptIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },

    promptEyebrow: {
      fontFamily: FONT_BOLD,
      fontSize: 9.5,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 4,
    },

    promptText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 13.5,
      lineHeight: 20,
      color: C.text,
    },

    editorCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      minHeight: 220,
    },

    editor: {
      fontFamily: FONT,
      fontSize: 15,
      lineHeight: 23,
      color: C.text,
      minHeight: 180,
      padding: 0,
    },

    editorLarge: {
      fontSize: 16,
      lineHeight: 26,
      minHeight: 320,
    },

    editorDisabled: {
      opacity: 0.5,
    },

    savedEntryCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 16,
      minHeight: 220,
    },

    savedEntryText: {
      fontFamily: FONT,
      fontSize: 15,
      lineHeight: 23,
      color: C.text,
    },

    editHint: {
      fontFamily: FONT_SEMI,
      fontSize: 12,
      marginTop: 14,
      textAlign: 'center',
    },

    saveMsg: {
      fontFamily: FONT_SEMI,
      fontSize: 12.5,
      marginTop: 12,
      textAlign: 'center',
    },

    saveBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 15,
      borderRadius: 14,
      marginTop: 18,
    },

    saveBtnDisabled: {
      opacity: 0.45,
    },

    saveBtnPressed: {
      opacity: 0.82,
    },

    saveBtnText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      letterSpacing: 1.2,
    },

    centerState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 56,
      gap: 14,
    },

    stateText: {
      fontFamily: FONT,
      fontSize: 13.5,
      color: C.muted,
      textAlign: 'center',
    },

    errorText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 13.5,
      color: C.danger,
      textAlign: 'center',
      lineHeight: 19,
    },

    retryBtn: {
      paddingHorizontal: 22,
      paddingVertical: 10,
      borderRadius: 12,
    },

    retryText: {
      fontFamily: FONT_BOLD,
      fontSize: 12.5,
    },

  });
}