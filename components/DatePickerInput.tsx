import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react-native';

type DatePickerInputProps = {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  accent: string;
  onAccent: string;
  isDark: boolean;
  placeholder?: string;
  minimumDate?: string;
  maximumDate?: string;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function prettyDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

export function DatePickerInput({
  value,
  onChange,
  label,
  accent,
  onAccent,
  isDark,
  placeholder = 'Select date',
  minimumDate,
  maximumDate,
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return parseDate(value);
    return new Date();
  });

  const days = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const shiftMonth = (amount: number) => {
    setViewMonth((c) => new Date(c.getFullYear(), c.getMonth() + amount, 1));
  };

  const selectDate = (date: Date) => {
    onChange(formatDate(date));
    setOpen(false);
  };

  const isDisabled = (date: Date): boolean => {
    const dateStr = formatDate(date);
    if (minimumDate && dateStr < minimumDate) return true;
    if (maximumDate && dateStr > maximumDate) return true;
    return false;
  };

  const C = isDark
    ? { bg: '#161616', card: '#1C1C1C', border: '#363636', text: '#F4F2EE', muted: '#AAA59D', inputBg: '#1E1E1E', inputBorder: '#363636', divider: '#2A2A2A' }
    : { bg: '#FFFFFF', card: '#FFFFFF', border: '#ECE9E4', text: '#27241F', muted: '#8F8A82', inputBg: '#FCFBF9', inputBorder: '#E0DDD7', divider: '#F0EEEA' };

  const styles = makeStyles(C);

  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable onPress={() => setOpen(true)} style={styles.inputWrap}>
        <Text style={[styles.inputText, !value && styles.placeholder]}>{value ? prettyDate(value) : placeholder}</Text>
        <CalendarIcon color={accent} size={18} strokeWidth={2.2} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <X color={C.muted} size={20} />
              </Pressable>
            </View>

            <View style={styles.monthNav}>
              <Pressable onPress={() => shiftMonth(-1)} style={styles.navBtn} hitSlop={12}>
                <ChevronLeft color={C.text} size={22} />
              </Pressable>
              <Pressable onPress={() => setViewMonth(new Date())} hitSlop={8}>
                <Text style={[styles.todayBtn, { color: accent }]}>Today</Text>
              </Pressable>
              <Pressable onPress={() => shiftMonth(1)} style={styles.navBtn} hitSlop={12}>
                <ChevronRight color={C.text} size={22} />
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((d) => (
                <Text key={d} style={styles.weekdayLabel}>{d}</Text>
              ))}
            </View>

            <View style={styles.dayGrid}>
              {days.map((date, i) => {
                if (!date) return <View key={`empty-${i}`} style={styles.dayCellEmpty} />;
                const dateStr = formatDate(date);
                const isSelected = dateStr === value;
                const disabled = isDisabled(date);
                return (
                  <Pressable
                    key={dateStr}
                    onPress={() => !disabled && selectDate(date)}
                    disabled={disabled}
                    style={[
                      styles.dayCell,
                      isSelected && { backgroundColor: accent },
                      disabled && styles.dayCellDisabled,
                    ]}
                  >
                    <Text style={[
                      styles.dayText,
                      isSelected && { color: onAccent, fontFamily: FONT_BOLD },
                      disabled && styles.dayTextDisabled,
                    ]}>
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type Palette = { bg: string; card: string; border: string; text: string; muted: string; inputBg: string; inputBorder: string; divider: string };
function makeStyles(C: Palette) {
  return StyleSheet.create({
    label: { fontFamily: FONT_MED, fontSize: 13, color: C.muted, marginTop: 14, marginBottom: 6 },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: C.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: C.inputBg,
      flex: 1,
    },
    inputText: { fontFamily: FONT, fontSize: 13, color: C.text, flexShrink: 1 },
    placeholder: { color: C.muted },
    modalShade: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalCard: { backgroundColor: C.bg, borderRadius: 20, padding: 20, width: '88%', maxWidth: 360 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    modalTitle: { fontFamily: FONT_BOLD, fontSize: 16, color: C.text },
    monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    todayBtn: { fontFamily: FONT_SEMI, fontSize: 13 },
    weekdayRow: { flexDirection: 'row', marginBottom: 6 },
    weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: FONT_BOLD, fontSize: 10, color: C.muted, letterSpacing: 0.3 },
    dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: '14.28%', aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    dayCellEmpty: { width: '14.28%', aspectRatio: 1 },
    dayCellDisabled: { opacity: 0.3 },
    dayText: { fontFamily: FONT_MED, fontSize: 14, color: C.text },
    dayTextDisabled: { color: C.muted },
  });
}
