import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreditCard, Minus, Plus, Trash2, X } from 'lucide-react-native';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { DatePickerInput } from '@/components/DatePickerInput';
import { CurrencyPickerModal } from '@/components/CurrencyPickerModal';
import { formatMoney } from '@/components/currencies';

type Debt = {
  id: string;
  title: string;
  amount: number;
  category: string;
  transaction_date: string;
};

const DEBT_CATEGORIES = ['Loan', 'Credit Card', 'Family', 'Friend', 'Other'];

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function DebtScreen() {
  const { accentForeground, accentWash, isDark, onAccent, currency_code, updateSettings } = useApp();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(DEBT_CATEGORIES[0]);
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  // Pay-down state
  const [payFor, setPayFor] = useState<Debt | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const fmt = (v: number) => formatMoney(v, currency_code);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadErr } = await supabase
      .from('finance_transactions')
      .select('id, title, amount, category, transaction_date')
      .eq('kind', 'debt')
      .order('transaction_date', { ascending: false });
    if (loadErr) setError('Your debts could not be loaded.');
    else setDebts((data ?? []) as Debt[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setTitle('');
    setAmount('');
    setCategory(DEBT_CATEGORIES[0]);
    setDate(todayStr());
    setError(null);
    setModalOpen(true);
  };

  const save = async () => {
    const value = parseFloat(amount);
    if (!title.trim()) { setError('Add a title.'); return; }
    if (!value || value <= 0) { setError('Enter a valid amount.'); return; }
    setSaving(true);
    const { data, error: saveErr } = await supabase
      .from('finance_transactions')
      .insert({ kind: 'debt', title: title.trim(), amount: value, category, transaction_date: date || todayStr() })
      .select('id, title, amount, category, transaction_date')
      .maybeSingle();
    if (saveErr || !data) setError('The debt could not be saved.');
    else { setDebts((c) => [data as Debt, ...c]); setModalOpen(false); }
    setSaving(false);
  };

  const payDown = async () => {
    if (!payFor) return;
    const value = parseFloat(payAmount);
    if (!value || value <= 0) { setError('Enter an amount to pay down.'); return; }
    const next = Math.max(0, Number(payFor.amount) - value);
    const { error: updErr } = await supabase.from('finance_transactions').update({ amount: next }).eq('id', payFor.id);
    if (updErr) { setError('Could not update the debt.'); return; }
    setDebts((c) => c.map((d) => d.id === payFor.id ? { ...d, amount: next } : d));
    setPayFor(null);
    setPayAmount('');
  };

  const remove = async (id: string) => {
    const prev = debts;
    setDebts((c) => c.filter((d) => d.id !== id));
    const { error: delErr } = await supabase.from('finance_transactions').delete().eq('id', id);
    if (delErr) { setError('Could not delete.'); setDebts(prev); }
  };

  const total = debts.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
      <PageHeader title="Debts" financeMode onSetCurrency={() => setCurrencyOpen(true)} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {error && <Text style={styles.error}>{error}</Text>}

        <View style={[styles.summaryCard, isDark && styles.cardDark]}>
          <Text style={[styles.summaryLabel, isDark && styles.darkMuted]}>Total debt</Text>
          <Text style={[styles.summaryValue, { color: accentForeground }]}>{fmt(total)}</Text>
        </View>

        {loading ? <Text style={[styles.emptyText, isDark && styles.darkMuted]}>Loading...</Text> : debts.length === 0 ? (
          <View style={styles.empty}><Text style={[styles.emptyText, isDark && styles.darkMuted]}>No debts recorded. Tap + to add one.</Text></View>
        ) : (
          <View style={styles.debtList}>
            {debts.map((debt) => (
              <View key={debt.id} style={[styles.debtCard, isDark && styles.cardDark]}>
                <View style={styles.debtTop}>
                  <View style={[styles.debtIcon, { backgroundColor: accentForeground }]}><CreditCard color={onAccent} size={18} /></View>
                  <View style={styles.debtCopy}>
                    <Text style={[styles.debtTitle, isDark && styles.darkText]} numberOfLines={1}>{debt.title}</Text>
                    <Text style={[styles.debtMeta, isDark && styles.darkMuted]}>{debt.category}  ·  {debt.transaction_date}</Text>
                  </View>
                  <Pressable onPress={() => remove(debt.id)} hitSlop={8}><Trash2 color={isDark ? '#5A5751' : '#C8C5BE'} size={16} /></Pressable>
                </View>
                <View style={styles.debtBottom}>
                  <Text style={[styles.debtAmount, { color: accentForeground }]}>{fmt(Number(debt.amount))}</Text>
                  <Pressable onPress={() => { setPayFor(debt); setPayAmount(''); }} style={[styles.payBtn, { backgroundColor: accentWash }]}>
                    <Minus color={accentForeground} size={15} />
                    <Text style={[styles.payText, { color: accentForeground }]}>Pay down</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable onPress={openNew} style={[styles.fab, { backgroundColor: accentForeground }]} hitSlop={12}>
        <Plus color={onAccent} size={26} strokeWidth={2.6} />
      </Pressable>

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalShade}>
          <View style={[styles.modalCard, isDark && styles.modalDark]}>
            <View style={styles.modalTitleRow}><Text style={[styles.modalTitle, isDark && styles.darkText]}>Add debt</Text><Pressable onPress={() => setModalOpen(false)}><X color={isDark ? '#F4F2EE' : '#5A5751'} size={21} /></Pressable></View>
            <Text style={[styles.label, isDark && styles.darkMuted]}>Title</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="What is this debt for?" placeholderTextColor="#9B978F" style={[styles.input, isDark && styles.inputDark]} autoFocus />
            <Text style={[styles.label, isDark && styles.darkMuted]}>Amount ({currency_code})</Text>
            <TextInput value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor="#9B978F" style={[styles.input, isDark && styles.inputDark]} keyboardType="numeric" />
            <Text style={[styles.label, isDark && styles.darkMuted]}>Category</Text>
            <View style={styles.chipRow}>{DEBT_CATEGORIES.map((c) => <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && { backgroundColor: accentForeground, borderColor: accentForeground }]}><Text style={[styles.chipText, isDark && styles.darkMuted, category === c && { color: onAccent, fontFamily: FONT_SEMI }]}>{c}</Text></Pressable>)}</View>
            <Text style={[styles.label, isDark && styles.darkMuted]}>Date</Text>
            <DatePickerInput value={date} onChange={setDate} accent={accentForeground} onAccent={onAccent} isDark={isDark} placeholder="Select date" />
            <Pressable disabled={saving} onPress={save} style={[styles.saveButton, { backgroundColor: accentForeground }]}><Text style={[styles.saveText, { color: onAccent }]}>{saving ? 'Saving...' : 'Save'}</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!payFor} transparent animationType="slide" onRequestClose={() => setPayFor(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.modalCard, isDark && styles.modalDark]}>
            <View style={styles.modalTitleRow}><Text style={[styles.modalTitle, isDark && styles.darkText]} numberOfLines={1}>Pay down {payFor?.title}</Text><Pressable onPress={() => setPayFor(null)}><X color={isDark ? '#F4F2EE' : '#5A5751'} size={21} /></Pressable></View>
            <Text style={[styles.label, isDark && styles.darkMuted]}>Current: {payFor ? fmt(Number(payFor.amount)) : ''}</Text>
            <Text style={[styles.label, isDark && styles.darkMuted]}>Amount to pay ({currency_code})</Text>
            <TextInput value={payAmount} onChangeText={setPayAmount} placeholder="500" placeholderTextColor="#9B978F" style={[styles.input, isDark && styles.inputDark]} keyboardType="numeric" autoFocus />
            <Pressable onPress={payDown} style={[styles.saveButton, { backgroundColor: accentForeground }]}><Text style={[styles.saveText, { color: onAccent }]}>Pay down</Text></Pressable>
          </View>
        </View>
      </Modal>

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
  safe: { flex: 1, backgroundColor: '#FBFAF8' }, safeDark: { backgroundColor: '#090909' }, content: { padding: 16, paddingBottom: 90 }, darkText: { color: '#F4F2EE' }, darkMuted: { color: '#AAA59D' }, error: { fontFamily: FONT_MED, color: '#C53A2F', fontSize: 13, marginBottom: 10 },
  summaryCard: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: '#ECE9E4', padding: 18, marginBottom: 16 }, cardDark: { backgroundColor: '#111', borderColor: '#2A2A2A' }, summaryLabel: { fontFamily: FONT_SEMI, fontSize: 13, color: '#77746E' }, summaryValue: { fontFamily: FONT_BOLD, fontSize: 26, marginTop: 6 },
  debtList: { gap: 12 }, debtCard: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: '#ECE9E4', padding: 16 }, debtTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }, debtIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, debtCopy: { flex: 1, gap: 3 }, debtTitle: { fontFamily: FONT_MED, fontSize: 15, color: '#27241F' }, debtMeta: { fontFamily: FONT, fontSize: 12, color: '#908B83' }, debtBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, debtAmount: { fontFamily: FONT_BOLD, fontSize: 16 }, payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 }, payText: { fontFamily: FONT_SEMI, fontSize: 13 },
  empty: { paddingVertical: 40, alignItems: 'center' }, emptyText: { fontFamily: FONT, fontSize: 14, color: '#908B83', textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, alignSelf: 'center', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }, modalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 }, modalDark: { backgroundColor: '#161616' }, modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, modalTitle: { fontFamily: FONT_BOLD, fontSize: 18, color: '#27241F', flex: 1, marginRight: 12 }, label: { fontFamily: FONT_MED, fontSize: 13, color: '#77746E', marginTop: 14, marginBottom: 6 }, input: { borderWidth: 1, borderColor: '#E1DED8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontFamily: FONT, fontSize: 15, color: '#282724' }, inputDark: { backgroundColor: '#1E1E1E', borderColor: '#363636', color: '#F4F2EE' }, chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E2DFD9', backgroundColor: '#FFF' }, chipText: { fontFamily: FONT, fontSize: 13, color: '#77746E' }, saveButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 22 }, saveText: { fontFamily: FONT_SEMI, fontSize: 15 },
});
