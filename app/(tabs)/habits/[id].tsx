import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Flame,
  Trash2,
  MessageCircle,
} from 'lucide-react-native';

import {
  useLocalSearchParams,
  router,
} from 'expo-router';

import { PageHeader } from '@/components/PageHeader';

import { useApp } from '@/components/AppProvider';

import { supabase } from '@/lib/supabase';

type Habit = {
  id: string;
  name: string;
  category: string;
  duration_minutes: number | null;
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
  const { id } =
    useLocalSearchParams<{ id: string }>();

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
          'id, name, category, duration_minutes, current_streak, created_at, checkpoint, trophies_earned, freezes_held, start_date, end_date'
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
    if (!completions.size) return 0;

    const sorted =
      Array.from(completions).sort();

    let max = 1;
    let cur = 1;

    for (
      let i = 1;
      i < sorted.length;
      i++
    ) {
      const prev = parseDate(
        sorted[i - 1]
      );

      const curr = parseDate(
        sorted[i]
      );

      const diff = Math.round(
        (curr.getTime() -
          prev.getTime()) /
          86400000
      );

      if (diff === 1) {
        cur++;
        max = Math.max(
          max,
          cur
        );
      } else {
        cur = 1;
      }
    }

    return max;
  }, [completions]);

  const tiles = useMemo(() => {
    if (!habit || !habit.start_date) {
      return [];
    }

    const start = parseDate(
      habit.start_date
    );

    const end = habit.end_date
      ? parseDate(habit.end_date)
      : new Date(
          start.getFullYear() + 1,
          start.getMonth(),
          start.getDate()
        );

    const today = todayStr();

    const arr: {
      key: string;
      label: string;
      day: number;
      tileNumber: number;
      done: boolean;
      isFuture: boolean;
      isToday: boolean;
    }[] = [];

    const cur = new Date(start);

    let idx = 0;

    while (
      cur <= end &&
      idx < 400
    ) {
      const key = dateKey(cur);

      const done =
        completions.has(key);

      arr.push({
        key,
        label: `${MONTHS[cur.getMonth()]} ${cur.getDate()}`,
        day: cur.getDate(),
        tileNumber: idx + 1,
        done,
        isFuture: key > today,
        isToday: key === today,
      });

      cur.setDate(
        cur.getDate() + 1
      );

      idx++;
    }

    return arr;
  }, [habit, completions]);

  const totalDays = tiles.length;

  const doneDays = tiles.filter(
    (t) => t.done
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
      },
    } as never);
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
      router.back();
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
        <PageHeader title="Habit" />

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
        <PageHeader title="Habit" />

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
      <PageHeader
        title={
          habit.name.length > 18
            ? habit.name.slice(0, 18) +
              '…'
            : habit.name
        }
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
                  color:
                    accentForeground,
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
              day streak
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
                  color:
                    accentForeground,
                },
              ]}
            >
              {doneDays}/{totalDays}
            </Text>

            <Text
              style={[
                styles.statLabel,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              Days
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
                  color:
                    accentForeground,
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
                  color:
                    accentForeground,
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
                        'transparent',
                      borderWidth: 1,
                      borderColor:
                        isDark
                          ? '#2A2A2A'
                          : '#ECE9E4',
                    },

                    tile.isToday &&
                      !tile.done && {
                        borderWidth: 1.5,
                        borderColor:
                          accentForeground,
                      },
                  ]}
                >
                  <Text
                    style={[
                      styles.tileDay,
                      isDark &&
                        !tile.done &&
                        styles.darkText,

                      tile.done && {
                        color:
                          onAccent,
                        fontFamily:
                          FONT_BOLD,
                      },

                      tile.isFuture && {
                        opacity: 0.3,
                      },
                    ]}
                  >
                    {tile.tileNumber}
                  </Text>
                </View>
              )
            )}
          </View>
        </View>

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
      </ScrollView>

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

  content: {
    padding: 16,
    paddingBottom: 30,
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
    gap: 5,
  },

  tile: {
    width: '9.5%',
    aspectRatio: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tileDay: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#27241F',
  },

  deleteBtn: {
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