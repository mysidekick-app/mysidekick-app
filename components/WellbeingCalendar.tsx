import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

type WellbeingCalendarProps = {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  accent: string;
  isDark: boolean;
  entryDates?: Set<string>;
  allowFuture?: boolean;
  dotColor?: string;
};

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const todayDate = () => formatDate(new Date());

export function WellbeingCalendar({ selectedDate, onSelectDate, accent, isDark, entryDates, allowFuture = false, dotColor }: WellbeingCalendarProps) {
  const [monthView, setMonthView] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseDate(selectedDate);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [weekOffset, setWeekOffset] = useState(0);

  const today = todayDate();
  const selected = parseDate(selectedDate);

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const week = useMemo(() => {
    const start = new Date(selected);
    start.setDate(selected.getDate() - selected.getDay() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [selectedDate, weekOffset]);

  const monthDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [viewMonth]);

  const styles = makeStyles(isDark);

  const hasEntry = (dateStr: string) => entryDates?.has(dateStr) ?? false;

  const shiftMonth = (amount: number) => {
    setViewMonth((c) => new Date(c.getFullYear(), c.getMonth() + amount, 1));
  };

  const shiftWeek = (amount: number) => {
    setWeekOffset((v) => v + amount);
  };

  const goToday = () => {
    setViewMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setWeekOffset(0);
    onSelectDate(today);
  };

  return (
    <View style={styles.wrapper}>
      <Pressable onPress={() => setMonthView((v) => !v)} style={styles.calendarHeader}>
        <View>
          <Text style={styles.calendarEyebrow}>DATE</Text>
          <Text style={[styles.calendarTitle, { color: accent }]}>{monthLabel}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={() => setMonthView((v) => !v)} style={styles.viewToggle} hitSlop={8}>
            <Text style={[styles.viewToggleText, { color: accent }]}>{monthView ? 'WEEK' : 'MONTH'}</Text>
          </Pressable>
        </View>
      </Pressable>

      {monthView ? (
        <View style={styles.monthContainer}>
          <View style={styles.navRow}>
            <Pressable onPress={() => shiftMonth(-1)} style={styles.navBtn} hitSlop={12}>
              <ChevronLeft color={isDark ? '#F4F2EE' : '#27241F'} size={20} />
            </Pressable>
            <Pressable onPress={goToday} hitSlop={8}>
              <Text style={[styles.todayLink, { color: accent }]}>Today</Text>
            </Pressable>
            <Pressable onPress={() => shiftMonth(1)} style={styles.navBtn} hitSlop={12}>
              <ChevronRight color={isDark ? '#F4F2EE' : '#27241F'} size={20} />
            </Pressable>
          </View>
          <View style={styles.monthHeaderRow}>
            {DAY_LABELS.map((d) => (
              <Text key={d} style={styles.monthDayLabel}>{d}</Text>
            ))}
          </View>
          <View style={styles.monthGrid}>
            {monthDays.map((date, i) => {
              if (!date) return <View key={`empty-${i}`} style={styles.monthDayEmpty} />;
              const value = formatDate(date);
              const isSelected = value === selectedDate;
              const isToday = value === today;
              const isFuture = value > today;
              const hasDot = hasEntry(value);
              const dotBg = dotColor ?? accent;
              return (
                <Pressable
                  key={value}
                  onPress={() => (allowFuture || !isFuture) && onSelectDate(value)}
                  disabled={!allowFuture && isFuture}
                  style={[
                    styles.monthDay,
                    isSelected && { backgroundColor: accent },
                    !allowFuture && isFuture && !isSelected && styles.monthDayFuture,
                  ]}
                >
                  <Text style={[
                    styles.monthDayNumber,
                    isSelected && styles.selectedText,
                    !allowFuture && isFuture && !isSelected && styles.futureText,
                    isToday && !isSelected && { color: accent },
                  ]}>
                    {date.getDate()}
                  </Text>
                  {hasDot && !isSelected && <View style={[styles.entryDot, { backgroundColor: dotBg }]} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View>
          <View style={styles.navRow}>
            <Pressable onPress={() => shiftWeek(-1)} style={styles.navBtn} hitSlop={12}>
              <ChevronLeft color={isDark ? '#F4F2EE' : '#27241F'} size={20} />
            </Pressable>
            <Pressable onPress={goToday} hitSlop={8}>
              <Text style={[styles.todayLink, { color: accent }]}>Today</Text>
            </Pressable>
            <Pressable onPress={() => shiftWeek(1)} style={styles.navBtn} hitSlop={12}>
              <ChevronRight color={isDark ? '#F4F2EE' : '#27241F'} size={20} />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {week.map((date, index) => {
              const value = formatDate(date);
              const isSelected = value === selectedDate;
              const isToday = value === today;
              const isFuture = value > today;
              const hasDot = hasEntry(value);
              const dotBg = dotColor ?? accent;
              return (
                <Pressable
                  key={value}
                  onPress={() => (allowFuture || !isFuture) && onSelectDate(value)}
                  disabled={!allowFuture && isFuture}
                  style={[
                    styles.day,
                    isSelected && { backgroundColor: accent },
                    !allowFuture && isFuture && !isSelected && styles.dayFuture,
                  ]}
                >
                  <Text style={[styles.dayLabel, isSelected && styles.selectedText, !allowFuture && isFuture && !isSelected && styles.futureText]}>{DAY_LABELS[index]}</Text>
                  <Text style={[styles.dayNumber, isSelected && styles.selectedText, isToday && !isSelected && { color: accent }, !allowFuture && isFuture && !isSelected && styles.futureText]}>{date.getDate()}</Text>
                  {hasDot && !isSelected && <View style={[styles.entryDot, { backgroundColor: dotBg }]} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    wrapper: { backgroundColor: isDark ? '#151515' : '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: isDark ? '#2A2A2A' : '#ECE9E4', padding: 14, marginBottom: 18 },
    calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    calendarEyebrow: { fontFamily: 'Poppins-Bold', color: isDark ? '#AAA59D' : '#8F8A82', fontSize: 10, letterSpacing: 1.2 },
    calendarTitle: { fontFamily: 'Poppins-SemiBold', fontSize: 15, marginTop: 3 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    viewToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#2A2A2A' : '#ECE9E4' },
    viewToggleText: { fontFamily: 'Poppins-SemiBold', fontSize: 10, letterSpacing: 0.5 },
    navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1E1E1E' : '#F5F3EF' },
    todayLink: { fontFamily: 'Poppins-SemiBold', fontSize: 12 },
    weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
    day: { width: 39, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
    dayFuture: { opacity: 0.3 },
    dayLabel: { color: isDark ? '#AAA59D' : '#8F8A82', fontFamily: 'Poppins-Medium', fontSize: 9 },
    dayNumber: { color: isDark ? '#F4F2EE' : '#27241F', fontFamily: 'Poppins-SemiBold', fontSize: 15 },
    futureText: { color: isDark ? '#555' : '#C8C5BE' },
    selectedText: { color: '#FFFFFF' },
    entryDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
    monthContainer: {},
    monthHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    monthDayLabel: { flex: 1, textAlign: 'center', fontFamily: 'Poppins-Medium', fontSize: 9, color: isDark ? '#AAA59D' : '#8F8A82' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
    monthDay: { width: 38, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
    monthDayEmpty: { width: 38, height: 44 },
    monthDayFuture: { opacity: 0.3 },
    monthDayNumber: { color: isDark ? '#F4F2EE' : '#27241F', fontFamily: 'Poppins-Medium', fontSize: 13 },
  });
}
