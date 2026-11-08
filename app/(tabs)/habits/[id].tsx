import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  Edit3,
  Flame,
  MessageCircle,
  Trash2,
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
import { router, useLocalSearchParams } from 'expo-router';

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

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const CATEGORIES = ['Mind', 'Body', 'Health', 'Rest', 'Focus'];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

export default function HabitDetailScreen() {
  const { id, frequency: routeFrequency } =
    useLocalSearchParams<{ id: string; frequency?: HabitFrequency }>();

  const { accentForeground, accentColor: rawAccent, isDark, onAccent } = useApp() as any;

  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);
  const headerTextColor = isAccentPureBlack ? '#FFFFFF' : '#000000';

  const [habit, setHabit] = useState<Habit | null>(null);
  const [completions, setCompletions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Mind');
  const [editFrequency, setEditFrequency] = useState<HabitFrequency>('daily');
  const [editCheckpoint, setEditCheckpoint] = useState('5');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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
          'id, name, category, duration_minutes, frequency, current_streak, created_at, checkpoint, trophies_earned, freezes_held, start_date, end_date',
        )
        .eq('id', id)
        .maybeSingle(),

      supabase
        .from('habit_completions')
        .select('completed_on')
        .eq('habit_id', id)
        .order('completed_on', { ascending: false }),
    ]);

    if (hErr || cErr || !h) {
      setError('This habit could not be loaded.');
    } else {
      setHabit(h as Habit);
      setCompletions(
        new Set((comps ?? []).map((c: Completion) => c.completed_on)),
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
            label: `W${weekNumber}`,
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
  const donePeriods = tiles.filter((t) => t.done).length;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const openFlexInChat = () => {
    if (!habit) return;

    // Open Chat in streak-sharing mode and preserve the habit dashboard
    // frequency so the user can return to the same Habits view.
    router.push({
      pathname: '/(tabs)',
      params: {
        // Support both parameter names used by the Share Streak
        // recipient-selection mode in the Chat screen.
        shareStreak: 'true',
        flex: '1',
        streak: String(habit.current_streak),
        habitTitle: habit.name,
        habitName: habit.name,
        frequency: habit.frequency,
      },
    } as never);
  };

  const goBackToHabitsDashboard = () => {
    const frequency: HabitFrequency =
      habit?.frequency ?? routeFrequency ?? 'daily';

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
    setEditCheckpoint(habit.checkpoint ? String(habit.checkpoint) : '5');
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

    const { data, error: updateErr } = await supabase
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
    setDeleteConfirmOpen(false);

    const { error: delErr } = await supabase
      .from('habits')
      .delete()
      .eq('id', id);

    if (delErr) {
      setError('Could not delete this habit.');
    } else {
      goBackToHabitsDashboard();
    }
  };

  const C = isDark
    ? {
        cardBg: '#121212',
        cardText: '#FFFFFF',
        cardSubtext: '#A1A1AA',
        inputBg: '#1E1E1E',
        inactiveTileBg: '#3F3F46',
        inactiveTileText: '#A1A1AA',
      }
    : {
        cardBg: '#FFFFFF',
        cardText: '#000000',
        cardSubtext: '#52525B',
        inputBg: '#F4F4F5',
        inactiveTileBg: '#A1A1AA',
        inactiveTileText: '#3F3F46',
      };

  if (loading || !habit) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
        <StatusBar
          barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
          backgroundColor={pageBg}
        />
        <View style={styles.header}>
          <Pressable
            onPress={goBackToHabitsDashboard}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressedBtn]}
            hitSlop={12}
          >
            <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: headerTextColor }]}>HABIT</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={[styles.centerText, { color: headerTextColor }]}>
            {loading ? 'Loading habit details...' : error || 'Habit not found.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
        backgroundColor={pageBg}
      />

      {/* FIXED HEADER */}
      <View style={styles.header}>
        <Pressable
          onPress={goBackToHabitsDashboard}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: headerTextColor }]} numberOfLines={1}>
          {habit.name.toUpperCase()}
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      {/* PINNED SECTION: STREAK HERO + STATS + ACTION BUTTONS */}
      <View style={[styles.pinnedContainer, { backgroundColor: pageBg }]}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* HERO STREAK CARD */}
        <View style={styles.cardContainer}>
          <View style={styles.cardShadowBackdrop} />
          <View style={[styles.heroCardBody, { backgroundColor: C.cardBg }]}>
            <View style={styles.streakBadgeCenter}>
              <Flame color="#000000" size={20} strokeWidth={2.5} />
              <Text style={styles.streakBadgeText}>CURRENT STREAK</Text>
            </View>

            <Text style={[styles.streakBig, { color: C.cardText }]}>
              {habit.current_streak}
            </Text>

            <Text style={[styles.streakLabel, { color: C.cardSubtext }]}>
              {getFrequencyUnit(habit.frequency)}s
            </Text>

            <Text style={[styles.habitName, { color: C.cardText }]}>
              {habit.name}
            </Text>

            <Text style={[styles.habitMeta, { color: C.cardSubtext }]}>
              {habit.category}
              {habit.duration_minutes ? `  ·  ${habit.duration_minutes} min/day` : ''}
            </Text>
          </View>
        </View>

        {/* STATS ROW */}
        <View style={styles.statsRow}>
          <View style={styles.statCardWrapper}>
            <View style={styles.statShadowBackdrop} />
            <View style={[styles.statCardBody, { backgroundColor: C.cardBg }]}>
              <Text style={[styles.statValue, { color: C.cardText }]}>
                {donePeriods}/{totalPeriods}
              </Text>
              <Text style={[styles.statLabel, { color: C.cardSubtext }]}>
                {getFrequencyUnit(habit.frequency).toUpperCase()}S
              </Text>
            </View>
          </View>

          <View style={styles.statCardWrapper}>
            <View style={styles.statShadowBackdrop} />
            <View style={[styles.statCardBody, { backgroundColor: C.cardBg }]}>
              <Text style={[styles.statValue, { color: C.cardText }]}>
                {habit.trophies_earned}
              </Text>
              <Text style={[styles.statLabel, { color: C.cardSubtext }]}>TROPHIES</Text>
            </View>
          </View>

          <View style={styles.statCardWrapper}>
            <View style={styles.statShadowBackdrop} />
            <View style={[styles.statCardBody, { backgroundColor: C.cardBg }]}>
              <Text style={[styles.statValue, { color: C.cardText }]}>
                {longestStreak}
              </Text>
              <Text style={[styles.statLabel, { color: C.cardSubtext }]}>BEST STREAK</Text>
            </View>
          </View>
        </View>

        {/* ACTIONS ROW */}
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.flexBtn, pressed && styles.pressedBtn]}
            onPress={openFlexInChat}
          >
            <MessageCircle color="#FFFFFF" size={16} strokeWidth={2.5} />
            <Text style={styles.flexBtnText}>Flex Habit</Text>
          </Pressable>

          <Pressable
            onPress={openEdit}
            style={({ pressed }) => [styles.editBtn, pressed && styles.pressedBtn]}
          >
            <Edit3 color="#000000" size={16} strokeWidth={2.5} />
            <Text style={styles.editText}>Edit</Text>
          </Pressable>

          <Pressable
            onPress={() => setDeleteConfirmOpen(true)}
            style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressedBtn]}
          >
            <Trash2 color="#FFFFFF" size={16} strokeWidth={2.5} />
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </View>

      {/* ONLY TRACKING BOARD SCROLLS */}
      <ScrollView
        contentContainerStyle={styles.scrollListContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardContainer}>
          <View style={styles.cardShadowBackdrop} />
          <View style={[styles.tilesCardBody, { backgroundColor: C.cardBg }]}>
            <Text style={[styles.tilesTitle, { color: C.cardText }]}>
              TRACKING BOARD
            </Text>

            <View style={styles.tilesGrid}>
              {tiles.map((tile) => (
                <View
                  key={tile.key}
                  style={[
                    styles.tile,
                    habit.frequency === 'daily' && styles.tileDaily,
                    habit.frequency === 'weekly' && styles.tileWeekly,
                    habit.frequency === 'monthly' && styles.tileMonthly,
                    habit.frequency === 'annually' && styles.tileAnnual,
                    
                    /* TILE STYLING RULES:
                       1. Hit Streak (Completed): Accent color square with NO NUMBER
                       2. Inactive / Yet to arrive: Darker grey background with faint number
                       3. Missed / Uncompleted: Pure white background with day number
                    */
                    tile.done
                      ? { backgroundColor: pageBg }
                      : tile.isFuture
                      ? { backgroundColor: C.inactiveTileBg }
                      : { backgroundColor: '#FFFFFF' },
                  ]}
                >
                  {!tile.done && (
                    <Text
                      style={[
                        styles.tileDay,
                        { color: tile.isFuture ? C.inactiveTileText : '#000000' },
                      ]}
                    >
                      {tile.label}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* CENTERED EDIT HABIT MODAL */}
      <Modal
        visible={editModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalOpen(false)}
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
                    Edit habit
                  </Text>
                  <Pressable onPress={() => setEditModalOpen(false)} hitSlop={12}>
                    <X color={C.cardText} size={22} strokeWidth={2.5} />
                  </Pressable>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                >
                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    TITLE
                  </Text>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="e.g. Morning meditation"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      {
                        backgroundColor: C.inputBg,
                        color: C.cardText,
                      },
                    ]}
                  />

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    FREQUENCY
                  </Text>
                  <View style={styles.chipRowLeft}>
                    {FREQUENCIES.map((item) => {
                      const selected = editFrequency === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          onPress={() => {
                            setEditFrequency(item.value);
                            setEditCheckpoint(getDefaultCheckpoint(item.value));
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
                  <View style={styles.chipRowLeft}>
                    {CATEGORIES.map((c) => {
                      const selected = editCategory === c;
                      return (
                        <Pressable
                          key={c}
                          onPress={() => setEditCategory(c)}
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
                    CHECKPOINT
                  </Text>
                  <TextInput
                    value={editCheckpoint}
                    onChangeText={setEditCheckpoint}
                    placeholder="5"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      {
                        backgroundColor: C.inputBg,
                        color: C.cardText,
                      },
                    ]}
                    keyboardType="numeric"
                  />

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    START DATE
                  </Text>
                  <DatePickerInput
                    value={editStartDate}
                    onChange={setEditStartDate}
                    accent={pageBg}
                    onAccent={onAccent}
                    isDark={isDark}
                  />

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    END DATE (OPTIONAL)
                  </Text>
                  <DatePickerInput
                    value={editEndDate}
                    onChange={setEditEndDate}
                    accent={pageBg}
                    onAccent={onAccent}
                    isDark={isDark}
                    placeholder="No end date"
                  />
                </ScrollView>

                <Pressable
                  disabled={savingEdit}
                  onPress={saveEdit}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressedBtn,
                    savingEdit && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {savingEdit ? 'Saving...' : 'Save changes'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* CENTERED NEO-BRUTALIST DELETE CONFIRMATION MODAL */}
      <Modal
        visible={deleteConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmOpen(false)}
      >
        <View style={styles.alertShade}>
          <View style={styles.alertCardWrapper}>
            <View style={styles.alertShadowBackdrop} />
            <View style={styles.alertCardBody}>
              <View style={styles.alertHeaderRow}>
                <View style={styles.alertIconBadge}>
                  <AlertTriangle color="#000000" size={20} strokeWidth={2.5} />
                </View>
                <Text style={styles.alertTitle}>Delete Habit?</Text>
              </View>

              <Text style={styles.alertMessage}>
                Are you sure you want to delete this habit? This action cannot be undone.
              </Text>

              <View style={styles.alertActionsRow}>
                <Pressable
                  onPress={() => setDeleteConfirmOpen(false)}
                  style={({ pressed }) => [
                    styles.alertCancelBtn,
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={styles.alertCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={deleteHabit}
                  style={({ pressed }) => [
                    styles.alertDeleteBtn,
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={styles.alertDeleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <View style={styles.toastWrap}>
          <View style={styles.toastCardWrapper}>
            <View style={styles.toastShadowBackdrop} />
            <View style={[styles.toastCardBody, { backgroundColor: C.cardBg }]}>
              <Text style={[styles.toastText, { color: C.cardText }]}>
                {toast}
              </Text>
            </View>
          </View>
        </View>
      )}
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  centerText: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    textAlign: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_XB,
    fontSize: 20,
    letterSpacing: 1,
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },

  /* PINNED CONTAINER */
  pinnedContainer: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    zIndex: 10,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  errorText: {
    fontFamily: FONT_BOLD,
    color: '#DC2626',
    fontSize: 13,
    textAlign: 'center',
  },

  /* HERO STREAK CARD */
  cardContainer: {
    position: 'relative',
    width: '100%',
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
  heroCardBody: {
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#000000',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakBadgeCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FDE047',
    marginBottom: 8,
  },
  streakBadgeText: {
    fontFamily: FONT_BOLD,
    fontSize: 11,
    color: '#000000',
    letterSpacing: 0.5,
  },
  streakBig: {
    fontFamily: FONT_XB,
    fontSize: 44,
    lineHeight: 48,
    textAlign: 'center',
  },
  streakLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 6,
  },
  habitName: {
    fontFamily: FONT_XB,
    fontSize: 18,
    textAlign: 'center',
  },
  habitMeta: {
    fontFamily: FONT_MED,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },

  /* STATS ROW */
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  statCardWrapper: {
    flex: 1,
    position: 'relative',
  },
  statShadowBackdrop: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: -3,
    bottom: -3,
    backgroundColor: '#000000',
    borderRadius: 12,
  },
  statCardBody: {
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: '#000000',
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: FONT_XB,
    fontSize: 18,
    textAlign: 'center',
  },
  statLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 9,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 2,
  },

  /* ACTIONS ROW */
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  flexBtn: {
    flex: 1.2,
    backgroundColor: '#000000',
    borderRadius: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  flexBtnText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 13,
  },
  editBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  editText: {
    fontFamily: FONT_BOLD,
    color: '#000000',
    fontSize: 13,
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 13,
  },

  /* SCROLLABLE TRACKING BOARD */
  scrollListContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 100,
  },
  tilesCardBody: {
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#000000',
    padding: 16,
    alignItems: 'flex-start',
  },
  tilesTitle: {
    fontFamily: FONT_XB,
    fontSize: 14,
    letterSpacing: 1,
    textAlign: 'left',
    marginBottom: 14,
  },
  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    width: '100%',
  },
  tile: {
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileDaily: {
    width: '9.5%',
    height: 38,
    marginRight: 2,
    marginBottom: 4,
  },
  tileWeekly: {
    width: '15%',
    height: 36,
    marginRight: 2,
    marginBottom: 4,
  },
  tileMonthly: {
    width: '13.5%',
    height: 38,
    marginRight: 2,
    marginBottom: 4,
  },
  tileAnnual: {
    width: '18%',
    height: 42,
    marginRight: 2,
    marginBottom: 4,
  },
  tileDay: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    textAlign: 'center',
  },

  /* CENTERED MODALS & LEFT ALIGNED INPUT FORM */
  centeredModalShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    borderWidth: 2.5,
    borderColor: '#000000',
    padding: 20,
    maxHeight: 540,
    alignItems: 'flex-start',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 20,
    flex: 1,
    textAlign: 'left',
  },
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
    width: '100%',
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
    textAlign: 'left',
  },
  modalTextInput: {
    fontFamily: FONT_MED,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    textAlign: 'left',
    width: '100%',
  },
  chipRowLeft: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
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
    alignItems: 'center',
    width: '100%',
    marginTop: 14,
  },
  primaryBtnText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 15,
  },

  /* ALERT MODAL */
  alertShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  alertCardWrapper: {
    position: 'relative',
    width: '100%',
  },
  alertShadowBackdrop: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    backgroundColor: '#000000',
    borderRadius: 18,
  },
  alertCardBody: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: '#000000',
    padding: 20,
    alignItems: 'center',
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  alertIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FDE047',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    color: '#000000',
  },
  alertMessage: {
    fontFamily: FONT_MED,
    fontSize: 13,
    color: '#3F3F46',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 18,
  },
  alertActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  alertCancelBtn: {
    flex: 1,
    backgroundColor: '#F4F4F5',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  alertCancelText: {
    fontFamily: FONT_BOLD,
    color: '#000000',
    fontSize: 13,
  },
  alertDeleteBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  alertDeleteText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 13,
  },

  /* TOAST */
  toastWrap: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  toastCardWrapper: {
    position: 'relative',
  },
  toastShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: '#000000',
    borderRadius: 10,
  },
  toastCardBody: {
    borderWidth: 2.5,
    borderColor: '#000000',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  toastText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
    textAlign: 'center',
  },
});