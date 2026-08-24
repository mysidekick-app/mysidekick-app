import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/components/AppProvider';
import { CurrencyPickerModal } from '@/components/CurrencyPickerModal';
import { getCurrency } from '@/components/currencies';

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

export function SettingDetailPage({ title, children }: { title: string; children?: React.ReactNode }) {
  const { isDark, accentForeground, onAccent, currency_code, updateSettings } = useApp();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currency = getCurrency(currency_code);

  const C = isDark
    ? { bg: '#090909', card: '#151515', border: '#2A2A2A', text: '#F4F2EE', muted: '#AAA59D' }
    : { bg: '#FBFAF8', card: '#FFF', border: '#ECE9E4', text: '#27241F', muted: '#8F8A82' };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
      <PageHeader title={title} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children ?? (
          <View style={styles.placeholder}>
            <Text style={[styles.placeholderText, { color: C.muted }]}>This section will be available soon.</Text>
          </View>
        )}

        {title === 'Account' && (
          <View>
            <Text style={[styles.group, { color: C.muted }]}>PREFERENCES</Text>
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Pressable onPress={() => setCurrencyOpen(true)} style={styles.settingRow}>
                <View style={[styles.rowIcon, { backgroundColor: accentForeground }]}>
                  <Text style={[styles.currencySymbol, { color: onAccent }]}>{currency.symbol}</Text>
                </View>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowLabel, { color: C.text }]}>Currency</Text>
                  <Text style={[styles.rowValue, { color: C.muted }]}>{currency.name} ({currency.code})</Text>
                </View>
                <ChevronRight color={isDark ? '#77736C' : '#B2AEA7'} size={17} />
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <CurrencyPickerModal
        visible={currencyOpen}
        currentCode={currency_code}
        onSelect={(code) => updateSettings({ currency_code: code })}
        onClose={() => setCurrencyOpen(false)}
        accent={accentForeground}
        onAccent={onAccent}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 22, paddingBottom: 34 },
  placeholder: { paddingVertical: 20 },
  placeholderText: { fontFamily: FONT, fontSize: 14, lineHeight: 22 },
  group: { fontFamily: FONT_BOLD, fontSize: 10, letterSpacing: 1.5, marginBottom: 9, marginTop: 8 },
  card: { borderRadius: 17, borderWidth: 1, paddingHorizontal: 14 },
  settingRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  currencySymbol: { fontFamily: FONT_BOLD, fontSize: 14 },
  rowCopy: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: FONT_SEMI, fontSize: 14 },
  rowValue: { fontFamily: FONT, fontSize: 12 },
});
