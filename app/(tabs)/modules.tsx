import { useCallback, useEffect, useState } from 'react';

import {
  Bookmark,
  CalendarDays,
  CheckCircle2,
  Gamepad2,
  HeartPulse,
  ListChecks,
  BellRing,
  Sprout,
  WalletCards,
} from 'lucide-react-native';

import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { router } from 'expo-router';

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

/* =========================================================
   TYPES
========================================================= */

type DashboardItem = {
  key: string;
  label: string;
  icon: typeof WalletCards;
  value: string;
  description: string;
  route: string;
};

type DashboardState = {
  planner: number;
  habits: number;
  finance: number;
  lists: number;
  reminders: number;
  bookmarks: number;
  plantsNeedingAttention: number;
  plantsTotal: number;
  wellbeingCompleted: number;
  wellbeingTotal: number;
  games: number;
};

/* =========================================================
   FONTS
========================================================= */

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

/* =========================================================
   SUPPORTED WELL-BEING MODULES
========================================================= */

const SUPPORTED_WELLBEING_MODULES = new Set([
  'journaling',
  'blank_pages',
  'shadow_work',
  'affirmations',
  'mood_tracker',
  'delights',
  'breathwork',
]);

function normalizeWellbeingModuleKey(
  key: string | null | undefined,
): string | null {
  if (!key) {
    return null;
  }

  if (key === 'morning_pages') {
    return 'blank_pages';
  }

  return key;
}

/* =========================================================
   DATE HELPERS
========================================================= */

function getTodayKey(): string {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function parseDate(value: string): Date {
  const [year, month, day] = value
    .split('-')
    .map(Number);

  return new Date(
    year,
    month - 1,
    day,
  );
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function addDays(
  dateString: string,
  days: number,
): string {
  const date = parseDate(dateString);

  date.setDate(
    date.getDate() + days,
  );

  return formatDate(date);
}

function daysBetween(
  start: string,
  end: string,
): number {
  return Math.round(
    (parseDate(end).getTime() -
      parseDate(start).getTime()) /
      86400000,
  );
}

/* =========================================================
   DASHBOARD DEFAULTS
========================================================= */

function emptyDashboard(): DashboardState {
  return {
    planner: 0,
    habits: 0,
    finance: 0,
    lists: 0,
    reminders: 0,
    bookmarks: 0,
    plantsNeedingAttention: 0,
    plantsTotal: 0,
    wellbeingCompleted: 0,
    wellbeingTotal: 0,
    games: 0,
  };
}

/* =========================================================
   PLANNER RECURRENCE HELPERS
========================================================= */

function occurrenceStartsOnDate(
  task: {
    start_date: string;
    repeat: string | null;
    repeat_interval: number | null;
  },
  date: string,
): boolean {
  if (date < task.start_date) {
    return false;
  }

  const repeat = task.repeat ?? 'none';

  if (repeat === 'none') {
    return date === task.start_date;
  }

  const diff = daysBetween(
    task.start_date,
    date,
  );

  const interval = Math.max(
    1,
    task.repeat_interval ?? 1,
  );

  switch (repeat) {
    case 'daily':
    case 'custom':
      return diff % interval === 0;

    case 'weekly':
      return diff % (7 * interval) === 0;

    case 'monthly': {
      const start = parseDate(
        task.start_date,
      );

      const current = parseDate(date);

      const monthDiff =
        (current.getFullYear() -
          start.getFullYear()) *
          12 +
        (current.getMonth() -
          start.getMonth());

      return (
        monthDiff >= 0 &&
        monthDiff % interval === 0 &&
        current.getDate() ===
          start.getDate()
      );
    }

    case 'yearly': {
      const start = parseDate(
        task.start_date,
      );

      const current = parseDate(date);

      const yearDiff =
        current.getFullYear() -
        start.getFullYear();

      return (
        yearDiff >= 0 &&
        yearDiff % interval === 0 &&
        current.getMonth() ===
          start.getMonth() &&
        current.getDate() ===
          start.getDate()
      );
    }

    default:
      return false;
  }
}

function isOvernightTask(
  startTime: string | null,
  endTime: string | null,
): boolean {
  if (!startTime || !endTime) {
    return false;
  }

  const [
    startHour,
    startMinute,
  ] = startTime
    .split(':')
    .map(Number);

  const [
    endHour,
    endMinute,
  ] = endTime
    .split(':')
    .map(Number);

  const startMinutes =
    startHour * 60 +
    startMinute;

  const endMinutes =
    endHour * 60 +
    endMinute;

  return endMinutes <= startMinutes;
}

function taskOccursToday(
  task: {
    start_date: string;
    end_date: string;
    start_time: string | null;
    end_time: string | null;
    repeat: string | null;
    repeat_interval: number | null;
  },
  today: string,
): boolean {
  const repeat = task.repeat ?? 'none';

  /* Non-recurring task */
  if (repeat === 'none') {
    if (
      today >= task.start_date &&
      today <= task.end_date
    ) {
      return true;
    }

    /* Overnight task beginning yesterday */
    if (
      isOvernightTask(
        task.start_time,
        task.end_time,
      ) &&
      today ===
        addDays(
          task.start_date,
          1,
        )
    ) {
      return true;
    }

    return false;
  }

  /* Recurring task beginning today */
  if (
    occurrenceStartsOnDate(
      task,
      today,
    )
  ) {
    return true;
  }

  /* Recurring overnight task beginning yesterday */
  if (
    isOvernightTask(
      task.start_time,
      task.end_time,
    ) &&
    occurrenceStartsOnDate(
      task,
      addDays(today, -1),
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   SCREEN
========================================================= */

export default function ModulesScreen() {
  const appContext = useApp() as any;

  const {
    accentForeground,
    isDark,
  } = appContext;

  const displayName =
    appContext.display_name ||
    appContext.profileName ||
    'User';

  const [dashboard, setDashboard] =
    useState<DashboardState>(
      emptyDashboard(),
    );

  const [todayKey, setTodayKey] =
    useState(getTodayKey());

  const [loading, setLoading] =
    useState(true);

  const [hasError, setHasError] =
    useState(false);

  /* =======================================================
     COLORS
  ======================================================= */

  const C = isDark
    ? {
        bg: '#090909',
        card: '#151515',
        border: '#2A2A2A',
        text: '#F4F2EE',
        muted: '#AAA59D',
        soft: '#242424',
      }
    : {
        bg: '#FBFAF8',
        card: '#FFFFFF',
        border: '#ECE9E4',
        text: '#27241F',
        muted: '#8F8A82',
        soft: '#F3F2EF',
      };

  /* =======================================================
     DATE REFRESH
  ======================================================= */

  useEffect(() => {
    const checkDate = () => {
      const nextKey =
        getTodayKey();

      if (
        nextKey !== todayKey
      ) {
        setTodayKey(nextKey);

        setDashboard(
          emptyDashboard(),
        );
      }
    };

    const interval =
      setInterval(
        checkDate,
        60 * 1000,
      );

    return () =>
      clearInterval(interval);
  }, [todayKey]);

  /* =======================================================
     DASHBOARD DATA
  ======================================================= */

  const loadDashboard =
    useCallback(
      async () => {
        try {
          setLoading(true);
          setHasError(false);

          /* ===============================================
             AUTH
          =============================================== */

          const {
            data: { user },
            error: userError,
          } =
            await supabase.auth.getUser();

          if (
            userError ||
            !user
          ) {
            setDashboard(
              emptyDashboard(),
            );

            setLoading(false);
            setHasError(true);

            return;
          }

          const next =
            emptyDashboard();

          /* ===============================================
             1. PLANNER
          =============================================== */

          try {
            const {
              data: plannerRows,
              error: plannerError,
            } =
              await supabase
                .from(
                  'planner_tasks',
                )
                .select(
                  `
                    id,
                    start_date,
                    end_date,
                    start_time,
                    end_time,
                    completed,
                    repeat,
                    repeat_interval
                  `,
                )
                .eq(
                  'user_id',
                  user.id,
                );

            if (plannerError) {
              console.log(
                'DASHBOARD PLANNER ERROR:',
                plannerError,
              );
            } else {
              next.planner =
                (
                  plannerRows ?? []
                ).filter(
                  (task) =>
                    !task.completed &&
                    taskOccursToday(
                      task,
                      todayKey,
                    ),
                ).length;
            }
          } catch (error) {
            console.log(
              'DASHBOARD PLANNER EXCEPTION:',
              error,
            );
          }

          /* ===============================================
             2. HABITS
          =============================================== */

          try {
            const [
              {
                data: habitsRows,
                error: habitsError,
              },
              {
                data: completionRows,
                error: completionError,
              },
            ] =
              await Promise.all([
                supabase
                  .from('habits')
                  .select(
                    'id, start_date, end_date',
                  )
                  .eq(
                    'user_id',
                    user.id,
                  ),

                supabase
                  .from(
                    'habit_completions',
                  )
                  .select(
                    'habit_id',
                  )
                  .eq(
                    'user_id',
                    user.id,
                  )
                  .eq(
                    'completed_on',
                    todayKey,
                  ),
              ]);

            if (
              habitsError ||
              completionError
            ) {
              console.log(
                'DASHBOARD HABITS ERROR:',
                habitsError ??
                  completionError,
              );
            } else {
              const completedHabitIds =
                new Set(
                  (
                    completionRows ??
                    []
                  ).map(
                    (row) =>
                      row.habit_id,
                  ),
                );

              next.habits =
                (
                  habitsRows ??
                  []
                ).filter(
                  (habit) => {
                    const startsTodayOrEarlier =
                      !habit.start_date ||
                      habit.start_date <=
                        todayKey;

                    const hasNotEnded =
                      !habit.end_date ||
                      habit.end_date >=
                        todayKey;

                    const completed =
                      completedHabitIds.has(
                        habit.id,
                      );

                    return (
                      startsTodayOrEarlier &&
                      hasNotEnded &&
                      !completed
                    );
                  },
                ).length;
            }
          } catch (error) {
            console.log(
              'DASHBOARD HABITS EXCEPTION:',
              error,
            );
          }

          /* ===============================================
             3. FINANCE
          =============================================== */

          try {
            const {
              data: financeRows,
              error: financeError,
            } =
              await supabase
                .from(
                  'finance_transactions',
                )
                .select('id')
                .eq(
                  'user_id',
                  user.id,
                )
                .eq(
                  'transaction_date',
                  todayKey,
                );

            if (financeError) {
              console.log(
                'DASHBOARD FINANCE ERROR:',
                financeError,
              );
            } else {
              next.finance =
                (
                  financeRows ??
                  []
                ).length;
            }
          } catch (error) {
            console.log(
              'DASHBOARD FINANCE EXCEPTION:',
              error,
            );
          }

          /* ===============================================
             4. LISTS
          =============================================== */

          try {
            const {
              data: listRows,
              error: listError,
            } =
              await supabase
                .from(
                  'list_items',
                )
                .select('id')
                .eq(
                  'user_id',
                  user.id,
                )
                .eq(
                  'completed',
                  false,
                );

            if (listError) {
              console.log(
                'DASHBOARD LISTS ERROR:',
                listError,
              );
            } else {
              next.lists =
                (
                  listRows ??
                  []
                ).length;
            }
          } catch (error) {
            console.log(
              'DASHBOARD LISTS EXCEPTION:',
              error,
            );
          }

          /* ===============================================
             5. REMINDERS
          =============================================== */

          try {
            const {
              data: reminderRows,
              error: reminderError,
            } =
              await supabase
                .from(
                  'reminders',
                )
                .select('id')
                .eq(
                  'user_id',
                  user.id,
                )
                .eq(
                  'due_date',
                  todayKey,
                )
                .eq(
                  'completed',
                  false,
                );

            if (reminderError) {
              console.log(
                'DASHBOARD REMINDERS ERROR:',
                reminderError,
              );
            } else {
              next.reminders =
                (
                  reminderRows ??
                  []
                ).length;
            }
          } catch (error) {
            console.log(
              'DASHBOARD REMINDERS EXCEPTION:',
              error,
            );
          }

          /* ===============================================
             6. BOOKMARKS
          =============================================== */

          try {
            const startOfToday =
              new Date();

            startOfToday.setHours(
              0,
              0,
              0,
              0,
            );

            const startOfTomorrow =
              new Date(
                startOfToday,
              );

            startOfTomorrow.setDate(
              startOfTomorrow.getDate() +
                1,
            );

            const {
              data: bookmarkRows,
              error: bookmarkError,
            } =
              await supabase
                .from(
                  'bookmarks',
                )
                .select('id')
                .eq(
                  'user_id',
                  user.id,
                )
                .gte(
                  'created_at',
                  startOfToday.toISOString(),
                )
                .lt(
                  'created_at',
                  startOfTomorrow.toISOString(),
                );

            if (bookmarkError) {
              console.log(
                'DASHBOARD BOOKMARKS ERROR:',
                bookmarkError,
              );
            } else {
              next.bookmarks =
                (
                  bookmarkRows ??
                  []
                ).length;
            }
          } catch (error) {
            console.log(
              'DASHBOARD BOOKMARKS EXCEPTION:',
              error,
            );
          }

          /* ===============================================
             7. PLANTS
          =============================================== */

          try {
            const {
              data: plantRows,
              error: plantError,
            } =
              await supabase
                .from(
                  'plants',
                )
                .select(
                  'id, last_watered_on, watering_interval_days',
                )
                .eq(
                  'user_id',
                  user.id,
                );

            if (plantError) {
              console.log(
                'DASHBOARD PLANTS ERROR:',
                plantError,
              );
            } else {
              const plants =
                plantRows ?? [];

              next.plantsTotal =
                plants.length;

              next.plantsNeedingAttention =
                plants.filter(
                  (plant) => {
                    if (
                      !plant.last_watered_on
                    ) {
                      return true;
                    }

                    const interval =
                      Math.max(
                        1,
                        Number(
                          plant.watering_interval_days ??
                            7,
                        ),
                      );

                    const nextWatering =
                      addDays(
                        plant.last_watered_on,
                        interval,
                      );

                    return (
                      nextWatering <=
                      todayKey
                    );
                  },
                ).length;
            }
          } catch (error) {
            console.log(
              'DASHBOARD PLANTS EXCEPTION:',
              error,
            );
          }

          /* ===============================================
             8. WELL-BEING
          =============================================== */

          try {
            const {
              data: wellbeingModules,
              error:
                wellbeingModuleError,
            } =
              await supabase
                .from(
                  'wellbeing_modules',
                )
                .select(
                  'module_key, enabled',
                )
                .eq(
                  'user_id',
                  user.id,
                )
                .eq(
                  'enabled',
                  true,
                );

            if (
              wellbeingModuleError
            ) {
              console.log(
                'DASHBOARD WELLBEING MODULE ERROR:',
                wellbeingModuleError,
              );
            } else {
              const selectedModuleKeys =
                new Set<string>();

              for (
                const row of
                  wellbeingModules ??
                  []
              ) {
                const normalizedKey =
                  normalizeWellbeingModuleKey(
                    row.module_key,
                  );

                if (
                  normalizedKey &&
                  SUPPORTED_WELLBEING_MODULES.has(
                    normalizedKey,
                  )
                ) {
                  selectedModuleKeys.add(
                    normalizedKey,
                  );
                }
              }

              next.wellbeingTotal =
                selectedModuleKeys.size;

              if (
                selectedModuleKeys.size ===
                0
              ) {
                next.wellbeingCompleted =
                  0;
              } else {
                const databaseKeys =
                  Array.from(
                    selectedModuleKeys,
                  ).flatMap(
                    (key) => {
                      if (
                        key ===
                        'blank_pages'
                      ) {
                        return [
                          'blank_pages',
                          'morning_pages',
                        ];
                      }

                      return [key];
                    },
                  );

                const {
                  data:
                    wellbeingEntries,
                  error:
                    wellbeingEntryError,
                } =
                  await supabase
                    .from(
                      'wellbeing_entries',
                    )
                    .select(
                      'module_key',
                    )
                    .eq(
                      'user_id',
                      user.id,
                    )
                    .eq(
                      'entry_date',
                      todayKey,
                    )
                    .in(
                      'module_key',
                      databaseKeys,
                    );

                if (
                  wellbeingEntryError
                ) {
                  console.log(
                    'DASHBOARD WELLBEING ENTRY ERROR:',
                    wellbeingEntryError,
                  );
                } else {
                  const completedModuleKeys =
                    new Set<string>();

                  for (
                    const row of
                      wellbeingEntries ??
                      []
                  ) {
                    const normalizedKey =
                      normalizeWellbeingModuleKey(
                        row.module_key,
                      );

                    if (
                      normalizedKey &&
                      selectedModuleKeys.has(
                        normalizedKey,
                      )
                    ) {
                      completedModuleKeys.add(
                        normalizedKey,
                      );
                    }
                  }

                  next.wellbeingCompleted =
                    Math.min(
                      completedModuleKeys.size,
                      next.wellbeingTotal,
                    );
                }
              }
            }
          } catch (error) {
            console.log(
              'DASHBOARD WELLBEING EXCEPTION:',
              error,
            );
          }

          /* ===============================================
             9. GAMES
             
             IMPORTANT:
             Games are recorded in game_scores.
             Count today's game score records for the
             currently logged-in player.
          =============================================== */

          try {
            const startOfToday =
              new Date();

            startOfToday.setHours(
              0,
              0,
              0,
              0,
            );

            const startOfTomorrow =
              new Date(
                startOfToday,
              );

            startOfTomorrow.setDate(
              startOfTomorrow.getDate() +
                1,
            );

            const {
              data: gameRows,
              error: gameError,
            } =
              await supabase
                .from(
                  'game_scores',
                )
                .select('id')
                .eq(
                  'player_id',
                  user.id,
                )
                .gte(
                  'created_at',
                  startOfToday.toISOString(),
                )
                .lt(
                  'created_at',
                  startOfTomorrow.toISOString(),
                );

            if (gameError) {
              console.log(
                'DASHBOARD GAMES ERROR:',
                gameError,
              );
            } else {
              next.games =
                (
                  gameRows ??
                  []
                ).length;

              console.log(
                'DASHBOARD GAMES COUNT:',
                next.games,
              );
            }
          } catch (error) {
            console.log(
              'DASHBOARD GAMES EXCEPTION:',
              error,
            );
          }

          /* ===============================================
             APPLY
          =============================================== */

          setDashboard(next);
          setLoading(false);
        } catch (error) {
          console.log(
            'DASHBOARD LOAD ERROR:',
            error,
          );

          setLoading(false);
          setHasError(true);
        }
      },
      [todayKey],
    );

  /* =======================================================
     LOAD
  ======================================================= */

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  /* =======================================================
     DASHBOARD MODULES
  ======================================================= */

  const dashboardItems: DashboardItem[] = [
    {
      key: 'planner',
      label: 'Planner',
      icon: CalendarDays,
      value: String(
        dashboard.planner,
      ),
      description:
        'incomplete tasks today',
      route: '/planner',
    },

    {
      key: 'habits',
      label: 'Habits',
      icon: CheckCircle2,
      value: String(
        dashboard.habits,
      ),
      description:
        'incomplete habits today',
      route: '/habits',
    },

    {
      key: 'finance',
      label: 'Finance',
      icon: WalletCards,
      value: String(
        dashboard.finance,
      ),
      description:
        'finance items logged today',
      route: '/modules/finances',
    },

    {
      key: 'lists',
      label: 'Lists',
      icon: ListChecks,
      value: String(
        dashboard.lists,
      ),
      description:
        'incomplete list items',
      route: '/modules/lists',
    },

    {
      key: 'reminders',
      label: 'Reminders',
      icon: BellRing,
      value: String(
        dashboard.reminders,
      ),
      description:
        'incomplete reminders',
      route: '/reminders',
    },

    {
      key: 'bookmarks',
      label: 'Bookmarks',
      icon: Bookmark,
      value: String(
        dashboard.bookmarks,
      ),
      description:
        'resources added today',
      route: '/bookmarks',
    },

    {
      key: 'plants',
      label: 'Plants',
      icon: Sprout,
      value: `${dashboard.plantsNeedingAttention}/${dashboard.plantsTotal}`,
      description:
        'needing attention',
      route: '/plants',
    },

    {
      key: 'wellbeing',
      label: 'Well-being',
      icon: HeartPulse,
      value: `${dashboard.wellbeingCompleted}/${dashboard.wellbeingTotal}`,
      description:
        'completed today',
      route: '/modules/wellbeing',
    },

    {
      key: 'games',
      label: 'Games',
      icon: Gamepad2,
      value: String(
        dashboard.games,
      ),
      description:
        'games played today',
      route: '/modules/games',
    },
  ];

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor: C.bg,
        },
      ]}
    >
      <StatusBar
        barStyle={
          isDark
            ? 'light-content'
            : 'dark-content'
        }
        backgroundColor={C.bg}
        translucent={false}
      />

      {/* =================================================
          FIXED SIDEKICK RECTANGLE
          
          This is intentionally OUTSIDE the ScrollView.
          It will remain static while the modules scroll.
      ================================================= */}

      <View
        style={styles.fixedSidekickArea}
      >
        <View
          style={[
            styles.sidekickPlaceholder,
            {
              backgroundColor:
                accentForeground,
            },
          ]}
        >
          {/* Sidekick instructor */}

          <View
            style={[
              styles.sidekickInstructor,
              {
                backgroundColor:
                  accentForeground,
              },
            ]}
          >
            <Image
              source={require('../../assets/sidekick-favicon.png')}
              style={
                styles.sidekickInstructorImage
              }
              resizeMode="contain"
            />
          </View>

          {/* Message indicators */}

          <View
            style={styles.sidekickDots}
          >
            <View
              style={[
                styles.sidekickDot,
                styles.sidekickDotActive,
              ]}
            />

            <View
              style={styles.sidekickDot}
            />

            <View
              style={styles.sidekickDot}
            />
          </View>

          {/* Sidekick content */}

          <View
            style={styles.sidekickContent}
          >
            <Text
              style={
                styles.sidekickGreeting
              }
            >
              Good morning {displayName},
            </Text>

            <Text
              style={
                styles.sidekickBody
              }
            >
              Your Sidekick will use
              this space for important
              updates, guidance,
              reminders, and
              instructions.
            </Text>
          </View>

          {/* Navigation */}

          <View
            style={
              styles.sidekickNavigation
            }
          >
            <Text
              style={
                styles.sidekickNavigationText
              }
            >
              Previous
            </Text>

            <Text
              style={
                styles.sidekickNavigationText
              }
            >
              Next
            </Text>
          </View>
        </View>
      </View>

      {/* =================================================
          SCROLLABLE MODULE AREA
          
          ONLY this section scrolls.
      ================================================= */}

      <ScrollView
        style={styles.modulesScroll}
        contentContainerStyle={
          styles.modulesContent
        }
        showsVerticalScrollIndicator={
          false
        }
        bounces={true}
      >
        <View
          style={styles.grid}
        >
          {dashboardItems.map(
            ({
              key,
              label,
              icon: Icon,
              value,
              description,
              route,
            }) => (
              <Pressable
                key={key}
                onPress={() =>
                  router.push(
                    route as any,
                  )
                }
                style={({ pressed }) => [
                  styles.module,
                  {
                    backgroundColor:
                      C.card,
                    borderColor:
                      C.border,
                  },
                  pressed &&
                    styles.modulePressed,
                ]}
                accessibilityLabel={`${label}: ${value} ${description}`}
              >
                {/* ICON */}

                <View
                  style={[
                    styles.moduleIcon,
                    {
                      backgroundColor:
                        accentForeground,
                    },
                  ]}
                >
                  <Icon
                    color="#FFFFFF"
                    size={25}
                    strokeWidth={2.1}
                  />
                </View>

                {/* LABEL */}

                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[
                    styles.moduleLabel,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  {label.toUpperCase()}
                </Text>

                {/* VALUE */}

                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[
                    styles.moduleValue,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  {loading
                    ? '—'
                    : value}
                </Text>

                {/* DESCRIPTION */}

                <Text
                  numberOfLines={2}
                  style={[
                    styles.moduleDescription,
                    {
                      color: C.muted,
                    },
                  ]}
                >
                  {description}
                </Text>
              </Pressable>
            ),
          )}
        </View>

        {/* ERROR */}

        {hasError && (
          <View
            style={
              styles.errorContainer
            }
          >
            <Text
              style={[
                styles.errorText,
                {
                  color: C.muted,
                },
              ]}
            >
              Some activity could not
              be loaded.
            </Text>
          </View>
        )}

        {/* LOADING */}

        {loading && (
          <View
            style={
              styles.loadingContainer
            }
          >
            <ActivityIndicator
              size="small"
              color={
                accentForeground
              }
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles =
  StyleSheet.create({
    safe: {
      flex: 1,
    },

    /* =====================================================
       FIXED SIDEKICK AREA
       This does NOT scroll.
    ===================================================== */

    fixedSidekickArea: {
      paddingHorizontal: 16,
      paddingTop: 80,
      paddingBottom: 10,
    },

    sidekickPlaceholder: {
      width: '100%',
      minHeight: 190,
      borderRadius: 24,
      paddingHorizontal: 32,
      paddingTop: 58,
      paddingBottom: 48,
      position: 'relative',
      overflow: 'visible',
    },

    sidekickInstructor: {
      position: 'absolute',
      top: -34,
      left: 0,
      width: 104,
      height: 104,
      borderRadius: 52,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },

    sidekickInstructorImage: {
      width: 82,
      height: 82,
    },

    sidekickDots: {
      position: 'absolute',
      top: 22,
      right: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 7,
    },

    sidekickDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: '#FFFFFF',
    },

    sidekickDotActive: {
      backgroundColor: '#FFFFFF',
    },

    sidekickContent: {
      width: '100%',
    },

    sidekickGreeting: {
      color: '#FFFFFF',
      fontFamily: FONT,
      fontSize: 15,
      lineHeight: 23,
      fontStyle: 'italic',
      marginBottom: 2,
    },

    sidekickBody: {
      color: '#FFFFFF',
      fontFamily: FONT,
      fontSize: 12,
      lineHeight: 19,
      fontStyle: 'italic',
      maxWidth: '95%',
    },

    sidekickNavigation: {
      position: 'absolute',
      left: 32,
      right: 28,
      bottom: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    sidekickNavigationText: {
      color: '#FFFFFF',
      fontFamily: FONT_BOLD,
      fontSize: 12,
    },

    /* =====================================================
       MODULE SCROLL AREA
       This is the ONLY scrolling section.
    ===================================================== */

    modulesScroll: {
      flex: 1,
    },

    modulesContent: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 36,
    },

    /* =====================================================
       MODULE GRID
    ===================================================== */

    grid: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 10,
    },

    module: {
      width: '31.8%',
      minHeight: 142,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },

    modulePressed: {
      opacity: 0.7,
      transform: [
        {
          scale: 0.98,
        },
      ],
    },

    moduleIcon: {
      width: 48,
      height: 48,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },

    moduleLabel: {
      fontFamily: FONT_BOLD,
      fontSize: 8,
      letterSpacing: 0.15,
      textAlign: 'center',
      includeFontPadding: false,
      flexShrink: 1,
    },

    moduleValue: {
      fontFamily: FONT_BOLD,
      fontSize: 22,
      lineHeight: 25,
      textAlign: 'center',
      includeFontPadding: false,
    },

    moduleDescription: {
      fontFamily: FONT_MED,
      fontSize: 7.5,
      lineHeight: 10,
      textAlign: 'center',
      includeFontPadding: false,
      maxWidth: '95%',
    },

    /* =====================================================
       LOADING / ERROR
    ===================================================== */

    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 18,
    },

    errorContainer: {
      alignItems: 'center',
      paddingTop: 16,
    },

    errorText: {
      fontFamily: FONT,
      fontSize: 9,
      textAlign: 'center',
    },
  });