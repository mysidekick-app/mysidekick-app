import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Plus,
  Repeat,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  repeat_end_date: string | null;
  repeat_end_time: string | null;
  category: string;
  repeat: string;
  repeat_interval: number;
  repeat_unit: string | null;
  completed: boolean;
};

type RepeatType =
  | 'none'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'annually'
  | 'custom';

type RepeatUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
type FilterTag = 'all' | 'completed' | 'incomplete';

const REPEAT_OPTIONS: { key: RepeatType; label: string }[] = [
  { key: 'none', label: 'Does not repeat' },
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'annually', label: 'Annually' },
  { key: 'custom', label: 'Custom' },
];

const REPEAT_UNITS: { key: RepeatUnit; label: string }[] = [
  { key: 'minute', label: 'minutes' },
  { key: 'hour', label: 'hours' },
  { key: 'day', label: 'days' },
  { key: 'week', label: 'weeks' },
  { key: 'month', label: 'months' },
  { key: 'year', label: 'years' },
];

const CATEGORIES = ['General', 'Work', 'Personal'];

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
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

const advanceReminder = (r: Reminder): { due_date: string; time: string } => {
  const currentTime = r.time || '00:00';

  // Minute/hour repeats must advance the actual date-time, not just the date.
  if (r.repeat === 'hourly' || (r.repeat === 'custom' && (r.repeat_unit === 'minute' || r.repeat_unit === 'hour'))) {
    const next = new Date(`${r.due_date}T${currentTime}:00`);
    if (r.repeat === 'hourly') {
      next.setHours(next.getHours() + 1);
    } else if (r.repeat_unit === 'minute') {
      next.setMinutes(next.getMinutes() + Math.max(1, r.repeat_interval));
    } else {
      next.setHours(next.getHours() + Math.max(1, r.repeat_interval));
    }
    return {
      due_date: formatDate(next),
      time: `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`,
    };
  }

  switch (r.repeat) {
    case 'daily':
      return { due_date: addInterval(r.due_date, 'day', 1), time: currentTime };
    case 'weekly':
      return { due_date: addInterval(r.due_date, 'week', 1), time: currentTime };
    case 'monthly':
      return { due_date: addInterval(r.due_date, 'month', 1), time: currentTime };
    case 'annually':
      return { due_date: addInterval(r.due_date, 'year', 1), time: currentTime };
    case 'custom':
      return {
        due_date: addInterval(
          r.due_date,
          (r.repeat_unit ?? 'day') as RepeatUnit,
          Math.max(1, r.repeat_interval),
        ),
        time: currentTime,
      };
    default:
      return { due_date: r.due_date, time: currentTime };
  }
};

const prettyDate = (dateStr: string) => {
  const d = new Date(`${dateStr}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cmp = new Date(d);
  cmp.setHours(0, 0, 0, 0);

  const diff = Math.round((cmp.getTime() - today.getTime()) / 86400000);

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
    case 'hourly':
      return 'Hourly';
    case 'custom': {
      const unit = r.repeat_unit ?? 'day';
      const unitLabel =
        REPEAT_UNITS.find((u) => u.key === unit)?.label ?? 'days';
      return `Every ${r.repeat_interval} ${unitLabel}`;
    }
    default:
      return REPEAT_OPTIONS.find((o) => o.key === r.repeat)?.label ?? '';
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

  for (const r of reminders) {
    if (r.completed) {
      continue;
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
  ].filter((g) => g.items.length > 0);
};

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

export default function RemindersScreen() {
  const { accentForeground, accentColor: rawAccent, isDark, onAccent } = useApp() as any;

  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);
  const headerTextColor = isAccentPureBlack ? '#FFFFFF' : '#000000';

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<Reminder | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<Reminder | null>(null);

  const [filter, setFilter] = useState<FilterTag>('all');

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(todayStr());
  const [time, setTime] = useState('');
  const [endDate, setEndDate] = useState(todayStr());
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState('General');

  const [repeat, setRepeat] = useState<RepeatType>('none');
  const [repeatInterval, setRepeatInterval] = useState('1');
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit>('day');

  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error: loadErr } = await supabase
      .from('reminders')
      .select(
        'id, title, notes, due_date, time, repeat_end_date, repeat_end_time, category, repeat, repeat_interval, repeat_unit, completed',
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
    setEndDate(todayStr());
    setEndTime('');
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
    setEndDate(r.repeat_end_date ?? r.due_date);
    setEndTime(r.repeat_end_time ?? r.time ?? '');
    setCategory(r.category);

    setRepeat((r.repeat as RepeatType) || 'none');
    setRepeatInterval(String(r.repeat_interval ?? 1));
    setRepeatUnit((r.repeat_unit as RepeatUnit) || 'day');

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

    if (!time.trim()) {
      setError('Pick a time for this reminder.');
      return;
    }

    if (repeat !== 'none') {
      if (!endDate) { setError('Pick an end date for this repeating reminder.'); return; }
      if (!endTime.trim()) { setError('Pick an end time for this repeating reminder.'); return; }
      if (endDate < dueDate) { setError('End date cannot be before start date.'); return; }
      if (endDate === dueDate && endTime <= time) { setError('End time must be later than start time.'); return; }
    }

    const parsedInterval = parseInt(repeatInterval, 10) || 1;
    if (repeat === 'custom' && repeatUnit === 'minute' && parsedInterval < 10) {
      setError('The minimum repeat interval is 10 minutes.');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      due_date: dueDate,
      time: time.trim(),
      repeat_end_date: repeat === 'none' ? null : endDate,
      repeat_end_time: repeat === 'none' ? null : endTime.trim(),
      category,
      repeat,
      repeat_interval:
        repeat === 'custom'
          ? Math.max(repeatUnit === 'minute' ? 10 : 1, parsedInterval)
          : 1,
      repeat_unit: repeat === 'custom' ? repeatUnit : null,
    };

    if (editingId) {
      const { data, error: updateErr } = await supabase
        .from('reminders')
        .update(payload)
        .eq('id', editingId)
        .select(
          'id, title, notes, due_date, time, repeat_end_date, repeat_end_time, category, repeat, repeat_interval, repeat_unit, completed',
        )
        .maybeSingle();

      if (updateErr || !data) {
        setError('The reminder could not be updated.');
      } else {
        setReminders((current) =>
          current
            .map((item) => (item.id === editingId ? (data as Reminder) : item))
            .sort((a, b) => {
              const d = a.due_date.localeCompare(b.due_date);
              if (d !== 0) return d;
              return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
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
        'id, title, notes, due_date, time, repeat_end_date, repeat_end_time, category, repeat, repeat_interval, repeat_unit, completed',
      )
      .maybeSingle();

    if (saveErr || !data) {
      setError('The reminder could not be saved.');
    } else {
      setReminders((current) =>
        [...current, data as Reminder].sort((a, b) => {
          const d = a.due_date.localeCompare(b.due_date);
          if (d !== 0) return d;
          return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
        }),
      );

      setModalOpen(false);
    }

    setSaving(false);
  };

  const toggleComplete = async (r: Reminder) => {
    const next = !r.completed;

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
          .map((item) => (item.id === r.id ? { ...item, completed: next } : item))
          .sort((a, b) => {
            const d = a.due_date.localeCompare(b.due_date);
            if (d !== 0) return d;
            return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
          }),
      );

      return;
    }

    if (next) {
      const nextOccurrence = advanceReminder(r);
      const startClock = r.time ?? '00:00';
      const endClock = r.repeat_end_time ?? startClock;
      const endDay = r.repeat_end_date ?? r.due_date;
      const isIntradayRepeat = r.repeat === 'hourly' || (r.repeat === 'custom' && (r.repeat_unit === 'minute' || r.repeat_unit === 'hour'));
      if (isIntradayRepeat && nextOccurrence.time > endClock) {
        const nextDay = new Date(`${nextOccurrence.due_date}T12:00:00`);
        nextDay.setDate(nextDay.getDate() + 1);
        nextOccurrence.due_date = formatDate(nextDay);
        nextOccurrence.time = startClock;
      }
      const nextIsWithinWindow = nextOccurrence.due_date < endDay || (nextOccurrence.due_date === endDay && nextOccurrence.time <= endClock);
      const shouldCreateNext = nextIsWithinWindow;

      const { data: completedData, error: completeErr } = await supabase
        .from('reminders')
        .update({ completed: true })
        .eq('id', r.id)
        .select(
          'id, title, notes, due_date, time, repeat_end_date, repeat_end_time, category, repeat, repeat_interval, repeat_unit, completed',
        )
        .maybeSingle();

      if (completeErr || !completedData) {
        setError('Could not complete the repeating reminder.');
        return;
      }

      let nextData: any = null;
      let nextErr: any = null;
      if (shouldCreateNext) {
        const result = await supabase
        .from('reminders')
        .insert({
          title: r.title,
          notes: r.notes,
          due_date: nextOccurrence.due_date,
          time: nextOccurrence.time,
          repeat_end_date: r.repeat_end_date,
          repeat_end_time: r.repeat_end_time,
          category: r.category,
          repeat: r.repeat,
          repeat_interval: r.repeat_interval,
          repeat_unit: r.repeat_unit,
          completed: false,
        })
        .select(
          'id, title, notes, due_date, time, repeat_end_date, repeat_end_time, category, repeat, repeat_interval, repeat_unit, completed',
        )
        .maybeSingle();
        nextData = result.data;
        nextErr = result.error;
      }

      if (shouldCreateNext && (nextErr || !nextData)) {
        await supabase
          .from('reminders')
          .update({ completed: false })
          .eq('id', r.id);

        setError('Could not create the next repeating reminder.');
        return;
      }

      setReminders((current) =>
        [
          ...current.filter((item) => item.id !== r.id),
          completedData as Reminder,
          ...(nextData ? [nextData as Reminder] : []),
        ].sort((a, b) => {
          const d = a.due_date.localeCompare(b.due_date);
          if (d !== 0) return d;
          return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
        }),
      );

      return;
    }

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
        .map((item) => (item.id === r.id ? { ...item, completed: false } : item))
        .sort((a, b) => {
          const d = a.due_date.localeCompare(b.due_date);
          if (d !== 0) return d;
          return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
        }),
    );
  };

  const confirmDeleteReminder = (r: Reminder) => {
    setDeleteConfirmTarget(r);
  };

  const handleExecuteDelete = async () => {
    if (!deleteConfirmTarget) return;
    const r = deleteConfirmTarget;
    setDeleteConfirmTarget(null);

    const previous = reminders;
    setReminders((current) => current.filter((item) => item.id !== r.id));
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

  const groups = useMemo(() => {
    if (filter === 'completed') {
      return [
        {
          key: 'completed',
          label: 'Complete',
          items: [...filteredReminders]
            .sort((a, b) => {
              const d = a.due_date.localeCompare(b.due_date);
              if (d !== 0) return d;
              return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
            })
            .reverse(),
        },
      ].filter((g) => g.items.length > 0);
    }

    return groupReminders(filteredReminders);
  }, [filteredReminders, filter]);

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
          onPress={() => router.push('/modules')}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: headerTextColor }]}>
          REMINDERS
        </Text>

        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.bellBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <MoreVertical color={headerTextColor} size={24} strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* HEADER MENU MODAL */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuShade} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuCardWrapper}>
            <View style={styles.shadowBackdrop} />
            <View style={[styles.menuCardBody, { backgroundColor: C.cardBg }]}>
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
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
      </Modal>

      {/* PINNED / STICKY FILTER BAR */}
      <View style={[styles.stickyFilterContainer, { backgroundColor: pageBg }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTER_TAGS.map((tag) => {
            const active = filter === tag.key;
            return (
              <View key={tag.key} style={styles.filterTagWrapper}>
                <View style={styles.filterShadowBackdrop} />
                <Pressable
                  onPress={() => setFilter(tag.key)}
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
                    {tag.label}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* SCROLLING REMINDERS LIST */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {loading ? (
          <Text style={[styles.emptyText, { color: headerTextColor }]}>
            Loading your reminders...
          </Text>
        ) : filteredReminders.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: headerTextColor }]}>
              No reminders match this filter. Tap + to create one.
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={[styles.groupLabel, { color: headerTextColor }]}>
                {group.label.toUpperCase()}
              </Text>

              <View style={styles.listStack}>
                {group.items.map((r) => (
                  <View key={r.id} style={styles.cardContainer}>
                    <View style={styles.cardShadowBackdrop} />
                    <Pressable
                      onPress={() => setDetailOpen(r)}
                      style={[
                        styles.cardBody,
                        {
                          backgroundColor: C.cardBg,
                          borderColor: C.cardBorder,
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() => toggleComplete(r)}
                        style={[
                          styles.check,
                          r.completed && styles.checkDone,
                        ]}
                        hitSlop={8}
                      >
                        {r.completed && (
                          <Check color="#000000" size={14} strokeWidth={3} />
                        )}
                      </Pressable>

                      <View style={styles.rowCopy}>
                        <Text
                          style={[
                            styles.reminderTitle,
                            { color: C.cardText },
                            r.completed && styles.doneTitle,
                          ]}
                          numberOfLines={1}
                        >
                          {r.title}
                        </Text>

                        <Text style={[styles.metaText, { color: C.cardSubtext }]}>
                          {prettyDate(r.due_date)}
                          {r.time ? `  ·  ${prettyTime(r.time)}` : ''}
                          {'  ·  '}
                          {r.category}
                        </Text>

                        {r.repeat !== 'none' && (
                          <View style={styles.repeatBadge}>
                            <Repeat color="#000000" size={10} strokeWidth={2.5} />
                            <Text style={styles.repeatBadgeText}>
                              {repeatLabel(r)}
                            </Text>
                          </View>
                        )}
                      </View>

                      <ChevronRight color={C.cardText} size={20} strokeWidth={2.5} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* FAB */}
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

      {/* CENTERED FORM MODAL */}
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
                    {editingId ? 'Edit reminder' : 'New reminder'}
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
                    value={title}
                    onChangeText={setTitle}
                    placeholder="What do you need to remember?"
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
                    NOTES (OPTIONAL)
                  </Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Add details..."
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      styles.inputMulti,
                      {
                        backgroundColor: C.inputBg,
                        borderColor: C.inputBorder,
                        color: C.cardText,
                      },
                    ]}
                    multiline
                  />

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    START DATE
                  </Text>
                  <DatePickerInput
                    value={dueDate}
                    onChange={(value) => {
                      setDueDate(value);
                      if (endDate < value) setEndDate(value);
                    }}
                    accent={pageBg}
                    onAccent={onAccent}
                    isDark={isDark}
                  />

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    START TIME (REQUIRED)
                  </Text>
                  <TimePickerInput
                    value={time}
                    onChange={setTime}
                    accent={pageBg}
                    onAccent={onAccent}
                    isDark={isDark}
                  />

                  {repeat !== 'none' && (
                    <>
                      <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>END DATE</Text>
                      <DatePickerInput value={endDate} onChange={setEndDate} accent={pageBg} onAccent={onAccent} isDark={isDark} />
                      <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>END TIME</Text>
                      <TimePickerInput value={endTime} onChange={setEndTime} accent={pageBg} onAccent={onAccent} isDark={isDark} />
                    </>
                  )}

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
                    REPEAT
                  </Text>
                  <View style={styles.chipRow}>
                    {REPEAT_OPTIONS.map((opt) => {
                      const selected = repeat === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => setRepeat(opt.key)}
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
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {repeat === 'custom' && (
                    <View style={styles.customRow}>
                      <Text style={[styles.customPrefix, { color: C.cardText }]}>
                        Every
                      </Text>

                      <TextInput
                        value={repeatInterval}
                        onChangeText={(value) => {
                          const digits = value.replace(/[^0-9]/g, '');
                          setRepeatInterval(digits);
                        }}
                        placeholder="1"
                        placeholderTextColor={C.cardSubtext}
                        style={[
                          styles.customInput,
                          {
                            backgroundColor: C.inputBg,
                            borderColor: C.inputBorder,
                            color: C.cardText,
                          },
                        ]}
                        keyboardType="numeric"
                        onBlur={() => { if (repeatUnit === 'minute' && repeatInterval && Number(repeatInterval) < 10) setRepeatInterval('10'); }}
                      />

                      <View style={styles.chipRow}>
                        {REPEAT_UNITS.map((u) => {
                          const selected = repeatUnit === u.key;
                          return (
                            <Pressable
                              key={u.key}
                              onPress={() => { setRepeatUnit(u.key); if (u.key === 'minute' && Number(repeatInterval) < 10) setRepeatInterval('10'); }}
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
                                {u.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </ScrollView>

                <Pressable
                  disabled={saving}
                  onPress={saveReminder}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressedBtn,
                    saving && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {saving
                      ? 'Saving...'
                      : editingId
                      ? 'Save changes'
                      : 'Add reminder'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* CENTERED DETAIL MODAL */}
      <Modal
        visible={!!detailOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailOpen(null)}
      >
        <View style={styles.centeredModalShade}>
          <View style={styles.modalCardWrapper}>
            <View style={styles.modalShadowBackdrop} />
            <View style={[styles.modalCardBody, { backgroundColor: C.cardBg }]}>
              {detailOpen && (() => {
                const r = detailOpen;
                return (
                  <>
                    <View style={styles.modalTitleRow}>
                      <Text
                        style={[styles.modalTitle, { color: C.cardText }]}
                        numberOfLines={2}
                      >
                        {r.title}
                      </Text>

                      <Pressable onPress={() => setDetailOpen(null)} hitSlop={12}>
                        <X color={C.cardText} size={22} strokeWidth={2.5} />
                      </Pressable>
                    </View>

                    <View style={styles.detailSection}>
                      <View style={styles.detailLine}>
                        <CalendarDays color={C.cardSubtext} size={18} strokeWidth={2.2} />
                        <Text style={[styles.detailText, { color: C.cardText }]}>
                          {prettyDate(r.due_date)}
                          {r.time ? ` at ${prettyTime(r.time)}` : ''}
                        </Text>
                      </View>

                      <View style={styles.detailLine}>
                        <Bell color={C.cardSubtext} size={18} strokeWidth={2.2} />
                        <Text style={[styles.detailText, { color: C.cardText }]}>
                          {r.category}
                        </Text>
                      </View>

                      {r.repeat !== 'none' && (
                        <View style={styles.detailLine}>
                          <Repeat color={C.cardSubtext} size={18} strokeWidth={2.2} />
                          <Text style={[styles.detailText, { color: C.cardText }]}>
                            {repeatLabel(r)}
                          </Text>
                        </View>
                      )}

                      {r.notes && (
                        <Text style={[styles.detailNotes, { color: C.cardSubtext }]}>
                          {r.notes}
                        </Text>
                      )}
                    </View>

                    <View style={styles.detailActions}>
                      <Pressable
                        onPress={() => openEdit(r)}
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          { flex: 1 },
                          pressed && styles.pressedBtn,
                        ]}
                      >
                        <Text style={styles.primaryBtnText}>Edit</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => confirmDeleteReminder(r)}
                        style={({ pressed }) => [
                          styles.dangerBtn,
                          { flex: 1 },
                          pressed && styles.pressedBtn,
                        ]}
                      >
                        <Trash2 color="#FFFFFF" size={16} strokeWidth={2.5} />
                        <Text style={styles.dangerBtnText}>Delete</Text>
                      </Pressable>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </View>
      </Modal>

      {/* CENTERED DELETE ALERT MODAL */}
      <Modal
        visible={Boolean(deleteConfirmTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmTarget(null)}
      >
        <View style={styles.alertShade}>
          <View style={styles.alertCardWrapper}>
            <View style={styles.alertShadowBackdrop} />
            <View style={styles.alertCardBody}>
              <View style={styles.alertHeaderRow}>
                <View style={styles.alertIconBadge}>
                  <AlertTriangle color="#000000" size={20} strokeWidth={2.5} />
                </View>
                <Text style={styles.alertTitle}>Delete Reminder?</Text>
              </View>

              <Text style={styles.alertMessage}>
                Are you sure you want to delete this reminder? This action cannot be undone.
              </Text>

              <View style={styles.alertActionsRow}>
                <Pressable
                  onPress={() => setDeleteConfirmTarget(null)}
                  style={({ pressed }) => [
                    styles.alertCancelBtn,
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={styles.alertCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleExecuteDelete}
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
  },
  backBtn: {
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
  bellBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* HEADER MENU */
  menuShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 20,
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

  /* PINNED / STICKY FILTER CONTAINER */
  stickyFilterContainer: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    zIndex: 10,
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

  /* SCROLLING CONTENT */
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 120,
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

  empty: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    textAlign: 'center',
  },

  group: {
    marginBottom: 18,
  },
  groupLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 2,
  },
  listStack: {
    gap: 12,
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
  cardBody: {
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
  reminderTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
  },
  doneTitle: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  metaText: {
    fontFamily: FONT_MED,
    fontSize: 11,
  },
  repeatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#000000',
    backgroundColor: '#FDE047',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  repeatBadgeText: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    color: '#000000',
  },

  /* FAB NEO-BRUTALIST */
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
    backgroundColor: 'rgba(0,0,0,0.8)',
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
    maxHeight: 520,
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
  inputMulti: {
    minHeight: 64,
    textAlignVertical: 'top',
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
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  customPrefix: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },
  customInput: {
    width: 60,
    fontFamily: FONT_BOLD,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
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
  dangerBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  dangerBtnText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 15,
  },

  /* DETAIL MODAL SECTION */
  detailSection: {
    gap: 10,
    marginVertical: 10,
  },
  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailText: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },
  detailNotes: {
    fontFamily: FONT_MED,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 10,
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
    borderWidth: 3,
    borderColor: '#000000',
    padding: 20,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  alertIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FDE047',
    borderWidth: 2,
    borderColor: '#000000',
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
    marginBottom: 18,
  },
  alertActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  alertCancelBtn: {
    flex: 1,
    backgroundColor: '#F4F4F5',
    borderWidth: 2,
    borderColor: '#000000',
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
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  alertDeleteText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 13,
  },
});