import { useCallback, useEffect, useMemo, useState } from 'react';

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
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react-native';

import { router } from 'expo-router';

import { useApp } from '@/components/AppProvider';

import { DatePickerInput } from '@/components/DatePickerInput';

import { TimePickerInput } from '@/components/TimePickerInput';

import { supabase } from '@/lib/supabase';

type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  due_date: string;
  time: string | null;
  category: string;
  repeat: string;
  repeat_interval: number;
  repeat_unit: string | null;
  completed: boolean;
};

type RepeatType =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'annually'
  | 'custom';

type RepeatUnit = 'day' | 'week' | 'month' | 'year';

type FilterTag = 'all' | 'completed' | 'incomplete';

const REPEAT_OPTIONS: { key: RepeatType; label: string }[] = [
  { key: 'none', label: 'Does not repeat' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'annually', label: 'Annually' },
  { key: 'custom', label: 'Custom' },
];

const REPEAT_UNITS: { key: RepeatUnit; label: string }[] = [
  { key: 'day', label: 'days' },
  { key: 'week', label: 'weeks' },
  { key: 'month', label: 'months' },
  { key: 'year', label: 'years' },
];

const CATEGORIES = ['General', 'Work', 'Personal'];

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

const todayStr = () => {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;

const addInterval = (
  dateStr: string,
  unit: RepeatUnit,
  interval: number,
): string => {
  const d = new Date(`${dateStr}T12:00:00`);

  if (unit === 'day') {
    d.setDate(d.getDate() + interval);
  } else if (unit === 'week') {
    d.setDate(d.getDate() + interval * 7);
  } else if (unit === 'month') {
    d.setMonth(d.getMonth() + interval);
  } else if (unit === 'year') {
    d.setFullYear(d.getFullYear() + interval);
  }

  return formatDate(d);
};

const advanceReminder = (r: Reminder): string => {
  switch (r.repeat) {
    case 'daily':
      return addInterval(r.due_date, 'day', 1);

    case 'weekly':
      return addInterval(r.due_date, 'week', 1);

    case 'monthly':
      return addInterval(r.due_date, 'month', 1);

    case 'annually':
      return addInterval(r.due_date, 'year', 1);

    case 'custom':
      return addInterval(
        r.due_date,
        (r.repeat_unit ?? 'day') as RepeatUnit,
        Math.max(1, r.repeat_interval),
      );

    default:
      return r.due_date;
  }
};

const prettyDate = (dateStr: string) => {
  const d = new Date(`${dateStr}T12:00:00`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cmp = new Date(d);
  cmp.setHours(0, 0, 0, 0);

  const diff = Math.round(
    (cmp.getTime() - today.getTime()) / 86400000,
  );

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';

  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const prettyTime = (time: string | null) => {
  if (!time) return '';

  const [h, m] = time.split(':').map(Number);

  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;

  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
};

const repeatLabel = (r: Reminder): string => {
  switch (r.repeat) {
    case 'none':
      return '';

    case 'custom': {
      const unit = r.repeat_unit ?? 'day';

      const unitLabel =
        REPEAT_UNITS.find((u) => u.key === unit)?.label ?? 'days';

      return `Every ${r.repeat_interval} ${unitLabel}`;
    }

    default:
      return (
        REPEAT_OPTIONS.find((o) => o.key === r.repeat)?.label ?? ''
      );
  }
};

type Group = {
  key: string;
  label: string;
  items: Reminder[];
};

const groupReminders = (reminders: Reminder[]): Group[] => {
  const today = todayStr();

  const upcoming: Reminder[] = [];
  const overdue: Reminder[] = [];
  const later: Reminder[] = [];
  const completed: Reminder[] = [];

  for (const r of reminders) {
    if (r.completed) {
      completed.push(r);
    } else if (r.due_date < today) {
      overdue.push(r);
    } else if (r.due_date === today) {
      upcoming.push(r);
    } else {
      later.push(r);
    }
  }

  const byDate = (a: Reminder, b: Reminder) => {
    const d = a.due_date.localeCompare(b.due_date);

    if (d !== 0) return d;

    return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
  };

  return [
    {
      key: 'overdue',
      label: 'Overdue',
      items: overdue.sort(byDate),
    },
    {
      key: 'today',
      label: 'Today',
      items: upcoming.sort(byDate),
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      items: later.sort(byDate),
    },
    {
      key: 'completed',
      label: 'Complete',
      items: completed.sort(byDate).reverse(),
    },
  ].filter((g) => g.items.length > 0);
};

export default function RemindersScreen() {
  const { accentForeground, isDark, onAccent } = useApp();

  const accent = accentForeground;

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<Reminder | null>(null);

  const [filter, setFilter] = useState<FilterTag>('all');

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(todayStr());
  const [time, setTime] = useState('');
  const [category, setCategory] = useState('General');

  const [repeat, setRepeat] = useState<RepeatType>('none');
  const [repeatInterval, setRepeatInterval] = useState('1');
  const [repeatUnit, setRepeatUnit] =
    useState<RepeatUnit>('day');

  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error: loadErr } = await supabase
      .from('reminders')
      .select(
        'id, title, notes, due_date, time, category, repeat, repeat_interval, repeat_unit, completed',
      )
      .order('due_date', { ascending: true });

    if (loadErr) {
      setError('Your reminders could not be loaded.');
    } else {
      setReminders((data ?? []) as Reminder[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setTitle('');
    setNotes('');
    setDueDate(todayStr());
    setTime('');
    setCategory('General');
    setRepeat('none');
    setRepeatInterval('1');
    setRepeatUnit('day');
    setEditingId(null);
    setError(null);
  };

  const openNew = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (r: Reminder) => {
    setDetailOpen(null);

    setTitle(r.title);
    setNotes(r.notes ?? '');
    setDueDate(r.due_date);
    setTime(r.time ?? '');
    setCategory(r.category);

    setRepeat(
      (r.repeat as RepeatType) || 'none',
    );

    setRepeatInterval(
      String(r.repeat_interval ?? 1),
    );

    setRepeatUnit(
      (r.repeat_unit as RepeatUnit) || 'day',
    );

    setEditingId(r.id);
    setError(null);
    setModalOpen(true);
  };

  const saveReminder = async () => {
    if (!title.trim()) {
      setError('Give your reminder a title.');
      return;
    }

    if (!dueDate) {
      setError('Pick a date for this reminder.');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      due_date: dueDate,
      time: time.trim() || null,
      category,
      repeat,
      repeat_interval:
        repeat === 'custom'
          ? Math.max(
              1,
              parseInt(repeatInterval, 10) || 1,
            )
          : 1,
      repeat_unit:
        repeat === 'custom' ? repeatUnit : null,
    };

    if (editingId) {
      const { data, error: updateErr } = await supabase
        .from('reminders')
        .update(payload)
        .eq('id', editingId)
        .select(
          'id, title, notes, due_date, time, category, repeat, repeat_interval, repeat_unit, completed',
        )
        .maybeSingle();

      if (updateErr || !data) {
        setError('The reminder could not be updated.');
      } else {
        setReminders((current) =>
          current
            .map((item) =>
              item.id === editingId
                ? (data as Reminder)
                : item,
            )
            .sort((a, b) => {
              const d = a.due_date.localeCompare(
                b.due_date,
              );

              if (d !== 0) return d;

              return (a.time ?? '99:99').localeCompare(
                b.time ?? '99:99',
              );
            }),
        );

        setModalOpen(false);
        setEditingId(null);
      }

      setSaving(false);
      return;
    }

    const { data, error: saveErr } = await supabase
      .from('reminders')
      .insert(payload)
      .select(
        'id, title, notes, due_date, time, category, repeat, repeat_interval, repeat_unit, completed',
      )
      .maybeSingle();

    if (saveErr || !data) {
      setError('The reminder could not be saved.');
    } else {
      setReminders((current) =>
        [...current, data as Reminder].sort((a, b) => {
          const d = a.due_date.localeCompare(
            b.due_date,
          );

          if (d !== 0) return d;

          return (a.time ?? '99:99').localeCompare(
            b.time ?? '99:99',
          );
        }),
      );

      setModalOpen(false);
    }

    setSaving(false);
  };

  const toggleComplete = async (r: Reminder) => {
    const next = !r.completed;

    /*
     * Non-repeating reminder:
     * simply toggle its completed status.
     */
    if (r.repeat === 'none') {
      const { error: updErr } = await supabase
        .from('reminders')
        .update({ completed: next })
        .eq('id', r.id);

      if (updErr) {
        setError('Could not update the reminder.');
        return;
      }

      setReminders((current) =>
        current
          .map((item) =>
            item.id === r.id
              ? { ...item, completed: next }
              : item,
          )
          .sort((a, b) => {
            const d = a.due_date.localeCompare(
              b.due_date,
            );

            if (d !== 0) return d;

            return (a.time ?? '99:99').localeCompare(
              b.time ?? '99:99',
            );
          }),
      );

      return;
    }

    /*
     * Repeating reminder:
     *
     * When completing today's occurrence:
     *
     *   Today    -> completed
     *   Tomorrow -> new incomplete occurrence
     *
     * We do NOT move the existing row to tomorrow.
     */
    if (next) {
      const newDate = advanceReminder(r);

      const {
        data: completedData,
        error: completeErr,
      } = await supabase
        .from('reminders')
        .update({ completed: true })
        .eq('id', r.id)
        .select(
          'id, title, notes, due_date, time, category, repeat, repeat_interval, repeat_unit, completed',
        )
        .maybeSingle();

      if (completeErr || !completedData) {
        setError(
          'Could not complete the repeating reminder.',
        );
        return;
      }

      const {
        data: nextData,
        error: nextErr,
      } = await supabase
        .from('reminders')
        .insert({
          title: r.title,
          notes: r.notes,
          due_date: newDate,
          time: r.time,
          category: r.category,
          repeat: r.repeat,
          repeat_interval: r.repeat_interval,
          repeat_unit: r.repeat_unit,
          completed: false,
        })
        .select(
          'id, title, notes, due_date, time, category, repeat, repeat_interval, repeat_unit, completed',
        )
        .maybeSingle();

      if (nextErr || !nextData) {
        /*
         * If creation of the next occurrence failed,
         * restore today's occurrence to incomplete.
         */
        await supabase
          .from('reminders')
          .update({ completed: false })
          .eq('id', r.id);

        setError(
          'Could not create the next repeating reminder.',
        );

        return;
      }

      setReminders((current) =>
        [
          ...current.filter(
            (item) => item.id !== r.id,
          ),
          completedData as Reminder,
          nextData as Reminder,
        ].sort((a, b) => {
          const d = a.due_date.localeCompare(
            b.due_date,
          );

          if (d !== 0) return d;

          return (a.time ?? '99:99').localeCompare(
            b.time ?? '99:99',
          );
        }),
      );

      return;
    }

    /*
     * If a completed repeating occurrence is
     * unchecked, only that occurrence is made
     * incomplete again.
     */
    const { error: undoErr } = await supabase
      .from('reminders')
      .update({ completed: false })
      .eq('id', r.id);

    if (undoErr) {
      setError('Could not update the reminder.');
      return;
    }

    setReminders((current) =>
      current
        .map((item) =>
          item.id === r.id
            ? { ...item, completed: false }
            : item,
        )
        .sort((a, b) => {
          const d = a.due_date.localeCompare(
            b.due_date,
          );

          if (d !== 0) return d;

          return (a.time ?? '99:99').localeCompare(
            b.time ?? '99:99',
          );
        }),
    );
  };

  const deleteReminder = async (r: Reminder) => {
    const previous = reminders;

    setReminders((current) =>
      current.filter((item) => item.id !== r.id),
    );

    setDetailOpen(null);

    const { error: delErr } = await supabase
      .from('reminders')
      .delete()
      .eq('id', r.id);

    if (delErr) {
      setError('Could not delete the reminder.');
      setReminders(previous);
    }
  };

  const filteredReminders = useMemo(() => {
    switch (filter) {
      case 'completed':
        return reminders.filter((r) => r.completed);

      case 'incomplete':
        return reminders.filter((r) => !r.completed);

      default:
        return reminders;
    }
  }, [reminders, filter]);

  const groups = useMemo(
    () => groupReminders(filteredReminders),
    [filteredReminders],
  );

  const FILTER_TAGS: {
    key: FilterTag;
    label: string;
  }[] = [
    { key: 'all', label: 'All reminders' },
    { key: 'completed', label: 'Completed' },
    { key: 'incomplete', label: 'Incomplete' },
  ];

  const C = isDark
    ? {
        bg: '#090909',
        card: '#151515',
        border: '#2A2A2A',
        text: '#F4F2EE',
        muted: '#AAA59D',
        divider: '#262626',
        inputBg: '#1E1E1E',
        inputBorder: '#363636',
      }
    : {
        bg: '#FBFAF8',
        card: '#FFFFFF',
        border: '#ECE9E4',
        text: '#27241F',
        muted: '#8F8A82',
        divider: '#F0EEEA',
        inputBg: '#FCFBF9',
        inputBorder: '#E0DDD7',
      };

  const styles = makeStyles(C);

  return (
    <SafeAreaView
      style={[
        styles.safe,
        isDark && styles.safeDark,
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push('/modules')}
          style={[
            styles.backBtn,
            { backgroundColor: accent },
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
            { color: accent },
          ]}
        >
          REMINDERS
        </Text>

        <Pressable
          style={styles.bellBtn}
          hitSlop={12}
        >
          <Bell
            color={C.text}
            size={20}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <Text style={styles.error}>
            {error}
          </Text>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {FILTER_TAGS.map((tag) => (
            <Pressable
              key={tag.key}
              onPress={() =>
                setFilter(tag.key)
              }
              style={[
                styles.filterTag,
                filter === tag.key && {
                  backgroundColor: accent,
                  borderColor: accent,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterTagText,
                  filter === tag.key && {
                    color: onAccent,
                    fontFamily: FONT_SEMI,
                  },
                ]}
              >
                {tag.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <Text style={styles.emptyText}>
            Loading your reminders...
          </Text>
        ) : filteredReminders.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No reminders match this filter.
              Tap + to create one.
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View
              key={group.key}
              style={styles.group}
            >
              <Text style={styles.groupLabel}>
                {group.label.toUpperCase()}
              </Text>

              <View style={styles.list}>
                {group.items.map((r, i) => (
                  <Pressable
                    key={r.id}
                    onPress={() =>
                      setDetailOpen(r)
                    }
                    style={[
                      styles.row,
                      i <
                        group.items.length - 1 &&
                        styles.rowBorder,
                    ]}
                  >
                    <Pressable
                      onPress={() =>
                        toggleComplete(r)
                      }
                      style={[
                        styles.check,
                        r.completed && {
                          backgroundColor:
                            accent,
                          borderColor: accent,
                        },
                      ]}
                      hitSlop={8}
                    >
                      {r.completed && (
                        <Check
                          color={onAccent}
                          size={15}
                        />
                      )}
                    </Pressable>

                    <View style={styles.rowCopy}>
                      <Text
                        style={[
                          styles.reminderTitle,
                          r.completed &&
                            styles.doneTitle,
                        ]}
                        numberOfLines={1}
                      >
                        {r.title}
                      </Text>

                      <Text
                        style={styles.metaText}
                      >
                        {prettyDate(
                          r.due_date,
                        )}
                        {r.time
                          ? `  ·  ${prettyTime(
                              r.time,
                            )}`
                          : ''}
                        {'  ·  '}
                        {r.category}
                      </Text>

                      {r.repeat !== 'none' && (
                        <View
                          style={[
                            styles.repeatPill,
                            {
                              backgroundColor:
                                accent,
                            },
                          ]}
                        >
                          <Repeat
                            color={onAccent}
                            size={10}
                            strokeWidth={2.4}
                          />

                          <Text
                            style={[
                              styles.repeatPillText,
                              {
                                color:
                                  onAccent,
                              },
                            ]}
                          >
                            {repeatLabel(r)}
                          </Text>
                        </View>
                      )}
                    </View>

                    <ChevronRight
                      color={
                        isDark
                          ? '#555'
                          : '#C8C5BE'
                      }
                      size={18}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={openNew}
        style={[
          styles.fab,
          { backgroundColor: accent },
        ]}
        hitSlop={12}
      >
        <Plus
          color={onAccent}
          size={26}
          strokeWidth={2.6}
        />
      </Pressable>

      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setModalOpen(false)
        }
      >
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <View
              style={styles.modalTitleRow}
            >
              <Text style={styles.modalTitle}>
                {editingId
                  ? 'Edit reminder'
                  : 'New reminder'}
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
              style={{ flex: 1 }}
            >
              <Text style={styles.label}>
                Title
              </Text>

              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="What do you need to remember?"
                placeholderTextColor="#9B978F"
                style={styles.input}
                autoFocus
              />

              <Text style={styles.label}>
                Notes (optional)
              </Text>

              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Add details"
                placeholderTextColor="#9B978F"
                style={[
                  styles.input,
                  styles.inputMulti,
                ]}
                multiline
              />

              <Text style={styles.label}>
                Date
              </Text>

              <DatePickerInput
                value={dueDate}
                onChange={setDueDate}
                accent={accent}
                onAccent={onAccent}
                isDark={isDark}
              />

              <Text style={styles.label}>
                Time (optional)
              </Text>

              <TimePickerInput
                value={time}
                onChange={setTime}
                accent={accent}
                onAccent={onAccent}
                isDark={isDark}
              />

              <Text style={styles.label}>
                Category
              </Text>

              <View style={styles.chipRow}>
                {CATEGORIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() =>
                      setCategory(c)
                    }
                    style={[
                      styles.chip,
                      category === c && {
                        backgroundColor:
                          accent,
                        borderColor:
                          accent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        category === c && {
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

              <Text style={styles.label}>
                Repeat
              </Text>

              <View style={styles.repeatRow}>
                {REPEAT_OPTIONS.map(
                  (opt) => (
                    <Pressable
                      key={opt.key}
                      onPress={() =>
                        setRepeat(
                          opt.key,
                        )
                      }
                      style={[
                        styles.chip,
                        repeat ===
                          opt.key && {
                          backgroundColor:
                            accent,
                          borderColor:
                            accent,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          repeat ===
                            opt.key && {
                            color:
                              onAccent,
                            fontFamily:
                              FONT_SEMI,
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>

              {repeat === 'custom' && (
                <View
                  style={styles.customRow}
                >
                  <Text
                    style={
                      styles.customPrefix
                    }
                  >
                    Every
                  </Text>

                  <TextInput
                    value={repeatInterval}
                    onChangeText={
                      setRepeatInterval
                    }
                    placeholder="1"
                    placeholderTextColor="#9B978F"
                    style={
                      styles.customInput
                    }
                    keyboardType="numeric"
                  />

                  <View
                    style={
                      styles.customUnitRow
                    }
                  >
                    {REPEAT_UNITS.map(
                      (u) => (
                        <Pressable
                          key={u.key}
                          onPress={() =>
                            setRepeatUnit(
                              u.key,
                            )
                          }
                          style={[
                            styles.chip,
                            repeatUnit ===
                              u.key && {
                              backgroundColor:
                                accent,
                              borderColor:
                                accent,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              repeatUnit ===
                                u.key && {
                                color:
                                  onAccent,
                                fontFamily:
                                  FONT_SEMI,
                              },
                            ]}
                          >
                            {u.label}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                </View>
              )}
            </ScrollView>

            <Pressable
              disabled={saving}
              onPress={saveReminder}
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    accent,
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
                  : editingId
                  ? 'Save changes'
                  : 'Add reminder'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!detailOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setDetailOpen(null)
        }
      >
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            {detailOpen &&
              (() => {
                const r = detailOpen;

                return (
                  <>
                    <View
                      style={
                        styles.modalTitleRow
                      }
                    >
                      <Text
                        style={
                          styles.modalTitle
                        }
                        numberOfLines={2}
                      >
                        {r.title}
                      </Text>

                      <Pressable
                        onPress={() =>
                          setDetailOpen(
                            null,
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

                    <View
                      style={
                        styles.detailSection
                      }
                    >
                      <View
                        style={
                          styles.detailLine
                        }
                      >
                        <CalendarDays
                          color={C.muted}
                          size={16}
                        />

                        <Text
                          style={
                            styles.detailText
                          }
                        >
                          {prettyDate(
                            r.due_date,
                          )}
                          {r.time
                            ? ` at ${prettyTime(
                                r.time,
                              )}`
                            : ''}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.detailLine
                        }
                      >
                        <Bell
                          color={C.muted}
                          size={16}
                        />

                        <Text
                          style={
                            styles.detailText
                          }
                        >
                          {r.category}
                        </Text>
                      </View>

                      {r.repeat !==
                        'none' && (
                        <View
                          style={
                            styles.detailLine
                          }
                        >
                          <Repeat
                            color={
                              C.muted
                            }
                            size={16}
                          />

                          <Text
                            style={
                              styles.detailText
                            }
                          >
                            {repeatLabel(
                              r,
                            )}
                          </Text>
                        </View>
                      )}

                      {r.notes && (
                        <Text
                          style={
                            styles.detailNotes
                          }
                        >
                          {r.notes}
                        </Text>
                      )}
                    </View>

                    <View
                      style={
                        styles.detailActions
                      }
                    >
                      <Pressable
                        onPress={() =>
                          openEdit(r)
                        }
                        style={[
                          styles.detailAction,
                          {
                            backgroundColor:
                              accent,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.detailActionText,
                            {
                              color:
                                onAccent,
                            },
                          ]}
                        >
                          Edit
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          deleteReminder(r)
                        }
                        style={[
                          styles.detailAction,
                          styles.deleteAction,
                        ]}
                      >
                        <Trash2
                          color={
                            isDark
                              ? '#E5A39C'
                              : '#C53A2F'
                          }
                          size={16}
                        />

                        <Text
                          style={
                            styles.deleteText
                          }
                        >
                          Delete
                        </Text>
                      </Pressable>
                    </View>
                  </>
                );
              })()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type Palette = {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  divider: string;
  inputBg: string;
  inputBorder: string;
};

function makeStyles(C: Palette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: C.bg,
    },

    safeDark: {
      backgroundColor: '#090909',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingTop: 28,
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

    bellBtn: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },

    content: {
      padding: 16,
      paddingBottom: 90,
    },

    error: {
      fontFamily: FONT_MED,
      color: '#C53A2F',
      fontSize: 13,
      marginBottom: 10,
    },

    filterScroll: {
      marginBottom: 18,
    },

    filterRow: {
      flexDirection: 'row',
      gap: 8,
    },

    filterTag: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.card,
    },

    filterTagText: {
      fontFamily: FONT,
      fontSize: 12,
      color: C.muted,
    },

    group: {
      marginBottom: 18,
    },

    groupLabel: {
      fontFamily: FONT_BOLD,
      fontSize: 11,
      letterSpacing: 1,
      color: C.muted,
      marginBottom: 8,
      marginLeft: 4,
    },

    list: {
      backgroundColor: C.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
    },

    row: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },

    rowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
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
      gap: 4,
    },

    reminderTitle: {
      fontFamily: FONT_MED,
      fontSize: 15,
      color: C.text,
    },

    doneTitle: {
      textDecorationLine: 'line-through',
      opacity: 0.5,
    },

    metaText: {
      fontFamily: FONT,
      fontSize: 12,
      color: C.muted,
    },

    repeatPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      alignSelf: 'flex-start',
      marginTop: 2,
    },

    repeatPillText: {
      fontFamily: FONT_SEMI,
      fontSize: 10,
    },

    empty: {
      paddingVertical: 40,
      alignItems: 'center',
    },

    emptyText: {
      fontFamily: FONT,
      fontSize: 14,
      color: C.muted,
      textAlign: 'center',
    },

    fab: {
      position: 'absolute',
      bottom: 24,
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
      width: 56,
      height: 56,
      borderRadius: 28,
      alignSelf: 'center',
      marginHorizontal: 'auto',
    },

    modalShade: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },

    modalCard: {
      backgroundColor: C.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 22,
      paddingBottom: 34,
      maxHeight: '92%',
      flex: 1,
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
      color: C.text,
      flex: 1,
      marginRight: 12,
    },

    label: {
      fontFamily: FONT_MED,
      fontSize: 13,
      color: C.muted,
      marginTop: 14,
      marginBottom: 6,
    },

    input: {
      borderWidth: 1,
      borderColor: C.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontFamily: FONT,
      fontSize: 15,
      color: C.text,
      backgroundColor: C.inputBg,
    },

    inputMulti: {
      minHeight: 70,
      textAlignVertical: 'top',
    },

    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },

    repeatRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },

    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.card,
    },

    chipText: {
      fontFamily: FONT,
      fontSize: 13,
      color: C.muted,
    },

    customRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
      flexWrap: 'wrap',
    },

    customPrefix: {
      fontFamily: FONT_MED,
      fontSize: 14,
      color: C.text,
    },

    customInput: {
      width: 64,
      borderWidth: 1,
      borderColor: C.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: FONT,
      fontSize: 15,
      color: C.text,
      textAlign: 'center',
      backgroundColor: C.inputBg,
    },

    customUnitRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },

    saveButton: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 22,
    },

    saveText: {
      fontFamily: FONT_SEMI,
      fontSize: 15,
    },

    detailSection: {
      marginTop: 8,
      gap: 12,
      paddingVertical: 8,
    },

    detailLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    detailText: {
      fontFamily: FONT_MED,
      fontSize: 14,
      color: C.text,
    },

    detailNotes: {
      fontFamily: FONT,
      fontSize: 14,
      color: C.muted,
      lineHeight: 20,
      marginTop: 4,
    },

    detailActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
    },

    detailAction: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },

    deleteAction: {
      backgroundColor: isDarkColor(C)
        ? '#241815'
        : '#FBEAE8',
      borderWidth: 1,
      borderColor: isDarkColor(C)
        ? '#3A2422'
        : '#F2C8C2',
    },

    deleteText: {
      fontFamily: FONT_SEMI,
      fontSize: 14,
      color: '#C53A2F',
    },

    detailActionText: {
      fontFamily: FONT_SEMI,
      fontSize: 14,
    },
  });
}

function isDarkColor(C: Palette): boolean {
  return C.bg === '#090909';
}