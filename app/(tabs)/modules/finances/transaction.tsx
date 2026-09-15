import { useCallback, useEffect, useState } from 'react';
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
import { Plus, Trash2, X } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';

import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { DatePickerInput } from '@/components/DatePickerInput';
import { CurrencyPickerModal } from '@/components/CurrencyPickerModal';
import { formatMoney } from '@/components/currencies';

type Transaction = {
  id: string;
  title: string;
  amount: number;
  category: string;
  transaction_date: string;
};

const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Gift',
  'Investment',
  'Other',
];

const EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Bills',
  'Shopping',
  'Health',
  'Entertainment',
  'Rent',
  'Other',
];

const DEBT_CATEGORIES = [
  'Loan',
  'Credit Card',
  'Family',
  'Friend',
  'Other',
];

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

const todayStr = () => {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(d.getDate()).padStart(2, '0')}`;
};

const titleFor = (kind: string) =>
  kind === 'income'
    ? 'Money in'
    : kind === 'expense'
      ? 'Money out'
      : 'Debts';

export default function TransactionScreen({
  kind: kindProp,
}: {
  kind?: string;
}) {
  const { kind: kindParam } = useLocalSearchParams<{ kind: string }>();

  const kind = kindProp || kindParam || 'expense';

  const txKind =
    kind === 'income' || kind === 'expense' || kind === 'debt'
      ? kind
      : 'expense';

  const {
    accentForeground,
    accentWash,
    isDark,
    onAccent,
    currency_code,
    updateSettings,
  } = useApp();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  /*
   * Transaction-page date filter.
   *
   * IMPORTANT:
   * These dates belong ONLY to this transaction screen.
   * They are completely independent from the Financial Health
   * date filter on the Finance dashboard.
   */
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fmt = (v: number) => formatMoney(v, currency_code);

  const categories =
    txKind === 'income'
      ? INCOME_CATEGORIES
      : txKind === 'debt'
        ? DEBT_CATEGORIES
        : EXPENSE_CATEGORIES;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadErr } = await supabase
      .from('finance_transactions')
      .select('id, title, amount, category, transaction_date')
      .eq('kind', txKind)
      .order('transaction_date', { ascending: false });

    if (loadErr) {
      setError('Your transactions could not be loaded.');
    } else {
      setTransactions((data ?? []) as Transaction[]);
    }

    setLoading(false);
  }, [txKind]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setTitle('');
    setAmount('');
    setCategory(categories[0]);
    setDate(todayStr());
    setError(null);
    setModalOpen(true);
  };

  const save = async () => {
    const value = parseFloat(amount);

    if (!title.trim()) {
      setError('Add a title.');
      return;
    }

    if (!value || value <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: saveErr } = await supabase
      .from('finance_transactions')
      .insert({
        kind: txKind,
        title: title.trim(),
        amount: value,
        category: category || categories[0],
        transaction_date: date || todayStr(),
      })
      .select('id, title, amount, category, transaction_date')
      .maybeSingle();

    if (saveErr || !data) {
      setError('The transaction could not be saved.');
    } else {
      setTransactions((current) => [
        data as Transaction,
        ...current,
      ]);

      setModalOpen(false);
    }

    setSaving(false);
  };

  const remove = async (id: string) => {
    const previous = transactions;

    setTransactions((current) =>
      current.filter((t) => t.id !== id),
    );

    const { error: delErr } = await supabase
      .from('finance_transactions')
      .delete()
      .eq('id', id);

    if (delErr) {
      setError('Could not delete.');
      setTransactions(previous);
    }
  };

  /*
   * Apply the date filter locally.
   *
   * Both dates are inclusive.
   * If either date is empty, that side of the range is unrestricted.
   */
  const filteredTransactions = transactions.filter((transaction) => {
    const transactionDate = transaction.transaction_date;

    if (startDate && transactionDate < startDate) {
      return false;
    }

    if (endDate && transactionDate > endDate) {
      return false;
    }

    return true;
  });

  const total = filteredTransactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount),
    0,
  );

  const hasDateFilter = Boolean(startDate || endDate);

  const clearFilter = () => {
    setStartDate('');
    setEndDate('');
    setError(null);
  };

  const handleStartDateChange = (d: string) => {
    setStartDate(d);

    /*
     * Keep the range valid, matching the Financial Health
     * filter behaviour.
     */
    if (endDate && d > endDate) {
      setEndDate(d);
    }
  };

  const handleEndDateChange = (d: string) => {
    /*
     * Do not allow an end date earlier than the start date.
     */
    if (!startDate || d >= startDate) {
      setEndDate(d);
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.safe,
        isDark && styles.safeDark,
      ]}
    >
      <PageHeader
        title={titleFor(txKind)}
        financeMode
        onSetCurrency={() => setCurrencyOpen(true)}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <Text style={styles.error}>
            {error}
          </Text>
        )}

        {/* Summary */}
        <View
          style={[
            styles.summaryCard,
            isDark && styles.cardDark,
          ]}
        >
          {/* Financial Health-style date filter.
              This filter is local to this transaction page only. */}
          <View style={styles.dateFilterRow}>
            <View style={{ flex: 1 }}>
              <DatePickerInput
                value={startDate}
                onChange={handleStartDateChange}
                accent={accentForeground}
                onAccent={onAccent}
                isDark={isDark}
                placeholder="Start date"
              />
            </View>

            <Text
              style={[
                styles.dateSep,
                isDark && styles.darkMuted,
              ]}
            >
              →
            </Text>

            <View style={{ flex: 1 }}>
              <DatePickerInput
                value={endDate}
                onChange={handleEndDateChange}
                accent={accentForeground}
                onAccent={onAccent}
                isDark={isDark}
                placeholder="End date"
              />
            </View>
          </View>

          {hasDateFilter && (
            <Pressable
              onPress={clearFilter}
              style={styles.clearFilterButton}
            >
              <Text style={styles.clearFilterText}>
                Clear dates
              </Text>
            </Pressable>
          )}

          <Text
            style={[
              styles.summaryLabel,
              isDark && styles.darkMuted,
            ]}
          >
            {txKind === 'income'
              ? 'Total received'
              : txKind === 'debt'
                ? 'Total owed'
                : 'Total spent'}
          </Text>

          <Text
            style={[
              styles.summaryValue,
              {
                color: isDark
                  ? '#FFFFFF'
                  : accentForeground,
              },
            ]}
          >
            {fmt(total)}
          </Text>
        </View>

        {/* Transactions */}
        {loading ? (
          <Text
            style={[
              styles.emptyText,
              isDark && styles.darkMuted,
            ]}
          >
            Loading...
          </Text>
        ) : filteredTransactions.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={[
                styles.emptyText,
                isDark && styles.darkMuted,
              ]}
            >
              {hasDateFilter
                ? `No ${titleFor(txKind).toLowerCase()} found for this date range.`
                : `No ${titleFor(txKind).toLowerCase()} yet. Tap + to record one.`}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.list,
              isDark && styles.cardDark,
            ]}
          >
            {filteredTransactions.map(
              (transaction, index) => (
                <View
                  key={transaction.id}
                  style={[
                    styles.row,
                    index < filteredTransactions.length - 1 &&
                      styles.rowBorder,
                    isDark && styles.rowBorderDark,
                  ]}
                >
                  <View style={styles.rowCopy}>
                    <Text
                      style={[
                        styles.rowTitle,
                        isDark && styles.darkText,
                      ]}
                      numberOfLines={1}
                    >
                      {transaction.title}
                    </Text>

                    <Text
                      style={[
                        styles.rowMeta,
                        isDark && styles.darkMuted,
                      ]}
                    >
                      {transaction.category}
                      {'  ·  '}
                      {transaction.transaction_date}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.rowAmount,
                      {
                        color: isDark
                          ? '#FFFFFF'
                          : accentForeground,
                      },
                    ]}
                  >
                    {fmt(Number(transaction.amount))}
                  </Text>

                  <Pressable
                    onPress={() => remove(transaction.id)}
                    hitSlop={8}
                  >
                    <Trash2
                      color={
                        isDark
                          ? '#5A5751'
                          : '#C8C5BE'
                      }
                      size={16}
                    />
                  </Pressable>
                </View>
              ),
            )}
          </View>
        )}
      </ScrollView>

      {/* Floating + button */}
      <Pressable
        onPress={openNew}
        style={[
          styles.fab,
          {
            backgroundColor: accentForeground,
          },
        ]}
        hitSlop={12}
      >
        <Plus
          color={onAccent}
          size={26}
          strokeWidth={2.6}
        />
      </Pressable>

      {/* Add transaction modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalShade}>
          <View
            style={[
              styles.modalCard,
              isDark && styles.modalDark,
            ]}
          >
            <View style={styles.modalTitleRow}>
              <Text
                style={[
                  styles.modalTitle,
                  isDark && styles.darkText,
                ]}
              >
                Add {titleFor(txKind).toLowerCase()}
              </Text>

              <Pressable
                onPress={() => setModalOpen(false)}
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

            <Text
              style={[
                styles.label,
                isDark && styles.darkMuted,
              ]}
            >
              Title
            </Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What is this for?"
              placeholderTextColor="#9B978F"
              style={[
                styles.input,
                isDark && styles.inputDark,
              ]}
              autoFocus
            />

            <Text
              style={[
                styles.label,
                isDark && styles.darkMuted,
              ]}
            >
              Amount ({currency_code})
            </Text>

            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor="#9B978F"
              style={[
                styles.input,
                isDark && styles.inputDark,
              ]}
              keyboardType="numeric"
            />

            <Text
              style={[
                styles.label,
                isDark && styles.darkMuted,
              ]}
            >
              Category
            </Text>

            <View style={styles.chipRow}>
              {categories.map((c) => {
                const selected =
                  (category || categories[0]) === c;

                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[
                      styles.chip,
                      selected && {
                        backgroundColor:
                          accentForeground,
                        borderColor:
                          accentForeground,
                      },
                      isDark &&
                        !selected &&
                        styles.chipDark,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isDark && styles.darkMuted,
                        selected && {
                          color: onAccent,
                          fontFamily: FONT_SEMI,
                        },
                      ]}
                    >
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={[
                styles.label,
                isDark && styles.darkMuted,
              ]}
            >
              Date
            </Text>

            <DatePickerInput
              value={date}
              onChange={setDate}
              accent={accentForeground}
              onAccent={onAccent}
              isDark={isDark}
              placeholder="Select date"
            />

            <Pressable
              disabled={saving}
              onPress={save}
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  { color: onAccent },
                ]}
              >
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <CurrencyPickerModal
        visible={currencyOpen}
        currentCode={currency_code}
        onSelect={(code) =>
          updateSettings({
            currency_code: code,
          })
        }
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
    backgroundColor: '#FBFAF8',
  },

  safeDark: {
    backgroundColor: '#090909',
  },

  content: {
    padding: 16,
    paddingBottom: 90,
  },

  darkText: {
    color: '#F4F2EE',
  },

  darkMuted: {
    color: '#AAA59D',
  },

  error: {
    fontFamily: FONT_MED,
    color: '#C53A2F',
    fontSize: 13,
    marginBottom: 10,
  },

  /*
   * SUMMARY
   */

  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    padding: 18,
    marginBottom: 16,
  },

  cardDark: {
    backgroundColor: '#111',
    borderColor: '#2A2A2A',
  },

  /*
   * FINANCIAL HEALTH-STYLE DATE FILTER
   */

  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },

  dateSep: {
    fontFamily: FONT_MED,
    fontSize: 11,
    color: '#908B83',
  },

  clearFilterButton: {
    alignSelf: 'flex-start',
    marginTop: -4,
    marginBottom: 10,
  },

  clearFilterText: {
    fontFamily: FONT_MED,
    fontSize: 11,
    color: '#C53A2F',
  },

  summaryLabel: {
    fontFamily: FONT_SEMI,
    fontSize: 13,
    color: '#77746E',
  },

  summaryValue: {
    fontFamily: FONT_BOLD,
    fontSize: 26,
    marginTop: 6,
  },

  /*
   * TRANSACTION LIST
   */

  list: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    paddingHorizontal: 14,
  },

  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },

  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0EEEA',
  },

  rowBorderDark: {
    borderBottomColor: '#292929',
  },

  rowCopy: {
    flex: 1,
    gap: 3,
  },

  rowTitle: {
    fontFamily: FONT_MED,
    fontSize: 15,
    color: '#27241F',
  },

  rowMeta: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#908B83',
  },

  rowAmount: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  empty: {
    paddingVertical: 40,
    alignItems: 'center',
  },

  emptyText: {
    fontFamily: FONT,
    fontSize: 14,
    color: '#908B83',
    textAlign: 'center',
  },

  /*
   * FAB
   */

  fab: {
    position: 'absolute',
    bottom: 82,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 6,
  },

  /*
   * MODALS
   */

  modalShade: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  modalCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 34,
  },

  modalDark: {
    backgroundColor: '#161616',
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
    color: '#27241F',
  },

  label: {
    fontFamily: FONT_MED,
    fontSize: 13,
    color: '#77746E',
    marginTop: 14,
    marginBottom: 6,
  },

  input: {
    borderWidth: 1,
    borderColor: '#E1DED8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: FONT,
    fontSize: 15,
    color: '#282724',
  },

  inputDark: {
    backgroundColor: '#1E1E1E',
    borderColor: '#363636',
    color: '#F4F2EE',
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2DFD9',
    backgroundColor: '#FFF',
  },

  chipDark: {
    backgroundColor: '#1E1E1E',
    borderColor: '#363636',
  },

  chipText: {
    fontFamily: FONT,
    fontSize: 13,
    color: '#77746E',
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
});