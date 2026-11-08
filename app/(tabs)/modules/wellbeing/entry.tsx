import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, MoreVertical, RefreshCw } from 'lucide-react-native';

import { useApp } from '@/components/AppProvider';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

import {
  WellbeingCalendar,
  parseDate,
  todayDate,
} from '@/components/WellbeingCalendar';

/* ------------------------------------------------------------------ */
/* Palettes & Typography                                              */
/* ------------------------------------------------------------------ */

const DARK_PALETTE = {
  bg: '#090909',
  card: '#121212',
  cardBorder: '#000000',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  divider: '#262626',
  danger: '#EF4444',
  inputBg: '#1E1E1E',
};

const LIGHT_PALETTE = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  cardBorder: '#000000',
  text: '#000000',
  muted: '#52525B',
  divider: '#E4E4E7',
  danger: '#EF4444',
  inputBg: '#F4F4F5',
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
      'Let your mind wander onto the page...',
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

function isModuleKey(
  value: unknown,
): value is ModuleKey {
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
/* Date helper                                                        */
/* ------------------------------------------------------------------ */

function prettyDateLabel(
  dateStr: string,
): string {
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

  const {
    isDark,
    accentForeground,
    onAccent,
  } = useApp() as any;

  const { user } = useAuth();

  const accent = accentForeground || '#FDE047';
  const pageBg = accent;

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

  /* ---------------------------------------------------------------- */
  /* Global settings menu                                             */
  /* ---------------------------------------------------------------- */

  const [menuOpen, setMenuOpen] =
    useState<boolean>(false);

  /* ---------------------------------------------------------------- */
  /* Prompt refresh state                                             */
  /* ---------------------------------------------------------------- */

  const [promptIndex, setPromptIndex] =
    useState<number>(0);

  const isFuture = useMemo(
    () => selectedDate > today,
    [selectedDate, today],
  );

  const dailyPrompt = useMemo(() => {
    const list = PROMPT_LISTS[moduleKey];

    if (list.length === 0) {
      return null;
    }

    const dayIndex =
      parseDate(selectedDate).getTime() /
      86_400_000;

    const baseIndex =
      Math.floor(Math.abs(dayIndex)) %
      list.length;

    return list[
      (baseIndex + promptIndex) %
        list.length
    ];
  }, [
    moduleKey,
    selectedDate,
    promptIndex,
  ]);

  const refreshPrompt = useCallback(() => {
    const list = PROMPT_LISTS[moduleKey];

    if (list.length <= 1) {
      return;
    }

    setPromptIndex(prev =>
      (prev + 1) % list.length,
    );
  }, [moduleKey]);

  /* -------------------------------------------------------------- */
  /* Load one entry                                                  */
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
        console.error(
          'FAILED WELLBEING ENTRY LOAD:',
          {
            message: fetchErr.message,
            code: fetchErr.code,
            details: fetchErr.details,
            hint: fetchErr.hint,
            moduleKey,
            dateStr,
            userId: user.id,
          },
        );

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
  /* Load dates for calendar                                         */
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
  /* Initial entry load                                               */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    loadEntry(selectedDate);
  }, [loadEntry, selectedDate]);

  /* -------------------------------------------------------------- */
  /* Calendar dots                                                    */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    loadEntryDates();
  }, [loadEntryDates]);

  /* -------------------------------------------------------------- */
  /* Date selection                                                   */
  /* -------------------------------------------------------------- */

  const onSelectDate = useCallback(
    (date: string) => {
      if (date > today) {
        return;
      }

      setPromptIndex(0);
      setSelectedDate(date);
    },
    [today],
  );

  /* -------------------------------------------------------------- */
  /* Save entry                                                       */
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
        console.error(
          'FAILED WELLBEING ENTRY SAVE:',
          {
            message: upsertErr.message,
            code: upsertErr.code,
            details: upsertErr.details,
            hint: upsertErr.hint,
            moduleKey,
            selectedDate,
            userId: user.id,
          },
        );

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

  /* -------------------------------------------------------------- */
  /* Settings navigation                                             */
  /* -------------------------------------------------------------- */

  const openSettings = useCallback(() => {
    setMenuOpen(false);
    router.push('/(tabs)/profile');
  }, []);

  /* -------------------------------------------------------------- */
  /* Render                                                           */
  /* -------------------------------------------------------------- */

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: pageBg }]}
      edges={['top', 'bottom']}
    >
      <StatusBar barStyle="dark-content" backgroundColor={pageBg} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.8}
          />
        </Pressable>

        <Text style={[styles.headerTitle, { color: '#000000' }]}>
          {config.title}
        </Text>

        <Pressable
          onPress={() =>
            setMenuOpen(prev => !prev)
          }
          style={({ pressed }) => [styles.menuBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
          accessibilityLabel="Open settings menu"
        >
          <MoreVertical
            color="#000000"
            size={24}
            strokeWidth={2.5}
          />
        </Pressable>
      </View>

      {/* Global settings menu */}

      {menuOpen ? (
        <View style={styles.menuShadeOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setMenuOpen(false)}>
            <View style={styles.menuCardWrapper}>
              <View style={styles.shadowBackdrop} />
              <View style={[styles.menuCardBody, { backgroundColor: COLORS.card }]}>
                <Pressable
                  onPress={openSettings}
                  style={styles.menuItem}
                >
                  <Text style={[styles.menuItemText, { color: COLORS.text }]}>
                    Settings
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : 'height'
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
              { color: '#000000' },
            ]}
          >
            {prettyDateLabel(selectedDate)}
          </Text>

          {/* Calendar with forced white background wrapper for calendar component */}

          <View style={styles.cardContainer}>
            <View style={styles.cardShadowBackdrop} />
            <View style={[styles.calendarCardWrapper, { backgroundColor: '#FFFFFF', borderColor: '#000000' }]}>
              <WellbeingCalendar
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
                accent={accent}
                isDark={false}
                entryDates={allEntryDates}
              />
            </View>
          </View>

          {/* Future notice */}

          {isFuture ? (
            <View style={styles.cardContainer}>
              <View style={styles.cardShadowBackdrop} />
              <View
                style={[
                  styles.futureNotice,
                  { backgroundColor: '#FEE2E2', borderColor: '#000000' },
                ]}
              >
                <Text
                  style={styles.futureText}
                >
                  You can only write for today or
                  earlier. Pick a past date to
                  continue.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Loading */}

          {loading ? (
            <View
              style={styles.centerState}
            >
              <ActivityIndicator
                size="large"
                color="#000000"
              />

              <Text
                style={[styles.stateText, { color: '#000000' }]}
              >
                Loading your entry…
              </Text>
            </View>
          ) : error ? (
            /* Error */

            <View style={styles.cardContainer}>
              <View style={styles.cardShadowBackdrop} />
              <View
                style={[
                  styles.centerStateCard,
                  { backgroundColor: '#FEE2E2', borderColor: '#000000' },
                ]}
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
                  style={({ pressed }) => [
                    styles.retryBtn,
                    { backgroundColor: '#000000', borderColor: '#000000' },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text
                    style={[
                      styles.retryText,
                      { color: '#FFFFFF' },
                    ]}
                  >
                    Retry
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            /* Editor */

            <>
              {/* Prompt */}

              {config.hasPrompt &&
              dailyPrompt ? (
                <View style={styles.cardContainer}>
                  <View style={styles.cardShadowBackdrop} />
                  <View
                    style={[
                      styles.promptCard,
                      { backgroundColor: COLORS.card, borderColor: '#000000' },
                    ]}
                  >
                    {/* Refresh prompt button */}

                    <Pressable
                      onPress={refreshPrompt}
                      style={({ pressed }) => [
                        styles.promptIcon,
                        {
                          backgroundColor: accent,
                          borderColor: '#000000',
                        },
                        pressed && styles.pressedBtn,
                      ]}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Refresh prompt"
                    >
                      <RefreshCw
                        color="#000000"
                        size={14}
                        strokeWidth={2.5}
                      />
                    </Pressable>

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
                        style={[
                          styles.promptText,
                          { color: COLORS.text },
                        ]}
                      >
                        {dailyPrompt}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Existing entry */}

              {entryId && !isEditing ? (
                <View style={styles.cardContainer}>
                  <View style={styles.cardShadowBackdrop} />
                  <Pressable
                    onPress={() =>
                      setIsEditing(true)
                    }
                    style={[
                      styles.savedEntryCard,
                      { backgroundColor: COLORS.card, borderColor: '#000000' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.savedEntryText,
                        { color: COLORS.text },
                      ]}
                    >
                      {content}
                    </Text>

                    <Text
                      style={[
                        styles.editHint,
                        { color: '#000000' },
                      ]}
                    >
                      Tap to edit
                    </Text>
                  </Pressable>
                </View>
              ) : (
                /* New/editing entry */

                <View style={styles.cardContainer}>
                  <View style={styles.cardShadowBackdrop} />
                  <View
                    style={[
                      styles.editorCard,
                      { backgroundColor: COLORS.card, borderColor: '#000000' },
                    ]}
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
                      scrollEnabled
                      blurOnSubmit={false}
                      autoFocus={
                        entryId
                          ? true
                          : false
                      }
                      editable={!isFuture}
                      style={[
                        styles.editor,
                        { color: COLORS.text },
                        moduleKey ===
                          'morning_pages' &&
                          styles.editorLarge,
                        isFuture &&
                          styles.editorDisabled,
                      ]}
                      textAlignVertical="top"
                    />
                  </View>
                </View>
              )}

              {/* Save feedback */}

              {saveMsg ? (
                <Text
                  style={[
                    styles.saveMsg,
                    { color: '#000000' },
                  ]}
                >
                  {saveMsg}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* Save / Update button container */}

        {(isEditing || !entryId) && (
          <View style={styles.saveAction}>
            <View style={styles.fabShadowBackdropFull} />
            <Pressable
              onPress={onSave}
              disabled={saving || isFuture}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: '#000000', borderColor: '#000000' },
                (saving || isFuture) &&
                  styles.saveBtnDisabled,
                pressed &&
                  styles.pressedBtn,
              ]}
            >
              {saving ? (
                <ActivityIndicator
                  size="small"
                  color="#FFFFFF"
                />
              ) : (
                <Text
                  style={[
                    styles.saveBtnText,
                    { color: '#FFFFFF' },
                  ]}
                >
                  {entryId
                    ? 'UPDATE ENTRY'
                    : 'SAVE ENTRY'}
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
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

    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#000000',
    },

    headerTitle: {
      fontFamily: FONT_XB,
      fontSize: 22,
      letterSpacing: 1,
    },

    menuBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },

    menuShadeOverlay: {
      position: 'absolute',
      top: 55,
      right: 20,
      zIndex: 1000,
    },

    menuCardWrapper: {
      position: 'relative',
      width: 170,
    },

    shadowBackdrop: {
      position: 'absolute',
      top: 4,
      left: 4,
      right: -4,
      bottom: -4,
      backgroundColor: '#000000',
      borderRadius: 12,
    },

    menuCardBody: {
      borderRadius: 12,
      paddingVertical: 4,
      borderWidth: 2.5,
      borderColor: '#000000',
    },

    menuItem: {
      paddingVertical: 12,
      paddingHorizontal: 16,
    },

    menuItemText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
    },

    scroll: {
      padding: 18,
      paddingBottom: 100,
    },

    dateLabel: {
      fontFamily: FONT_XB,
      fontSize: 14,
      letterSpacing: 0.5,
      marginBottom: 14,
      textTransform: 'uppercase',
    },

    cardContainer: {
      position: 'relative',
      width: '100%',
      marginBottom: 16,
    },

    cardShadowBackdrop: {
      position: 'absolute',
      top: 4,
      left: 4,
      right: -4,
      bottom: -4,
      backgroundColor: '#000000',
      borderRadius: 16,
    },

    calendarCardWrapper: {
      borderRadius: 16,
      borderWidth: 3,
      padding: 12,
      overflow: 'hidden',
    },

    futureNotice: {
      borderWidth: 3,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },

    futureText: {
      fontFamily: FONT_BOLD,
      fontSize: 13,
      lineHeight: 18,
      color: '#DC2626',
    },

    promptCard: {
      flexDirection: 'row',
      gap: 12,
      borderWidth: 3,
      borderRadius: 16,
      padding: 16,
    },

    promptIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      borderWidth: 2,
    },

    promptEyebrow: {
      fontFamily: FONT_XB,
      fontSize: 10,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 4,
    },

    promptText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 14,
      lineHeight: 20,
    },

    editorCard: {
      borderWidth: 3,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 16,
      minHeight: 220,
    },

    editor: {
      fontFamily: FONT,
      fontSize: 15,
      lineHeight: 23,
      minHeight: 180,
      maxHeight: 300,
      padding: 0,
    },

    editorLarge: {
      fontSize: 16,
      lineHeight: 26,
      minHeight: 220,
      maxHeight: 360,
    },

    editorDisabled: {
      opacity: 0.5,
    },

    savedEntryCard: {
      borderWidth: 3,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 16,
      minHeight: 220,
    },

    savedEntryText: {
      fontFamily: FONT,
      fontSize: 15,
      lineHeight: 23,
    },

    editHint: {
      fontFamily: FONT_XB,
      fontSize: 12,
      marginTop: 14,
      textAlign: 'center',
    },

    saveMsg: {
      fontFamily: FONT_XB,
      fontSize: 13,
      marginTop: 12,
      textAlign: 'center',
    },

    saveAction: {
      position: 'relative',
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 20,
    },

    fabShadowBackdropFull: {
      position: 'absolute',
      top: 14,
      left: 22,
      right: 14,
      bottom: 16,
      backgroundColor: '#000000',
      borderRadius: 16,
    },

    saveBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 16,
      borderWidth: 3,
    },

    saveBtnDisabled: {
      opacity: 0.45,
    },

    saveBtnText: {
      fontFamily: FONT_XB,
      fontSize: 15,
      letterSpacing: 1.2,
    },

    centerState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 56,
      gap: 14,
    },

    centerStateCard: {
      borderWidth: 3,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      gap: 14,
    },

    stateText: {
      fontFamily: FONT_BOLD,
      fontSize: 14,
      textAlign: 'center',
    },

    errorText: {
      fontFamily: FONT_BOLD,
      fontSize: 13.5,
      color: '#DC2626',
      textAlign: 'center',
      lineHeight: 19,
    },

    retryBtn: {
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 2,
    },

    retryText: {
      fontFamily: FONT_XB,
      fontSize: 13,
    },
  });
}