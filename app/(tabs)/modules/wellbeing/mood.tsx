import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { router } from 'expo-router';
import { Bell, ChevronLeft } from 'lucide-react-native';

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
/* Mood config                                                        */
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
  MOOD_OPTIONS.map((m) => [m.value, m]),
);

const MODULE_KEY = 'mood_tracker';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
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
/* Entry row types                                                    */
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
/* Screen                                                             */
/* ================================================================== */

export default function MoodTrackerScreen() {
  const {
    isDark,
    accentForeground,
    accentWash,
    onAccent,
  } = useApp();

  const { user } = useAuth();

  const accent = accentForeground;
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

  const isFuture = useMemo(
    () => selectedDate > today,
    [selectedDate, today],
  );

  /* ---------------------------------------------------------------- */
  /* Load existing entry for selected date                            */
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
  /* Load last 7 mood entries                                        */
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
  /* Load all entry dates for calendar dots                           */
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
  /* Initial / dependent loads                                       */
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
  /* Date selection                                                   */
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
    <View style={styles.safe}>

      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: 28 },
        ]}
      >
        <Pressable
          onPress={() =>
            router.push('/modules')
          }
          style={[
            styles.backBtn,
            {
              backgroundColor: accent,
            },
          ]}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.4}
          />
        </Pressable>

        <Text
          style={styles.headerTitle}
        >
          MOOD TRACKER
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
            { color: accent },
          ]}
        >
          {prettyDateLabel(
            selectedDate,
          )}
        </Text>

        {/* Calendar */}
        <WellbeingCalendar
          selectedDate={selectedDate}
          onSelectDate={
            onSelectDate
          }
          accent={accent}
          isDark={isDark}
          entryDates={
            allEntryDates
          }
        />

        {/* Future notice */}
        {isFuture ? (
          <View
            style={
              styles.futureNotice
            }
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
        ) : null}

        {/* Loading / error / selector */}
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
                loadEntry(
                  selectedDate,
                )
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
                  {
                    color: onAccent,
                  },
                ]}
              >
                Retry
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Selector card */}
            <View
              style={
                styles.selectorCard
              }
            >
              <Text
                style={
                  styles.selectorEyebrow
                }
              >
                HOW ARE YOU FEELING?
              </Text>

              <Text
                style={
                  styles.selectorHint
                }
              >
                Tap the mood that best
                matches your day.
              </Text>

              <View
                style={styles.moodRow}
              >
                {MOOD_OPTIONS.map(
                  (opt) => {
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
                          isSelected && {
                            backgroundColor:
                              accent,
                            borderColor:
                              accent,
                          },
                          isFuture &&
                            styles.moodBtnDisabled,
                          pressed &&
                            styles.moodBtnPressed,
                        ]}
                        accessibilityLabel={`Mood: ${opt.label}`}
                      >
                        <Text
                          style={
                            styles.moodEmoji
                          }
                        >
                          {opt.emoji}
                        </Text>

                        <Text
                          style={[
                            styles.moodLabel,
                            isSelected && [
                              styles.moodLabelSelected,
                              {
                                color:
                                  onAccent,
                              },
                            ],
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
                  style={
                    styles.selectedSummary
                  }
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
                    style={
                      styles.selectedText
                    }
                  >
                    Feeling{' '}
                    {selectedMood.label.toLowerCase()}{' '}
                    today.
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Save feedback */}
            {saveMsg ? (
              <Text
                style={[
                  styles.saveMsg,
                  {
                    color: accent,
                  },
                ]}
              >
                {saveMsg}
              </Text>
            ) : null}

            {/* Save button */}
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
                  backgroundColor:
                    accent,
                },
                (saving ||
                  isFuture ||
                  moodValue === null) &&
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
                  SAVE MOOD
                </Text>
              )}
            </Pressable>

            {/* History card */}
            <View
              style={
                styles.historyCard
              }
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
                  style={
                    styles.historyCount
                  }
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
                    style={
                      styles.historyStateText
                    }
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
                    style={[
                      styles.retryBtnSmall,
                      {
                        backgroundColor:
                          accent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.retryText,
                        {
                          color:
                            onAccent,
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
                    style={
                      styles.historyStateText
                    }
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
                    (row) => {
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
                            isCurrent && [
                              styles.historyRowCurrent,
                              {
                                backgroundColor:
                                  accentWash,
                              },
                            ],
                          ]}
                        >
                          <Text
                            style={
                              styles.historyEmoji
                            }
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
                              style={
                                styles.historyDate
                              }
                            >
                              {shortDateLabel(
                                row.entry_date,
                              )}
                            </Text>

                            <Text
                              style={
                                styles.historyMoodLabel
                              }
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
                                    accent,
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
          </>
        )}
      </ScrollView>
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

    selectorCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 16,
      padding: 16,
      marginBottom: 4,
    },

    selectorEyebrow: {
      fontFamily: FONT_BOLD,
      fontSize: 11,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 4,
    },

    selectorHint: {
      fontFamily: FONT,
      fontSize: 12.5,
      color: C.muted,
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
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 14,
      paddingVertical: 14,
      gap: 6,
    },

    moodBtnPressed: {
      opacity: 0.85,
    },

    moodBtnDisabled: {
      opacity: 0.4,
    },

    moodEmoji: {
      fontSize: 26,
      lineHeight: 30,
    },

    moodLabel: {
      fontFamily: FONT_BOLD,
      fontSize: 9.5,
      letterSpacing: 0.8,
      color: C.muted,
    },

    moodLabelSelected: {},

    selectedSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: C.divider,
    },

    selectedEmoji: {
      fontSize: 22,
      lineHeight: 26,
    },

    selectedText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 13,
      color: C.text,
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

    historyCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 16,
      padding: 16,
      marginTop: 22,
    },

    historyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },

    historyTitle: {
      fontFamily: FONT_BOLD,
      fontSize: 11,
      letterSpacing: 1.3,
      color: C.muted,
    },

    historyCount: {
      fontFamily: FONT_MEDIUM,
      fontSize: 10.5,
      letterSpacing: 0.6,
      color: C.muted,
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
      borderBottomColor: C.divider,
    },

    historyRowCurrent: {
      borderRadius: 10,
      paddingHorizontal: 8,
      marginHorizontal: -8,
      borderBottomColor: 'transparent',
    },

    historyEmoji: {
      fontSize: 22,
      lineHeight: 26,
      width: 30,
      textAlign: 'center',
    },

    historyDate: {
      fontFamily: FONT_SEMI,
      fontSize: 12.5,
      color: C.text,
    },

    historyMoodLabel: {
      fontFamily: FONT,
      fontSize: 11,
      color: C.muted,
      marginTop: 2,
    },

    historyCurrentTag: {
      fontFamily: FONT_BOLD,
      fontSize: 9.5,
      letterSpacing: 1,
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

    retryBtnSmall: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 10,
      marginTop: 4,
    },

    retryText: {
      fontFamily: FONT_BOLD,
      fontSize: 12.5,
    },

    historyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 24,
      gap: 10,
    },

    historyStateText: {
      fontFamily: FONT,
      fontSize: 12.5,
      color: C.muted,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
}