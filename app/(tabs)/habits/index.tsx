import { useCallback, useEffect, useState } from 'react';

import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Check,
  ChevronRight,
  Flame,
  Plus,
  X,
} from 'lucide-react-native';

import { router } from 'expo-router';

import { PageHeader } from '@/components/PageHeader';

import { DatePickerInput } from '@/components/DatePickerInput';

import { useApp } from '@/components/AppProvider';

import { supabase } from '@/lib/supabase';

type Habit = {
  id: string;
  name: string;
  category: string;
  duration_minutes: number | null;
  current_streak: number;
  checkpoint: number;
  trophies_earned: number;
  freezes_held: number;
};

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

const CATEGORIES = [
  'Mind',
  'Body',
  'Health',
  'Rest',
  'Focus',
];

const todayStr = () => {
  const d = new Date();

  return `${d.getFullYear()}-${String(
    d.getMonth() + 1
  ).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function HabitsScreen() {
  const {
    accentForeground,
    isDark,
    onAccent,
  } = useApp();

  const [habits, setHabits] = useState<Habit[]>([]);

  const [completedToday, setCompletedToday] =
    useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);

  const [name, setName] = useState('');

  const [category, setCategory] = useState('Mind');

  const [duration, setDuration] = useState('');

  const [checkpoint, setCheckpoint] = useState('5');

  const [startDate, setStartDate] = useState(todayStr());

  const [endDate, setEndDate] = useState('');

  const [saving, setSaving] = useState(false);

  /*
   * ---------------------------------------------------------
   * CALCULATE CURRENT CONTINUOUS STREAK
   * ---------------------------------------------------------
   *
   * The streak is based ONLY on actual completion records.
   *
   * Example:
   *
   * Aug 18  ✅
   * Aug 19  ✅
   * Aug 20  ❌
   * Aug 21  ❌
   * Aug 22  ✅
   *
   * Current streak = 1
   *
   * The old Aug 18-19 streak does not carry over.
   */
  const calculateCurrentStreak = async (
    habitId: string
  ): Promise<number> => {
    const { data, error } = await supabase
      .from('habit_completions')
      .select('completed_on')
      .eq('habit_id', habitId)
      .order('completed_on', {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    const dates = (data ?? [])
      .map(
        (row: { completed_on: string }) =>
          row.completed_on
      )
      .filter(Boolean);

    if (dates.length === 0) {
      return 0;
    }

    const today = todayStr();

    /*
     * The current streak must include today.
     *
     * If today has not been completed, the current streak
     * is zero.
     */
    if (dates[0] !== today) {
      return 0;
    }

    let streak = 1;

    let previousDate = new Date(
      `${today}T00:00:00`
    );

    for (let i = 1; i < dates.length; i++) {
      const currentDate = new Date(
        `${dates[i]}T00:00:00`
      );

      const difference =
        (previousDate.getTime() -
          currentDate.getTime()) /
        (1000 * 60 * 60 * 24);

      /*
       * We only continue if the previous completion was
       * exactly one calendar day before the current one.
       */
      if (difference !== 1) {
        break;
      }

      streak += 1;

      previousDate = currentDate;
    }

    return streak;
  };

  /*
   * ---------------------------------------------------------
   * LOAD HABITS
   * ---------------------------------------------------------
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const today = todayStr();

    const [
      {
        data: habitRows,
        error: habitErr,
      },
      {
        data: compRows,
        error: compErr,
      },
    ] = await Promise.all([
      supabase
        .from('habits')
        .select(
          'id, name, category, duration_minutes, current_streak, checkpoint, trophies_earned, freezes_held'
        )
        .order('created_at', {
          ascending: true,
        }),

      supabase
        .from('habit_completions')
        .select('habit_id')
        .eq('completed_on', today),
    ]);

    console.log('HABITS ERROR:', habitErr);
    console.log(
      'HABIT COMPLETIONS ERROR:',
      compErr
    );

    if (habitErr || compErr) {
      setError(
        'Your habits could not be loaded.'
      );

      setLoading(false);
      return;
    }

    const loadedHabits =
      (habitRows ?? []) as Habit[];

    setHabits(loadedHabits);

    setCompletedToday(
      new Set(
        (compRows ?? []).map(
          (row: { habit_id: string }) =>
            row.habit_id
        )
      )
    );

    /*
     * Recalculate current streaks when loading.
     *
     * This is important because a missed day should
     * automatically break the current streak even if
     * the old current_streak value is still stored.
     */
    const updatedHabits =
      await Promise.all(
        loadedHabits.map(async (habit) => {
          try {
            const streak =
              await calculateCurrentStreak(
                habit.id
              );

            const trophies = Math.floor(
              streak /
                Math.max(
                  Number(habit.checkpoint) || 1,
                  1
                )
            );

            /*
             * Only update the database when the stored
             * values are different.
             */
            if (
              streak !== habit.current_streak ||
              trophies !== habit.trophies_earned
            ) {
              await supabase
                .from('habits')
                .update({
                  current_streak: streak,
                  trophies_earned: trophies,
                })
                .eq('id', habit.id);
            }

            return {
              ...habit,
              current_streak: streak,
              trophies_earned: trophies,
            };
          } catch (err) {
            console.log(
              'STREAK LOAD ERROR:',
              habit.id,
              err
            );

            return habit;
          }
        })
      );

    setHabits(updatedHabits);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * ---------------------------------------------------------
   * COMPLETE / UNDO TODAY
   * ---------------------------------------------------------
   */
  const toggleToday = async (
    habit: Habit
  ) => {
    const today = todayStr();

    const isDone =
      completedToday.has(habit.id);

    setError(null);

    /*
     * =======================================================
     * UNDO TODAY
     * =======================================================
     */
    if (isDone) {
      /*
       * Remove today's completion.
       */
      const {
        error: delErr,
      } = await supabase
        .from('habit_completions')
        .delete()
        .eq('habit_id', habit.id)
        .eq('completed_on', today);

      if (delErr) {
        console.log(
          'UNDO HABIT ERROR:',
          delErr
        );

        setError(
          'Could not undo completion.'
        );

        return;
      }

      /*
       * Remove today from the local completed set.
       */
      setCompletedToday((current) => {
        const next = new Set(current);

        next.delete(habit.id);

        return next;
      });

      /*
       * Recalculate from the remaining history.
       *
       * Since today was removed, the current streak
       * becomes zero under the "streak must include today"
       * rule.
       */
      let newStreak = 0;

      try {
        newStreak =
          await calculateCurrentStreak(
            habit.id
          );
      } catch (err) {
        console.log(
          'STREAK RECALCULATION ERROR:',
          err
        );

        setError(
          'Could not recalculate streak.'
        );

        return;
      }

      const newTrophies = Math.floor(
        newStreak /
          Math.max(
            Number(habit.checkpoint) || 1,
            1
          )
      );

      /*
       * Save the new streak.
       */
      const {
        error: updateErr,
      } = await supabase
        .from('habits')
        .update({
          current_streak: newStreak,
          trophies_earned: newTrophies,
        })
        .eq('id', habit.id);

      if (updateErr) {
        console.log(
          'HABIT STREAK UPDATE ERROR:',
          updateErr
        );

        setError(
          'Could not update streak.'
        );

        return;
      }

      /*
       * Update UI.
       */
      setHabits((current) =>
        current.map((h) =>
          h.id === habit.id
            ? {
                ...h,
                current_streak:
                  newStreak,
                trophies_earned:
                  newTrophies,
              }
            : h
        )
      );

      return;
    }

    /*
     * =======================================================
     * COMPLETE TODAY
     * =======================================================
     */

    /*
     * Insert today's completion.
     *
     * The database unique constraint should prevent
     * duplicate completions for the same habit/day.
     */
    const {
      error: insErr,
    } = await supabase
      .from('habit_completions')
      .insert({
        habit_id: habit.id,
        completed_on: today,
      });

    if (insErr) {
      console.log(
        'COMPLETE HABIT ERROR:',
        insErr
      );

      /*
       * PostgreSQL duplicate key error.
       */
      if (
        insErr.code === '23505' ||
        insErr.message
          ?.toLowerCase()
          .includes('duplicate')
      ) {
        setCompletedToday((current) => {
          const next = new Set(current);

          next.add(habit.id);

          return next;
        });

        setError(
          'This habit is already completed today.'
        );
      } else {
        setError(
          'Could not mark complete.'
        );
      }

      return;
    }

    /*
     * Mark today's habit complete immediately.
     */
    setCompletedToday((current) => {
      const next = new Set(current);

      next.add(habit.id);

      return next;
    });

    /*
     * Calculate the streak from the ACTUAL completion
     * history.
     *
     * We do not do:
     *
     * current_streak + 1
     *
     * because that would incorrectly preserve streaks
     * across missed days.
     */
    let newStreak = 0;

    try {
      newStreak =
        await calculateCurrentStreak(
          habit.id
        );
    } catch (err) {
      console.log(
        'STREAK RECALCULATION ERROR:',
        err
      );

      setError(
        'Could not calculate streak.'
      );

      return;
    }

    /*
     * Calculate trophies from the current streak.
     */
    const newTrophies = Math.floor(
      newStreak /
        Math.max(
          Number(habit.checkpoint) || 1,
          1
        )
    );

    /*
     * Save the calculated values.
     */
    const {
      error: updateErr,
    } = await supabase
      .from('habits')
      .update({
        current_streak: newStreak,
        trophies_earned: newTrophies,
      })
      .eq('id', habit.id);

    if (updateErr) {
      console.log(
        'HABIT UPDATE ERROR:',
        updateErr
      );

      setError(
        'Could not update streak.'
      );

      return;
    }

    /*
     * Update the UI.
     */
    setHabits((current) =>
      current.map((h) =>
        h.id === habit.id
          ? {
              ...h,
              current_streak:
                newStreak,
              trophies_earned:
                newTrophies,
            }
          : h
      )
    );
  };

  /*
   * ---------------------------------------------------------
   * NEW HABIT
   * ---------------------------------------------------------
   */
  const openNew = () => {
    setName('');
    setCategory('Mind');
    setDuration('');
    setCheckpoint('5');
    setStartDate(todayStr());
    setEndDate('');
    setError(null);
    setModalOpen(true);
  };

  /*
   * ---------------------------------------------------------
   * SAVE HABIT
   * ---------------------------------------------------------
   */
  const saveHabit = async () => {
    if (!name.trim()) {
      setError(
        'Give your habit a name.'
      );
      return;
    }

    if (!startDate.trim()) {
      setError(
        'Pick a start date.'
      );
      return;
    }

    setSaving(true);
    setError(null);

    const dur = duration.trim()
      ? parseInt(duration, 10)
      : null;

    const cp = checkpoint.trim()
      ? parseInt(checkpoint, 10)
      : 5;

    const {
      data,
      error: saveErr,
    } = await supabase
      .from('habits')
      .insert({
        name: name.trim(),
        category,
        duration_minutes: dur,
        checkpoint: cp,
        start_date: startDate,
        end_date: endDate || null,
        current_streak: 0,
        trophies_earned: 0,
      })
      .select(
        'id, name, category, duration_minutes, current_streak, checkpoint, trophies_earned, freezes_held'
      )
      .maybeSingle();

    if (saveErr || !data) {
      console.log(
        'SAVE HABIT ERROR:',
        saveErr
      );

      setError(
        'The habit could not be saved.'
      );
    } else {
      setHabits((current) => [
        ...current,
        data as Habit,
      ]);

      setModalOpen(false);
    }

    setSaving(false);
  };

  /*
   * ---------------------------------------------------------
   * SUMMARY
   * ---------------------------------------------------------
   */
  const totalDone =
    completedToday.size;

  const totalHabits =
    habits.length;

  /*
   * ---------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------
   */
  return (
    <SafeAreaView
      style={[
        styles.safe,
        isDark && styles.safeDark,
      ]}
    >
      <PageHeader
        title="Habits"
        showBell
        onBack={() =>
          router.push('/modules')
        }
      />

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {error && (
          <Text style={styles.error}>
            {error}
          </Text>
        )}

        {/* TODAY PROGRESS */}
        <View
          style={[
            styles.progressCard,
            isDark && styles.cardDark,
          ]}
        >
          <View
            style={styles.progressTop}
          >
            <Text
              style={[
                styles.progressLabel,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              Today
            </Text>

            <Text
              style={[
                styles.progressCount,
                {
                  color:
                    accentForeground,
                },
              ]}
            >
              {totalDone}/
              {totalHabits}
            </Text>
          </View>

          <View
            style={[
              styles.progressTrack,
              isDark &&
                styles.trackDark,
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${
                    totalHabits
                      ? (totalDone /
                          totalHabits) *
                        100
                      : 0
                  }%`,
                  backgroundColor:
                    accentForeground,
                },
              ]}
            />
          </View>

          <Text
            style={[
              styles.progressHint,
              isDark &&
                styles.darkMuted,
            ]}
          >
            Keep going — every check-in
            grows your streak.
          </Text>
        </View>

        {/* LOADING */}
        {loading ? (
          <Text
            style={[
              styles.emptyText,
              isDark &&
                styles.darkMuted,
            ]}
          >
            Loading your habits...
          </Text>
        ) : habits.length === 0 ? (
          /* EMPTY */
          <View style={styles.empty}>
            <Text
              style={[
                styles.emptyText,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              No habits yet. Tap + to
              create your first one.
            </Text>
          </View>
        ) : (
          /* HABIT LIST */
          <View
            style={[
              styles.list,
              isDark &&
                styles.cardDark,
            ]}
          >
            {habits.map(
              (habit, i) => {
                const done =
                  completedToday.has(
                    habit.id
                  );

                return (
                  <View
                    key={habit.id}
                    style={[
                      styles.row,
                      i <
                        habits.length -
                          1 &&
                        styles.rowBorder,
                      isDark &&
                        styles.rowBorderDark,
                    ]}
                  >
                    {/* CHECK */}
                    <Pressable
                      onPress={() =>
                        toggleToday(
                          habit
                        )
                      }
                      style={[
                        styles.check,
                        done && {
                          backgroundColor:
                            accentForeground,
                          borderColor:
                            accentForeground,
                        },
                      ]}
                      hitSlop={8}
                    >
                      {done && (
                        <Check
                          color={
                            onAccent
                          }
                          size={15}
                        />
                      )}
                    </Pressable>

                    {/* HABIT NAME */}
                    <Pressable
                      onPress={() =>
                        toggleToday(
                          habit
                        )
                      }
                      style={
                        styles.rowCopy
                      }
                      hitSlop={4}
                    >
                      <Text
                        style={[
                          styles.habitName,
                          isDark &&
                            styles.darkText,
                          done &&
                            styles.doneName,
                        ]}
                      >
                        {habit.name}
                      </Text>

                      <Text
                        style={[
                          styles.habitMeta,
                          isDark &&
                            styles.darkMuted,
                        ]}
                      >
                        {habit.category}

                        {habit.duration_minutes
                          ? `  ·  ${habit.duration_minutes} min`
                          : ''}

                        {'  ·  '}

                        {
                          habit.trophies_earned
                        }{' '}
                        🏆
                      </Text>
                    </Pressable>

                    {/* STREAK */}
                    <View
                      style={
                        styles.streakBadge
                      }
                    >
                      <Flame
                        color={
                          done
                            ? accentForeground
                            : isDark
                            ? '#555'
                            : '#C8C5BE'
                        }
                        size={14}
                      />

                      <Text
                        style={[
                          styles.streakText,
                          {
                            color: done
                              ? accentForeground
                              : isDark
                              ? '#AAA59D'
                              : '#89857D',
                          },
                        ]}
                      >
                        {
                          habit.current_streak
                        }
                      </Text>
                    </View>

                    {/* DETAILS */}
                    <Pressable
                      onPress={() =>
                        router.push(
                          `/habits/${habit.id}`
                        )
                      }
                      style={
                        styles.chevron
                      }
                      hitSlop={8}
                    >
                      <ChevronRight
                        color={
                          isDark
                            ? '#666'
                            : '#C8C5BE'
                        }
                        size={20}
                      />
                    </Pressable>
                  </View>
                );
              }
            )}
          </View>
        )}
      </ScrollView>

      {/* FLOATING PLUS */}
      <Pressable
        onPress={openNew}
        style={[
          styles.fab,
          {
            backgroundColor:
              accentForeground,
          },
        ]}
        hitSlop={12}
      >
        <Plus
          color={onAccent}
          size={26}
          strokeWidth={2.6}
        />
      </Pressable>

      {/* NEW HABIT MODAL */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setModalOpen(false)
        }
      >
        <View
          style={
            styles.modalShade
          }
        >
          <View
            style={[
              styles.modalCard,
              isDark &&
                styles.modalDark,
            ]}
          >
            <View
              style={
                styles.modalTitleRow
              }
            >
              <Text
                style={[
                  styles.modalTitle,
                  isDark &&
                    styles.darkText,
                ]}
              >
                New habit
              </Text>

              <Pressable
                onPress={() =>
                  setModalOpen(
                    false
                  )
                }
              >
                <X
                  color={
                    isDark
                      ? '#F4F2EE'
                      : '#5A5751'
                  }
                  size={21}
                />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={
                false
              }
              style={{
                maxHeight: 400,
              }}
            >
              {/* TITLE */}
              <Text
                style={[
                  styles.label,
                  isDark &&
                    styles.darkMuted,
                ]}
              >
                Title
              </Text>

              <TextInput
                value={name}
                onChangeText={
                  setName
                }
                placeholder="e.g. Morning meditation"
                placeholderTextColor="#9B978F"
                style={[
                  styles.input,
                  isDark &&
                    styles.inputDark,
                ]}
                autoFocus
              />

              {/* CATEGORY */}
              <Text
                style={[
                  styles.label,
                  isDark &&
                    styles.darkMuted,
                ]}
              >
                Category
              </Text>

              <View
                style={
                  styles.catRow
                }
              >
                {CATEGORIES.map(
                  (c) => (
                    <Pressable
                      key={c}
                      onPress={() =>
                        setCategory(c)
                      }
                      style={[
                        styles.catChip,
                        category ===
                          c && {
                            backgroundColor:
                              accentForeground,
                            borderColor:
                              accentForeground,
                          },
                      ]}
                    >
                      <Text
                        style={[
                          styles.catText,
                          isDark &&
                            styles.darkMuted,
                          category ===
                            c && {
                            color:
                              onAccent,
                            fontFamily:
                              FONT_SEMI,
                          },
                        ]}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>

              {/* DURATION */}
              <Text
                style={[
                  styles.label,
                  isDark &&
                    styles.darkMuted,
                ]}
              >
                Duration (minutes,
                optional)
              </Text>

              <TextInput
                value={duration}
                onChangeText={
                  setDuration
                }
                placeholder="15"
                placeholderTextColor="#9B978F"
                style={[
                  styles.input,
                  isDark &&
                    styles.inputDark,
                ]}
                keyboardType="numeric"
              />

              {/* CHECKPOINT */}
              <Text
                style={[
                  styles.label,
                  isDark &&
                    styles.darkMuted,
                ]}
              >
                Checkpoint (days per
                trophy)
              </Text>

              <TextInput
                value={checkpoint}
                onChangeText={
                  setCheckpoint
                }
                placeholder="5"
                placeholderTextColor="#9B978F"
                style={[
                  styles.input,
                  isDark &&
                    styles.inputDark,
                ]}
                keyboardType="numeric"
              />

              {/* START DATE */}
              <Text
                style={[
                  styles.label,
                  isDark &&
                    styles.darkMuted,
                ]}
              >
                Start date
              </Text>

              <DatePickerInput
                value={startDate}
                onChange={
                  setStartDate
                }
                accent={
                  accentForeground
                }
                onAccent={
                  onAccent
                }
                isDark={isDark}
              />

              {/* END DATE */}
              <Text
                style={[
                  styles.label,
                  isDark &&
                    styles.darkMuted,
                ]}
              >
                End date (optional)
              </Text>

              <DatePickerInput
                value={endDate}
                onChange={
                  setEndDate
                }
                accent={
                  accentForeground
                }
                onAccent={
                  onAccent
                }
                isDark={isDark}
                placeholder="No end date"
              />
            </ScrollView>

            {/* SAVE */}
            <Pressable
              disabled={saving}
              onPress={
                saveHabit
              }
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  {
                    color:
                      onAccent,
                  },
                ]}
              >
                {saving
                  ? 'Saving...'
                  : 'Add habit'}
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
    backgroundColor: '#FBFAF8',
  },

  safeDark: {
    backgroundColor: '#090909',
  },

  content: {
    padding: 16,
    paddingBottom: 90,
  },

  darkText: {
    color: '#F4F2EE',
  },

  darkMuted: {
    color: '#AAA59D',
  },

  error: {
    fontFamily: FONT_MED,
    color: '#C53A2F',
    fontSize: 13,
    marginBottom: 10,
  },

  progressCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    padding: 18,
    marginBottom: 16,
  },

  cardDark: {
    backgroundColor: '#111',
    borderColor: '#2A2A2A',
  },

  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },

  progressLabel: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
    color: '#77746E',
  },

  progressCount: {
    fontFamily: FONT_BOLD,
    fontSize: 22,
  },

  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F0EEEA',
    marginTop: 12,
    overflow: 'hidden',
  },

  trackDark: {
    backgroundColor: '#222',
  },

  progressFill: {
    height: 8,
    borderRadius: 4,
  },

  progressHint: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#908B83',
    marginTop: 10,
  },

  list: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    paddingHorizontal: 14,
  },

  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },

  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0EEEA',
  },

  rowBorderDark: {
    borderBottomColor: '#292929',
  },

  check: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#D8D5CE',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rowCopy: {
    flex: 1,
    gap: 3,
  },

  habitName: {
    fontFamily: FONT_MED,
    fontSize: 15,
    color: '#27241F',
  },

  doneName: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },

  habitMeta: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#908B83',
  },

  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },

  streakText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  chevron: {
    paddingLeft: 4,
  },

  empty: {
    paddingVertical: 40,
    alignItems: 'center',
  },

  emptyText: {
    fontFamily: FONT,
    fontSize: 14,
    color: '#908B83',
    textAlign: 'center',
  },

  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalShade: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor:
      'rgba(0,0,0,0.45)',
  },

  modalCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 34,
    maxHeight: '92%',
  },

  modalDark: {
    backgroundColor: '#161616',
  },

  modalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  modalTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    color: '#27241F',
  },

  label: {
    fontFamily: FONT_MED,
    fontSize: 13,
    color: '#77746E',
    marginTop: 12,
    marginBottom: 6,
  },

  input: {
    borderWidth: 1,
    borderColor: '#E1DED8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: FONT,
    fontSize: 15,
    color: '#282724',
  },

  inputDark: {
    backgroundColor: '#1E1E1E',
    borderColor: '#363636',
    color: '#F4F2EE',
  },

  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2DFD9',
    backgroundColor: '#FFF',
  },

  catText: {
    fontFamily: FONT,
    fontSize: 13,
    color: '#77746E',
  },

  saveButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },

  saveText: {
    fontFamily: FONT_SEMI,
    fontSize: 15,
  },
});