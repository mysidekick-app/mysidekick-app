import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  MoreVertical,
  Plus,
  X,
} from 'lucide-react-native';
import {
  KeyboardAvoidingView,
  Modal,
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
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

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

export default function HabitsScreen() {
  const {
    accentForeground,
    accentColor: rawAccent,
    isDark,
    onAccent,
  } = useApp() as any;

  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);
  const headerTextColor = isAccentPureBlack ? '#FFFFFF' : '#000000';

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Mind');
  const [frequencyFilter, setFrequencyFilter] = useState<HabitFrequency>('daily');
  const [frequency, setFrequency] = useState<HabitFrequency>('daily');
  const [checkpoint, setCheckpoint] = useState('5');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const today = todayStr();

    const [
      { data: habitRows, error: habitErr },
      { data: compRows, error: compErr },
    ] = await Promise.all([
      supabase
        .from('habits')
        .select(
          'id, name, category, duration_minutes, frequency, current_streak, checkpoint, trophies_earned, freezes_held',
        )
        .order('created_at', { ascending: true }),

      supabase
        .from('habit_completions')
        .select('habit_id, completed_on')
        .order('completed_on', { ascending: false }),
    ]);

    if (habitErr || compErr) {
      setError('Your habits could not be loaded.');
      setLoading(false);
      return;
    }

    const loadedHabits = (habitRows ?? []) as Habit[];
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

    const updatedHabits = await Promise.all(
      loadedHabits.map(async (habit) => {
        try {
          const streak = await calculateCurrentStreak(habit);
          const trophies = Math.floor(
            streak / Math.max(Number(habit.checkpoint) || 1, 1),
          );

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

  const toggleToday = async (habit: Habit) => {
    const today = todayStr();
    const currentPeriod = getPeriodKey(today, habit.frequency);
    const isDone = completedToday.has(habit.id);

    setError(null);

    if (isDone) {
      const { error: delErr } = await supabase
        .from('habit_completions')
        .delete()
        .eq('habit_id', habit.id)
        .gte('completed_on', periodBounds(currentPeriod, habit.frequency)[0])
        .lte('completed_on', periodBounds(currentPeriod, habit.frequency)[1]);

      if (delErr) {
        setError('Could not undo completion.');
        return;
      }

      setCompletedToday((current) => {
        const next = new Set(current);
        next.delete(habit.id);
        return next;
      });

      let newStreak = 0;
      try {
        newStreak = await calculateCurrentStreak(habit);
      } catch (err) {
        setError('Could not recalculate streak.');
        return;
      }

      const newTrophies = Math.floor(
        newStreak / Math.max(Number(habit.checkpoint) || 1, 1),
      );

      const { error: updateErr } = await supabase
        .from('habits')
        .update({
          current_streak: newStreak,
          trophies_earned: newTrophies,
        })
        .eq('id', habit.id);

      if (updateErr) {
        setError('Could not update streak.');
        return;
      }

      setHabits((current) =>
        current.map((h) =>
          h.id === habit.id
            ? {
                ...h,
                current_streak: newStreak,
                trophies_earned: newTrophies,
              }
            : h,
        ),
      );
      return;
    }

    const { error: insErr } = await supabase
      .from('habit_completions')
      .insert({
        habit_id: habit.id,
        completed_on: today,
      });

    if (insErr) {
      if (
        insErr.code === '23505' ||
        insErr.message?.toLowerCase().includes('duplicate')
      ) {
        setCompletedToday((current) => {
          const next = new Set(current);
          next.add(habit.id);
          return next;
        });
        setError('This habit is already completed for this period.');
      } else {
        setError('Could not mark complete.');
      }
      return;
    }

    setCompletedToday((current) => {
      const next = new Set(current);
      next.add(habit.id);
      return next;
    });

    let newStreak = 0;
    try {
      newStreak = await calculateCurrentStreak(habit);
    } catch (err) {
      setError('Could not calculate streak.');
      return;
    }

    const newTrophies = Math.floor(
      newStreak / Math.max(Number(habit.checkpoint) || 1, 1),
    );

    const { error: updateErr } = await supabase
      .from('habits')
      .update({
        current_streak: newStreak,
        trophies_earned: newTrophies,
      })
      .eq('id', habit.id);

    if (updateErr) {
      setError('Could not update streak.');
      return;
    }

    setHabits((current) =>
      current.map((h) =>
        h.id === habit.id
          ? {
              ...h,
              current_streak: newStreak,
              trophies_earned: newTrophies,
            }
          : h,
      ),
    );
  };

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

  const saveHabit = async () => {
    if (!name.trim()) {
      setError('Give your habit a name.');
      return;
    }

    if (!startDate.trim()) {
      setError('Pick a start date.');
      return;
    }

    setSaving(true);
    setError(null);

    const cp = checkpoint.trim() ? parseInt(checkpoint, 10) : 5;

    const { data, error: saveErr } = await supabase
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
      setError('The habit could not be saved.');
    } else {
      setHabits((current) => [...current, data as Habit]);
      setModalOpen(false);
    }

    setSaving(false);
  };

  const visibleHabits = habits.filter(
    (habit) => habit.frequency === frequencyFilter,
  );

  const totalDone = visibleHabits.filter(
    (habit) => completedToday.has(habit.id),
  ).length;

  const totalHabits = visibleHabits.length;

  const C = isDark
    ? {
        cardBg: '#121212',
        cardText: '#FFFFFF',
        cardSubtext: '#A1A1AA',
        cardBorder: '#000000',
        inputBg: '#1E1E1E',
        inputBorder: '#333333',
      }
    : {
        cardBg: '#FFFFFF',
        cardText: '#000000',
        cardSubtext: '#52525B',
        cardBorder: '#000000',
        inputBg: '#F4F4F5',
        inputBorder: '#E4E4E7',
      };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
        backgroundColor={pageBg}
      />

      {/* FIXED HEADER */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            setSettingsMenuOpen(false);
            router.push('/modules');
          }}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: headerTextColor }]}>
          HABITS
        </Text>

        <Pressable
          onPress={() => setSettingsMenuOpen((current) => !current)}
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <MoreVertical color={headerTextColor} size={24} strokeWidth={2.5} />
        </Pressable>

        {settingsMenuOpen && (
          <View style={styles.menuShadeOverlay}>
            <Pressable style={{ flex: 1 }} onPress={() => setSettingsMenuOpen(false)}>
              <View style={styles.menuCardWrapper}>
                <View style={styles.shadowBackdrop} />
                <View style={[styles.menuCardBody, { backgroundColor: C.cardBg }]}>
                  <Pressable
                    onPress={() => {
                      setSettingsMenuOpen(false);
                      router.push('/(tabs)/profile');
                    }}
                    style={styles.menuItem}
                  >
                    <Text style={[styles.menuItemText, { color: C.cardText }]}>
                      Settings
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </View>
        )}
      </View>

      {/* PINNED SECTION: FREQUENCY FILTER + STREAK PROGRESS CARD */}
      <View style={[styles.pinnedSection, { backgroundColor: pageBg }]}>
        {/* NEO-BRUTALIST FREQUENCY FILTER */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {FREQUENCIES.map((item) => {
            const active = frequencyFilter === item.value;
            return (
              <View key={item.value} style={styles.filterTagWrapper}>
                <View style={styles.filterShadowBackdrop} />
                <Pressable
                  onPress={() => setFrequencyFilter(item.value)}
                  style={({ pressed }) => [
                    styles.filterTagBtn,
                    {
                      backgroundColor: active ? '#000000' : '#FFFFFF',
                      borderColor: '#000000',
                    },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterTagText,
                      { color: active ? '#FFFFFF' : '#000000' },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>

        {/* NEO-BRUTALIST PROGRESS STREAK CARD */}
        <View style={styles.cardContainer}>
          <View style={styles.cardShadowBackdrop} />
          <View style={[styles.progressCardBody, { backgroundColor: C.cardBg, borderColor: C.cardBorder }]}>
            <View style={styles.progressTop}>
              <Text style={[styles.progressLabel, { color: C.cardSubtext }]}>
                {frequencyFilter === 'daily'
                  ? 'TODAY'
                  : frequencyFilter === 'weekly'
                  ? 'THIS WEEK'
                  : frequencyFilter === 'monthly'
                  ? 'THIS MONTH'
                  : 'THIS YEAR'}
              </Text>

              <Text style={[styles.progressCount, { color: C.cardText }]}>
                {totalDone}/{totalHabits}
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      totalHabits ? (totalDone / totalHabits) * 100 : 0
                    }%`,
                    backgroundColor: pageBg,
                  },
                ]}
              />
            </View>

            <Text style={[styles.progressHint, { color: C.cardSubtext }]}>
              Keep going — every check-in grows your streak.
            </Text>
          </View>
        </View>
      </View>

      {/* ONLY SCROLLABLE LIST OF HABITS */}
      <ScrollView
        contentContainerStyle={styles.scrollListContent}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {loading ? (
          <Text style={[styles.emptyText, { color: headerTextColor }]}>
            Loading your habits...
          </Text>
        ) : visibleHabits.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: headerTextColor }]}>
              No habits yet. Tap + to create your first one.
            </Text>
          </View>
        ) : (
          <View style={styles.listStack}>
            {visibleHabits.map((habit) => {
              const done = completedToday.has(habit.id);

              return (
                <View key={habit.id} style={styles.cardContainer}>
                  <View style={styles.cardShadowBackdrop} />
                  <View
                    style={[
                      styles.rowCardBody,
                      {
                        backgroundColor: C.cardBg,
                        borderColor: C.cardBorder,
                      },
                    ]}
                  >
                    {/* CHECKBOX */}
                    <Pressable
                      onPress={() => toggleToday(habit)}
                      style={[styles.check, done && styles.checkDone]}
                      hitSlop={8}
                    >
                      {done && (
                        <Check color="#000000" size={14} strokeWidth={3} />
                      )}
                    </Pressable>

                    {/* HABIT NAME */}
                    <Pressable
                      onPress={() => router.push(`/habits/${habit.id}`)}
                      style={styles.rowCopy}
                      hitSlop={4}
                    >
                      <Text
                        style={[
                          styles.habitName,
                          { color: C.cardText },
                          done && styles.doneName,
                        ]}
                      >
                        {habit.name}
                      </Text>

                      <Text style={[styles.habitMeta, { color: C.cardSubtext }]}>
                        {habit.category}
                        {'  ·  '}
                        {habit.trophies_earned} 🏆
                      </Text>
                    </Pressable>

                    {/* STREAK */}
                    <View style={styles.streakBadge}>
                      <Flame color="#000000" size={14} strokeWidth={2.5} />
                      <Text style={styles.streakText}>
                        {habit.current_streak}
                      </Text>
                    </View>

                    {/* DETAILS */}
                    <Pressable
                      onPress={() => router.push(`/habits/${habit.id}`)}
                      style={styles.chevron}
                      hitSlop={8}
                    >
                      <ChevronRight color={C.cardText} size={20} strokeWidth={2.5} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* FLOATING PLUS BUTTON */}
      <View style={styles.fabContainer}>
        <View style={styles.fabShadowBackdrop} />
        <Pressable
          onPress={openNew}
          style={({ pressed }) => [styles.fabBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <Plus color="#FFFFFF" size={28} strokeWidth={3} />
        </Pressable>
      </View>

      {/* CENTERED NEW HABIT MODAL */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.centeredModalShade}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoidingViewCentered}
          >
            <View style={styles.modalCardWrapper}>
              <View style={styles.modalShadowBackdrop} />
              <View style={[styles.modalCardBody, { backgroundColor: C.cardBg }]}>
                <View style={styles.modalTitleRow}>
                  <Text style={[styles.modalTitle, { color: C.cardText }]}>
                    New habit
                  </Text>

                  <Pressable onPress={() => setModalOpen(false)} hitSlop={12}>
                    <X color={C.cardText} size={22} strokeWidth={2.5} />
                  </Pressable>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                >
                  {error && <Text style={styles.modalError}>{error}</Text>}

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    TITLE
                  </Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Morning meditation"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      {
                        backgroundColor: C.inputBg,
                        borderColor: C.inputBorder,
                        color: C.cardText,
                      },
                    ]}
                    autoFocus
                  />

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    FREQUENCY
                  </Text>
                  <View style={styles.chipRow}>
                    {FREQUENCIES.map((item) => {
                      const selected = frequency === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          onPress={() => {
                            setFrequency(item.value);
                            setCheckpoint(getDefaultCheckpoint(item.value));
                          }}
                          style={({ pressed }) => [
                            styles.chip,
                            selected ? styles.chipActive : { backgroundColor: C.inputBg },
                            pressed && styles.pressedBtn,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: selected ? '#FFFFFF' : C.cardText },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    CATEGORY
                  </Text>
                  <View style={styles.chipRow}>
                    {CATEGORIES.map((c) => {
                      const selected = category === c;
                      return (
                        <Pressable
                          key={c}
                          onPress={() => setCategory(c)}
                          style={({ pressed }) => [
                            styles.chip,
                            selected ? styles.chipActive : { backgroundColor: C.inputBg },
                            pressed && styles.pressedBtn,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: selected ? '#FFFFFF' : C.cardText },
                            ]}
                          >
                            {c}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    TROPHY CHECKPOINT
                  </Text>
                  <TextInput
                    value={checkpoint}
                    onChangeText={setCheckpoint}
                    placeholder="5"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      {
                        backgroundColor: C.inputBg,
                        borderColor: C.inputBorder,
                        color: C.cardText,
                      },
                    ]}
                    keyboardType="numeric"
                  />

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    START DATE
                  </Text>
                  <DatePickerInput
                    value={startDate}
                    onChange={setStartDate}
                    accent={pageBg}
                    onAccent={onAccent}
                    isDark={isDark}
                  />

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    END DATE (OPTIONAL)
                  </Text>
                  <DatePickerInput
                    value={endDate}
                    onChange={setEndDate}
                    accent={pageBg}
                    onAccent={onAccent}
                    isDark={isDark}
                    placeholder="No end date"
                  />
                </ScrollView>

                <Pressable
                  disabled={saving}
                  onPress={saveHabit}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressedBtn,
                    saving && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {saving ? 'Saving...' : 'Add habit'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
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

  /* HEADER */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    zIndex: 100,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_XB,
    fontSize: 22,
    letterSpacing: 1,
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* MENU MODAL OVERLAY */
  menuShadeOverlay: {
    position: 'absolute',
    top: 55,
    right: 20,
    zIndex: 1000,
  },
  menuCardWrapper: {
    position: 'relative',
    width: 160,
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
    borderWidth: 2.5,
    borderColor: '#000000',
    paddingVertical: 4,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },

  /* PINNED CONTAINER */
  pinnedSection: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    zIndex: 10,
  },
  filterScroll: {
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 18,
    paddingBottom: 4,
  },
  filterTagWrapper: {
    position: 'relative',
  },
  filterShadowBackdrop: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: -3,
    bottom: -3,
    backgroundColor: '#000000',
    borderRadius: 10,
  },
  filterTagBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 2.5,
  },
  filterTagText: {
    fontFamily: FONT_BOLD,
    fontSize: 12.5,
  },

  /* PROGRESS CARD */
  progressCardBody: {
    borderRadius: 16,
    borderWidth: 2.5,
    padding: 16,
  },
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  progressLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
    letterSpacing: 1,
  },
  progressCount: {
    fontFamily: FONT_XB,
    fontSize: 22,
  },
  progressTrack: {
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  progressHint: {
    fontFamily: FONT_MED,
    fontSize: 11,
    marginTop: 8,
  },

  /* SCROLLABLE LIST CONTENT */
  scrollListContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 120,
  },
  listStack: {
    gap: 12,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2.5,
    borderColor: '#000000',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: FONT_BOLD,
    color: '#DC2626',
    fontSize: 13,
  },

  /* CARD NEO-BRUTALIST */
  cardContainer: {
    position: 'relative',
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
  rowCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 2.5,
    padding: 12,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: {
    backgroundColor: '#FFFFFF',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  habitName: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
  },
  doneName: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  habitMeta: {
    fontFamily: FONT_MED,
    fontSize: 11,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#000000',
    backgroundColor: '#FDE047',
    alignSelf: 'center',
  },
  streakText: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
    color: '#000000',
  },
  chevron: {
    paddingLeft: 2,
  },

  empty: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    textAlign: 'center',
  },

  /* FAB */
  fabContainer: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    width: 60,
    height: 60,
  },
  fabShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 56,
    height: 56,
    backgroundColor: '#000000',
    borderRadius: 28,
  },
  fabBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000000',
    borderWidth: 2.5,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* CENTERED MODALS */
  centeredModalShade: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  keyboardAvoidingViewCentered: {
    width: '100%',
    maxHeight: '85%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCardWrapper: {
    position: 'relative',
    width: '100%',
  },
  modalShadowBackdrop: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    backgroundColor: '#000000',
    borderRadius: 20,
  },
  modalCardBody: {
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#000000',
    padding: 20,
    maxHeight: 540,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 20,
    flex: 1,
    marginRight: 10,
  },
  modalError: {
    fontFamily: FONT_BOLD,
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 8,
  },
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  modalScrollContent: {
    paddingBottom: 16,
  },
  inputLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },
  modalTextInput: {
    fontFamily: FONT_MED,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#000000',
  },
  chipActive: {
    backgroundColor: '#000000',
  },
  chipText: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
  },

  primaryBtn: {
    backgroundColor: '#000000',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: '#000000',
    alignItems: 'center',
    marginTop: 14,
  },
  primaryBtnText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 15,
  },
});