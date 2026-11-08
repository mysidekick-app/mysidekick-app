import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ChevronLeft, MoreVertical } from 'lucide-react-native';

import { useApp } from '@/components/AppProvider';

import { useAuth } from '@/components/AuthProvider';

import { supabase } from '@/lib/supabase';

import {
  WellbeingCalendar,
  parseDate,
  todayDate,
} from '@/components/WellbeingCalendar';

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
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
/* Mood config                                                         */
/* ------------------------------------------------------------------ */

type MoodLevel = 1 | 2 | 3 | 4 | 5;

type MoodOption = {
  value: MoodLevel;
  label: string;
  emoji: string;
};

const MOOD_OPTIONS: MoodOption[] = [
  { value: 1, label: 'Awful', emoji: '😞' },
  { value: 2, label: 'Low', emoji: '😕' },
  { value: 3, label: 'Okay', emoji: '😐' },
  { value: 4, label: 'Good', emoji: '🙂' },
  { value: 5, label: 'Great', emoji: '😄' },
];

const MOOD_BY_VALUE = new Map<MoodLevel, MoodOption>(
  MOOD_OPTIONS.map(m => [m.value, m]),
);

const MODULE_KEY = 'mood_tracker';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function prettyDateLabel(dateStr: string): string {
  const d = parseDate(dateStr);

  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function shortDateLabel(dateStr: string): string {
  const d = parseDate(dateStr);

  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/* ------------------------------------------------------------------ */
/* Entry row types                                                      */
/* ------------------------------------------------------------------ */

type MoodEntryRow = {
  id: string;
  mood_value: number | null;
};

type HistoryRow = {
  id: string;
  entry_date: string;
  mood_value: number | null;
};

/* ================================================================== */
/* Screen                                                              */
/* ================================================================== */

export default function MoodTrackerScreen() {
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

  const [moodValue, setMoodValue] =
    useState<MoodLevel | null>(null);

  const [loading, setLoading] =
    useState<boolean>(true);

  const [saving, setSaving] =
    useState<boolean>(false);

  const [error, setError] =
    useState<string | null>(null);

  const [saveMsg, setSaveMsg] =
    useState<string | null>(null);

  const [history, setHistory] =
    useState<HistoryRow[]>([]);

  const [historyLoading, setHistoryLoading] =
    useState<boolean>(true);

  const [historyError, setHistoryError] =
    useState<string | null>(null);

  const [allEntryDates, setAllEntryDates] =
    useState<Set<string>>(new Set());

  const [menuOpen, setMenuOpen] =
    useState(false);

  const isFuture = useMemo(
    () => selectedDate > today,
    [selectedDate, today],
  );

  /* ---------------------------------------------------------------- */
  /* Settings menu                                                     */
  /* ---------------------------------------------------------------- */

  const openSettings = useCallback(() => {
    setMenuOpen(false);
    router.push('/(tabs)/profile');
  }, []);

  /* ---------------------------------------------------------------- */
  /* Load existing entry for selected date                             */
  /* ---------------------------------------------------------------- */

  const loadEntry = useCallback(
    async (dateStr: string) => {
      setLoading(true);
      setError(null);
      setSaveMsg(null);

      if (!user) {
        setError(
          'You must be signed in to use this module.',
        );

        setMoodValue(null);
        setLoading(false);
        return;
      }

      const {
        data,
        error: fetchErr,
      } = await supabase
        .from('wellbeing_entries')
        .select('id, mood_value')
        .eq('user_id', user.id)
        .eq('module_key', MODULE_KEY)
        .eq('entry_date', dateStr)
        .maybeSingle();

      if (fetchErr) {
        console.error(
          'FAILED MOOD ENTRY LOAD:',
          {
            message: fetchErr.message,
            code: fetchErr.code,
            details: fetchErr.details,
            hint: fetchErr.hint,
            moduleKey: MODULE_KEY,
            dateStr,
            userId: user.id,
          },
        );

        setError(
          `Could not load mood entry: ${fetchErr.message}`,
        );

        setLoading(false);
        return;
      }

      const row =
        data as MoodEntryRow | null;

      const v = row?.mood_value;

      setMoodValue(
        v !== null &&
          v !== undefined &&
          v >= 1 &&
          v <= 5
          ? (v as MoodLevel)
          : null,
      );

      setLoading(false);
    },
    [user],
  );

  /* ---------------------------------------------------------------- */
  /* Load last 7 mood entries                                         */
  /* ---------------------------------------------------------------- */

  const loadHistory = useCallback(
    async () => {
      setHistoryLoading(true);
      setHistoryError(null);

      if (!user) {
        setHistory([]);
        setHistoryLoading(false);
        return;
      }

      const {
        data,
        error: histErr,
      } = await supabase
        .from('wellbeing_entries')
        .select(
          'id, entry_date, mood_value',
        )
        .eq('user_id', user.id)
        .eq('module_key', MODULE_KEY)
        .order('entry_date', {
          ascending: false,
        })
        .limit(7);

      if (histErr) {
        console.error(
          'FAILED MOOD HISTORY LOAD:',
          {
            message: histErr.message,
            code: histErr.code,
            details: histErr.details,
            hint: histErr.hint,
          },
        );

        setHistoryError(
          `Could not load your mood history: ${histErr.message}`,
        );

        setHistoryLoading(false);
        return;
      }

      setHistory(
        (data ?? []) as HistoryRow[],
      );

      setHistoryLoading(false);
    },
    [user],
  );

  /* ---------------------------------------------------------------- */
  /* Load all entry dates for calendar dots                            */
  /* ---------------------------------------------------------------- */

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
        .eq('module_key', MODULE_KEY);

      if (datesErr) {
        console.error(
          'FAILED MOOD ENTRY DATES LOAD:',
          {
            message: datesErr.message,
            code: datesErr.code,
            details: datesErr.details,
            hint: datesErr.hint,
          },
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
    [user],
  );

  /* ---------------------------------------------------------------- */
  /* Initial / dependent loads                                        */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    loadEntry(selectedDate);
  }, [loadEntry, selectedDate]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    loadEntryDates();
  }, [loadEntryDates]);

  /* ---------------------------------------------------------------- */
  /* Date selection                                                    */
  /* ---------------------------------------------------------------- */

  const onSelectDate = useCallback(
    (date: string) => {
      if (date > today) {
        return;
      }

      setSelectedDate(date);
    },
    [today],
  );

  /* ---------------------------------------------------------------- */
  /* Save                                                              */
  /* ---------------------------------------------------------------- */

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
          'You must be signed in to save a mood.',
        );

        return;
      }

      if (moodValue === null) {
        setSaveMsg(
          'Pick a mood before saving.',
        );

        return;
      }

      setSaving(true);
      setSaveMsg(null);
      setError(null);

      const {
        error: upsertErr,
      } = await supabase
        .from('wellbeing_entries')
        .upsert(
          {
            user_id: user.id,
            module_key: MODULE_KEY,
            entry_date: selectedDate,
            mood_value: moodValue,
            content: '',
          },
          {
            onConflict:
              'user_id,module_key,entry_date',
          },
        );

      if (upsertErr) {
        console.error(
          'FAILED MOOD SAVE:',
          {
            message: upsertErr.message,
            code: upsertErr.code,
            details: upsertErr.details,
            hint: upsertErr.hint,
            moduleKey: MODULE_KEY,
            selectedDate,
            userId: user.id,
          },
        );

        setError(
          `Could not save your mood: ${upsertErr.message}`,
        );
      } else {
        setSaveMsg('Saved.');
        setError(null);

        await loadHistory();
        await loadEntryDates();
        await loadEntry(selectedDate);
      }

      setSaving(false);
    },
    [
      isFuture,
      moodValue,
      selectedDate,
      user,
      loadHistory,
      loadEntryDates,
      loadEntry,
    ],
  );

  const selectedMood =
    moodValue !== null
      ? MOOD_BY_VALUE.get(
          moodValue,
        ) ?? null
      : null;

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: pageBg }]}
      edges={['top', 'bottom']}
    >
      <StatusBar barStyle="dark-content" backgroundColor={pageBg} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: 12 },
        ]}
      >
        <Pressable
          onPress={() =>
            router.push('/(tabs)/modules/wellbeing')
          }
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

        <Text
          style={[styles.headerTitle, { color: '#000000' }]}
        >
          MOOD TRACKER
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

      <ScrollView
        contentContainerStyle={
          styles.scroll
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* Date label */}
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
              onSelectDate={
                onSelectDate
              }
              accent={accent}
              isDark={false}
              entryDates={
                allEntryDates
              }
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
                style={
                  styles.futureText
                }
              >
                You can only log a mood
                for today or earlier.
                Pick a past date to
                continue.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Loading / error / selector */}
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
                  loadEntry(
                    selectedDate,
                  )
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
                    {
                      color: '#FFFFFF',
                    },
                  ]}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            {/* Selector card */}
            <View style={styles.cardContainer}>
              <View style={styles.cardShadowBackdrop} />
              <View
                style={[
                  styles.selectorCard,
                  { backgroundColor: COLORS.card, borderColor: '#000000' },
                ]}
              >
                <Text
                  style={
                    styles.selectorEyebrow
                  }
                >
                  HOW ARE YOU FEELING?
                </Text>

                <Text
                  style={[
                    styles.selectorHint,
                    { color: COLORS.muted },
                  ]}
                >
                  Tap the mood that best
                  matches your day.
                </Text>

                <View
                  style={styles.moodRow}
                >
                  {MOOD_OPTIONS.map(
                    opt => {
                      const isSelected =
                        moodValue ===
                        opt.value;

                      return (
                        <Pressable
                          key={
                            opt.value
                          }
                          onPress={() =>
                            !isFuture &&
                            setMoodValue(
                              opt.value,
                            )
                          }
                          disabled={
                            isFuture
                          }
                          style={({
                            pressed,
                          }) => [
                            styles.moodBtn,
                            {
                              backgroundColor: isSelected ? accent : COLORS.inputBg,
                              borderColor: '#000000',
                            },
                            isFuture &&
                              styles.moodBtnDisabled,
                            pressed &&
                              styles.pressedBtn,
                          ]}
                          accessibilityLabel={`Mood: ${opt.label}`}
                        >
                          <Text
                            style={
                              styles.moodEmoji
                            }
                          >
                            {
                              opt.emoji
                            }
                          </Text>

                          <Text
                            style={[
                              styles.moodLabel,
                              { color: isSelected ? '#000000' : COLORS.muted },
                            ]}
                          >
                            {opt.label.toUpperCase()}
                          </Text>
                        </Pressable>
                      );
                    },
                  )}
                </View>

                {selectedMood ? (
                  <View
                    style={[
                      styles.selectedSummary,
                      { borderTopColor: COLORS.divider },
                    ]}
                  >
                    <Text
                      style={
                        styles.selectedEmoji
                      }
                    >
                      {
                        selectedMood.emoji
                      }
                    </Text>

                    <Text
                      style={[
                        styles.selectedText,
                        { color: COLORS.text },
                      ]}
                    >
                      Feeling{' '}
                      {selectedMood.label.toLowerCase()}{' '}
                      today.
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

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

            {/* Save button container with full shadow */}
            <View style={styles.cardContainer}>
              <View style={styles.cardShadowBackdrop} />
              <Pressable
                onPress={onSave}
                disabled={
                  saving ||
                  isFuture ||
                  moodValue === null
                }
                style={({ pressed }) => [
                  styles.saveBtn,
                  {
                    backgroundColor: '#000000',
                    borderColor: '#000000',
                  },
                  (saving ||
                    isFuture ||
                    moodValue === null) &&
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
                      {
                        color: '#FFFFFF',
                      },
                    ]}
                  >
                    SAVE MOOD
                  </Text>
                )}
              </Pressable>
            </View>

            {/* History card */}
            <View style={styles.cardContainer}>
              <View style={styles.cardShadowBackdrop} />
              <View
                style={[
                  styles.historyCard,
                  { backgroundColor: COLORS.card, borderColor: '#000000' },
                ]}
              >
                <View
                  style={
                    styles.historyHeader
                  }
                >
                  <Text
                    style={
                      styles.historyTitle
                    }
                  >
                    RECENT MOODS
                  </Text>

                  <Text
                    style={[
                      styles.historyCount,
                      { color: COLORS.muted },
                    ]}
                  >
                    Last 7
                  </Text>
                </View>

                {historyLoading ? (
                  <View
                    style={
                      styles.historyState
                    }
                  >
                    <ActivityIndicator
                      size="small"
                      color={
                        COLORS.muted
                      }
                    />

                    <Text
                      style={[
                        styles.historyStateText,
                        { color: COLORS.muted },
                      ]}
                    >
                      Loading history…
                    </Text>
                  </View>
                ) : historyError ? (
                  <View
                    style={
                      styles.historyState
                    }
                  >
                    <Text
                      style={
                        styles.errorText
                      }
                    >
                      {historyError}
                    </Text>

                    <Pressable
                      onPress={
                        loadHistory
                      }
                      style={({ pressed }) => [
                        styles.retryBtnSmall,
                        {
                          backgroundColor: '#000000',
                          borderColor: '#000000',
                        },
                        pressed && styles.pressedBtn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.retryText,
                          {
                            color: '#FFFFFF',
                          },
                        ]}
                      >
                        Retry
                      </Text>
                    </Pressable>
                  </View>
                ) : history.length === 0 ? (
                  <View
                    style={
                      styles.historyState
                    }
                  >
                    <Text
                      style={[
                        styles.historyStateText,
                        { color: COLORS.muted },
                      ]}
                    >
                      No moods logged yet.
                      Save your first
                      entry above.
                    </Text>
                  </View>
                ) : (
                  <View
                    style={
                      styles.historyList
                    }
                  >
                    {history.map(
                      row => {
                        const mv =
                          row.mood_value;

                        const mood =
                          mv !== null &&
                          mv !== undefined &&
                          mv >= 1 &&
                          mv <= 5
                            ? MOOD_BY_VALUE.get(
                                mv as MoodLevel,
                              )
                            : null;

                        const isCurrent =
                          row.entry_date ===
                          selectedDate;

                        return (
                          <View
                            key={row.id}
                            style={[
                              styles.historyRow,
                              { borderBottomColor: COLORS.divider },
                              isCurrent && [
                                styles.historyRowCurrent,
                                {
                                  backgroundColor: accent,
                                  borderColor: '#000000',
                                  borderWidth: 2,
                                },
                              ],
                            ]}
                          >
                            <Text
                              style={[
                                styles.historyEmoji,
                                isCurrent && {
                                  color:
                                    '#000000',
                                },
                              ]}
                            >
                              {mood
                                ? mood.emoji
                                : '—'}
                            </Text>

                            <View
                              style={{
                                flex: 1,
                              }}
                            >
                              <Text
                                style={[
                                  styles.historyDate,
                                  { color: COLORS.text },
                                  isCurrent && {
                                    color:
                                      '#000000',
                                  },
                                ]}
                              >
                                {shortDateLabel(
                                  row.entry_date,
                                )}
                              </Text>

                              <Text
                                style={[
                                  styles.historyMoodLabel,
                                  { color: COLORS.muted },
                                  isCurrent && {
                                    color:
                                      '#000000',
                                  },
                                ]}
                              >
                                {mood
                                  ? mood.label
                                  : 'Unknown'}
                              </Text>
                            </View>

                            {isCurrent ? (
                              <Text
                                style={[
                                  styles.historyCurrentTag,
                                  {
                                    color:
                                      '#000000',
                                  },
                                ]}
                              >
                                NOW
                              </Text>
                            ) : null}
                          </View>
                        );
                      },
                    )}
                  </View>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
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

    menuItemPressed: {
      opacity: 0.6,
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

    selectorCard: {
      borderWidth: 3,
      borderRadius: 16,
      padding: 16,
    },

    selectorEyebrow: {
      fontFamily: FONT_XB,
      fontSize: 11,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 4,
    },

    selectorHint: {
      fontFamily: FONT,
      fontSize: 12.5,
      marginBottom: 16,
      lineHeight: 17,
    },

    moodRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
    },

    moodBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderRadius: 12,
      paddingVertical: 14,
      gap: 6,
    },

    moodBtnDisabled: {
      opacity: 0.4,
    },

    moodEmoji: {
      fontSize: 26,
      lineHeight: 30,
    },

    moodLabel: {
      fontFamily: FONT_XB,
      fontSize: 9.5,
      letterSpacing: 0.8,
    },

    selectedSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
      paddingTop: 14,
      borderTopWidth: 2,
    },

    selectedEmoji: {
      fontSize: 22,
      lineHeight: 26,
    },

    selectedText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 13,
    },

    saveMsg: {
      fontFamily: FONT_XB,
      fontSize: 13,
      marginTop: 12,
      textAlign: 'center',
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

    historyCard: {
      borderWidth: 3,
      borderRadius: 16,
      padding: 16,
    },

    historyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },

    historyTitle: {
      fontFamily: FONT_XB,
      fontSize: 11,
      letterSpacing: 1.3,
      color: C.muted,
    },

    historyCount: {
      fontFamily: FONT_BOLD,
      fontSize: 10.5,
      letterSpacing: 0.6,
    },

    historyList: {
      gap: 2,
    },

    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
    },

    historyRowCurrent: {
      borderRadius: 10,
      paddingHorizontal: 8,
      marginHorizontal: -8,
      borderBottomWidth: 2,
    },

    historyEmoji: {
      fontSize: 22,
      lineHeight: 26,
      width: 30,
      textAlign: 'center',
    },

    historyDate: {
      fontFamily: FONT_BOLD,
      fontSize: 12.5,
    },

    historyMoodLabel: {
      fontFamily: FONT_MEDIUM,
      fontSize: 11,
      marginTop: 2,
    },

    historyCurrentTag: {
      fontFamily: FONT_XB,
      fontSize: 9.5,
      letterSpacing: 1,
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

    retryBtnSmall: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 10,
      marginTop: 4,
      borderWidth: 2,
    },

    retryText: {
      fontFamily: FONT_XB,
      fontSize: 13,
    },

    historyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 24,
      gap: 10,
    },

    historyStateText: {
      fontFamily: FONT_BOLD,
      fontSize: 12.5,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
}