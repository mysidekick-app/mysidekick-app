import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Search, X } from 'lucide-react-native';
import { CURRENCIES, getCurrency } from '@/components/currencies';

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

type CurrencyPickerModalProps = {
  visible: boolean;
  currentCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
  accent: string;
  onAccent: string;
  isDark: boolean;
};

export function CurrencyPickerModal({ visible, currentCode, onSelect, onClose, accent, onAccent, isDark }: CurrencyPickerModalProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...CURRENCIES].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [query]);

  const C = isDark
    ? { bg: '#0E0E0E', card: '#161616', border: '#2A2A2A', text: '#F4F2EE', muted: '#AAA59D', inputBg: '#1E1E1E', inputBorder: '#363636' }
    : { bg: '#FBFAF8', card: '#FFFFFF', border: '#ECE9E4', text: '#27241F', muted: '#8F8A82', inputBg: '#FCFBF9', inputBorder: '#E0DDD7' };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.shade}>
        <View style={[styles.sheet, { backgroundColor: C.bg }]}>
          <View style={[styles.header, { borderBottomColor: C.border }]}>
            <Text style={[styles.title, { color: C.text }]}>Select Currency</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X color={C.muted} size={22} />
            </Pressable>
          </View>

          <View style={[styles.searchWrap, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
            <Search color={C.muted} size={18} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search currency or country"
              placeholderTextColor={C.muted}
              style={[styles.searchInput, { color: C.text }]}
              autoFocus
            />
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {filtered.map((c) => {
              const selected = c.code === currentCode;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => { onSelect(c.code); onClose(); }}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: C.border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.symbol, { backgroundColor: accent }]}>
                    <Text style={[styles.symbolText, { color: onAccent }]}>{c.symbol}</Text>
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowName, { color: C.text }]}>{c.name}</Text>
                    <Text style={[styles.rowCode, { color: C.muted }]}>{c.code}</Text>
                  </View>
                  {selected && <Check color={accent} size={20} strokeWidth={2.5} />}
                </Pressable>
              );
            })}
            {filtered.length === 0 && (
              <Text style={[styles.empty, { color: C.muted }]}>No currencies found.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { flex: 1, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontFamily: FONT_BOLD, fontSize: 18 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, height: 46, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontFamily: FONT, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 18, borderBottomWidth: 1 },
  symbol: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  symbolText: { fontFamily: FONT_BOLD, fontSize: 13 },
  rowCopy: { flex: 1, gap: 2 },
  rowName: { fontFamily: FONT_MED, fontSize: 14 },
  rowCode: { fontFamily: FONT, fontSize: 12 },
  empty: { fontFamily: FONT, fontSize: 14, textAlign: 'center', paddingVertical: 30 },
});
