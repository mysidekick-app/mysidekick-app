import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Calendar,
  ChevronLeft,
  CreditCard,
  MoreVertical,
  PiggyBank,
  UsersRound,
  X,
} from 'lucide-react-native';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

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

type SavingsGoal = {
  id: string;
  current_amount: number;
};

type FinanceModule = {
  key: string;
  label: string;
  route: string;
  icon: typeof ArrowDownToLine;
};

const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

const row1Modules: FinanceModule[] = [
  {
    key: 'income',
    label: 'Money in',
    route: '/modules/finances/income',
    icon: ArrowDownToLine,
  },
  {
    key: 'expense',
    label: 'Money out',
    route: '/modules/finances/expense',
    icon: ArrowUpFromLine,
  },
];

const row2Modules: FinanceModule[] = [
  {
    key: 'savings',
    label: 'Savings',
    route: '/modules/finances/savings',
    icon: PiggyBank,
  },
  {
    key: 'debt',
    label: 'Debts',
    route: '/modules/finances/debt',
    icon: CreditCard,
  },
  {
    key: 'split',
    label: 'Split',
    route: '/modules/finances/split',
    icon: UsersRound,
  },
];

export default function FinancesDashboard() {
  const {
    accentForeground,
    accentColor: rawAccent,
    isDark,
    onAccent,
    currency_code,
    updateSettings,
  } = useApp() as any;

  const pageBg = rawAccent || accentForeground || '#FDE047';

  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [savings, setSavings] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  const [showDateFilter, setShowDateFilter] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);

    const [
      { data: transactionRows, error: transactionErr },
      { data: savingsRows, error: savingsErr },
    ] = await Promise.all([
      supabase
        .from('finance_transactions')
        .select('id, kind, title, amount, category, transaction_date')
        .order('transaction_date', { ascending: false }),
      supabase
        .from('savings_goals')
        .select('id, current_amount'),
    ]);

    if (transactionErr || savingsErr) {
      setError('Your financial data could not be loaded.');
    } else {
      setError(null);
      setTransactions((transactionRows ?? []) as FinanceTransaction[]);
      setSavings((savingsRows ?? []) as SavingsGoal[]);
    }

    setLoading(false);
  }, []);

  // Refresh financial figures whenever the dashboard becomes active again.
  // This ensures transactions saved in Money In / Money Out / Debts are
  // reflected immediately when the user returns to this screen.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    let active = true;

    const channel = supabase.channel(
      `finance_dashboard_index_realtime_${Date.now()}`
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'finance_transactions' },
      () => {
        if (active) void load();
      }
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'savings_goals' },
      () => {
        if (active) void load();
      }
    );

    void channel.subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const filteredTx = useMemo(() => {
    if (!showDateFilter || (!startDate && !endDate)) {
      return transactions;
    }

    return transactions.filter((t) => {
      if (startDate && t.transaction_date < startDate) return false;
      if (endDate && t.transaction_date > endDate) return false;
      return true;
    });
  }, [transactions, showDateFilter, startDate, endDate]);

  const totals = useMemo(() => {
    const income = filteredTx
      .filter((t) => t.kind === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expense = filteredTx
      .filter((t) => t.kind === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const debt = filteredTx
      .filter((t) => t.kind === 'debt')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const saved = savings.reduce(
      (sum, goal) => sum + Number(goal.current_amount),
      0
    );

    return {
      income,
      expense,
      debt,
      saved,
      net: income - (expense + debt),
    };
  }, [filteredTx, savings]);

  const spending = useMemo(() => {
    const byCategory = filteredTx
      .filter((t) => t.kind === 'expense')
      .reduce<Record<string, number>>((acc, t) => {
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

  const openModule = (route: string) => {
    router.push(route as never);
  };

  const handleSetCurrency = (code: string) => {
    updateSettings({ currency_code: code });
  };

  const clearDateFilter = () => {
    setStartDate('');
    setEndDate('');
    setShowDateFilter(false);
  };

  const fmt = (v: number) => formatMoney(v, currency_code);

  const C = isDark
    ? {
        cardBg: '#121212',
        cardText: '#FFFFFF',
        cardSubtext: '#A1A1AA',
        trackBg: '#27272A',
      }
    : {
        cardBg: '#FFFFFF',
        cardText: '#000000',
        cardSubtext: '#52525B',
        trackBg: '#E4E4E7',
      };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={pageBg} />

      {/* HEADER WITH STRICT BLACK FINANCES TITLE & STANDARD NAV BUTTONS */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            setSettingsMenuOpen(false);
            router.push('/modules');
          }}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
        </Pressable>

        <Text style={styles.headerTitle}>FINANCES</Text>

        <Pressable
          onPress={() => setSettingsMenuOpen((current) => !current)}
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <MoreVertical color="#000000" size={24} strokeWidth={2.5} />
        </Pressable>

        {settingsMenuOpen && (
          <View style={styles.menuShadeOverlay}>
            <Pressable style={{ flex: 1 }} onPress={() => setSettingsMenuOpen(false)}>
              <View style={styles.menuCardWrapper}>
                <View style={styles.shadowBackdrop} />
                <View style={[styles.menuCardBody, { backgroundColor: C.cardBg }]}>
                  <Pressable
                    onPress={() => {
                      setSettingsMenuOpen(false);
                      setCurrencyOpen(true);
                    }}
                    style={styles.menuItem}
                  >
                    <Text style={[styles.menuItemText, { color: C.cardText }]}>
                      Currency ({currency_code})
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Row 1: Money in + Money out (Always white background even in dark mode) */}
        <View style={styles.moduleRow}>
          {row1Modules.map((item) => {
            const Icon = item.icon;

            return (
              <View key={item.key} style={styles.moduleCardWrapper}>
                <View style={styles.moduleShadowBackdrop} />
                <Pressable
                  onPress={() => openModule(item.route)}
                  style={({ pressed }) => [
                    styles.moduleCardBody,
                    { backgroundColor: '#FFFFFF' },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <View style={[styles.moduleIconBadge, { backgroundColor: pageBg }]}>
                    <Icon color="#000000" size={22} strokeWidth={2.5} />
                  </View>

                  <Text style={[styles.moduleLabel, { color: '#000000' }]}>
                    {item.label.toUpperCase()}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Row 2: Savings + Debt + Split (Always white background even in dark mode) */}
        <View style={styles.moduleRow2}>
          {row2Modules.map((item) => {
            const Icon = item.icon;

            return (
              <View key={item.key} style={styles.moduleCardWrapper}>
                <View style={styles.moduleShadowBackdrop} />
                <Pressable
                  onPress={() => openModule(item.route)}
                  style={({ pressed }) => [
                    styles.moduleCardBody,
                    { backgroundColor: '#FFFFFF' },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <View style={[styles.moduleIconBadge, { backgroundColor: pageBg }]}>
                    <Icon color="#000000" size={22} strokeWidth={2.5} />
                  </View>

                  <Text style={[styles.moduleLabel, { color: '#000000' }]}>
                    {item.label.toUpperCase()}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* FINANCIAL HEALTH */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>FINANCIAL HEALTH</Text>

          {!showDateFilter ? (
            <Pressable
              onPress={() => setShowDateFilter(true)}
              style={({ pressed }) => [
                styles.filterToggleBtn,
                pressed && styles.pressedBtn,
              ]}
              hitSlop={8}
            >
              <Calendar color="#000000" size={14} strokeWidth={2.5} />
              <Text style={styles.filterToggleText}>FILTER DATES</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={clearDateFilter}
              style={({ pressed }) => [
                styles.filterToggleBtn,
                pressed && styles.pressedBtn,
              ]}
              hitSlop={8}
            >
              <X color="#000000" size={14} strokeWidth={2.5} />
              <Text style={styles.filterToggleText}>CLEAR FILTER</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.cardContainer}>
          <View style={styles.cardShadowBackdrop} />
          <View style={[styles.healthCardBody, { backgroundColor: C.cardBg }]}>
            {/* Date filter row */}
            {showDateFilter && (
              <View style={styles.dateFilterRow}>
                <View style={{ flex: 1 }}>
                  <DatePickerInput
                    value={startDate}
                    onChange={(d) => {
                      setStartDate(d);
                      if (endDate && d > endDate) {
                        setEndDate(d);
                      }
                    }}
                    accent={pageBg}
                    onAccent={onAccent}
                    isDark={isDark}
                    placeholder="Start date"
                  />
                </View>

                <Text style={[styles.dateSep, { color: C.cardSubtext }]}>→</Text>

                <View style={{ flex: 1 }}>
                  <DatePickerInput
                    value={endDate}
                    onChange={(d) => {
                      if (!startDate || d >= startDate) {
                        setEndDate(d);
                      }
                    }}
                    accent={pageBg}
                    onAccent={onAccent}
                    isDark={isDark}
                    placeholder="End date"
                  />
                </View>
              </View>
            )}

            <View style={styles.healthHeader}>
              <Text style={[styles.mutedText, { color: C.cardSubtext }]}>
                {showDateFilter && (startDate || endDate)
                  ? 'NET POSITION'
                  : 'TOTAL NET WORTH'}
              </Text>

              <Text
                style={[
                  styles.netValue,
                  {
                    color: totals.net >= 0 ? '#16A34A' : '#DC2626',
                  },
                ]}
              >
                {totals.net < 0 ? '-' : '+'}
                {fmt(Math.abs(totals.net))}
              </Text>
            </View>

            {/* CHART (BARS SHADED WITH GLOBAL ACCENT COLOR) */}
            <View style={styles.chart}>
              {chartValues.map((item) => {
                const barHeight = Math.max(
                  (item.value / maxChart) * 100,
                  item.value ? 6 : 0
                );

                return (
                  <View key={item.label} style={styles.chartItem}>
                    <View style={[styles.barColumn, { height: 90 }]}>
                      <View
                        style={[
                          styles.barAmountPosition,
                          { bottom: (barHeight / 100) * 90 + 4 },
                        ]}
                      >
                        <Text
                          style={[styles.chartValueText, { color: C.cardText }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                        >
                          {fmt(item.value)}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${barHeight}%`,
                            backgroundColor: pageBg,
                          },
                        ]}
                      />
                    </View>

                    <Text style={[styles.chartLabelText, { color: C.cardText }]}>
                      {item.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* SPENDING BY CATEGORY */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>SPENDING BY CATEGORY</Text>
        </View>

        <View style={styles.cardContainer}>
          <View style={styles.cardShadowBackdrop} />
          <View style={[styles.spendingCardBody, { backgroundColor: C.cardBg }]}>
            {loading ? (
              <Text style={[styles.mutedText, { color: C.cardSubtext }]}>
                Loading your spending...
              </Text>
            ) : spending.length === 0 ? (
              <Text style={[styles.mutedText, { color: C.cardSubtext }]}>
                Your spending categories will appear here.
              </Text>
            ) : (
              spending.map(([category, amount]) => (
                <View key={category} style={styles.categoryRow}>
                  <View style={styles.categoryTop}>
                    <Text style={[styles.categoryName, { color: C.cardText }]}>
                      {category}
                    </Text>

                    <Text style={[styles.categoryAmount, { color: C.cardSubtext }]}>
                      {fmt(amount)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.categoryTrack,
                      { backgroundColor: C.trackBg },
                    ]}
                  >
                    <View
                      style={[
                        styles.categoryFill,
                        {
                          width: `${(amount / maxSpending) * 100}%`,
                          backgroundColor: pageBg,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

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
  safe: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  pressedBtn: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: FONT_BOLD,
    color: '#DC2626',
    fontSize: 13,
    textAlign: 'center',
  },

  /* HEADER */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    zIndex: 100,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_XB,
    fontSize: 22,
    letterSpacing: 1,
    color: '#000000',
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* MENU DROPDOWN */
  menuShadeOverlay: {
    position: 'absolute',
    top: 55,
    right: 20,
    zIndex: 1000,
  },
  menuCardWrapper: {
    position: 'relative',
    width: 170,
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
    paddingVertical: 4,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },

  /* MODULE CARDS */
  moduleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  moduleRow2: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  moduleCardWrapper: {
    flex: 1,
    position: 'relative',
  },
  moduleShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: '#000000',
    borderRadius: 14,
  },
  moduleCardBody: {
    minHeight: 100,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 4,
    paddingHorizontal: 4,
  },
  moduleIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleLabel: {
    fontFamily: FONT_XB,
    fontSize: 10,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  /* HEADINGS */
  sectionHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: FONT_XB,
    fontSize: 16,
    letterSpacing: 1,
    color: '#000000',
  },
  filterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FDE047',
  },
  filterToggleText: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    color: '#000000',
    letterSpacing: 0.5,
  },

  /* CARDS */
  cardContainer: {
    position: 'relative',
    width: '100%',
    marginBottom: 18,
  },
  cardShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: '#000000',
    borderRadius: 16,
    borderWidth: 2.5,
  },
  healthCardBody: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 4,
  },
  spendingCardBody: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 4,
  },

  /* DATE FILTER ROW */
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  dateSep: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },

  /* HEALTH HEADER */
  healthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mutedText: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  netValue: {
    fontFamily: FONT_XB,
    fontSize: 18,
  },

  /* CHART */
  chart: {
    height: 155,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingTop: 16,
    gap: 8,
  },
  chartItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barColumn: {
    width: '64%',
    minWidth: 22,
    maxWidth: 44,
    position: 'relative',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barAmountPosition: {
    position: 'absolute',
    left: -20,
    right: -20,
    alignItems: 'center',
    zIndex: 2,
  },
  chartValueText: {
    fontFamily: FONT_BOLD,
    fontSize: 9,
    textAlign: 'center',
  },
  bar: {
    width: '100%',
    borderRadius: 6,
  },
  chartLabelText: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    marginTop: 8,
    textAlign: 'center',
  },

  /* SPENDING BY CATEGORY */
  categoryRow: {
    marginBottom: 14,
  },
  categoryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  categoryName: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
  },
  categoryAmount: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
  },
  categoryTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  categoryFill: {
    height: '100%',
    borderRadius: 5,
  },
});