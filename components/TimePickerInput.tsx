import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Clock, X } from 'lucide-react-native';

type TimePickerInputProps = {
  value: string;
  onChange: (time: string) => void;
  label?: string;
  accent: string;
  onAccent: string;
  isDark: boolean;
  placeholder?: string;
};

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

function parseTime(t: string): { h: number; m: number } {
  if (!t) return { h: 9, m: 0 };
  const [h, m] = t.split(':').map(Number);
  return { h: h ?? 9, m: m ?? 0 };
}

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function prettyTime(t: string): string {
  if (!t) return '';
  const { h, m } = parseTime(t);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export function TimePickerInput({
  value,
  onChange,
  label,
  accent,
  onAccent,
  isDark,
  placeholder = 'Select time',
}: TimePickerInputProps) {
  const [open, setOpen] = useState(false);
  const initial = parseTime(value);
  const [pickH, setPickH] = useState(initial.h);
  const [pickM, setPickM] = useState(initial.m);

  const C = isDark
    ? { bg: '#161616', card: '#1C1C1C', border: '#363636', text: '#F4F2EE', muted: '#AAA59D', inputBg: '#1E1E1E', inputBorder: '#363636' }
    : { bg: '#FFFFFF', card: '#FFFFFF', border: '#ECE9E4', text: '#27241F', muted: '#8F8A82', inputBg: '#FCFBF9', inputBorder: '#E0DDD7' };

  const openPicker = () => {
    const p = parseTime(value);
    setPickH(p.h);
    setPickM(p.m);
    setOpen(true);
  };

  const confirm = () => {
    onChange(formatTime(pickH, pickM));
    setOpen(false);
  };

  const clear = () => {
    onChange('');
    setOpen(false);
  };

  const styles = makeStyles(C);

  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable onPress={openPicker} style={styles.inputWrap}>
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {value ? prettyTime(value) : placeholder}
        </Text>
        <Clock color={accent} size={18} strokeWidth={2.2} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select time</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <X color={C.muted} size={20} />
              </Pressable>
            </View>

            <View style={styles.pickerRow}>
              <View style={styles.pickerCol}>
                <Text style={styles.pickerLabel}>Hour</Text>
                <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                  {HOURS.map((h) => (
                    <Pressable
                      key={h}
                      onPress={() => setPickH(h)}
                      style={[styles.pickerItem, pickH === h && { backgroundColor: accent }]}
                    >
                      <Text style={[styles.pickerItemText, pickH === h && { color: onAccent, fontFamily: FONT_BOLD }]}>
                        {h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.pickerCol}>
                <Text style={styles.pickerLabel}>Minute</Text>
                <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                  {MINUTES.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setPickM(m)}
                      style={[styles.pickerItem, pickM === m && { backgroundColor: accent }]}
                    >
                      <Text style={[styles.pickerItemText, pickM === m && { color: onAccent, fontFamily: FONT_BOLD }]}>
                        {String(m).padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Selected:</Text>
              <Text style={[styles.previewValue, { color: accent }]}>{prettyTime(formatTime(pickH, pickM))}</Text>
            </View>

            <View style={styles.actionRow}>
              <Pressable onPress={clear} style={styles.clearBtn}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
              <Pressable onPress={confirm} style={[styles.confirmBtn, { backgroundColor: accent }]}>
                <Text style={[styles.confirmText, { color: onAccent }]}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type Palette = { bg: string; card: string; border: string; text: string; muted: string; inputBg: string; inputBorder: string };
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
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: C.inputBg,
    },
    inputText: { fontFamily: FONT, fontSize: 15, color: C.text },
    placeholder: { color: C.muted },
    modalShade: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalCard: { backgroundColor: C.bg, borderRadius: 20, padding: 20, width: '88%', maxWidth: 380 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontFamily: FONT_BOLD, fontSize: 16, color: C.text },
    pickerRow: { flexDirection: 'row', gap: 12, height: 220 },
    pickerCol: { flex: 1 },
    pickerLabel: { fontFamily: FONT_BOLD, fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 8, letterSpacing: 0.5 },
    pickerScroll: { flex: 1 },
    pickerItem: { paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    pickerItemText: { fontFamily: FONT_MED, fontSize: 14, color: C.text },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, justifyContent: 'center' },
    previewLabel: { fontFamily: FONT_MED, fontSize: 14, color: C.muted },
    previewValue: { fontFamily: FONT_BOLD, fontSize: 16 },
    actionRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
    clearBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
    clearText: { fontFamily: FONT_SEMI, fontSize: 14, color: C.muted },
    confirmBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    confirmText: { fontFamily: FONT_SEMI, fontSize: 14 },
  });
}
