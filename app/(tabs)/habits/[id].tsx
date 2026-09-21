import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ChevronLeft,
  Edit3,
  Flame,
  Trash2,
  MessageCircle,
  X,
} from 'lucide-react-native';

import {
  useLocalSearchParams,
  router,
} from 'expo-router';

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
  created_at: string;
  checkpoint: number;
  trophies_earned: number;
  freezes_held: number;
  start_date: string | null;
  end_date: string | null;
};

type Completion = {
  completed_on: string;
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

function getCheckpointLabel(frequency: HabitFrequency): string {
  if (frequency === 'weekly') return 'Checkpoint (every number of months)';
  if (frequency === 'monthly') return 'Checkpoint (every number of months)';
  if (frequency === 'annually') return 'Checkpoint (every number of years)';
  return 'Checkpoint (every number of days)';
}



const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

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
  ).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);

  return new Date(y, m - 1, d);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(
    d.getMonth() + 1
  ).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export default function HabitDetailScreen() {
  const { id, frequency: routeFrequency } =
    useLocalSearchParams<{ id: string; frequency?: HabitFrequency }>();

  const {
    accentForeground,
    isDark,
    onAccent,
  } = useApp();


  const [habit, setHabit] =
    useState<Habit | null>(null);

  const [completions, setCompletions] =
    useState<Set<string>>(new Set());

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [toast, setToast] =
    useState<string | null>(null);

  const [editModalOpen, setEditModalOpen] =
    useState(false);
  const [editName, setEditName] =
    useState('');
  const [editCategory, setEditCategory] =
    useState('Mind');
  const [editFrequency, setEditFrequency] =
    useState<HabitFrequency>('daily');
  const [editCheckpoint, setEditCheckpoint] =
    useState('5');
  const [editStartDate, setEditStartDate] =
    useState('');
  const [editEndDate, setEditEndDate] =
    useState('');
  const [savingEdit, setSavingEdit] =
    useState(false);

  const load = useCallback(async () => {
    if (!id) return;

    setLoading(true);

    const [
      { data: h, error: hErr },
      { data: comps, error: cErr },
    ] = await Promise.all([
      supabase
        .from('habits')
        .select(
          'id, name, category, duration_minutes, frequency, current_streak, created_at, checkpoint, trophies_earned, freezes_held, start_date, end_date'
        )
        .eq('id', id)
        .maybeSingle(),

      supabase
        .from('habit_completions')
        .select('completed_on')
        .eq('habit_id', id)
        .order('completed_on', {
          ascending: false,
        }),
    ]);

    if (hErr || cErr || !h) {
      setError(
        'This habit could not be loaded.'
      );
    } else {
      setHabit(h as Habit);

      setCompletions(
        new Set(
          (comps ?? []).map(
            (c: Completion) =>
              c.completed_on
          )
        )
      );
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const longestStreak = useMemo(() => {
    if (!habit || !completions.size) return 0;

    const periods = Array.from(
      new Set(
        Array.from(completions).map((date) =>
          getPeriodKey(date, habit.frequency),
        ),
      ),
    ).sort();

    if (!periods.length) return 0;

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

    let max = 1;
    let current = 1;

    for (let i = 1; i < periods.length; i++) {
      if (gap(startOfPeriod(periods[i]), startOfPeriod(periods[i - 1])) === 1) {
        current++;
        max = Math.max(max, current);
      } else {
        current = 1;
      }
    }

    return max;
  }, [habit, completions]);

  const tiles = useMemo(() => {
    if (!habit || !habit.start_date) return [];

    const start = parseDate(habit.start_date);
    const end = habit.end_date
      ? parseDate(habit.end_date)
      : new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    const today = parseDate(todayStr());

    const result: {
      key: string;
      label: string;
      done: boolean;
      isFuture: boolean;
      isToday: boolean;
    }[] = [];

    if (habit.frequency === 'daily') {
      const cur = new Date(start);
      let i = 0;

      while (cur <= end && i < 400) {
        const key = dateKey(cur);
        result.push({
          key,
          label: String(i + 1),
          done: completions.has(key),
          isFuture: cur > today,
          isToday: key === todayStr(),
        });
        cur.setDate(cur.getDate() + 1);
        i++;
      }
    } else if (habit.frequency === 'weekly') {
      const cur = new Date(start);
      const seen = new Set<string>();
      let weekNumber = 1;

      while (cur <= end) {
        const key = getWeekKey(cur);

        if (!seen.has(key)) {
          const weekStart = detailPeriodStart(key, 'weekly');
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);

          result.push({
            key,
            label: `Week ${weekNumber}`,
            done: Array.from(completions).some(
              (date) => getPeriodKey(date, 'weekly') === key,
            ),
            isFuture: weekStart > today,
            isToday: weekStart <= today && weekEnd >= today,
          });

          seen.add(key);
          weekNumber++;
        }

        cur.setDate(cur.getDate() + 7);
      }
    } else if (habit.frequency === 'monthly') {
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const finalMonth = new Date(end.getFullYear(), end.getMonth(), 1);

      while (cur <= finalMonth && result.length < 120) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);

        result.push({
          key,
          label: MONTHS[cur.getMonth()],
          done: Array.from(completions).some(
            (date) => getPeriodKey(date, 'monthly') === key,
          ),
          isFuture: cur > today,
          isToday: cur <= today && monthEnd >= today,
        });

        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
        const key = String(year);

        result.push({
          key,
          label: key,
          done: Array.from(completions).some(
            (date) => getPeriodKey(date, 'annually') === key,
          ),
          isFuture: new Date(year, 0, 1) > today,
          isToday: year === today.getFullYear(),
        });
      }
    }

    return result;
  }, [habit, completions]);

  function detailPeriodStart(key: string, frequency: HabitFrequency): Date {
    if (frequency === 'daily') return new Date(`${key}T00:00:00`);
    if (frequency === 'monthly') return new Date(`${key}-01T00:00:00`);
    if (frequency === 'annually') return new Date(`${key}-01-01T00:00:00`);

    const [y, w] = key.split('-W').map(Number);
    const jan4 = new Date(y, 0, 4);
    const day = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - day + 1 + (w - 1) * 7);
    return monday;
  }

  const totalPeriods = tiles.length;

  const donePeriods = tiles.filter(
    (t) => t.done,
  ).length;

  const showToast = (
    msg: string
  ) => {
    setToast(msg);

    setTimeout(
      () => setToast(null),
      2500
    );
  };

  const openFlexInChat = () => {
    if (!habit) return;

    router.push({
      pathname: '/(tabs)',
      params: {
        shareStreak: 'true',
        streak: String(
          habit.current_streak
        ),
        habitName: habit.name,
        frequency: habit.frequency,
      },
    } as never);
  };

  const goBackToHabitsDashboard = () => {
    const frequency: HabitFrequency =
      habit?.frequency ??
      routeFrequency ??
      'daily';

    router.dismissTo({
      pathname: '/habits',
      params: { frequency },
    } as never);
  };

  const openEdit = () => {
    if (!habit) return;

    setEditName(habit.name);
    setEditCategory(habit.category);
    setEditFrequency(habit.frequency ?? 'daily');
    setEditCheckpoint(
      habit.checkpoint
        ? String(habit.checkpoint)
        : '5',
    );
    setEditStartDate(habit.start_date ?? '');
    setEditEndDate(habit.end_date ?? '');
    setError(null);
    setEditModalOpen(true);
  };

  const saveEdit = async () => {
    if (!habit) return;

    if (!editName.trim()) {
      setError('Give your habit a name.');
      return;
    }

    if (!editStartDate.trim()) {
      setError('Pick a start date.');
      return;
    }

    setSavingEdit(true);
    setError(null);

    const checkpointValue = editCheckpoint.trim()
      ? parseInt(editCheckpoint, 10)
      : 5;

    const { data, error: updateErr } =
      await supabase
        .from('habits')
        .update({
          name: editName.trim(),
          category: editCategory,
          frequency: editFrequency,
          checkpoint: checkpointValue,
          start_date: editStartDate,
          end_date: editEndDate || null,
        })
        .eq('id', habit.id)
        .select(
          'id, name, category, duration_minutes, frequency, current_streak, created_at, checkpoint, trophies_earned, freezes_held, start_date, end_date',
        )
        .maybeSingle();

    if (updateErr || !data) {
      console.log('EDIT HABIT ERROR:', updateErr);
      setError('The habit could not be updated.');
      setSavingEdit(false);
      return;
    }

    setHabit(data as Habit);
    setEditModalOpen(false);
    setSavingEdit(false);
    showToast('Habit updated.');
  };

  const deleteHabit = async () => {
    if (!habit) return;

    const {
      error: delErr,
    } = await supabase
      .from('habits')
      .delete()
      .eq('id', id);

    if (delErr) {
      setError(
        'Could not delete this habit.'
      );
    } else {
      const frequency: HabitFrequency =
        habit?.frequency ??
        routeFrequency ??
        'daily';

      router.dismissTo({
        pathname: '/habits',
        params: { frequency },
      } as never);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[
          styles.safe,
          isDark &&
            styles.safeDark,
        ]}
      >
        <View
          style={[
            styles.header,
            isDark && styles.headerDark,
          ]}
        >
          <Pressable
            onPress={goBackToHabitsDashboard}
            style={[
              styles.backButton,
              {
                backgroundColor: accentForeground,
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
              isDark && styles.darkText,
            ]}
          >
            Habit
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.center}>
          <Text
            style={[
              styles.emptyText,
              isDark &&
                styles.darkMuted,
            ]}
          >
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!habit) {
    return (
      <SafeAreaView
        style={[
          styles.safe,
          isDark &&
            styles.safeDark,
        ]}
      >
        <View
          style={[
            styles.header,
            isDark && styles.headerDark,
          ]}
        >
          <Pressable
            onPress={goBackToHabitsDashboard}
            style={[
              styles.backButton,
              {
                backgroundColor: accentForeground,
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
              isDark && styles.darkText,
            ]}
          >
            Habit
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.center}>
          <Text
            style={[
              styles.emptyText,
              isDark &&
                styles.darkMuted,
            ]}
          >
            {error ||
              'Habit not found.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.safe,
        isDark &&
          styles.safeDark,
      ]}
    >
      <View
        style={[
          styles.header,
          isDark && styles.headerDark,
        ]}
      >
        <Pressable
          onPress={goBackToHabitsDashboard}
          style={[
            styles.backButton,
            {
              backgroundColor: accentForeground,
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
            isDark && styles.darkText,
          ]}
          numberOfLines={1}
        >
          {habit.name.length > 18
            ? habit.name.slice(0, 18) + '…'
            : habit.name}
        </Text>

        <View style={styles.headerSpacer} />
      </View>

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

        {/* Streak hero */}
        <View
          style={[
            styles.streakHero,
            isDark &&
              styles.cardDark,
          ]}
        >
          <View
            style={
              styles.streakCircle
            }
          >
            <Flame
              color={
                accentForeground
              }
              size={32}
            />

            <Text
              style={[
                styles.streakBig,
                {
                  color: isDark
                    ? '#FFFFFF'
                    : accentForeground,
                },
              ]}
            >
              {habit.current_streak}
            </Text>

            <Text
              style={[
                styles.streakLabel,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              {getFrequencyUnit(habit.frequency)} streak
            </Text>
          </View>

          <Text
            style={[
              styles.habitName,
              isDark &&
                styles.darkText,
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
              ? `  ·  ${habit.duration_minutes} min/day`
              : ''}
          </Text>
        </View>

        {/* Stats */}
        <View
          style={styles.statsRow}
        >
          <View
            style={[
              styles.statCard,
              isDark &&
                styles.cardDark,
            ]}
          >
            <Text
              style={[
                styles.statValue,
                {
                  color: isDark
                    ? '#FFFFFF'
                    : accentForeground,
                },
              ]}
            >
              {donePeriods}/{totalPeriods}
            </Text>

            <Text
              style={[
                styles.statLabel,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              {getFrequencyUnit(habit.frequency).replace(/^./, (c) => c.toUpperCase())}s
            </Text>
          </View>

          <View
            style={[
              styles.statCard,
              isDark &&
                styles.cardDark,
            ]}
          >
            <Text
              style={[
                styles.statValue,
                {
                  color: isDark
                    ? '#FFFFFF'
                    : accentForeground,
                },
              ]}
            >
              {habit.trophies_earned}
            </Text>

            <Text
              style={[
                styles.statLabel,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              Trophies
            </Text>
          </View>

          <View
            style={[
              styles.statCard,
              isDark &&
                styles.cardDark,
            ]}
          >
            <Text
              style={[
                styles.statValue,
                {
                  color: isDark
                    ? '#FFFFFF'
                    : accentForeground,
                },
              ]}
            >
              {longestStreak}
            </Text>

            <Text
              style={[
                styles.statLabel,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              Best streak
            </Text>
          </View>
        </View>

        {/* Flex in chat */}
        <Pressable
          style={[
            styles.flexBtn,
            {
              backgroundColor:
                accentForeground,
            },
          ]}
          onPress={
            openFlexInChat
          }
        >
          <MessageCircle
            color={onAccent}
            size={16}
          />

          <Text
            style={[
              styles.flexBtnText,
              {
                color: onAccent,
              },
            ]}
          >
            Flex in chat
          </Text>
        </Pressable>

        {/* Tracking board - VIEW ONLY */}
        <View
          style={[
            styles.tilesCard,
            isDark &&
              styles.cardDark,
          ]}
        >
          <Text
            style={[
              styles.tilesTitle,
              isDark &&
                styles.darkText,
            ]}
          >
            Tracking board
          </Text>

          <View
            style={
              styles.tilesGrid
            }
          >
            {tiles.map(
              (tile) => (
                <View
                  key={tile.key}
                  style={[
                    styles.tile,
                    habit.frequency === 'daily' && styles.tileDaily,
                    habit.frequency === 'weekly' && styles.tileWeekly,
                    habit.frequency === 'monthly' && styles.tileMonthly,
                    habit.frequency === 'annually' && styles.tileAnnual,
                    tile.done && {
                      backgroundColor:
                        accentForeground,
                    },

                    !tile.done &&
                      !tile.isFuture && {
                        backgroundColor:
                          isDark
                            ? '#1E1E1E'
                            : '#F5F3EF',
                      },

                    tile.isFuture && {
                      backgroundColor:
                        isDark
                          ? '#1A1A1A'
                          : '#F1F0ED',
                      borderWidth: 1,
                      borderColor:
                        isDark
                          ? '#303030'
                          : '#E2E0DB',
                    },

                    tile.isToday &&
                      !tile.done && {
                        borderWidth: 1.5,
                        borderColor:
                          accentForeground,
                      },
                  ]}
                >
                  {!tile.done && (
                    <Text
                      style={[
                        styles.tileDay,
                        isDark &&
                          styles.darkText,
                        tile.isFuture && {
                          opacity: 0.3,
                        },
                      ]}
                    >
                      {tile.label}
                    </Text>
                  )}
                </View>
              )
            )}
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={openEdit}
            style={[
              styles.editBtn,
              isDark &&
                styles.editBtnDark,
            ]}
          >
            <Edit3
              color={
                isDark
                  ? '#FFFFFF'
                  : '#5A5751'
              }
              size={16}
            />

            <Text
              style={[
                styles.editText,
                isDark &&
                  styles.editTextDark,
              ]}
            >
              Edit habit
            </Text>
          </Pressable>

          <Pressable
            onPress={deleteHabit}
            style={[
              styles.deleteBtn,
              isDark &&
                styles.deleteBtnDark,
            ]}
          >
            <Trash2
              color="#C53A2F"
              size={16}
            />

            <Text
              style={styles.deleteText}
            >
              Delete habit
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={editModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setEditModalOpen(false)
        }
      >
        <View style={styles.modalShade}>
          <View
            style={[
              styles.modalCard,
              isDark &&
                styles.modalDark,
            ]}
          >
            <View style={styles.modalTitleRow}>
              <Text
                style={[
                  styles.modalTitle,
                  isDark &&
                    styles.darkText,
                ]}
              >
                Edit habit
              </Text>

              <Pressable
                onPress={() =>
                  setEditModalOpen(false)
                }
              >
                <X
                  color={
                    isDark
                      ? '#FFFFFF'
                      : '#5A5751'
                  }
                  size={21}
                />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={{ maxHeight: 420 }}
            >
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
                value={editName}
                onChangeText={setEditName}
                placeholder="e.g. Morning meditation"
                placeholderTextColor="#9B978F"
                style={[
                  styles.input,
                  isDark &&
                    styles.inputDark,
                ]}
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
                      setEditFrequency(item.value);
                      setEditCheckpoint(getDefaultCheckpoint(item.value));
                    }}
                    style={[
                      styles.frequencyFormChip,
                      editFrequency === item.value && {
                        backgroundColor: accentForeground,
                        borderColor: accentForeground,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.frequencyText,
                        isDark && styles.darkMuted,
                        editFrequency === item.value && {
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

              <Text
                style={[
                  styles.label,
                  isDark &&
                    styles.darkMuted,
                ]}
              >
                Category
              </Text>

              <View style={styles.catRow}>
                {CATEGORIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() =>
                      setEditCategory(c)
                    }
                    style={[
                      styles.catChip,
                      editCategory === c && {
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
                        editCategory === c && {
                          color: onAccent,
                          fontFamily:
                            FONT_SEMI,
                        },
                      ]}
                    >
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>


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
                value={editCheckpoint}
                onChangeText={setEditCheckpoint}
                placeholder="5"
                placeholderTextColor="#9B978F"
                style={[
                  styles.input,
                  isDark &&
                    styles.inputDark,
                ]}
                keyboardType="numeric"
              />

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
                value={editStartDate}
                onChange={setEditStartDate}
                accent={accentForeground}
                onAccent={onAccent}
                isDark={isDark}
              />

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
                value={editEndDate}
                onChange={setEditEndDate}
                accent={accentForeground}
                onAccent={onAccent}
                isDark={isDark}
                placeholder="No end date"
              />
            </ScrollView>

            <Pressable
              disabled={savingEdit}
              onPress={saveEdit}
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
                  { color: onAccent },
                ]}
              >
                {savingEdit
                  ? 'Saving...'
                  : 'Save changes'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {toast && (
        <View
          style={
            styles.toastWrap
          }
        >
          <View
            style={[
              styles.toast,
              isDark &&
                styles.cardDark,
            ]}
          >
            <Text
              style={[
                styles.toastText,
                isDark &&
                  styles.darkText,
              ]}
            >
              {toast}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor:
      '#FBFAF8',
  },

  safeDark: {
    backgroundColor:
      '#090909',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE9E4',
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
    flex: 1,
    marginHorizontal: 14,
    textAlign: 'center',
    fontFamily: FONT_BOLD,
    fontSize: 17,
    color: '#27241F',
    letterSpacing: 0.2,
  },

  headerSpacer: {
    width: 38,
    height: 38,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 80,
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

  center: {
    flex: 1,
    justifyContent:
      'center',
    alignItems: 'center',
  },

  emptyText: {
    fontFamily: FONT,
    fontSize: 14,
    color: '#908B83',
  },

  streakHero: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    padding: 24,
    alignItems: 'center',
    marginBottom: 14,
  },

  cardDark: {
    backgroundColor: '#111',
    borderColor: '#2A2A2A',
  },

  streakCircle: {
    alignItems: 'center',
    gap: 2,
    marginBottom: 14,
  },

  streakBig: {
    fontFamily: FONT_BOLD,
    fontSize: 48,
    lineHeight: 54,
  },

  streakLabel: {
    fontFamily: FONT_MED,
    fontSize: 13,
    color: '#908B83',
  },

  habitName: {
    fontFamily: FONT_SEMI,
    fontSize: 17,
    color: '#27241F',
  },

  habitMeta: {
    fontFamily: FONT,
    fontSize: 13,
    color: '#908B83',
    marginTop: 4,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },

  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    padding: 14,
    alignItems: 'center',
  },

  statValue: {
    fontFamily: FONT_BOLD,
    fontSize: 24,
  },

  statLabel: {
    fontFamily: FONT,
    fontSize: 11,
    color: '#908B83',
    marginTop: 4,
  },

  flexBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 14,
  },

  flexBtnText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  tilesCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    padding: 16,
    marginBottom: 14,
  },

  tilesTitle: {
    fontFamily: FONT_SEMI,
    fontSize: 15,
    color: '#27241F',
    marginBottom: 14,
  },

  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },

  tileDaily: {
    width: '9.5%',
    height: 42,
    marginRight: 1,
    marginBottom: 2,
  },

  tileWeekly: {
    width: '15.8%',
    height: 38,
    marginRight: 1,
    marginBottom: 2,
  },

  tileMonthly: {
    width: '13.9%',
    height: 42,
    marginRight: 1,
    marginBottom: 2,
  },

  tileAnnual: {
    width: '19%',
    height: 48,
    marginRight: 1,
    marginBottom: 2,
  },

  tile: {
    paddingHorizontal: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },

  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1DED8',
    backgroundColor: '#F7F6F3',
  },

  editBtnDark: {
    borderColor: '#303030',
    backgroundColor: '#161616',
  },

  editText: {
    fontFamily: FONT_MED,
    fontSize: 14,
    color: '#5A5751',
  },

  editTextDark: {
    color: '#FFFFFF',
  },

  tileDay: {
    fontFamily: FONT,
    fontSize: 11,
    color: '#27241F',
    includeFontPadding: false,
    flexShrink: 0,
    textAlign: 'center',
  },

  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0D5D2',
    backgroundColor: '#FDF4F3',
  },

  deleteBtnDark: {
    borderColor: '#3A2222',
    backgroundColor: '#1A1212',
  },

  deleteText: {
    fontFamily: FONT_MED,
    fontSize: 14,
    color: '#C53A2F',
  },

  modalShade: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    color: '#FFFFFF',
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

  frequencyText: {
    fontFamily: FONT_MED,
    fontSize: 12,
    color: '#77746E',
    textAlign: 'center',
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

  toastWrap: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  toast: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#FFF',
    borderColor: '#ECE9E4',
  },

  toastText: {
    fontFamily: FONT_MED,
    fontSize: 13,
    color: '#27241F',
    textAlign: 'center',
  },
});