import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  MoreVertical,
  Plus,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

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
    accentColor: rawAccent,
    isDark,
    onAccent,
    currency_code,
    updateSettings,
  } = useApp() as any;

  const pageBg = rawAccent || accentForeground || '#FDE047';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

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
      setError('Add a description.');
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

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);

    const previous = transactions;
    setTransactions((current) => current.filter((t) => t.id !== id));

    const { error: delErr } = await supabase
      .from('finance_transactions')
      .delete()
      .eq('id', id);

    if (delErr) {
      setError('Could not delete.');
      setTransactions(previous);
    }
  };

  const total = transactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount),
    0,
  );

  const C = isDark
    ? {
        cardBg: '#121212',
        cardText: '#FFFFFF',
        cardSubtext: '#A1A1AA',
        inputBg: '#1E1E1E',
      }
    : {
        cardBg: '#FFFFFF',
        cardText: '#000000',
        cardSubtext: '#52525B',
        inputBg: '#F4F4F5',
      };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={pageBg} />

      {/* HEADER */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            setSettingsMenuOpen(false);
            router.push('/modules/finances');
          }}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
        </Pressable>

        <Text style={styles.headerTitle}>
          {titleFor(txKind).toUpperCase()}
        </Text>

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

      {/* PINNED TOP SECTION: SUMMARY CARD & SECTION HEADING */}
      <View style={[styles.pinnedContainer, { backgroundColor: pageBg }]}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* SUMMARY CARD (STICKY) - Always white background even in dark mode */}
        <View style={styles.cardContainer}>
          <View style={styles.cardShadowBackdrop} />
          <View style={[styles.summaryCardBody, { backgroundColor: '#FFFFFF' }]}>
            <Text style={[styles.summaryLabel, { color: '#52525B' }]}>
              {txKind === 'income'
                ? 'TOTAL RECEIVED'
                : txKind === 'debt'
                  ? 'TOTAL OWED'
                  : 'TOTAL SPENT'}
            </Text>

            <Text style={[styles.summaryValue, { color: '#000000' }]}>
              {fmt(total)}
            </Text>
          </View>
        </View>

        {/* TRANSACTIONS SECTION HEADING */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>TRANSACTIONS</Text>
        </View>
      </View>

      {/* ONLY SCROLLABLE TRANSACTIONS LIST */}
      <ScrollView
        contentContainerStyle={styles.scrollListContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={styles.emptyText}>
            Loading transactions...
          </Text>
        ) : transactions.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {`No ${titleFor(txKind).toLowerCase()} yet. Tap + to record one.`}
            </Text>
          </View>
        ) : (
          <View style={styles.listStackTight}>
            {transactions.map((transaction) => (
              <View key={transaction.id} style={styles.cardContainerCompact}>
                <View style={styles.cardShadowBackdrop} />
                <View style={[styles.rowCardBodyCompact, { backgroundColor: C.cardBg }]}>
                  <View style={styles.rowCopy}>
                    <Text
                      style={[styles.rowTitle, { color: C.cardText }]}
                      numberOfLines={1}
                    >
                      {transaction.title}
                    </Text>

                    <Text style={[styles.rowMeta, { color: C.cardSubtext }]}>
                      {transaction.category}
                      {'  ·  '}
                      {transaction.transaction_date}
                    </Text>
                  </View>

                  <Text style={[styles.rowAmount, { color: C.cardText }]}>
                    {fmt(Number(transaction.amount))}
                  </Text>

                  <Pressable
                    onPress={() => setDeleteTargetId(transaction.id)}
                    hitSlop={8}
                    style={({ pressed }) => pressed && styles.pressedBtn}
                  >
                    <Trash2 color="#EF4444" size={18} strokeWidth={2.5} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* FLOATING PLUS BUTTON */}
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

      {/* CENTERED ADD TRANSACTION MODAL */}
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
                    Add {titleFor(txKind).toLowerCase()}
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
                  {/* 1. CATEGORY FIRST */}
                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    CATEGORY
                  </Text>
                  <View style={styles.chipRowLeft}>
                    {categories.map((c) => {
                      const selected = (category || categories[0]) === c;
                      return (
                        <Pressable
                          key={c}
                          onPress={() => setCategory(c)}
                          style={({ pressed }) => [
                            styles.chip,
                            selected
                              ? styles.chipActive
                              : { backgroundColor: C.inputBg },
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

                  {/* 2. DESCRIPTION */}
                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    DESCRIPTION
                  </Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder={txKind === 'income' ? 'Where is this from?' : 'What is this for?'}
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      {
                        backgroundColor: C.inputBg,
                        color: C.cardText,
                      },
                    ]}
                    autoFocus
                  />

                  {/* 3. AMOUNT */}
                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    AMOUNT ({currency_code})
                  </Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      {
                        backgroundColor: C.inputBg,
                        color: C.cardText,
                      },
                    ]}
                    keyboardType="numeric"
                  />

                  {/* 4. DATE */}
                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    DATE
                  </Text>
                  <DatePickerInput
                    value={date}
                    onChange={setDate}
                    accent={pageBg}
                    onAccent={onAccent}
                    isDark={isDark}
                    placeholder="Select date"
                  />
                </ScrollView>

                <Pressable
                  disabled={saving}
                  onPress={save}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressedBtn,
                    saving && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* CENTERED DELETE ALERT MODAL */}
      <Modal
        visible={!!deleteTargetId}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTargetId(null)}
      >
        <View style={styles.alertShade}>
          <View style={styles.alertCardWrapper}>
            <View style={styles.alertShadowBackdrop} />
            <View style={styles.alertCardBody}>
              <View style={styles.alertHeaderRow}>
                <View style={styles.alertIconBadge}>
                  <AlertTriangle color="#000000" size={20} strokeWidth={2.5} />
                </View>
                <Text style={styles.alertTitle}>Delete Transaction?</Text>
              </View>

              <Text style={styles.alertMessage}>
                Are you sure you want to delete this record? This action cannot be undone.
              </Text>

              <View style={styles.alertActionsRow}>
                <Pressable
                  onPress={() => setDeleteTargetId(null)}
                  style={({ pressed }) => [
                    styles.alertCancelBtn,
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={styles.alertCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={confirmDelete}
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
  safe: {
    flex: 1,
  },
  pressedBtn: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
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

  /* PINNED CONTAINER FOR SUMMARY CARD & TITLE */
  pinnedContainer: {
    paddingHorizontal: 18,
    paddingBottom: 4,
    zIndex: 10,
  },
  cardContainer: {
    position: 'relative',
    width: '100%',
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
  summaryCardBody: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 4,
  },
  summaryLabel: {
    fontFamily: FONT_XB,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontFamily: FONT_XB,
    fontSize: 26,
    marginTop: 2,
  },

  /* SECTION HEADINGS */
  sectionHeadingRow: {
    marginTop: 12,
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: FONT_XB,
    fontSize: 15,
    letterSpacing: 1,
    color: '#000000',
  },

  /* SCROLLABLE LIST */
  scrollListContent: {
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 110,
  },
  listStackTight: {
    gap: 6,
  },
  cardContainerCompact: {
    position: 'relative',
    width: '100%',
  },
  rowCardBodyCompact: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2.5,
  },
  rowCopy: {
    flex: 1,
    gap: 1,
  },
  rowTitle: {
    fontFamily: FONT_XB,
    fontSize: 14,
  },
  rowMeta: {
    fontFamily: FONT_MED,
    fontSize: 11,
  },
  rowAmount: {
    fontFamily: FONT_XB,
    fontSize: 14,
  },

  empty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
    color: '#000000',
    textAlign: 'center',
  },

  /* FAB */
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
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* MODALS */
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
    padding: 20,
    maxHeight: 540,
    alignItems: 'flex-start',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 20,
    flex: 1,
    textAlign: 'left',
  },
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
    width: '100%',
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
    textAlign: 'left',
  },
  modalTextInput: {
    fontFamily: FONT_MED,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    textAlign: 'left',
    width: '100%',
  },
  chipRowLeft: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  chipActive: {
    backgroundColor: '#000000',
  },
  chipText: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
  },

  primaryBtn: {
    backgroundColor: '#000000',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    marginTop: 14,
  },
  primaryBtnText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 15,
  },

  /* DELETE ALERT MODAL */
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
    padding: 20,
    alignItems: 'center',
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  alertIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FDE047',
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
    textAlign: 'center',
    marginBottom: 18,
  },
  alertActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  alertCancelBtn: {
    flex: 1,
    backgroundColor: '#F4F4F5',
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