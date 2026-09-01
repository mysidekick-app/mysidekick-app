import { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  CalendarDays,
  CheckCircle2,
  Gamepad2,
  HeartPulse,
  ListChecks,
  MoreVertical,
  BellRing,
  Sprout,
  WalletCards,
  Settings,
  ChevronLeft,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
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
=========================================================

   These are the ONLY seven well-being categories
   recognized by the dashboard.

   Blank Pages uses "blank_pages" as the canonical
   dashboard key, but "morning_pages" is still accepted
   because that is the original backend key.
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

  /*
   * The interface was renamed from Morning Pages
   * to Blank Pages, while the backend may still
   * contain morning_pages.
   */
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
  const [year, month, day] =
    value.split('-').map(Number);

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

  const repeat =
    task.repeat ?? 'none';

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

      const current = parseDate(
        date,
      );

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

      const current = parseDate(
        date,
      );

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
  const repeat =
    task.repeat ?? 'none';

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
  const {
    accentForeground,
    isDark,
  } = useApp();

  const [menuOpen, setMenuOpen] =
    useState(false);

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

             EXACTLY 7 SUPPORTED MODULES

             The denominator is based on the user's
             selected/enabled categories.

             Database duplicates cannot increase the
             denominator.

             morning_pages is normalized to blank_pages.
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
              /*
               * Store selected modules in a Set.
               *
               * This removes duplicate database rows.
               */
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

                /*
                 * Ignore unsupported / obsolete
                 * module keys.
                 */
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

              /*
               * TOTAL TRACKED
               *
               * This is now guaranteed to represent
               * unique supported categories only.
               */
              next.wellbeingTotal =
                selectedModuleKeys.size;

              /*
               * There are no selected modules.
               */
              if (
                selectedModuleKeys.size ===
                0
              ) {
                next.wellbeingCompleted = 0;
              } else {
                /*
                 * Blank Pages may exist in the database
                 * under either name.
                 */
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
                  /*
                   * Normalize every completed entry.
                   *
                   * Example:
                   *
                   * morning_pages
                   * blank_pages
                   *
                   * become the same canonical key:
                   *
                   * blank_pages
                   */
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

                  /*
                   * Completed cannot exceed total.
                   */
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
                  'game_sessions',
                )
                .select(
                  'id',
                )
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

  const dashboardItems:
    DashboardItem[] = [
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
     BACK TO CHAT LIST
     
     The chat list is:
     
       app/(tabs)/index.tsx
     
     NOT /chat.
  ======================================================= */

  const goToChatList =
    () => {
      router.push(
        '/(tabs)/' as any,
      );
    };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor:
            C.bg,
        },
      ]}
    >
      {/* =================================================
          HEADER
      ================================================= */}

      <View
        style={[
          styles.header,
          {
            borderBottomColor:
              C.border,
          },
        ]}
      >
        {/* BACK TO CHAT LIST */}

        <Pressable
          onPress={goToChatList}
          style={[
            styles.backButton,
            {
              backgroundColor:
                accentForeground,
            },
          ]}
          hitSlop={8}
          accessibilityLabel="Back to chat list"
        >
          <ChevronLeft
            color="#FFFFFF"
            size={21}
            strokeWidth={3}
          />
        </Pressable>

        {/* TITLE */}

        <Text
          style={[
            styles.headerTitle,
            {
              color:
                accentForeground,
            },
          ]}
        >
          DASHBOARD
        </Text>

        {/* MORE */}

        <Pressable
          onPress={() =>
            setMenuOpen(true)
          }
          style={
            styles.headerButton
          }
          hitSlop={12}
          accessibilityLabel="More options"
        >
          <MoreVertical
            color={C.text}
            size={22}
          />
        </Pressable>
      </View>

      {/* =================================================
          DASHBOARD
      ================================================= */}

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={
            styles.grid
          }
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
                style={({
                  pressed,
                }) => [
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
                      color:
                        C.text,
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
                      color:
                        C.text,
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
                      color:
                        C.muted,
                    },
                  ]}
                >
                  {description}
                </Text>
              </Pressable>
            ),
          )}
        </View>

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
                  color:
                    C.muted,
                },
              ]}
            >
              Some activity could not
              be loaded.
            </Text>
          </View>
        )}

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

      {/* =================================================
          SETTINGS MENU
      ================================================= */}

      {menuOpen && (
        <Pressable
          style={
            styles.menuOverlay
          }
          onPress={() =>
            setMenuOpen(false)
          }
        >
          <Pressable
            style={[
              styles.menu,
              {
                backgroundColor:
                  C.card,
                borderColor:
                  C.border,
              },
            ]}
            onPress={(event) =>
              event.stopPropagation()
            }
          >
            <Pressable
              onPress={() => {
                setMenuOpen(false);

                router.push(
                  '/(tabs)/profile',
                );
              }}
              style={
                styles.menuItem
              }
            >
              <View
                style={[
                  styles.menuIcon,
                  {
                    backgroundColor:
                      C.soft,
                  },
                ]}
              >
                <Settings
                  color={
                    accentForeground
                  }
                  size={17}
                />
              </View>

              <Text
                style={[
                  styles.menuItemText,
                  {
                    color:
                      C.text,
                  },
                ]}
              >
                Settings
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
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
       HEADER
    ===================================================== */

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal: 16,
      paddingTop: 24,
      paddingBottom: 8,
      borderBottomWidth: 1,
    },

    headerTitle: {
      fontFamily: FONT_BOLD,
      fontSize: 18,
      letterSpacing: 0.8,
    },

    /* =====================================================
       BACK BUTTON
    ===================================================== */

    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    headerButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    /* =====================================================
       CONTENT
    ===================================================== */

    content: {
      paddingHorizontal: 16,

      /*
       * Extra space before the dashboard modules/title area.
       */
      paddingTop: 30,

      paddingBottom: 36,
    },

    /* =====================================================
       DASHBOARD MODULE GRID

       THREE COLUMNS EVEN ON MOBILE
    ===================================================== */

    grid: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent:
        'space-between',
      rowGap: 10,
    },

    module: {
      width: '31.8%',
      minHeight: 142,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent:
        'center',
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
      justifyContent:
        'center',
      marginBottom: 2,
    },

    moduleLabel: {
      fontFamily: FONT_BOLD,
      fontSize: 8,
      letterSpacing: 0.15,
      textAlign: 'center',
      includeFontPadding:
        false,
      flexShrink: 1,
    },

    moduleValue: {
      fontFamily: FONT_BOLD,
      fontSize: 22,
      lineHeight: 25,
      textAlign: 'center',
      includeFontPadding:
        false,
    },

    moduleDescription: {
      fontFamily: FONT_MED,
      fontSize: 7.5,
      lineHeight: 10,
      textAlign: 'center',
      includeFontPadding:
        false,
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

    /* =====================================================
       MENU
    ===================================================== */

    menuOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor:
        'rgba(0,0,0,0.18)',
    },

    menu: {
      position: 'absolute',
      top: 72,
      right: 16,
      minWidth: 190,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 6,
      paddingHorizontal: 6,

      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 8,
    },

    menuItem: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 8,
      borderRadius: 11,
    },

    menuIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    menuItemText: {
      fontFamily: FONT_SEMI,
      fontSize: 13,
      flex: 1,
    },
  });