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
  ChevronLeft,
  ChevronRight,
  Flame,
  MoreVertical,
  Plus,
  X,
} from 'lucide-react-native';

import { router } from 'expo-router';

import { DatePickerInput } from '@/components/DatePickerInput';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

type Habit = {
  id: string;
  name: string;
  category: string;
  duration_minutes: number | null;
  frequency: HabitFrequency;
  current_streak: number;
  checkpoint: number;
  trophies_earned: number;
  freezes_held: number;
};

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

type HabitFrequency = 'daily' | 'weekly' | 'monthly' | 'annually';

const FREQUENCIES: { value: HabitFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
];

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const year = d.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getPeriodKey(dateString: string, frequency: HabitFrequency): string {
  const d = new Date(`${dateString}T00:00:00`);
  if (frequency === 'daily') return dateString;
  if (frequency === 'weekly') return getWeekKey(d);
  if (frequency === 'monthly') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return String(d.getFullYear());
}

function getFrequencyUnit(frequency: HabitFrequency): string {
  if (frequency === 'weekly') return 'week';
  if (frequency === 'monthly') return 'month';
  if (frequency === 'annually') return 'year';
  return 'day';
}

function getDefaultCheckpoint(frequency: HabitFrequency): string {
  if (frequency === 'weekly') return '4';
  if (frequency === 'monthly') return '3';
  if (frequency === 'annually') return '1';
  return '5';
}



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
    d.getMonth() + 1,
  ).padStart(2, '0')}-${String(d.getDate()).padStart(
    2,
    '0',
  )}`;
};

function periodBounds(key: string, frequency: HabitFrequency): [string, string] {
  const start = frequency === 'daily'
    ? new Date(`${key}T00:00:00`)
    : frequency === 'monthly'
    ? new Date(`${key}-01T00:00:00`)
    : frequency === 'annually'
    ? new Date(`${key}-01-01T00:00:00`)
    : (() => {
        const [y, w] = key.split('-W').map(Number);
        const jan4 = new Date(y, 0, 4);
        const day = jan4.getDay() || 7;
        const monday = new Date(jan4);
        monday.setDate(jan4.getDate() - day + 1 + (w - 1) * 7);
        return monday;
      })();

  const end = new Date(start);
  if (frequency === 'weekly') end.setDate(end.getDate() + 6);
  if (frequency === 'monthly') end.setMonth(end.getMonth() + 1, 0);
  if (frequency === 'annually') end.setFullYear(end.getFullYear(), 11, 31);

  const format = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  return [format(start), format(end)];
}

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
  const [error, setError] =
    useState<string | null>(null);

  const [modalOpen, setModalOpen] =
    useState(false);

  const [settingsMenuOpen, setSettingsMenuOpen] =
    useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] =
    useState('Mind');
  const [frequencyFilter, setFrequencyFilter] = useState<HabitFrequency>('daily');
  const [frequency, setFrequency] = useState<HabitFrequency>('daily');
  const [checkpoint, setCheckpoint] = useState('5');
  const [startDate, setStartDate] =
    useState(todayStr());
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

  const calculateCurrentStreak = async (habit: Habit): Promise<number> => {
    const { data, error } = await supabase
      .from('habit_completions')
      .select('completed_on')
      .eq('habit_id', habit.id)
      .order('completed_on', { ascending: false });

    if (error) throw error;

    const periods = Array.from(
      new Set((data ?? []).map((row: { completed_on: string }) =>
        getPeriodKey(row.completed_on, habit.frequency),
      )),
    );
    if (!periods.length) return 0;

    const current = getPeriodKey(todayStr(), habit.frequency);
    if (periods[0] !== current) return 0;

    const startOfPeriod = (key: string): Date => {
      if (habit.frequency === 'daily') return new Date(`${key}T00:00:00`);
      if (habit.frequency === 'monthly') return new Date(`${key}-01T00:00:00`);
      if (habit.frequency === 'annually') return new Date(`${key}-01-01T00:00:00`);
      const [y, w] = key.split('-W').map(Number);
      const jan4 = new Date(y, 0, 4);
      const day = jan4.getDay() || 7;
      const monday = new Date(jan4);
      monday.setDate(jan4.getDate() - day + 1 + (w - 1) * 7);
      return monday;
    };

    const gap = (a: Date, b: Date): number => {
      if (habit.frequency === 'daily') return Math.round((a.getTime() - b.getTime()) / 86400000);
      if (habit.frequency === 'weekly') return Math.round((a.getTime() - b.getTime()) / (86400000 * 7));
      if (habit.frequency === 'monthly') return (a.getFullYear() - b.getFullYear()) * 12 + a.getMonth() - b.getMonth();
      return a.getFullYear() - b.getFullYear();
    };

    let streak = 1;
    let previous = startOfPeriod(periods[0]);
    for (let i = 1; i < periods.length; i++) {
      const current = startOfPeriod(periods[i]);
      if (gap(previous, current) !== 1) break;
      streak++;
      previous = current;
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
          'id, name, category, duration_minutes, frequency, current_streak, checkpoint, trophies_earned, freezes_held',
        )
        .order('created_at', {
          ascending: true,
        }),

      supabase
        .from('habit_completions')
        .select('habit_id, completed_on')
        .order('completed_on', { ascending: false }),
    ]);

    console.log('HABITS ERROR:', habitErr);

    console.log(
      'HABIT COMPLETIONS ERROR:',
      compErr,
    );

    if (habitErr || compErr) {
      setError(
        'Your habits could not be loaded.',
      );

      setLoading(false);
      return;
    }

    const loadedHabits =
      (habitRows ?? []) as Habit[];

    setHabits(loadedHabits);

    setCompletedToday(
      new Set(
        (compRows ?? [])
          .filter((row: { habit_id: string; completed_on: string }) => {
            const h = loadedHabits.find((habit) => habit.id === row.habit_id);
            return h
              ? getPeriodKey(row.completed_on, h.frequency) ===
                  getPeriodKey(today, h.frequency)
              : false;
          })
          .map((row: { habit_id: string }) => row.habit_id),
      ),
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
              await calculateCurrentStreak(habit);

            const trophies = Math.floor(
              streak /
                Math.max(
                  Number(habit.checkpoint) || 1,
                  1,
                ),
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
              err,
            );

            return habit;
          }
        }),
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
    habit: Habit,
  ) => {
    const today = todayStr();
    const currentPeriod = getPeriodKey(today, habit.frequency);

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
        .gte('completed_on', periodBounds(currentPeriod, habit.frequency)[0])
        .lte('completed_on', periodBounds(currentPeriod, habit.frequency)[1]);

      if (delErr) {
        console.log(
          'UNDO HABIT ERROR:',
          delErr,
        );

        setError(
          'Could not undo completion.',
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
            habit,
          );
      } catch (err) {
        console.log(
          'STREAK RECALCULATION ERROR:',
          err,
        );

        setError(
          'Could not recalculate streak.',
        );

        return;
      }

      const newTrophies = Math.floor(
        newStreak /
          Math.max(
            Number(habit.checkpoint) || 1,
            1,
          ),
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
          updateErr,
        );

        setError(
          'Could not update streak.',
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
            : h,
        ),
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
        insErr,
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
          'This habit is already completed for this period.',
        );
      } else {
        setError(
          'Could not mark complete.',
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
          habit,
        );
    } catch (err) {
      console.log(
        'STREAK RECALCULATION ERROR:',
        err,
      );

      setError(
        'Could not calculate streak.',
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
          1,
        ),
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
        updateErr,
      );

      setError(
        'Could not update streak.',
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
          : h,
      ),
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
    setFrequency('daily');
    setCheckpoint(getDefaultCheckpoint('daily'));
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
        'Give your habit a name.',
      );

      return;
    }

    if (!startDate.trim()) {
      setError(
        'Pick a start date.',
      );

      return;
    }

    setSaving(true);
    setError(null);

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
        frequency,
        checkpoint: cp,
        start_date: startDate,
        end_date: endDate || null,
        current_streak: 0,
        trophies_earned: 0,
      })
      .select(
        'id, name, category, duration_minutes, frequency, current_streak, checkpoint, trophies_earned, freezes_held',
      )
      .maybeSingle();

    if (saveErr || !data) {
      console.log(
        'SAVE HABIT ERROR:',
        saveErr,
      );

      setError(
        'The habit could not be saved.',
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

  const visibleHabits = habits.filter(
    (habit) => habit.frequency === frequencyFilter,
  );

  const totalDone = visibleHabits.filter(
    (habit) => completedToday.has(habit.id),
  ).length;

  const totalHabits = visibleHabits.length;

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
      <View
        style={[
          styles.header,
          isDark && styles.headerDark,
        ]}
      >
        <Pressable
          onPress={() => {
            setSettingsMenuOpen(false);
            router.push('/modules');
          }}
          style={[
            styles.backButton,
            {
              backgroundColor:
                accentForeground,
            },
          ]}
          hitSlop={8}
        >
          <ChevronLeft
            color={onAccent}
            size={21}
            strokeWidth={2.5}
          />
        </Pressable>

        <Text
          style={[
            styles.headerTitle,
            {
              color:
                isDark ? '#FFFFFF' : accentForeground,
            },
          ]}
        >
          HABITS
        </Text>

        <Pressable
          onPress={() =>
            setSettingsMenuOpen(
              (current) => !current,
            )
          }
          style={styles.menuButton}
          hitSlop={8}
        >
          <MoreVertical
            color={
              isDark
                ? '#F4F2EE'
                : '#5A5751'
            }
            size={22}
            strokeWidth={2.2}
          />
        </Pressable>

        {settingsMenuOpen && (
          <View
            style={[
              styles.settingsMenu,
              isDark &&
                styles.settingsMenuDark,
            ]}
          >
            <Pressable
              onPress={() => {
                setSettingsMenuOpen(
                  false,
                );
                router.push('/(tabs)/profile');
              }}
              style={
                styles.settingsMenuItem
              }
            >
              <Text
                style={[
                  styles.settingsMenuText,
                  isDark &&
                    styles.darkText,
                ]}
              >
                Settings
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <Text style={styles.error}>
            {error}
          </Text>
        )}

        <View style={[styles.frequencyCard, isDark && styles.cardDark]}>
          {FREQUENCIES.map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setFrequencyFilter(item.value)}
              style={[
                styles.frequencyChip,
                frequencyFilter === item.value && {
                  backgroundColor: accentForeground,
                  borderColor: accentForeground,
                },
              ]}
            >
              <Text
                style={[
                  styles.frequencyText,
                  isDark && styles.darkMuted,
                  frequencyFilter === item.value && {
                    color: onAccent,
                    fontFamily: FONT_SEMI,
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

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
              {frequencyFilter === 'daily' ? 'Today' : frequencyFilter === 'weekly' ? 'This week' : frequencyFilter === 'monthly' ? 'This month' : 'This year'}
            </Text>

            <Text
              style={[
                styles.progressCount,
                {
                  color: isDark
                    ? '#FFFFFF'
                    : accentForeground,
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
                    isDark
                      ? '#000000'
                      : accentForeground,
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
        ) : visibleHabits.length === 0 ? (
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
            {visibleHabits.map(
              (habit, i) => {
                const done =
                  completedToday.has(
                    habit.id,
                  );

                return (
                  <View
                    key={habit.id}
                    style={[
                      styles.row,
                      i <
                        visibleHabits.length -
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
                          habit,
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
                          color={onAccent}
                          size={15}
                        />
                      )}
                    </Pressable>

                    {/* HABIT NAME */}

                    <Pressable
                      onPress={() =>
                        router.push(
                          `/habits/${habit.id}`,
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
                            styles.darkText,
                        ]}
                      >
                        {habit.category}

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
                          isDark
                            ? '#FFFFFF'
                            : done
                            ? accentForeground
                            : '#C8C5BE'
                        }
                        size={14}
                      />

                      <Text
                        style={[
                          styles.streakText,
                          {
                            color: isDark
                              ? '#FFFFFF'
                              : done
                              ? accentForeground
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
                          `/habits/${habit.id}`,
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
              },
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
                  setModalOpen(false)
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
                onChangeText={setName}
                placeholder="e.g. Morning meditation"
                placeholderTextColor="#9B978F"
                style={[
                  styles.input,
                  isDark &&
                    styles.inputDark,
                ]}
                autoFocus
              />

              <Text
                style={[
                  styles.label,
                  isDark && styles.darkMuted,
                ]}
              >
                How frequently would you like to track this habit?
              </Text>

              <View style={styles.frequencyFormRow}>
                {FREQUENCIES.map((item) => (
                  <Pressable
                    key={item.value}
                    onPress={() => {
                      setFrequency(item.value);
                      setCheckpoint(getDefaultCheckpoint(item.value));
                    }}
                    style={[
                      styles.frequencyFormChip,
                      frequency === item.value && {
                        backgroundColor: accentForeground,
                        borderColor: accentForeground,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.frequencyText,
                        isDark && styles.darkMuted,
                        frequency === item.value && {
                          color: onAccent,
                          fontFamily: FONT_SEMI,
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

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
                style={styles.catRow}
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
                  ),
                )}
              </View>


              {/* CHECKPOINT */}

              <Text
                style={[
                  styles.label,
                  isDark &&
                    styles.darkMuted,
                ]}
              >
                Checkpoint
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
                onChange={setStartDate}
                accent={
                  accentForeground
                }
                onAccent={onAccent}
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
                onChange={setEndDate}
                accent={
                  accentForeground
                }
                onAccent={onAccent}
                isDark={isDark}
                placeholder="No end date"
              />
            </ScrollView>

            {/* SAVE */}

            <Pressable
              disabled={saving}
              onPress={saveHabit}
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
                    color: onAccent,
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

  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE9E4',
    zIndex: 100,
  },

  headerDark: {
    borderBottomColor: '#292929',
  },

  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 17,
    color: '#27241F',
    letterSpacing: 0.2,
  },

  menuButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  settingsMenu: {
    position: 'absolute',
    top: 68,
    right: 16,
    minWidth: 150,
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E2DC',
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 8,
    zIndex: 1000,
  },

  settingsMenuDark: {
    backgroundColor: '#181818',
    borderColor: '#303030',
  },

  settingsMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  settingsMenuText: {
    fontFamily: FONT_MED,
    fontSize: 14,
    color: '#27241F',
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

  frequencyCard: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    padding: 6,
    marginBottom: 12,
  },

  frequencyChip: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 8,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  frequencyText: {
    fontFamily: FONT_MED,
    fontSize: 12,
    color: '#77746E',
    textAlign: 'center',
  },

  frequencyFormRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  frequencyFormChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2DFD9',
    backgroundColor: '#FFF',
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
    backgroundColor: '#FFFFFF',
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
    bottom: 30,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 6,
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