import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Dimensions,
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
  MoreVertical,
  Check,
  ChevronLeft,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react-native';

import { router } from 'expo-router';

import { useApp } from '@/components/AppProvider';

import { supabase } from '@/lib/supabase';

import {
  WellbeingCalendar,
  formatDate,
  parseDate,
} from '@/components/WellbeingCalendar';

import { DatePickerInput } from '@/components/DatePickerInput';

import { TimePickerInput } from '@/components/TimePickerInput';

/* =========================================================
   TYPES
========================================================= */

type Subtask = {
  id: string;
  title: string;
  completed: boolean;
};

type RepeatType =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

type PlannerTask = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  collaborator: string | null;
  completed: boolean;
  repeat: RepeatType;
  repeat_interval: number;
  subtasks: Subtask[];
};

type ViewMode = 'calendar' | 'task';

type Palette = {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  input: string;
  inputBorder: string;
  divider: string;
};

/* =========================================================
   CONSTANTS
========================================================= */

const HOURS = Array.from(
  { length: 24 },
  (_, i) => i,
);

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

const REPEAT_OPTIONS: {
  key: RepeatType;
  label: string;
}[] = [
  {
    key: 'none',
    label: 'Never',
  },
  {
    key: 'daily',
    label: 'Daily',
  },
  {
    key: 'weekly',
    label: 'Weekly',
  },
  {
    key: 'monthly',
    label: 'Monthly',
  },
  {
    key: 'yearly',
    label: 'Yearly',
  },
  {
    key: 'custom',
    label: 'Custom',
  },
];

const CARD_COLORS = [
  '#4A90D9',
  '#E8873E',
  '#5BAE6F',
  '#D94A5A',
  '#9B6BD4',
  '#3AA9B0',
  '#666666',
];

/* =========================================================
   HELPERS
========================================================= */

const todayStr = () =>
  formatDateString(new Date());

function formatDateString(date: Date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

const formatHour = (h: number) => {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
};

const timeToMinutes = (
  time: string | null,
) => {
  if (!time) return null;

  const [hours, minutes] = time
    .split(':')
    .map(Number);

  return hours * 60 + minutes;
};

const prettyTime = (
  time: string | null,
) => {
  if (!time) return '';

  const [hours, minutes] = time
    .split(':')
    .map(Number);

  const hour =
    hours % 12 === 0
      ? 12
      : hours % 12;

  const period =
    hours >= 12 ? 'PM' : 'AM';

  return `${hour}:${String(
    minutes,
  ).padStart(2, '0')} ${period}`;
};

const addDays = (
  dateStr: string,
  days: number,
): string => {
  const date = parseDate(dateStr);

  date.setDate(
    date.getDate() + days,
  );

  return formatDateString(date);
};

const daysBetween = (
  startStr: string,
  endStr: string,
) => {
  return Math.round(
    (parseDate(endStr).getTime() -
      parseDate(startStr).getTime()) /
      86400000,
  );
};

const dateIsBefore = (
  a: string,
  b: string,
) => a < b;

const dateIsAfter = (
  a: string,
  b: string,
) => a > b;

/*
 * A task is considered overnight when its
 * end time is earlier than or equal to its
 * start time.
 *
 * Example:
 * 21:00 → 05:00
 *
 * becomes:
 * 21:00 → 29:00
 */
const getTaskDurationMinutes = (
  task: PlannerTask,
) => {
  const start =
    timeToMinutes(
      task.start_time,
    );

  const end =
    timeToMinutes(
      task.end_time,
    );

  if (
    start === null ||
    end === null
  ) {
    return 60;
  }

  if (end <= start) {
    return (
      end +
      1440 -
      start
    );
  }

  return end - start;
};

const isOvernightTask = (
  task: PlannerTask,
) => {
  const start =
    timeToMinutes(
      task.start_time,
    );

  const end =
    timeToMinutes(
      task.end_time,
    );

  if (
    start === null ||
    end === null
  ) {
    return false;
  }

  return end <= start;
};

/*
 * Convert an existing database row into
 * the UI repeat type.
 *
 * We use daily + interval > 1 internally
 * for Custom so the existing database can
 * be retained without a migration.
 */
const normalizeRepeat = (
  repeat: string | null | undefined,
  repeatInterval: number,
): RepeatType => {
  if (!repeat) return 'none';

  if (
    repeat === 'daily' &&
    repeatInterval > 1
  ) {
    return 'custom';
  }

  if (
    repeat === 'daily' ||
    repeat === 'weekly' ||
    repeat === 'monthly' ||
    repeat === 'yearly'
  ) {
    return repeat;
  }

  return 'none';
};

/*
 * Does a recurring task have an occurrence
 * starting on this date?
 */
const occurrenceStartsOnDate = (
  task: PlannerTask,
  date: string,
) => {
  if (
    dateIsBefore(
      date,
      task.start_date,
    )
  ) {
    return false;
  }

  if (
    task.repeat === 'none'
  ) {
    return (
      date ===
        task.start_date
    );
  }

  const diff = daysBetween(
    task.start_date,
    date,
  );

  const interval = Math.max(
    1,
    task.repeat_interval || 1,
  );

  switch (task.repeat) {
    case 'daily':
      return (
        diff % interval === 0
      );

    case 'custom':
      return (
        diff % interval === 0
      );

    case 'weekly':
      return (
        diff %
          (7 * interval) ===
        0
      );

    case 'monthly': {
      const start =
        parseDate(
          task.start_date,
        );

      const current =
        parseDate(date);

      const monthDiff =
        (current.getFullYear() -
          start.getFullYear()) *
          12 +
        (current.getMonth() -
          start.getMonth());

      return (
        monthDiff >= 0 &&
        monthDiff % interval ===
          0 &&
        current.getDate() ===
          start.getDate()
      );
    }

    case 'yearly': {
      const start =
        parseDate(
          task.start_date,
        );

      const current =
        parseDate(date);

      const yearDiff =
        current.getFullYear() -
        start.getFullYear();

      return (
        yearDiff >= 0 &&
        yearDiff % interval ===
          0 &&
        current.getMonth() ===
          start.getMonth() &&
        current.getDate() ===
          start.getDate()
      );
    }

    default:
      return false;
  }
};

/*
 * Returns timeline segments that intersect
 * the selected calendar date.
 *
 * This is what lets:
 *
 * 9 PM → 5 AM
 *
 * show correctly across midnight.
 */
type TimelineInterval = {
  start: number;
  end: number;
};

const getTaskIntervalsForDate = (
  task: PlannerTask,
  date: string,
): TimelineInterval[] => {
  const segments: TimelineInterval[] = [];

  const start =
    timeToMinutes(
      task.start_time,
    );

  const end =
    timeToMinutes(
      task.end_time,
    );

  /*
   * Untimed task.
   */
  if (
    start === null ||
    end === null
  ) {
    return [];
  }

  /*
   * Regular non-recurring task.
   */
  if (
    task.repeat === 'none'
  ) {
    if (
      date === task.start_date
    ) {
      if (end <= start) {
        segments.push({
          start,
          end: end + 1440,
        });
      } else {
        segments.push({
          start,
          end,
        });
      }

      return segments;
    }

    /*
     * Overnight continuation on
     * the following day.
     */
    if (
      isOvernightTask(task) &&
      date ===
        addDays(
          task.start_date,
          1,
        )
    ) {
      segments.push({
        start: 0,
        end,
      });
    }

    return segments;
  }

  /*
   * Recurring tasks:
   *
   * Check an occurrence starting today.
   * Also check an occurrence starting
   * yesterday, because it may cross
   * midnight into today.
   */
  const possibleStarts = [
    date,
    addDays(date, -1),
  ];

  possibleStarts.forEach(
    (occurrenceDate) => {
      if (
        !occurrenceStartsOnDate(
          task,
          occurrenceDate,
        )
      ) {
        return;
      }

      if (
        occurrenceDate ===
        date
      ) {
        if (end <= start) {
          segments.push({
            start,
            end: end + 1440,
          });
        } else {
          segments.push({
            start,
            end,
          });
        }
      } else if (
        occurrenceDate ===
        addDays(date, -1)
      ) {
        if (end <= start) {
          segments.push({
            start: 0,
            end,
          });
        }
      }
    },
  );

  return segments;
};

/*
 * Calculate all calendar dates on which a
 * task appears.
 *
 * We generate enough history/future to
 * cover the normal calendar navigation
 * range.
 */
const getTaskCalendarDates = (
  task: PlannerTask,
) => {
  const result = new Set<string>();

  if (
    task.repeat === 'none'
  ) {
    let date = task.start_date;

    while (
      date <= task.end_date
    ) {
      result.add(date);

      date = addDays(
        date,
        1,
      );
    }

    /*
     * Overnight continuation.
     */
    if (
      isOvernightTask(task)
    ) {
      result.add(
        addDays(
          task.start_date,
          1,
        ),
      );
    }

    return result;
  }

  const calendarStart =
    dateIsBefore(
      task.start_date,
      addDays(
        todayStr(),
        -365,
      ),
    )
      ? task.start_date
      : addDays(
          todayStr(),
          -365,
        );

  const calendarEnd =
    addDays(
      todayStr(),
      365,
    );

  let date = calendarStart;

  while (
    date <= calendarEnd
  ) {
    if (
      occurrenceStartsOnDate(
        task,
        date,
      )
    ) {
      result.add(date);

      if (
        isOvernightTask(task)
      ) {
        result.add(
          addDays(
            date,
            1,
          ),
        );
      }
    }

    date = addDays(
      date,
      1,
    );
  }

  return result;
};

/*
 * Used to create a task color locally.
 */
const getTaskColor = (
  id: string,
) => {
  let total = 0;

  for (
    let i = 0;
    i < id.length;
    i++
  ) {
    total +=
      id.charCodeAt(i);
  }

  return CARD_COLORS[
    total % CARD_COLORS.length
  ];
};

/* =========================================================
   MAIN SCREEN
========================================================= */

export default function PlannerScreen() {
  const isMobileScreen = Dimensions.get('window').width < 768;

  const {
    accentForeground,
    isDark,
    onAccent,
  } = useApp();

  const [
    viewMode,
    setViewMode,
  ] = useState<ViewMode>(
    'calendar',
  );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(todayStr());

  const [
    tasks,
    setTasks,
  ] = useState<PlannerTask[]>(
    [],
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);

  const [
    selectedTaskId,
    setSelectedTaskId,
  ] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [
    editingTaskId,
    setEditingTaskId,
  ] = useState<string | null>(null);

  /* =====================================================
     FORM STATE
  ===================================================== */

  const [
    taskTitle,
    setTaskTitle,
  ] = useState('');

  const [
    taskDesc,
    setTaskDesc,
  ] = useState('');

  const [
    subtaskInputs,
    setSubtaskInputs,
  ] = useState<string[]>(
    [''],
  );

  const [
    subtaskInputIds,
    setSubtaskInputIds,
  ] = useState<(string | null)[]>(
    [null],
  );

  const [
    startDate,
    setStartDate,
  ] = useState(todayStr());

  const [
    startTime,
    setStartTime,
  ] = useState('09:00');

  const [
    endTime,
    setEndTime,
  ] = useState('10:00');

  const [
    repeat,
    setRepeat,
  ] = useState<RepeatType>(
    'none',
  );

  const [
    repeatInterval,
    setRepeatInterval,
  ] = useState('1');

  const [
    collaborator,
    setCollaborator,
  ] = useState('');

  const [
    cardColor,
    setCardColor,
  ] = useState(
    CARD_COLORS[0],
  );

  const [
    saving,
    setSaving,
  ] = useState(false);

  /* =====================================================
     THEME
  ===================================================== */

  const C: Palette = isDark
    ? {
        bg: '#090909',
        card: '#151515',
        border: '#2A2A2A',
        text: '#F4F2EE',
        muted: '#AAA59D',
        input: '#1E1E1E',
        inputBorder: '#363636',
        divider: '#262626',
      }
    : {
        bg: '#FBFAF8',
        card: '#FFFFFF',
        border: '#ECE9E4',
        text: '#27241F',
        muted: '#8F8A82',
        input: '#FCFBF9',
        inputBorder: '#E0DDD7',
        divider: '#F0EEEA',
      };

  /* =====================================================
     LOAD TASKS
  ===================================================== */

  const loadTasks =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const {
          data: taskRows,
          error: taskError,
        } = await supabase
          .from('planner_tasks')
          .select(
            `
            id,
            title,
            description,
            start_date,
            end_date,
            start_time,
            end_time,
            collaborator,
            completed,
            repeat,
            repeat_interval
            `,
          )
          .order(
            'start_date',
            {
              ascending: true,
            },
          );

        if (taskError) {
          console.log(
            'PLANNER TASK LOAD ERROR:',
            taskError,
          );

          setError(
            'Planner tasks could not be loaded.',
          );

          return;
        }

        const {
          data: subRows,
          error: subError,
        } = await supabase
          .from(
            'planner_subtasks',
          )
          .select(
            `
            id,
            task_id,
            title,
            completed,
            position
            `,
          )
          .order(
            'position',
            {
              ascending: true,
            },
          );

        if (subError) {
          console.log(
            'PLANNER SUBTASK LOAD ERROR:',
            subError,
          );

          setError(
            'Planner subtasks could not be loaded.',
          );

          return;
        }

        const subtasks =
          (subRows ?? []) as {
            id: string;
            task_id: string;
            title: string;
            completed: boolean;
            position: number;
          }[];

        const mappedTasks: PlannerTask[] =
          (
            (taskRows ??
              []) as any[]
          ).map(
            (task) => {
              const repeatInterval =
                Math.max(
                  1,
                  task.repeat_interval ??
                    1,
                );

              return {
                id: task.id,
                title: task.title,
                description:
                  task.description ??
                  null,
                start_date:
                  task.start_date,
                end_date:
                  task.end_date,
                start_time:
                  task.start_time ??
                  null,
                end_time:
                  task.end_time ??
                  null,
                collaborator:
                  task.collaborator ??
                  null,
                completed:
                  task.completed ??
                  false,
                repeat:
                  normalizeRepeat(
                    task.repeat,
                    repeatInterval,
                  ),
                repeat_interval:
                  repeatInterval,
                subtasks:
                  subtasks
                    .filter(
                      (sub) =>
                        sub.task_id ===
                        task.id,
                    )
                    .map(
                      (sub) => ({
                        id: sub.id,
                        title:
                          sub.title,
                        completed:
                          sub.completed ??
                          false,
                      }),
                    ),
              };
            },
          );

        setTasks(
          mappedTasks,
        );
      } catch (err) {
        console.log(
          'PLANNER LOAD UNEXPECTED ERROR:',
          err,
        );

        setError(
          'Something went wrong loading the planner.',
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /* =====================================================
     CALENDAR TASK DATES
  ===================================================== */

  const taskDates = useMemo(() => {
    const dates =
      new Set<string>();

    tasks.forEach(
      (task) => {
        const taskCalendarDates =
          getTaskCalendarDates(
            task,
          );

        taskCalendarDates.forEach(
          (date) =>
            dates.add(date),
        );
      },
    );

    return dates;
  }, [tasks]);

  /* =====================================================
     SELECTED DAY TASKS
  ===================================================== */

  const selectedTasks =
    useMemo(() => {
      return tasks.filter(
        (task) =>
          getTaskIntervalsForDate(
            task,
            selectedDate,
          ).length > 0 ||
          (
            task.start_date <=
              selectedDate &&
            selectedDate <=
              task.end_date
          ) ||
          (
            task.repeat !== 'none' &&
            occurrenceStartsOnDate(
              task,
              selectedDate,
            )
          ),
      );
    }, [
      tasks,
      selectedDate,
    ]);

  const handleCalendarTaskSelect =
    useCallback((task: PlannerTask) => {
      setSelectedTaskId(task.id);
      setTimeout(() => {
        setSelectedTaskId((current) =>
          current === task.id ? null : current,
        );
      }, 700);
    }, []);

  /* =====================================================
     OPEN NEW / EDIT TASK
  ===================================================== */

  const resetTaskForm = () => {
    setTaskTitle('');
    setTaskDesc('');
    setSubtaskInputs(['']);
    setSubtaskInputIds([null]);
    setStartDate(selectedDate);
    setStartTime('09:00');
    setEndTime('10:00');
    setRepeat('none');
    setRepeatInterval('1');
    setCollaborator('');
    setCardColor(CARD_COLORS[0]);
    setEditingTaskId(null);
    setError(null);
  };

  const openNewTask =
    (date?: string) => {
      resetTaskForm();

      setStartDate(
        date ??
          selectedDate,
      );

      setModalOpen(true);
    };

  const openEditTask =
    (task: PlannerTask) => {
      setEditingTaskId(task.id);
      setTaskTitle(task.title);
      setTaskDesc(task.description ?? '');

      setSubtaskInputs(
        task.subtasks.length > 0
          ? task.subtasks.map(
              (subtask) =>
                subtask.title,
            )
          : [''],
      );

      setSubtaskInputIds(
        task.subtasks.length > 0
          ? task.subtasks.map(
              (subtask) =>
                subtask.id,
            )
          : [null],
      );

      setStartDate(task.start_date);
      setStartTime(
        task.start_time ?? '09:00',
      );
      setEndTime(
        task.end_time ?? '10:00',
      );
      setRepeat(task.repeat);
      setRepeatInterval(
        String(
          task.repeat_interval || 1,
        ),
      );
      setCollaborator(
        task.collaborator ?? '',
      );
      setCardColor(
        getTaskColor(task.id),
      );
      setError(null);
      setModalOpen(true);
    };

  /* =====================================================
     SAVE TASK
  ===================================================== */

  const saveTask = async () => {
    if (!taskTitle.trim()) {
      setError(
        'Please enter a task title.',
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const {
        data: {
          user,
        },
        error: userError,
      } =
        await supabase.auth.getUser();

      if (userError || !user) {
        console.log(
          'PLANNER USER ERROR:',
          userError,
        );

        setError(
          'You must be signed in to save a task.',
        );

        return;
      }

      const subtaskEntries =
        subtaskInputs
          .map(
            (value, index) => ({
              title: value.trim(),
              id:
                subtaskInputIds[
                  index
                ] ?? null,
            }),
          )
          .filter(
            (entry) =>
              entry.title.length > 0,
          );

      const startMinutes =
        timeToMinutes(
          startTime,
        );

      const endMinutes =
        timeToMinutes(
          endTime,
        );

      const overnight =
        startMinutes !== null &&
        endMinutes !== null &&
        endMinutes <=
          startMinutes;

      const endDate =
        overnight
          ? addDays(
              startDate,
              1,
            )
          : startDate;

      const dbRepeat:
        | 'none'
        | 'daily'
        | 'weekly'
        | 'monthly'
        | 'yearly' =
        repeat === 'custom'
          ? 'daily'
          : repeat;

      const dbRepeatInterval =
        repeat === 'custom'
          ? Math.max(
              1,
              Number(
                repeatInterval,
              ) || 1,
            )
          : 1;

      const taskPayload = {
        title:
          taskTitle.trim(),
        description:
          taskDesc.trim() ||
          null,
        start_date:
          startDate,
        end_date:
          endDate,
        start_time:
          startTime || null,
        end_time:
          endTime || null,
        collaborator:
          collaborator.trim() ||
          null,
        repeat:
          dbRepeat,
        repeat_interval:
          dbRepeatInterval,
      };

      let taskRow: any = null;

      if (editingTaskId) {
        const {
          data,
          error: taskError,
        } =
          await supabase
            .from(
              'planner_tasks',
            )
            .update(
              taskPayload,
            )
            .eq(
              'id',
              editingTaskId,
            )
            .eq(
              'user_id',
              user.id,
            )
            .select(
              `
              id,
              title,
              description,
              start_date,
              end_date,
              start_time,
              end_time,
              collaborator,
              completed,
              repeat,
              repeat_interval
              `,
            )
            .single();

        if (taskError) {
          console.log(
            'PLANNER TASK UPDATE ERROR:',
            taskError,
          );

          setError(
            'The task could not be updated.',
          );

          return;
        }

        taskRow = data;
      } else {
        const {
          data,
          error: taskError,
        } =
          await supabase
            .from(
              'planner_tasks',
            )
            .insert({
              user_id:
                user.id,
              ...taskPayload,
              completed:
                false,
            })
            .select(
              `
              id,
              title,
              description,
              start_date,
              end_date,
              start_time,
              end_time,
              collaborator,
              completed,
              repeat,
              repeat_interval
              `,
            )
            .single();

        if (taskError) {
          console.log(
            'PLANNER TASK SAVE ERROR:',
            taskError,
          );

          setError(
            'The task could not be saved.',
          );

          return;
        }

        taskRow = data;
      }

      if (!taskRow) {
        setError(
          'The task was not returned after saving.',
        );
        return;
      }

      const existingTask =
        editingTaskId
          ? tasks.find(
              (task) =>
                task.id ===
                editingTaskId,
            ) ?? null
          : null;

      const existingSubtasks =
        existingTask?.subtasks ??
        [];

      const keptSubtaskIds =
        new Set<string>();

      const savedSubs: Subtask[] =
        [];

      for (
        let index = 0;
        index <
          subtaskEntries.length;
        index += 1
      ) {
        const {
          title,
          id: retainedId,
        } = subtaskEntries[index];

        if (retainedId) {
          const {
            error:
              subtaskUpdateError,
          } =
            await supabase
              .from(
                'planner_subtasks',
              )
              .update({
                title,
                position:
                  index,
              })
              .eq(
                'id',
                retainedId,
              )
              .eq(
                'task_id',
                taskRow.id,
              )
              .eq(
                'user_id',
                user.id,
              );

          if (
            subtaskUpdateError
          ) {
            throw subtaskUpdateError;
          }

          keptSubtaskIds.add(
            retainedId,
          );

          const existing =
            existingSubtasks.find(
              (subtask) =>
                subtask.id ===
                retainedId,
            );

          savedSubs.push({
            id: retainedId,
            title,
            completed:
              existing?.completed ??
              false,
          });
        } else {
          const {
            data:
              insertedSubtask,
            error:
              subtaskInsertError,
          } =
            await supabase
              .from(
                'planner_subtasks',
              )
              .insert({
                user_id:
                  user.id,
                task_id:
                  taskRow.id,
                title,
                completed:
                  false,
                position:
                  index,
              })
              .select(
                `
                id,
                title,
                completed
                `,
              )
              .single();

          if (
            subtaskInsertError
          ) {
            throw subtaskInsertError;
          }

          savedSubs.push({
            id:
              insertedSubtask.id,
            title:
              insertedSubtask.title,
            completed:
              insertedSubtask.completed ??
              false,
          });
        }
      }

      const removedSubtaskIds =
        existingSubtasks
          .map(
            (subtask) =>
              subtask.id,
          )
          .filter(
            (id) =>
              !keptSubtaskIds.has(
                id,
              ),
          );

      if (
        removedSubtaskIds.length >
        0
      ) {
        const {
          error:
            subtaskDeleteError,
        } =
          await supabase
            .from(
              'planner_subtasks',
            )
            .delete()
            .in(
              'id',
              removedSubtaskIds,
            )
            .eq(
              'task_id',
              taskRow.id,
            )
            .eq(
              'user_id',
              user.id,
            );

        if (
          subtaskDeleteError
        ) {
          throw subtaskDeleteError;
        }
      }

      const savedRepeatInterval =
        Math.max(
          1,
          taskRow.repeat_interval ??
            1,
        );

      const savedTask:
        PlannerTask = {
        id:
          taskRow.id,
        title:
          taskRow.title,
        description:
          taskRow.description ??
          null,
        start_date:
          taskRow.start_date,
        end_date:
          taskRow.end_date,
        start_time:
          taskRow.start_time ??
          null,
        end_time:
          taskRow.end_time ??
          null,
        collaborator:
          taskRow.collaborator ??
          null,
        completed:
          existingTask?.completed ??
          taskRow.completed ??
          false,
        repeat:
          normalizeRepeat(
            taskRow.repeat,
            savedRepeatInterval,
          ),
        repeat_interval:
          savedRepeatInterval,
        subtasks:
          savedSubs,
      };

      setTasks(
        (current) => {
          const withoutTask =
            current.filter(
              (item) =>
                item.id !==
                savedTask.id,
            );

          return [
            ...withoutTask,
            savedTask,
          ].sort(
            (a, b) =>
              a.start_date.localeCompare(
                b.start_date,
              ),
          );
        },
      );

      setSelectedTaskId(
        savedTask.id,
      );

      setSelectedDate(
        startDate,
      );

      setModalOpen(false);
      setEditingTaskId(null);
      setTaskTitle('');
      setTaskDesc('');
      setSubtaskInputs(['']);
      setSubtaskInputIds([null]);
      setStartTime('09:00');
      setEndTime('10:00');
      setRepeat('none');
      setRepeatInterval('1');
      setCollaborator('');
      setCardColor(
        CARD_COLORS[0],
      );
    } catch (err) {
      console.log(
        'PLANNER SAVE UNEXPECTED ERROR:',
        err,
      );

      setError(
        editingTaskId
          ? 'The task could not be updated.'
          : 'Something went wrong while saving the task.',
      );
    } finally {
      setSaving(false);
    }
  };

  /* =====================================================
     TOGGLE TASK
  ===================================================== */

  const toggleTask =
    async (
      task: PlannerTask,
    ) => {
      const newCompleted =
        !task.completed;

      setTasks(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              task.id
                ? {
                    ...item,
                    completed:
                      newCompleted,
                  }
                : item,
          ),
      );

      const {
        error: updateError,
      } =
        await supabase
          .from(
            'planner_tasks',
          )
          .update({
            completed:
              newCompleted,
          })
          .eq(
            'id',
            task.id,
          );

      if (updateError) {
        console.log(
          'PLANNER TASK TOGGLE ERROR:',
          updateError,
        );

        setTasks(
          (current) =>
            current.map(
              (item) =>
                item.id ===
                task.id
                  ? {
                      ...item,
                      completed:
                        task.completed,
                    }
                  : item,
            ),
        );

        setError(
          'The task could not be updated.',
        );
      }
    };

  /* =====================================================
     TOGGLE SUBTASK
  ===================================================== */

  const toggleSubtask =
    async (
      task: PlannerTask,
      subtaskId: string,
    ) => {
      const subtask =
        task.subtasks.find(
          (item) =>
            item.id ===
            subtaskId,
        );

      if (!subtask) {
        return;
      }

      const newCompleted =
        !subtask.completed;

      setTasks(
        (current) =>
          current.map(
            (item) => {
              if (
                item.id !==
                task.id
              ) {
                return item;
              }

              return {
                ...item,

                subtasks:
                  item.subtasks.map(
                    (
                      sub,
                    ) =>
                      sub.id ===
                      subtaskId
                        ? {
                            ...sub,
                            completed:
                              newCompleted,
                          }
                        : sub,
                  ),
              };
            },
          ),
      );

      const {
        error: updateError,
      } =
        await supabase
          .from(
            'planner_subtasks',
          )
          .update({
            completed:
              newCompleted,
          })
          .eq(
            'id',
            subtaskId,
          );

      if (updateError) {
        console.log(
          'PLANNER SUBTASK TOGGLE ERROR:',
          updateError,
        );

        setTasks(
          (current) =>
            current.map(
              (item) => {
                if (
                  item.id !==
                  task.id
                ) {
                  return item;
                }

                return {
                  ...item,

                  subtasks:
                    item.subtasks.map(
                      (
                        sub,
                      ) =>
                        sub.id ===
                        subtaskId
                          ? {
                              ...sub,
                              completed:
                                subtask.completed,
                            }
                          : sub,
                    ),
                };
              },
            ),
        );

        setError(
          'The subtask could not be updated.',
        );
      }
    };

  /* =====================================================
     DELETE TASK
  ===================================================== */

  const deleteTask =
    async (
      task: PlannerTask,
    ) => {
      setError(null);

      const {
        error:
          subtaskDeleteError,
      } =
        await supabase
          .from(
            'planner_subtasks',
          )
          .delete()
          .eq(
            'task_id',
            task.id,
          );

      if (
        subtaskDeleteError
      ) {
        console.log(
          'PLANNER SUBTASK DELETE ERROR:',
          subtaskDeleteError,
        );

        setError(
          'The task could not be deleted.',
        );

        return;
      }

      const {
        error:
          taskDeleteError,
      } =
        await supabase
          .from(
            'planner_tasks',
          )
          .delete()
          .eq(
            'id',
            task.id,
          );

      if (
        taskDeleteError
      ) {
        console.log(
          'PLANNER TASK DELETE ERROR:',
          taskDeleteError,
        );

        setError(
          'The task could not be deleted.',
        );

        return;
      }

      setTasks(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              task.id,
          ),
      );

      setSelectedTaskId(
        (current) =>
          current === task.id
            ? null
            : current,
      );
    };

  /* =====================================================
     RENDER
  ===================================================== */

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
      {/* HEADER */}

      <View
        style={[
          styles.header,
          {
            borderBottomColor:
              C.border,
          },
        ]}
      >
        <Pressable
          onPress={() =>
            router.push(
              '/modules',
            )
          }
          style={[
            styles.headerBack,
            {
              backgroundColor:
                accentForeground,
            },
          ]}
          hitSlop={12}
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.4}
          />
        </Pressable>

        <Text
          style={[
            styles.headerTitle,
            {
              color:
                accentForeground,
            },
          ]}
        >
          PLANNER
        </Text>

        <Pressable
          onPress={() => setMenuOpen(true)}
          style={styles.headerBtn}
          hitSlop={12}
        >
          <MoreVertical
            color={C.text}
            size={22}
          />
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.headerMenuShade}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={[
              styles.headerMenuCard,
              {
                backgroundColor: C.card,
                borderColor: C.border,
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <Pressable
  style={styles.headerMenuItem}
  onPress={() => {
    setMenuOpen(false);
    router.push('/(tabs)/profile');
  }}
>
              <Text
                style={[
                  styles.headerMenuText,
                  { color: C.text },
                ]}
              >
                Settings
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* VIEW TOGGLE */}

        <View
          style={[
            styles.viewToggle,
            {
              backgroundColor:
                isDark
                  ? '#1A1A1A'
                  : '#EFEDE8',
            },
          ]}
        >
          {(
            [
              'calendar',
              'task',
            ] as ViewMode[]
          ).map(
            (mode) => (
              <Pressable
                key={mode}
                onPress={() =>
                  setViewMode(
                    mode,
                  )
                }
                style={[
                  styles.viewOption,
                  viewMode ===
                    mode && {
                    backgroundColor:
                      accentForeground,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.viewText,
                    {
                      color:
                        isDark
                          ? '#AAA59D'
                          : '#7C7870',
                    },
                    viewMode ===
                      mode && {
                      color:
                        onAccent,
                    },
                  ]}
                >
                  {mode ===
                  'calendar'
                    ? 'Calendar'
                    : 'Task'}
                </Text>
              </Pressable>
            ),
          )}
        </View>

        {/* ERROR */}

        {error && (
          <Text
            style={[
              styles.error,
              {
                color:
                  '#C53A2F',
              },
            ]}
          >
            {error}
          </Text>
        )}

        {/* CALENDAR */}

        <WellbeingCalendar
          selectedDate={
            selectedDate
          }
          onSelectDate={(
            date,
          ) =>
            setSelectedDate(
              date,
            )
          }
          accent={
            accentForeground
          }
          isDark={isDark}
          entryDates={
            taskDates
          }
          allowFuture
          dotColor={
            accentForeground
          }
        />

        {/* LOADING */}

        {loading ? (
          <View
            style={
              styles.empty
            }
          >
            <Text
              style={[
                styles.emptyText,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              Loading planner...
            </Text>
          </View>
        ) : viewMode ===
          'calendar' ? (
          <TimelineView
            tasks={
              selectedTasks
            }
            selectedDate={
              selectedDate
            }
            isDark={isDark}
            selectedTaskId={
              selectedTaskId
            }
            onSelectTask={
              handleCalendarTaskSelect
            }
            onEditTask={
              openEditTask
            }
            onDelete={
              deleteTask
            }
            onToggleSub={
              toggleSubtask
            }
            C={C}
          />
        ) : (
          <TaskListView
            tasks={
              selectedTasks
            }
            isDark={isDark}
            onSelectTask={(
              task,
            ) =>
              setSelectedTaskId(
                task.id,
              )
            }
            selectedTaskId={
              selectedTaskId
            }
            onToggle={
              toggleTask
            }
            onToggleSub={
              toggleSubtask
            }
            onEditTask={
              openEditTask
            }
            onDelete={
              deleteTask
            }
            C={C}
          />
        )}
      </ScrollView>

      {/* FLOATING ADD */}

      <Pressable
        onPress={() =>
          openNewTask()
        }
        style={({
          pressed,
        }) => [
          styles.fab,
          {
            backgroundColor:
              accentForeground,
          },
          pressed && {
            opacity: 0.85,
          },
        ]}
      >
        <Plus
          color="#FFFFFF"
          size={28}
          strokeWidth={2.6}
        />
      </Pressable>

      {/* NEW TASK MODAL */}

      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setModalOpen(
            false,
          )
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
              {
                backgroundColor:
                  C.card,
              },
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
                  {
                    color: C.text,
                  },
                ]}
              >
                {editingTaskId
                  ? 'Edit task'
                  : 'New task'}
              </Text>

              <Pressable
                onPress={() =>
                  setModalOpen(
                    false,
                  )
                }
                hitSlop={12}
              >
                <X
                  color={C.muted}
                  size={21}
                />
              </Pressable>
            </View>

            <ScrollView
              style={
                styles.modalScroll
              }
              showsVerticalScrollIndicator={
                false
              }
              keyboardShouldPersistTaps="handled"
            >
              {error && (
                <Text
                  style={[
                    styles.error,
                    {
                      color:
                        '#C53A2F',
                      marginTop: 4,
                    },
                  ]}
                >
                  {error}
                </Text>
              )}

              {/* TITLE */}

              <Text
                style={[
                  styles.label,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                Title
              </Text>

              <TextInput
                value={
                  taskTitle
                }
                onChangeText={
                  setTaskTitle
                }
                placeholder="What needs doing?"
                placeholderTextColor={
                  C.muted
                }
                style={[
                  styles.input,
                  {
                    backgroundColor:
                      C.input,
                    borderColor:
                      C.inputBorder,
                    color: C.text,
                  },
                ]}
                autoFocus
              />

              {/* DESCRIPTION */}

              <Text
                style={[
                  styles.label,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                Description
                (optional)
              </Text>

              <TextInput
                value={
                  taskDesc
                }
                onChangeText={
                  setTaskDesc
                }
                placeholder="Add details"
                placeholderTextColor={
                  C.muted
                }
                style={[
                  styles.input,
                  styles.inputMulti,
                  {
                    backgroundColor:
                      C.input,
                    borderColor:
                      C.inputBorder,
                    color: C.text,
                  },
                ]}
                multiline
              />

              {/* SUBTASKS */}

              <Text
                style={[
                  styles.label,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                Subtasks
                (optional)
              </Text>

              {subtaskInputs.map(
                (
                  value,
                  index,
                ) => (
                  <View
                    key={index}
                    style={
                      styles.subtaskInputRow
                    }
                  >
                    <TextInput
                      value={
                        value
                      }
                      onChangeText={(
                        text,
                      ) =>
                        setSubtaskInputs(
                          (
                            previous,
                          ) =>
                            previous.map(
                              (
                                item,
                                itemIndex,
                              ) =>
                                itemIndex ===
                                index
                                  ? text
                                  : item,
                            ),
                        )
                      }
                      placeholder={`Subtask ${
                        index + 1
                      }`}
                      placeholderTextColor={
                        C.muted
                      }
                      style={[
                        styles.input,
                        styles.subtaskInput,
                        {
                          backgroundColor:
                            C.input,
                          borderColor:
                            C.inputBorder,
                          color:
                            C.text,
                        },
                      ]}
                      onSubmitEditing={() => {
                        if (
                          value.trim()
                        ) {
                          setSubtaskInputs(
                            (
                              previous,
                            ) => [
                              ...previous,
                              '',
                            ],
                          );

                          setSubtaskInputIds(
                            (
                              previous,
                            ) => [
                              ...previous,
                              null,
                            ],
                          );
                        }
                      }}
                      returnKeyType="next"
                    />

                    {subtaskInputs.length >
                      1 && (
                      <Pressable
                        onPress={() => {
                          setSubtaskInputs(
                            (
                              previous,
                            ) =>
                              previous.filter(
                                (
                                  _,
                                  itemIndex,
                                ) =>
                                  itemIndex !==
                                  index,
                              ),
                          );

                          setSubtaskInputIds(
                            (
                              previous,
                            ) =>
                              previous.filter(
                                (
                                  _,
                                  itemIndex,
                                ) =>
                                  itemIndex !==
                                  index,
                              ),
                          );
                        }}
                        hitSlop={8}
                      >
                        <X
                          color={
                            C.muted
                          }
                          size={18}
                        />
                      </Pressable>
                    )}
                  </View>
                ),
              )}

              {subtaskInputs[
                subtaskInputs.length -
                  1
              ]?.trim() && (
                <Pressable
                  onPress={() => {
                    setSubtaskInputs(
                      (
                        previous,
                      ) => [
                        ...previous,
                        '',
                      ],
                    );

                    setSubtaskInputIds(
                      (
                        previous,
                      ) => [
                        ...previous,
                        null,
                      ],
                    );
                  }}
                  style={
                    styles.addSubtaskBtn
                  }
                >
                  <Plus
                    color={
                      accentForeground
                    }
                    size={16}
                  />

                  <Text
                    style={[
                      styles.addSubtaskText,
                      {
                        color:
                          accentForeground,
                      },
                    ]}
                  >
                    Add subtask
                  </Text>
                </Pressable>
              )}

              {/* DATE */}

              <Text
                style={[
                  styles.label,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                Start date
              </Text>

              <DatePickerInput
                value={
                  startDate
                }
                onChange={
                  setStartDate
                }
                accent={
                  accentForeground
                }
                onAccent={
                  onAccent
                }
                isDark={
                  isDark
                }
              />

              {/* TIME */}

              <View
                style={
                  styles.timeRow
                }
              >
                <View
                  style={
                    styles.timeField
                  }
                >
                  <TimePickerInput
                    value={
                      startTime
                    }
                    onChange={
                      setStartTime
                    }
                    label="Start time"
                    accent={
                      accentForeground
                    }
                    onAccent={
                      onAccent
                    }
                    isDark={
                      isDark
                    }
                  />
                </View>

                <View
                  style={
                    styles.timeField
                  }
                >
                  <TimePickerInput
                    value={
                      endTime
                    }
                    onChange={
                      setEndTime
                    }
                    label="End time"
                    accent={
                      accentForeground
                    }
                    onAccent={
                      onAccent
                    }
                    isDark={
                      isDark
                    }
                  />
                </View>
              </View>

              {/* REPEAT */}

              <Text
                style={[
                  styles.label,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                Repeat
              </Text>

              <View
                style={
                  styles.chipRow
                }
              >
                {REPEAT_OPTIONS.map(
                  (
                    option,
                  ) => (
                    <Pressable
                      key={
                        option.key
                      }
                      onPress={() =>
                        setRepeat(
                          option.key,
                        )
                      }
                      style={[
                        styles.chip,
                        {
                          borderColor:
                            C.border,
                          backgroundColor:
                            C.card,
                        },
                        repeat ===
                          option.key && {
                          backgroundColor:
                            accentForeground,
                          borderColor:
                            accentForeground,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color:
                              C.muted,
                          },
                          repeat ===
                            option.key && {
                            color:
                              onAccent,
                            fontFamily:
                              FONT_SEMI,
                          },
                        ]}
                      >
                        {
                          option.label
                        }
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>

              {/* CUSTOM REPEAT */}

              {repeat ===
                'custom' && (
                <View
                  style={
                    styles.customRow
                  }
                >
                  <Text
                    style={[
                      styles.customPrefix,
                      {
                        color:
                          C.text,
                      },
                    ]}
                  >
                    Every
                  </Text>

                  <TextInput
                    value={
                      repeatInterval
                    }
                    onChangeText={
                      setRepeatInterval
                    }
                    placeholder="1"
                    placeholderTextColor={
                      C.muted
                    }
                    style={[
                      styles.customInput,
                      {
                        backgroundColor:
                          C.input,
                        borderColor:
                          C.inputBorder,
                        color:
                          C.text,
                      },
                    ]}
                    keyboardType="numeric"
                  />

                  <Text
                    style={[
                      styles.customPrefix,
                      {
                        color:
                          C.text,
                      },
                    ]}
                  >
                    day(s)
                  </Text>
                </View>
              )}

              {/* COLLABORATOR */}

              <Text
                style={[
                  styles.label,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                Collaborator
              </Text>

              <CollaboratorSearch
                value={
                  collaborator
                }
                onChange={
                  setCollaborator
                }
                accent={
                  accentForeground
                }
                onAccent={
                  onAccent
                }
                isDark={
                  isDark
                }
                C={C}
              />

              {/* CARD COLOR */}

              <Text
                style={[
                  styles.label,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                Card color
              </Text>

              <View
                style={
                  styles.colorRow
                }
              >
                {CARD_COLORS.map(
                  (color) => (
                    <Pressable
                      key={color}
                      onPress={() =>
                        setCardColor(
                          color,
                        )
                      }
                      style={[
                        styles.colorDot,
                        {
                          backgroundColor:
                            color,
                        },
                        cardColor ===
                          color && {
                          borderWidth: 3,
                          borderColor:
                            C.text,
                        },
                      ]}
                    />
                  ),
                )}
              </View>

              {/* SAVE */}

              <Pressable
                disabled={
                  saving
                }
                onPress={
                  saveTask
                }
                style={[
                  styles.saveButton,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                  saving &&
                    styles.saveButtonDisabled,
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
                    : editingTaskId
                    ? 'Save changes'
                    : 'Add task'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* =========================================================
   TIMELINE
========================================================= */

type TimelineTaskLayout = {
  task: PlannerTask;
  start: number;
  end: number;
  column: number;
};

function buildTimelineLayouts(
  tasks: PlannerTask[],
  selectedDate: string,
): TimelineTaskLayout[] {
  const items: {
    task: PlannerTask;
    start: number;
    end: number;
    order: number;
  }[] = [];

  tasks.forEach(
    (task, order) => {
      const intervals =
        getTaskIntervalsForDate(
          task,
          selectedDate,
        );

      intervals.forEach(
        (interval) => {
          items.push({
            task,
            start:
              interval.start,
            end: Math.min(
              interval.end,
              1440,
            ),
            order,
          });
        },
      );
    },
  );

  items.sort(
    (a, b) =>
      a.start - b.start ||
      a.order - b.order,
  );

  const columnsEnd: number[] =
    [];

  return items.map(
    (item) => {
      let column = 0;

      while (
        column <
        columnsEnd.length
      ) {
        if (
          item.start >=
          columnsEnd[
            column
          ]
        ) {
          break;
        }

        column += 1;
      }

      if (
        column >=
        columnsEnd.length
      ) {
        columnsEnd.push(
          item.end,
        );
      } else {
        columnsEnd[
          column
        ] = item.end;
      }

      return {
        task: item.task,
        start: item.start,
        end: item.end,
        column,
      };
    },
  );
}

function TimelineView({
  tasks,
  selectedDate,
  isDark,
  selectedTaskId,
  onSelectTask,
  onEditTask,
  onDelete,
  onToggleSub,
  C,
}: {
  tasks: PlannerTask[];
  selectedDate: string;
  isDark: boolean;
  selectedTaskId: string | null;
  onSelectTask: (
    task: PlannerTask,
  ) => void;
  onEditTask: (
    task: PlannerTask,
  ) => void;
  onDelete: (
    task: PlannerTask,
  ) => void;
  onToggleSub: (
    task: PlannerTask,
    subtaskId: string,
  ) => void;
  C: Palette;
}) {
  const timedTasks =
    tasks.filter(
      (task) =>
        task.start_time,
    );

  const untimedTasks =
    tasks.filter(
      (task) =>
        !task.start_time,
    );

  const layouts =
    buildTimelineLayouts(
      timedTasks,
      selectedDate,
    );

  return (
    <View>
      <View
        style={[
          styles.timelineCard,
          {
            backgroundColor:
              C.card,
            borderColor:
              C.border,
          },
        ]}
      >
        <View
          style={
            styles.timelineCanvas
          }
        >
          {HOURS.map(
            (hour) => (
              <View
                key={hour}
                style={[
                  styles.timelineRow,
                  {
                    top:
                      hour * 44,
                    borderBottomColor:
                      C.divider,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.timelineHour,
                    {
                      color:
                        C.muted,
                    },
                  ]}
                >
                  {formatHour(
                    hour,
                  )}
                </Text>

                <View
                  style={[
                    styles.timelineContent,
                    {
                      borderLeftColor:
                        C.divider,
                    },
                  ]}
                />
              </View>
            ),
          )}

          <View
            style={
              styles.timelineBlocksLayer
            }
          >
            {layouts.map(
              (
                layout,
                index,
              ) => {
                const color =
                  getTaskColor(
                    layout.task.id,
                  );

                const isSelected =
                  selectedTaskId ===
                  layout.task.id;

                /*
                 * EXISTING POSITIONING
                 * CALCULATIONS — DO NOT CHANGE.
                 */
                const blockTop =
                  (layout.start /
                    60) *
                  44;

                const blockHeight =
                  Math.max(
                    38,
                    ((layout.end -
                      layout.start) /
                      60) *
                      44,
                  );

                const horizontalOffset =
                  layout.column *
                  22;

                const blockLeft =
                  58 +
                  horizontalOffset;

                const blockRight =
                  8;

                const completedCount =
                  layout.task.subtasks.filter(
                    (subtask) =>
                      subtask.completed,
                  ).length;

                return (
                  <Pressable
                    key={`${layout.task.id}-${index}`}
                    onPress={() =>
                      onSelectTask(
                        layout.task,
                      )
                    }
                    style={[
                      styles.timelineBlock,
                      {
                        /*
                         * These values are
                         * deliberately identical
                         * regardless of selection.
                         */
                        top:
                          blockTop,
                        height:
                          blockHeight,
                        left:
                          blockLeft,
                        right:
                          blockRight,

                        backgroundColor:
                          layout.task.completed
                            ? C.divider
                            : color,

                        /*
                         * SELECTION ONLY CHANGES
                         * THE STACKING ORDER.
                         */
                        zIndex:
                          isSelected
                            ? 100
                            : 0,
                      },
                    ]}
                  >
                    {/* TITLE */}

                    <Text
                      style={[
                        styles.timelineBlockTitle,
                        {
                          color:
                            layout.task.completed
                              ? isDark
                                ? '#F4F2EE'
                                : '#3D3932'
                              : '#FFFFFF',
                        },
                        layout.task.completed &&
                          styles.completed,
                      ]}
                      numberOfLines={1}
                    >
                      {
                        layout.task.title
                      }
                    </Text>

                    {/* TIME */}

                    <Text
                      style={[
                        styles.timelineBlockTime,
                        {
                          color:
                            layout.task.completed
                              ? isDark
                                ? '#D0CCC5'
                                : '#625D55'
                              : 'rgba(255,255,255,0.92)',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {prettyTime(
                        layout.task.start_time,
                      )}{' '}
                      -{' '}
                      {prettyTime(
                        layout.task.end_time,
                      )}
                    </Text>

                    {/* SUBTASK COUNT */}

                    <Text
                      style={[
                        styles.timelineBlockSubtaskCount,
                        {
                          color:
                            layout.task.completed
                              ? isDark
                                ? '#B8B3AB'
                                : '#777168'
                              : 'rgba(255,255,255,0.88)',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {completedCount}/
                      {
                        layout.task
                          .subtasks
                          .length
                      }{' '}
                      subtasks
                    </Text>

                    {/* REPEAT FREQUENCY */}

                    {layout.task.repeat !==
                      'none' && (
                      <Text
                        style={[
                          styles.timelineBlockRepeat,
                          {
                            color:
                              layout.task.completed
                                ? isDark
                                  ? '#B8B3AB'
                                  : '#777168'
                                : 'rgba(255,255,255,0.88)',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {layout.task.repeat === 'daily'
                          ? layout.task.repeat_interval > 1
                            ? `Every ${layout.task.repeat_interval} days`
                            : 'Every day'
                          : layout.task.repeat === 'custom'
                          ? `Every ${layout.task.repeat_interval} days`
                          : layout.task.repeat === 'weekly'
                          ? layout.task.repeat_interval > 1
                            ? `Every ${layout.task.repeat_interval} weeks`
                            : 'Every week'
                          : layout.task.repeat === 'monthly'
                          ? layout.task.repeat_interval > 1
                            ? `Every ${layout.task.repeat_interval} months`
                            : 'Every month'
                          : layout.task.repeat_interval > 1
                          ? `Every ${layout.task.repeat_interval} years`
                          : 'Every year'}
                      </Text>
                    )}

                    {/* EDIT BUTTON */}

                    <Pressable
                      onPress={() =>
                        onEditTask(
                          layout.task,
                        )
                      }
                      hitSlop={6}
                      style={[
                        styles.timelineEditButton,
                        {
                          backgroundColor:
                            'rgba(0,0,0,0.28)',
                        },
                      ]}
                    >
                      <Pencil
                        color="#FFFFFF"
                        size={13}
                        strokeWidth={2.5}
                      />
                    </Pressable>

                    {/* DELETE BUTTON */}

                    <Pressable
                      onPress={() =>
                        onDelete(
                          layout.task,
                        )
                      }
                      hitSlop={6}
                      style={[
                        styles.timelineDeleteButton,
                        {
                          backgroundColor:
                            'rgba(0,0,0,0.28)',
                        },
                      ]}
                    >
                      <Trash2
                        color="#FFFFFF"
                        size={13}
                        strokeWidth={2.5}
                      />
                    </Pressable>
                  </Pressable>
                );
              },
            )}
          </View>
        </View>

        {/* UNSCHEDULED TASKS */}

        {untimedTasks.length >
          0 && (
          <View
            style={[
              styles.untimedSection,
              {
                borderTopColor:
                  C.divider,
              },
            ]}
          >
            <Text
              style={[
                styles.untimedLabel,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              UNSCHEDULED
            </Text>

            {untimedTasks.map(
              (task) => {
                const color =
                  getTaskColor(
                    task.id,
                  );

                const isSelected =
                  selectedTaskId ===
                  task.id;

                return (
                  <View
                    key={task.id}
                    style={
                      styles.untimedTaskGroup
                    }
                  >
                    <Pressable
                      onPress={() =>
                        onSelectTask(
                          task,
                        )
                      }
                      style={[
                        styles.untimedRow,
                        isSelected && {
                          zIndex: 10,
                          elevation: 4,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.check,
                          task.completed && {
                            backgroundColor:
                              color,
                            borderColor:
                              color,
                          },
                        ]}
                      >
                        {task.completed && (
                          <Check
                            color="#FFF"
                            size={13}
                          />
                        )}
                      </View>

                      <View
                        style={
                          styles.taskCopy
                        }
                      >
                        <Text
                          style={[
                            styles.taskTitle,
                            {
                              color:
                                C.text,
                            },
                            task.completed &&
                              styles.completed,
                          ]}
                        >
                          {
                            task.title
                          }
                        </Text>

                        <Text
                          style={[
                            styles.taskMeta,
                            {
                              color:
                                C.muted,
                            },
                          ]}
                        >
                          {task.collaborator ||
                            'No collaborator'}
                        </Text>
                      </View>
                    </Pressable>

                    {task.subtasks
                      .length >
                      0 && (
                      <View
                        style={
                          styles.untimedSubtasks
                        }
                      >
                        {task.subtasks.map(
                          (
                            subtask,
                          ) => (
                            <Pressable
                              key={
                                subtask.id
                              }
                              onPress={() =>
                                onToggleSub(
                                  task,
                                  subtask.id,
                                )
                              }
                              style={
                                styles.subtaskRow
                              }
                            >
                              <View
                                style={[
                                  styles.subtaskCheck,
                                  subtask.completed && {
                                    backgroundColor:
                                      color,
                                    borderColor:
                                      color,
                                  },
                                ]}
                              >
                                {subtask.completed && (
                                  <Check
                                    color="#FFF"
                                    size={
                                      10
                                    }
                                  />
                                )}
                              </View>

                              <Text
                                style={[
                                  styles.subtaskText,
                                  {
                                    color:
                                      C.text,
                                  },
                                  subtask.completed &&
                                    styles.completed,
                                ]}
                              >
                                {
                                  subtask.title
                                }
                              </Text>
                            </Pressable>
                          ),
                        )}
                      </View>
                    )}
                  </View>
                );
              },
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/* =========================================================
   TASK LIST
========================================================= */

function TaskListView({
  tasks,
  isDark,
  onSelectTask,
  selectedTaskId,
  onToggle,
  onToggleSub,
  onEditTask,
  onDelete,
  C,
}: {
  tasks: PlannerTask[];
  isDark: boolean;
  onSelectTask: (
    task: PlannerTask,
  ) => void;
  selectedTaskId: string | null;
  onToggle: (
    task: PlannerTask,
  ) => void;
  onToggleSub: (
    task: PlannerTask,
    subtaskId: string,
  ) => void;
  onEditTask: (
    task: PlannerTask,
  ) => void;
  onDelete: (
    task: PlannerTask,
  ) => void;
  C: Palette;
}) {
  if (!tasks.length) {
    return (
      <View
        style={
          styles.empty
        }
      >
        <Text
          style={[
            styles.emptyText,
            {
              color:
                C.muted,
            },
          ]}
        >
          A clear day. Tap +
          to add something.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={
        styles.taskListContainer
      }
    >
      {tasks.map(
        (task) => {
          const color =
            getTaskColor(
              task.id,
            );

          const isSelected =
            selectedTaskId ===
            task.id;

          return (
            <View
              key={task.id}
              style={[
                styles.taskCard,
                {
                  backgroundColor:
                    C.card,
                  borderColor:
                    isSelected
                      ? color
                      : C.border,
                  borderWidth:
                    isSelected
                      ? 2
                      : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.taskCardAccent,
                  {
                    backgroundColor:
                      color,
                  },
                ]}
              />

              <View
                style={
                  styles.taskCardBody
                }
              >
                <View
                  style={
                    styles.taskMainRow
                  }
                >
                  <Pressable
                    onPress={() =>
                      onToggle(
                        task,
                      )
                    }
                    style={[
                      styles.check,
                      task.completed && {
                        backgroundColor:
                          color,
                        borderColor:
                          color,
                      },
                    ]}
                    hitSlop={6}
                  >
                    {task.completed && (
                      <Check
                        color="#FFF"
                        size={13}
                      />
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      onSelectTask(
                        task,
                      )
                    }
                    style={
                      styles.taskCopy
                    }
                  >
                    <Text
                      style={[
                        styles.taskTitle,
                        {
                          color:
                            C.text,
                        },
                        task.completed &&
                          styles.completed,
                      ]}
                    >
                      {
                        task.title
                      }
                    </Text>

                    {task.description ? (
                      <Text
                        style={[
                          styles.taskDesc,
                          {
                            color:
                              C.muted,
                          },
                        ]}
                        numberOfLines={
                          2
                        }
                      >
                        {
                          task.description
                        }
                      </Text>
                    ) : null}

                    <Text
                      style={[
                        styles.taskMeta,
                        {
                          color:
                            C.muted,
                        },
                      ]}
                    >
                      {prettyTime(
                        task.start_time,
                      ) ||
                        task.start_date}

                      {task.start_time &&
                      task.end_time
                        ? ` – ${prettyTime(
                            task.end_time,
                          )}`
                        : ''}

                      {task.collaborator
                        ? `  ·  ${task.collaborator}`
                        : ''}
                    </Text>

                    {task.repeat !==
                      'none' && (
                      <View
                        style={[
                          styles.repeatPill,
                          {
                            backgroundColor:
                              color,
                          },
                        ]}
                      >
                        <Repeat
                          color="#FFF"
                          size={10}
                          strokeWidth={
                            2.4
                          }
                        />

                        <Text
                          style={
                            styles.repeatPillText
                          }
                        >
                          {task.repeat ===
                          'daily'
                            ? 'Every day'
                            : task.repeat ===
                              'custom'
                            ? `Every ${task.repeat_interval} day(s)`
                            : task.repeat ===
                              'weekly'
                            ? `Every ${task.repeat_interval} week(s)`
                            : task.repeat ===
                              'monthly'
                            ? `Every ${task.repeat_interval} month(s)`
                            : `Every ${task.repeat_interval} year(s)`}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </View>

                {task.subtasks
                  .length > 0 && (
                  <View
                    style={
                      styles.subtaskList
                    }
                  >
                    {task.subtasks.map(
                      (
                        subtask,
                      ) => (
                        <Pressable
                          key={
                            subtask.id
                          }
                          onPress={() =>
                            onToggleSub(
                              task,
                              subtask.id,
                            )
                          }
                          style={
                            styles.subtaskRow
                          }
                        >
                          <View
                            style={[
                              styles.subtaskCheck,
                              subtask.completed && {
                                backgroundColor:
                                  color,
                                borderColor:
                                  color,
                              },
                            ]}
                          >
                            {subtask.completed && (
                              <Check
                                color="#FFF"
                                size={
                                  10
                                }
                              />
                            )}
                          </View>

                          <Text
                            style={[
                              styles.subtaskText,
                              {
                                color:
                                  C.text,
                              },
                              subtask.completed &&
                                styles.completed,
                            ]}
                          >
                            {
                              subtask.title
                            }
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                )}

                <View
                  style={styles.taskActionRow}
                >
                  <Pressable
                    onPress={() =>
                      onEditTask(
                        task,
                      )
                    }
                    style={[
                      styles.editTaskListButton,
                      {
                        borderColor:
                          C.border,
                      },
                    ]}
                  >
                    <Pencil
                      color={C.text}
                      size={14}
                    />

                    <Text
                      style={[
                        styles.editTaskListText,
                        {
                          color:
                            C.text,
                        },
                      ]}
                    >
                      Edit task
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      onDelete(
                        task,
                      )
                    }
                    style={
                      styles.deleteTaskBtn
                    }
                    hitSlop={8}
                  >
                    <Trash2
                      color={C.muted}
                      size={14}
                    />

                    <Text
                      style={[
                        styles.deleteTaskText,
                        {
                          color:
                            C.muted,
                        },
                      ]}
                    >
                      Delete task
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        },
      )}
    </View>
  );
}

/* =========================================================
   COLLABORATOR SEARCH
========================================================= */

function CollaboratorSearch({
  value,
  onChange,
  accent,
  onAccent,
  isDark,
  C,
}: {
  value: string;
  onChange: (
    value: string,
  ) => void;
  accent: string;
  onAccent: string;
  isDark: boolean;
  C: Palette;
}) {
  const [
    query,
    setQuery,
  ] = useState(value);

  const [
    results,
    setResults,
  ] = useState<
    {
      user_id: string;
      display_name: string;
      username: string;
    }[]
  >([]);

  const [
    searching,
    setSearching,
  ] = useState(false);

  const [
    showResults,
    setShowResults,
  ] = useState(false);

  const search = async (
    text: string,
  ) => {
    setQuery(text);
    onChange(text);

    if (!text.trim()) {
      setResults([]);
      setShowResults(
        false,
      );
      return;
    }

    setShowResults(true);
    setSearching(true);

    try {
      const {
        data,
        error,
      } = await supabase
        .from(
          'social_profiles',
        )
        .select(
          'user_id, display_name, username',
        )
        .ilike(
          'display_name',
          `%${text.trim()}%`,
        )
        .limit(5);

      if (error) {
        console.log(
          'COLLABORATOR SEARCH ERROR:',
          error,
        );

        setResults([]);
      } else {
        setResults(
          (data ??
            []) as {
            user_id: string;
            display_name: string;
            username: string;
          }[],
        );
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={
          search
        }
        placeholder="Search for users..."
        placeholderTextColor={
          C.muted
        }
        style={[
          styles.input,
          {
            backgroundColor:
              C.input,
            borderColor:
              C.inputBorder,
            color: C.text,
          },
        ]}
        onFocus={() => {
          if (query.trim()) {
            setShowResults(
              true,
            );
          }
        }}
      />

      {showResults && (
        <View
          style={[
            styles.collabResults,
            {
              backgroundColor:
                C.card,
              borderColor:
                C.border,
            },
          ]}
        >
          {searching && (
            <Text
              style={[
                styles.collabHint,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              Searching...
            </Text>
          )}

          {!searching &&
            results.length ===
              0 &&
            query.trim() && (
              <Text
                style={[
                  styles.collabHint,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                No users found.
              </Text>
            )}

          {results.map(
            (user) => (
              <Pressable
                key={
                  user.user_id
                }
                onPress={() => {
                  onChange(
                    user.display_name,
                  );

                  setQuery(
                    user.display_name,
                  );

                  setShowResults(
                    false,
                  );
                }}
                style={[
                  styles.collabRow,
                  {
                    borderBottomColor:
                      C.divider,
                  },
                ]}
              >
                <View
                  style={[
                    styles.collabAvatar,
                    {
                      backgroundColor:
                        accent,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.collabAvatarText,
                      {
                        color:
                          onAccent,
                      },
                    ]}
                  >
                    {user.display_name
                      .slice(
                        0,
                        1,
                      )
                      .toUpperCase()}
                  </Text>
                </View>

                <View>
                  <Text
                    style={[
                      styles.collabName,
                      {
                        color:
                          C.text,
                      },
                    ]}
                  >
                    {
                      user.display_name
                    }
                  </Text>

                  <Text
                    style={[
                      styles.collabUsername,
                      {
                        color:
                          C.muted,
                      },
                    ]}
                  >
                    @
                    {
                      user.username
                    }
                  </Text>
                </View>
              </Pressable>
            ),
          )}
        </View>
      )}
    </View>
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

    header: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      paddingHorizontal: 16,
      paddingTop: 28,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },

    headerBack: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    headerBtn: {
      width: 40,
      height: 40,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    headerMenuShade: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.25)',
      alignItems: 'flex-end',
      paddingTop: 64,
      paddingRight: 12,
    },

    headerMenuCard: {
      borderRadius: 14,
      borderWidth: 1,
      minWidth: 150,
      paddingVertical: 6,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },

    headerMenuItem: {
      paddingVertical: 12,
      paddingHorizontal: 16,
    },

    headerMenuText: {
      fontFamily: FONT_MED,
      fontSize: 14,
    },

    headerTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 18,
      letterSpacing: 1.5,
    },

    content: {
      padding: 16,
      paddingBottom: 100,
    },

    viewToggle: {
      flexDirection:
        'row',
      borderRadius: 12,
      padding: 3,
      marginBottom: 16,
    },

    viewOption: {
      flex: 1,
      height: 38,
      borderRadius: 9,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    viewText: {
      fontFamily:
        FONT_SEMI,
      fontSize: 12,
    },

    error: {
      fontFamily:
        FONT_MED,
      fontSize: 13,
      marginBottom: 10,
    },

    timelineCard: {
      borderRadius: 16,
      borderWidth: 1,
      overflow: 'hidden',
    },

    timelineCanvas: {
      height: 24 * 44,
      position: 'relative',
    },

    timelineRow: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 44,
      borderBottomWidth: 1,
      flexDirection:
        'row',
    },

    timelineHour: {
      width: 56,
      textAlign: 'right',
      paddingRight: 8,
      paddingTop: 4,
      fontFamily:
        FONT_SEMI,
      fontSize: 9,
    },

    timelineContent: {
      flex: 1,
      borderLeftWidth: 1,
    },

    timelineBlocksLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },

    timelineBlock: {
      position: 'absolute',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
      overflow: 'hidden',
    },

    timelineBlockTitle: {
      fontFamily:
        FONT_SEMI,
      fontSize: 10,
      lineHeight: 12,
      paddingRight: 24,
    },

    timelineBlockTime: {
      fontFamily:
        FONT,
      fontSize: 8,
      lineHeight: 10,
      marginTop: 1,
      paddingRight: 24,
    },

    timelineBlockSubtaskCount: {
      fontFamily:
        FONT_MED,
      fontSize: 8,
      lineHeight: 10,
      marginTop: 1,
      paddingRight: 24,
    },

    timelineBlockRepeat: {
      fontFamily:
        FONT_MED,
      fontSize: 7,
      lineHeight: 9,
      marginTop: 1,
      paddingRight: 24,
    },

    timelineEditButton: {
      position: 'absolute',
      top: 2,
      right: 3,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    timelineDeleteButton: {
      position: 'absolute',
      top: 20,
      right: 3,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    untimedSection: {
      padding: 14,
      borderTopWidth: 1,
    },

    untimedTaskGroup: {
      marginBottom: 8,
    },

    untimedLabel: {
      fontFamily:
        FONT_BOLD,
      fontSize: 9,
      letterSpacing: 0.5,
      marginBottom: 10,
    },

    untimedRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 11,
      marginBottom: 6,
    },

    check: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor:
        '#C9C5BD',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    taskCopy: {
      flex: 1,
    },

    taskTitle: {
      fontFamily:
        FONT_SEMI,
      fontSize: 13,
    },

    taskMeta: {
      fontFamily:
        FONT,
      fontSize: 10,
      marginTop: 3,
    },

    taskDesc: {
      fontFamily:
        FONT,
      fontSize: 12,
      marginTop: 4,
      lineHeight: 16,
    },

    completed: {
      textDecorationLine:
        'line-through',
      opacity: 0.55,
    },

    untimedSubtasks: {
      marginLeft: 33,
      gap: 6,
      marginBottom: 6,
    },

    empty: {
      paddingVertical: 24,
      alignItems:
        'center',
    },

    emptyText: {
      fontFamily:
        FONT,
      fontSize: 13,
      textAlign:
        'center',
    },

    taskListContainer: {
      gap: 12,
    },

    taskCard: {
      borderRadius: 16,
      borderWidth: 1,
      overflow:
        'hidden',
      flexDirection:
        'row',
    },

    taskCardAccent: {
      width: 4,
    },

    taskCardBody: {
      flex: 1,
      padding: 14,
    },

    taskMainRow: {
      flexDirection:
        'row',
      alignItems:
        'flex-start',
      gap: 11,
    },

    taskActionsRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 12,
      marginTop: 12,
    },

    editTaskListButton: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },

    editTaskListText: {
      fontFamily:
        FONT_MED,
      fontSize: 12,
    },

    repeatPill: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      alignSelf:
        'flex-start',
      marginTop: 6,
    },

    repeatPillText: {
      fontFamily:
        FONT_SEMI,
      fontSize: 10,
      color: '#FFF',
    },

    subtaskList: {
      marginTop: 10,
      marginLeft: 33,
      gap: 8,
    },

    subtaskRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 8,
    },

    subtaskCheck: {
      width: 18,
      height: 18,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor:
        '#C9C5BD',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    subtaskText: {
      fontFamily:
        FONT,
      fontSize: 13,
      flex: 1,
    },

    deleteTaskBtn: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 6,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor:
        'rgba(0,0,0,0.05)',
    },

    deleteTaskText: {
      fontFamily:
        FONT_MED,
      fontSize: 12,
    },

    fab: {
      position: 'absolute',
      bottom: 24,
      alignSelf:
        'center',
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems:
        'center',
      justifyContent:
        'center',
      shadowColor:
        '#000',
      shadowOpacity:
        0.25,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 4,
      },
      elevation: 6,
    },

    modalShade: {
      flex: 1,
      justifyContent:
        'flex-end',
      backgroundColor:
        'rgba(0,0,0,0.45)',
    },

    modalCard: {
      borderTopLeftRadius:
        24,
      borderTopRightRadius:
        24,
      padding: 22,
      paddingBottom: 34,
      maxHeight:
        '92%',
    },

    modalTitleRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginBottom: 16,
    },

    modalTitle: {
      fontFamily:
        FONT_BOLD,
      fontSize: 18,
      flex: 1,
      marginRight: 12,
    },

    modalScroll: {
      maxHeight:
        '80%',
    },

    label: {
      fontFamily:
        FONT_MED,
      fontSize: 13,
      marginTop: 14,
      marginBottom: 6,
    },

    input: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontFamily:
        FONT,
      fontSize: 15,
    },

    inputMulti: {
      minHeight: 70,
      textAlignVertical:
        'top',
    },

    subtaskInputRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 8,
      marginBottom: 8,
    },

    subtaskInput: {
      flex: 1,
    },

    addSubtaskBtn: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 6,
      marginBottom: 4,
    },

    addSubtaskText: {
      fontFamily:
        FONT_SEMI,
      fontSize: 13,
    },

    timeRow: {
      flexDirection:
        'row',
      gap: 12,
    },

    timeField: {
      flex: 1,
    },

    chipRow: {
      flexDirection:
        'row',
      flexWrap:
        'wrap',
      gap: 8,
    },

    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
    },

    chipText: {
      fontFamily:
        FONT,
      fontSize: 13,
    },

    customRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 10,
      marginTop: 12,
      flexWrap:
        'wrap',
    },

    customPrefix: {
      fontFamily:
        FONT_MED,
      fontSize: 14,
    },

    customInput: {
      width: 64,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily:
        FONT,
      fontSize: 15,
      textAlign:
        'center',
    },

    colorRow: {
      flexDirection:
        'row',
      gap: 12,
      marginTop: 4,
    },

    colorDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 2,
      borderColor:
        'transparent',
    },

    saveButton: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems:
        'center',
      marginTop: 22,
    },

    saveButtonDisabled: {
      opacity: 0.6,
    },

    saveText: {
      fontFamily:
        FONT_SEMI,
      fontSize: 15,
    },

    collabResults: {
      borderWidth: 1,
      borderRadius: 12,
      marginTop: 4,
      maxHeight: 200,
      overflow:
        'hidden',
    },

    collabHint: {
      fontFamily:
        FONT,
      fontSize: 13,
      paddingVertical: 12,
      textAlign:
        'center',
    },

    collabRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
    },

    collabAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    collabAvatarText: {
      fontFamily:
        FONT_BOLD,
      fontSize: 13,
    },

    collabName: {
      fontFamily:
        FONT_SEMI,
      fontSize: 14,
    },

    collabUsername: {
      fontFamily:
        FONT,
      fontSize: 11,
      marginTop: 1,
    },
  
  taskActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});