import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, CreditCard, PiggyBank, Plus, UsersRound, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { CurrencyPickerModal } from '@/components/CurrencyPickerModal';
import { DatePickerInput } from '@/components/DatePickerInput';
import { formatMoney } from '@/components/currencies';

type FinanceTransaction = {
  id: string;
  kind: 'income' | 'expense' | 'debt';
  title: string;
  amount: number;
  category: string;
  transaction_date: string;
};

type SavingsGoal = { id: string; current_amount: number };

type FinanceModule = {
  key: string;
  label: string;
  route: string;
  icon: typeof ArrowDownToLine;
};

const row1Modules: FinanceModule[] = [
  { key: 'income', label: 'Money in', route: '/modules/finances/income', icon: ArrowDownToLine },
  { key: 'expense', label: 'Money out', route: '/modules/finances/expense', icon: ArrowUpFromLine },
];

const row2Modules: FinanceModule[] = [
  { key: 'savings', label: 'Savings', route: '/modules/finances/savings', icon: PiggyBank },
  { key: 'debt', label: 'Debts', route: '/modules/finances/debt', icon: CreditCard },
  { key: 'split', label: 'Split', route: '/modules/finances/split', icon: UsersRound },
];

const allModules = [...row1Modules, ...row2Modules];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthsAgoStr = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function FinancesDashboard() {
  const { accentForeground, accentWash, isDark, onAccent, currency_code, updateSettings } = useApp();
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [savings, setSavings] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [startDate, setStartDate] = useState(monthsAgoStr(3));
  const [endDate, setEndDate] = useState(todayStr());

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: transactionRows, error: transactionErr }, { data: savingsRows, error: savingsErr }] = await Promise.all([
      supabase.from('finance_transactions').select('id, kind, title, amount, category, transaction_date').order('transaction_date', { ascending: false }),
      supabase.from('savings_goals').select('id, current_amount'),
    ]);
    if (transactionErr || savingsErr) setError('Your financial data could not be loaded.');
    else {
      setTransactions((transactionRows ?? []) as FinanceTransaction[]);
      setSavings((savingsRows ?? []) as SavingsGoal[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredTx = useMemo(() => {
    return transactions.filter((t) => t.transaction_date >= startDate && t.transaction_date <= endDate);
  }, [transactions, startDate, endDate]);

  const totals = useMemo(() => {
    const income = filteredTx.filter((t) => t.kind === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = filteredTx.filter((t) => t.kind === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
    const debt = filteredTx.filter((t) => t.kind === 'debt').reduce((sum, t) => sum + Number(t.amount), 0);
    const saved = savings.reduce((sum, goal) => sum + Number(goal.current_amount), 0);
    return { income, expense, debt, saved, net: income - expense - debt };
  }, [filteredTx, savings]);

  const spending = useMemo(() => {
    const byCategory = filteredTx.filter((t) => t.kind === 'expense').reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + Number(t.amount);
      return acc;
    }, {});
    return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  }, [filteredTx]);

  const chartValues = [
    { label: 'Money in', value: totals.income },
    { label: 'Money out', value: totals.expense },
    { label: 'Savings', value: totals.saved },
    { label: 'Debt', value: totals.debt },
  ];
  const maxChart = Math.max(...chartValues.map((item) => item.value), 1);
  const maxSpending = Math.max(...spending.map(([, value]) => value), 1);

  const openModule = (route: string) => router.push(route as never);

  const handleSetCurrency = (code: string) => {
    updateSettings({ currency_code: code });
  };

  const fmt = (v: number) => formatMoney(v, currency_code);

  return (
    <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
      <PageHeader title="Finances" financeMode onSetCurrency={() => setCurrencyOpen(true)} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {error && <Text style={styles.error}>{error}</Text>}

        {/* Row 1: Money in + Money out */}
        <View style={styles.moduleRow}>
          {row1Modules.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable key={item.key} onPress={() => openModule(item.route)} style={({ pressed }) => [styles.moduleCard, isDark && styles.cardDark, pressed && styles.pressed]}>
                <View style={[styles.moduleIconWrap, { backgroundColor: accentForeground }]}>
                  <Icon color={onAccent} size={22} strokeWidth={2.3} />
                </View>
                <Text style={[styles.moduleLabel, isDark && styles.darkText]}>{item.label.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>
        {/* Row 2: Savings + Debt + Split */}
        <View style={styles.moduleRow2}>
          {row2Modules.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable key={item.key} onPress={() => openModule(item.route)} style={({ pressed }) => [styles.moduleCard2, isDark && styles.cardDark, pressed && styles.pressed]}>
                <View style={[styles.moduleIconWrap, { backgroundColor: accentForeground }]}>
                  <Icon color={onAccent} size={22} strokeWidth={2.3} />
                </View>
                <Text style={[styles.moduleLabel, isDark && styles.darkText]}>{item.label.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Financial health with date filter */}
        <View style={styles.sectionHeadingRow}>
          <Text style={[styles.sectionTitle, isDark && styles.darkText]}>Financial health</Text>
        </View>
        <View style={[styles.healthCard, isDark && styles.cardDark]}>
          <View style={styles.dateFilterRow}>
            <View style={{ flex: 1 }}>
              <DatePickerInput value={startDate} onChange={(d) => { setStartDate(d); if (endDate && d > endDate) setEndDate(d); }} accent={accentForeground} onAccent={onAccent} isDark={isDark} placeholder="Start date" />
            </View>
            <Text style={[styles.dateSep, isDark && styles.darkMuted]}>→</Text>
            <View style={{ flex: 1 }}>
              <DatePickerInput value={endDate} onChange={(d) => { if (!startDate || d >= startDate) setEndDate(d); }} accent={accentForeground} onAccent={onAccent} isDark={isDark} placeholder="End date" />
            </View>
          </View>
          <View style={styles.healthHeader}>
            <Text style={[styles.mutedText, isDark && styles.darkMuted]}>Net position</Text>
            <Text style={[styles.netValue, { color: totals.net >= 0 ? '#3E9D66' : '#E05252' }]}>{totals.net < 0 ? '-' : '+'}{fmt(Math.abs(totals.net))}</Text>
          </View>
          <View style={styles.chart}>
            {chartValues.map((item) => (
              <View key={item.label} style={styles.chartItem}>
                <Text style={[styles.chartValue, isDark && styles.darkMuted]}>{fmt(item.value)}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height: `${Math.max(item.value / maxChart * 100, item.value ? 5 : 0)}%`, backgroundColor: accentForeground }]} />
                </View>
                <Text style={[styles.chartLabel, isDark && styles.darkText]}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionHeadingRow}>
          <Text style={[styles.sectionTitle, isDark && styles.darkText]}>Spending by category</Text>
        </View>
        <View style={[styles.spendingCard, isDark && styles.cardDark]}>
          {loading ? <Text style={[styles.mutedText, isDark && styles.darkMuted]}>Loading your spending...</Text> : spending.length === 0 ? (
            <Text style={[styles.mutedText, isDark && styles.darkMuted]}>Your spending categories will appear here.</Text>
          ) : spending.map(([category, amount]) => (
            <View key={category} style={styles.categoryRow}>
              <View style={styles.categoryTop}><Text style={[styles.categoryName, isDark && styles.darkText]}>{category}</Text><Text style={[styles.categoryAmount, isDark && styles.darkMuted]}>{fmt(amount)}</Text></View>
              <View style={[styles.categoryTrack, isDark && styles.trackDark]}><View style={[styles.categoryFill, { width: `${amount / maxSpending * 100}%`, backgroundColor: accentForeground }]} /></View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Floating + button */}
      <Pressable onPress={() => setAddOpen(true)} style={[styles.fab, { backgroundColor: accentForeground }]} hitSlop={12}>
        <Plus color={onAccent} size={26} strokeWidth={2.6} />
      </Pressable>

      {/* Add transaction modal */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalShade}>
          <View style={[styles.modalCard, isDark && styles.modalDark]}>
            <View style={styles.modalTitleRow}><View><Text style={[styles.modalTitle, isDark && styles.darkText]}>Add transaction</Text><Text style={[styles.modalSub, isDark && styles.darkMuted]}>Choose what you want to record.</Text></View><Pressable onPress={() => setAddOpen(false)}><X color={isDark ? '#F4F2EE' : '#5A5751'} size={21} /></Pressable></View>
            {allModules.map((item) => <Pressable key={item.key} onPress={() => { setAddOpen(false); openModule(item.route); }} style={[styles.modalOption, isDark && styles.optionDark]}><View style={[styles.optionIcon, { backgroundColor: accentWash }]}><item.icon color={accentForeground} size={18} /></View><Text style={[styles.optionText, isDark && styles.darkText]}>{item.label}</Text><ChevronRight color={isDark ? '#666' : '#C8C5BE'} size={18} /></Pressable>)}
          </View>
        </View>
      </Modal>

      <CurrencyPickerModal
        visible={currencyOpen}
        currentCode={currency_code}
        onSelect={handleSetCurrency}
        onClose={() => setCurrencyOpen(false)}
        accent={accentForeground}
        onAccent={onAccent}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBFAF8' }, safeDark: { backgroundColor: '#090909' }, content: { padding: 16, paddingBottom: 90 }, darkText: { color: '#F4F2EE' }, darkMuted: { color: '#AAA59D' }, error: { fontFamily: 'Poppins-Medium', color: '#C53A2F', fontSize: 13, marginBottom: 10 },
  moduleRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  moduleRow2: { flexDirection: 'row', gap: 12, marginBottom: 26 },
  moduleCard: { flex: 1, minHeight: 112, borderRadius: 18, borderWidth: 1, borderColor: '#ECE9E4', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  moduleCard2: { flex: 1, minHeight: 112, borderRadius: 18, borderWidth: 1, borderColor: '#ECE9E4', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  moduleIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, moduleLabel: { fontFamily: 'Poppins-Bold', fontSize: 10, letterSpacing: 0.5, textAlign: 'center', color: '#302E29' }, pressed: { opacity: 0.72 }, cardDark: { backgroundColor: '#111', borderColor: '#2A2A2A' },
  sectionTitle: { fontFamily: 'Poppins-Bold', fontSize: 17, color: '#27241F', marginBottom: 12 }, sectionHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
  healthCard: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: '#ECE9E4', padding: 18 },
  dateFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  dateChip: { flex: 1, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#E1DED8', backgroundColor: '#FCFBF9' },
  dateChipDark: { backgroundColor: '#1E1E1E', borderColor: '#363636' },
  dateChipText: { fontFamily: 'Poppins-Regular', fontSize: 12, color: '#77746E' },
  dateSep: { fontFamily: 'Poppins-Medium', fontSize: 14, color: '#908B83' },
  healthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, mutedText: { fontFamily: 'Poppins-Regular', color: '#908B83', fontSize: 13 }, netValue: { fontFamily: 'Poppins-Bold', fontSize: 15 }, chart: { height: 190, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingTop: 22, gap: 8 }, chartItem: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' }, chartValue: { fontFamily: 'Poppins-Regular', color: '#89857D', fontSize: 9, marginBottom: 5, textAlign: 'center' }, barTrack: { height: 112, width: '64%', minWidth: 22, maxWidth: 46, borderRadius: 8, backgroundColor: '#F0EEEA', justifyContent: 'flex-end', overflow: 'hidden' }, bar: { width: '100%', borderRadius: 8 }, chartLabel: { fontFamily: 'Poppins-Medium', color: '#3C3933', fontSize: 10, marginTop: 8, textAlign: 'center' },
  spendingCard: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: '#ECE9E4', padding: 18 }, categoryRow: { marginBottom: 16 }, categoryTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }, categoryName: { fontFamily: 'Poppins-Medium', color: '#38352F', fontSize: 13 }, categoryAmount: { fontFamily: 'Poppins-Medium', color: '#77746E', fontSize: 12 }, categoryTrack: { height: 8, backgroundColor: '#F0EEEA', borderRadius: 5, overflow: 'hidden' }, trackDark: { backgroundColor: '#292929' }, categoryFill: { height: 8, borderRadius: 5 },
  fab: { position: 'absolute', bottom: 24, alignSelf: 'center', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }, modalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 }, modalDark: { backgroundColor: '#161616' }, modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }, modalTitle: { fontFamily: 'Poppins-Bold', fontSize: 19, color: '#27241F' }, modalSub: { fontFamily: 'Poppins-Regular', fontSize: 12, color: '#908B83', marginTop: 3 }, modalOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0EEEA' }, optionDark: { borderBottomColor: '#292929' }, optionIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, optionText: { flex: 1, fontFamily: 'Poppins-Medium', color: '#27241F', fontSize: 14 },
});
