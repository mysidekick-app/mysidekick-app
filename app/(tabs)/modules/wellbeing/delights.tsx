import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { router } from 'expo-router';
import { Bell, ChevronLeft, X } from 'lucide-react-native';

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
/* The 9 delights                                                     */
/* ------------------------------------------------------------------ */

type DelightKey =
  | 'walking_around'
  | 'fellowship'
  | 'deliciousness'
  | 'transcendence'
  | 'goofing'
  | 'amelioration'
  | 'coitus'
  | 'enthrallment'
  | 'wildcard';

type Delight = {
  key: DelightKey;
  name: string;
  description: string;
  emoji: string;
};

const DELIGHTS: Delight[] = [
  {
    key: 'walking_around',
    name: 'Walking Around',
    description: 'Getting a bit of exercise.',
    emoji: '🚶',
  },
  {
    key: 'fellowship',
    name: 'Fellowship',
    description: 'Spending time with people.',
    emoji: '🤝',
  },
  {
    key: 'deliciousness',
    name: 'Deliciousness',
    description: 'Consuming something tasty.',
    emoji: '🍽️',
  },
  {
    key: 'transcendence',
    name: 'Transcendence',
    description:
      'Feeling like you’ve “leveled up” or reached a state of extreme delight.',
    emoji: '🌟',
  },
  {
    key: 'goofing',
    name: 'Goofing',
    description: 'Having a laugh.',
    emoji: '😂',
  },
  {
    key: 'amelioration',
    name: 'Amelioration',
    description: 'Improving yourself in some way.',
    emoji: '📈',
  },
  {
    key: 'coitus',
    name: 'Coitus',
    description: 'Sexy times.',
    emoji: '🔥',
  },
  {
    key: 'enthrallment',
    name: 'Enthrallment',
    description: 'Reaching a state of intense focus or engagement.',
    emoji: '🎯',
  },
  {
    key: 'wildcard',
    name: 'WILDCARD',
    description: 'Experience any delight not listed above.',
    emoji: '✨',
  },
];

const DELIGHT_BY_KEY = new Map<DelightKey, Delight>(
  DELIGHTS.map((d) => [d.key, d]),
);

const MODULE_KEY = 'delights';

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
/* Entry row type                                                     */
/* ------------------------------------------------------------------ */

type DelightsEntryRow = {
  id: string;
  delights: DelightKey[] | null;
  content: string | null;
};

/* ================================================================== */
/* Screen                                                             */
/* ================================================================== */

export default function DelightsScreen() {
  const {
    isDark,
    accentForeground,
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

  const [selected, setSelected] =
    useState<Set<DelightKey>>(new Set());

  const [content, setContent] =
    useState<string>('');

  const [loading, setLoading] =
    useState<boolean>(true);

  const [saving, setSaving] =
    useState<boolean>(false);

  const [error, setError] =
    useState<string | null>(null);

  const [saveMsg, setSaveMsg] =
    useState<string | null>(null);

  const [infoOpen, setInfoOpen] =
    useState<boolean>(false);

  const [allEntryDates, setAllEntryDates] =
    useState<Set<string>>(new Set());

  const [savedEntries, setSavedEntries] =
    useState<
      {
        id: string;
        entry_date: string;
        delights: DelightKey[] | null;
        content: string | null;
      }[]
    >([]);

  const isFuture = useMemo(
    () => selectedDate > today,
    [selectedDate, today],
  );

  /* ---------------------------------------------------------------- */
  /* Toggle delight                                                    */
  /* ---------------------------------------------------------------- */

  const toggleDelight = useCallback(
    (key: DelightKey) => {
      setSelected((prev) => {
        const next = new Set(prev);

        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }

        return next;
      });
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /* Load selected date                                               */
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
        setSelected(new Set());
        setContent('');
        setLoading(false);
        return;
      }

      const {
        data,
        error: fetchErr,
      } = await supabase
        .from('wellbeing_entries')
        .select(
          'id, delights, content',
        )
        .eq('user_id', user.id)
        .eq('module_key', MODULE_KEY)
        .eq('entry_date', dateStr)
        .maybeSingle();

      if (fetchErr) {
        console.error(
          'FAILED DELIGHTS ENTRY LOAD:',
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
          `Could not load delights entry: ${fetchErr.message}`,
        );

        setLoading(false);
        return;
      }

      const row =
        data as DelightsEntryRow | null;

      const arr = row?.delights ?? [];

      const valid = Array.isArray(arr)
        ? arr.filter(
            (
              k,
            ): k is DelightKey =>
              DELIGHT_BY_KEY.has(k),
          )
        : [];

      setSelected(new Set(valid));
      setContent(row?.content ?? '');
      setLoading(false);
    },
    [user],
  );

  /* ---------------------------------------------------------------- */
  /* Initial selected-date load                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    loadEntry(selectedDate);
  }, [loadEntry, selectedDate]);

  /* ---------------------------------------------------------------- */
  /* Load entry dates + saved entries                                */
  /* ---------------------------------------------------------------- */

  const loadEntryDates = useCallback(
    async () => {
      if (!user) {
        setAllEntryDates(new Set());
        setSavedEntries([]);
        return;
      }

      const {
        data,
        error: datesErr,
      } = await supabase
        .from('wellbeing_entries')
        .select(
          'id, entry_date, delights, content',
        )
        .eq('user_id', user.id)
        .eq('module_key', MODULE_KEY)
        .order('entry_date', {
          ascending: false,
        });

      if (datesErr) {
        console.error(
          'FAILED DELIGHTS ENTRY DATES LOAD:',
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
              (r: {
                entry_date: string;
              }) => r.entry_date,
            ),
          ),
        );

        setSavedEntries(
          data as {
            id: string;
            entry_date: string;
            delights: DelightKey[] | null;
            content: string | null;
          }[],
        );
      }
    },
    [user],
  );

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
          'You must be signed in to save your delights.',
        );
        return;
      }

      if (selected.size === 0) {
        setSaveMsg(
          'Pick at least one delight before saving.',
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
            delights: Array.from(selected),
            content,
          },
          {
            onConflict:
              'user_id,module_key,entry_date',
          },
        );

      if (upsertErr) {
        console.error(
          'FAILED DELIGHTS SAVE:',
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
          `Could not save your delights: ${upsertErr.message}`,
        );
      } else {
        setSaveMsg('Saved.');
        setError(null);

        await loadEntry(selectedDate);
        await loadEntryDates();
      }

      setSaving(false);
    },
    [
      content,
      isFuture,
      selected,
      selectedDate,
      user,
      loadEntry,
      loadEntryDates,
    ],
  );

  const selectedCount = selected.size;

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
              backgroundColor:
                accent,
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
          DELIGHTS
        </Text>

        <Pressable
          onPress={() =>
            setInfoOpen(true)
          }
          style={styles.infoBtn}
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
          contentContainerStyle={
            styles.scroll
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          {/* Date */}
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
                You can only log
                delights for today
                or earlier. Pick a
                past date to continue.
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
                style={
                  styles.stateText
                }
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
                      color:
                        onAccent,
                    },
                  ]}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Delights grid */}
              <View
                style={
                  styles.selectorCard
                }
              >
                <View
                  style={
                    styles.selectorHeader
                  }
                >
                  <View
                    style={{ flex: 1 }}
                  >
                    <Text
                      style={
                        styles.selectorEyebrow
                      }
                    >
                      THE 9 DELIGHTS
                    </Text>

                    <Text
                      style={
                        styles.selectorHint
                      }
                    >
                      Tap every delight
                      you experienced
                      today.
                    </Text>
                  </View>

                  <Pressable
                    onPress={() =>
                      setInfoOpen(true)
                    }
                    hitSlop={10}
                    accessibilityLabel="About the 9 delights"
                    style={
                      styles.gridInfoBtn
                    }
                  >
                    <Bell
                      color={
                        COLORS.muted
                      }
                      size={16}
                    />
                  </Pressable>
                </View>

                <View
                  style={styles.chipGrid}
                >
                  {DELIGHTS.map((d) => {
                    const isSelected =
                      selected.has(
                        d.key,
                      );

                    return (
                      <View
                        key={d.key}
                        style={
                          styles.chipCell
                        }
                      >
                        <Pressable
                          onPress={() =>
                            !isFuture &&
                            toggleDelight(
                              d.key,
                            )
                          }
                          disabled={
                            isFuture
                          }
                          style={({
                            pressed,
                          }) => [
                            styles.chipBtn,
                            isSelected && {
                              backgroundColor:
                                accent,
                              borderColor:
                                accent,
                            },
                            isFuture &&
                              styles.chipDisabled,
                            pressed &&
                              styles.chipPressed,
                          ]}
                          accessibilityLabel={`Delight: ${d.name}`}
                          accessibilityRole="button"
                        >
                          <Text
                            style={
                              styles.chipEmoji
                            }
                          >
                            {d.emoji}
                          </Text>

                          <Text
                            style={[
                              styles.chipLabel,
                              isSelected && [
                                styles.chipLabelSelected,
                                {
                                  color:
                                    onAccent,
                                },
                              ],
                            ]}
                            numberOfLines={1}
                          >
                            {d.name.toUpperCase()}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>

                {selectedCount > 0 ? (
                  <View
                    style={
                      styles.selectedSummary
                    }
                  >
                    <Text
                      style={
                        styles.selectedText
                      }
                    >
                      {selectedCount} delight
                      {selectedCount === 1
                        ? ''
                        : 's'}{' '}
                      selected.
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Notes */}
              <View
                style={
                  styles.editorCard
                }
              >
                <Text
                  style={
                    styles.editorEyebrow
                  }
                >
                  NOTES
                </Text>

                <TextInput
                  value={content}
                  onChangeText={
                    setContent
                  }
                  placeholder="Add a note about your delights…"
                  placeholderTextColor={
                    COLORS.muted
                  }
                  multiline
                  autoFocus={false}
                  editable={!isFuture}
                  style={[
                    styles.editor,
                    isFuture &&
                      styles.editorDisabled,
                  ]}
                  textAlignVertical="top"
                />
              </View>

              {/* Save feedback */}
              {saveMsg ? (
                <Text
                  style={[
                    styles.saveMsg,
                    {
                      color:
                        accent,
                    },
                  ]}
                >
                  {saveMsg}
                </Text>
              ) : null}

              {/* Save */}
              <Pressable
                onPress={onSave}
                disabled={
                  saving ||
                  isFuture ||
                  selected.size === 0
                }
                style={({ pressed }) => [
                  styles.saveBtn,
                  {
                    backgroundColor:
                      accent,
                  },
                  (saving ||
                    isFuture ||
                    selected.size === 0) &&
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
                    SAVE DELIGHTS
                  </Text>
                )}
              </Pressable>
            </>
          )}

          {/* Saved entries */}
          {savedEntries.length > 0 && (
            <View
              style={styles.savedCard}
            >
              <Text
                style={styles.savedTitle}
              >
                SAVED DELIGHTS
              </Text>

              {savedEntries.map(
                (entry) => {
                  const dlights =
                    (
                      entry.delights ??
                      []
                    ).filter(
                      (
                        k,
                      ): k is DelightKey =>
                        DELIGHT_BY_KEY.has(
                          k,
                        ),
                    );

                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() =>
                        onSelectDate(
                          entry.entry_date,
                        )
                      }
                      style={({
                        pressed,
                      }) => [
                        styles.savedRow,
                        pressed &&
                          styles.savedRowPressed,
                      ]}
                    >
                      <View
                        style={
                          styles.savedDot
                        }
                      />

                      <View
                        style={{
                          flex: 1,
                        }}
                      >
                        <Text
                          style={
                            styles.savedDate
                          }
                        >
                          {shortDateLabel(
                            entry.entry_date,
                          )}
                        </Text>

                        <Text
                          style={
                            styles.savedDelights
                          }
                          numberOfLines={1}
                        >
                          {dlights.length >
                          0
                            ? dlights
                                .map(
                                  (k) =>
                                    DELIGHT_BY_KEY.get(
                                      k,
                                    )?.emoji,
                                )
                                .join(
                                  ' ',
                                )
                            : 'No delights'}
                        </Text>

                        {entry.content ? (
                          <Text
                            style={
                              styles.savedContent
                            }
                            numberOfLines={1}
                          >
                            {entry.content}
                          </Text>
                        ) : null}
                      </View>

                      <Text
                        style={[
                          styles.savedEdit,
                          {
                            color:
                              accent,
                          },
                        ]}
                      >
                        EDIT
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Info bottom sheet */}
      <Modal
        visible={infoOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setInfoOpen(false)
        }
      >
        <View
          style={
            styles.sheetOverlay
          }
        >
          <Pressable
            style={
              StyleSheet.absoluteFill
            }
            onPress={() =>
              setInfoOpen(false)
            }
            accessibilityLabel="Close info sheet"
          />

          <View
            style={
              styles.sheetCard
            }
          >
            <View
              style={
                styles.sheetHeader
              }
            >
              <Text
                style={
                  styles.sheetTitle
                }
              >
                THE 9 DELIGHTS
              </Text>

              <Pressable
                onPress={() =>
                  setInfoOpen(false)
                }
                style={
                  styles.sheetCloseBtn
                }
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <X
                  color={COLORS.text}
                  size={20}
                />
              </Pressable>
            </View>

            <ScrollView
              style={
                styles.sheetScroll
              }
              contentContainerStyle={
                styles.sheetScrollContent
              }
              showsVerticalScrollIndicator={
                false
              }
            >
              {DELIGHTS.map((d) => (
                <View
                  key={d.key}
                  style={
                    styles.sheetRow
                  }
                >
                  <Text
                    style={
                      styles.sheetEmoji
                    }
                  >
                    {d.emoji}
                  </Text>

                  <View
                    style={{ flex: 1 }}
                  >
                    <Text
                      style={
                        styles.sheetName
                      }
                    >
                      {d.name}
                    </Text>

                    <Text
                      style={
                        styles.sheetDesc
                      }
                    >
                      {d.description}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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

    infoBtn: {
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
      marginBottom: 16,
    },

    selectorHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 16,
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
      lineHeight: 17,
    },

    gridInfoBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      marginTop: 2,
    },

    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -5,
    },

    chipCell: {
      width: '33.3333%',
      paddingHorizontal: 5,
      paddingVertical: 5,
    },

    chipBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 6,
      gap: 6,
    },

    chipPressed: {
      opacity: 0.85,
    },

    chipDisabled: {
      opacity: 0.4,
    },

    chipEmoji: {
      fontSize: 24,
      lineHeight: 28,
    },

    chipLabel: {
      fontFamily: FONT_BOLD,
      fontSize: 9,
      letterSpacing: 0.6,
      color: C.muted,
      textAlign: 'center',
    },

    chipLabelSelected: {},

    selectedSummary: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: C.divider,
    },

    selectedText: {
      fontFamily: FONT_MEDIUM,
      fontSize: 13,
      color: C.text,
      textAlign: 'center',
    },

    editorCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      minHeight: 160,
    },

    editorEyebrow: {
      fontFamily: FONT_BOLD,
      fontSize: 11,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 10,
    },

    editor: {
      fontFamily: FONT,
      fontSize: 15,
      lineHeight: 22,
      color: C.text,
      minHeight: 100,
      padding: 0,
    },

    editorDisabled: {
      opacity: 0.5,
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

    sheetOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor:
        'rgba(0,0,0,0.6)',
    },

    sheetCard: {
      backgroundColor: C.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: C.cardBorder,
      maxHeight: '82%',
    },

    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
    },

    sheetTitle: {
      fontFamily: FONT_XB,
      fontSize: 15,
      letterSpacing: 1.3,
      color: C.text,
    },

    sheetCloseBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: C.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },

    sheetScroll: {
      flexShrink: 1,
    },

    sheetScrollContent: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      paddingBottom: 36,
    },

    sheetRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
    },

    sheetEmoji: {
      fontSize: 24,
      lineHeight: 28,
      width: 34,
      textAlign: 'center',
    },

    sheetName: {
      fontFamily: FONT_SEMI,
      fontSize: 14,
      color: C.text,
      marginBottom: 3,
    },

    sheetDesc: {
      fontFamily: FONT,
      fontSize: 12.5,
      color: C.muted,
      lineHeight: 18,
    },

    savedCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 16,
      padding: 16,
      marginTop: 22,
    },

    savedTitle: {
      fontFamily: FONT_BOLD,
      fontSize: 11,
      letterSpacing: 1.3,
      color: C.muted,
      marginBottom: 14,
    },

    savedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
    },

    savedRowPressed: {
      opacity: 0.7,
    },

    savedDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.muted,
    },

    savedDate: {
      fontFamily: FONT_SEMI,
      fontSize: 12.5,
      color: C.text,
    },

    savedDelights: {
      fontFamily: FONT,
      fontSize: 11,
      color: C.muted,
      marginTop: 2,
    },

    savedContent: {
      fontFamily: FONT,
      fontSize: 11,
      color: C.muted,
      marginTop: 2,
      fontStyle: 'italic',
    },

    savedEdit: {
      fontFamily: FONT_BOLD,
      fontSize: 10,
      letterSpacing: 0.8,
    },
  });
}