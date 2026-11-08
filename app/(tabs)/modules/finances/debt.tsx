import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronLeft, CreditCard, Minus, MoreVertical, Plus, Trash2, X } from 'lucide-react-native';
import { router } from 'expo-router';
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
const STATUS_FILTERS = ['Unpaid', 'Paid', 'All'] as const;

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function DebtScreen() {
  const { accentForeground, accentWash, isDark, onAccent, currency_code, updateSettings } = useApp() as any;
  const pageBg = accentForeground || '#FDE047';

  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(DEBT_CATEGORIES[0]);
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  // Status Filter State
  const [activeFilter, setActiveFilter] = useState<(typeof STATUS_FILTERS)[number]>('Unpaid');

  // Pay-down state
  const [payFor, setPayFor] = useState<Debt | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState<string | null>(null);

  // Delete target state for neo-brutalist alert
  const [deleteDebtTarget, setDeleteDebtTarget] = useState<Debt | null>(null);

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

  const handlePayAmountChange = (text: string) => {
    setPayAmount(text);
    if (!payFor) return;
    const value = parseFloat(text);
    if (!isNaN(value) && value > Number(payFor.amount)) {
      setPayError(`Amount exceeds remaining debt balance (${fmt(Number(payFor.amount))}).`);
    } else {
      setPayError(null);
    }
  };

  const payDown = async () => {
    if (!payFor) return;
    const value = parseFloat(payAmount);
    if (!value || value <= 0) { setPayError('Enter an amount to pay down.'); return; }
    if (value > Number(payFor.amount)) {
      setPayError('Excess payment is not allowed.');
      return;
    }

    const next = Math.max(0, Number(payFor.amount) - value);

    const { error: updErr } = await supabase
      .from('finance_transactions')
      .update({ amount: next })
      .eq('id', payFor.id);

    if (updErr) {
      setPayError('Could not update the debt.');
      return;
    }

    const { error: expErr } = await supabase
      .from('finance_transactions')
      .insert({
        kind: 'expense',
        title: `Debt Payment: ${payFor.title}`,
        amount: value,
        category: 'Bills',
        transaction_date: todayStr(),
      });

    if (expErr) {
      console.warn('Expense entry could not be logged:', expErr.message);
    }

    setDebts((c) => c.map((d) => (d.id === payFor.id ? { ...d, amount: next } : d)));
    setPayFor(null);
    setPayAmount('');
    setPayError(null);
  };

  const confirmDelete = async () => {
    if (!deleteDebtTarget) return;
    const goal = deleteDebtTarget;
    setDeleteDebtTarget(null);

    const prev = debts;
    setDebts((c) => c.filter((d) => d.id !== goal.id));
    const { error: delErr } = await supabase.from('finance_transactions').delete().eq('id', goal.id);
    if (delErr) { setError('Could not delete.'); setDebts(prev); }
  };

  const total = debts.reduce((sum, d) => sum + Number(d.amount), 0);

  const filteredDebts = debts.filter((d) => {
    if (activeFilter === 'Paid') return Number(d.amount) === 0;
    if (activeFilter === 'Unpaid') return Number(d.amount) > 0;
    return true;
  });

  const C = isDark
    ? {
        cardBg: '#121212',
        cardText: '#FFFFFF',
        cardSubtext: '#A1A1AA',
        trackBg: '#27272A',
        inputBg: '#1E1E1E',
        modalBg: '#18181B',
      }
    : {
        cardBg: '#FFFFFF',
        cardText: '#000000',
        cardSubtext: '#52525B',
        trackBg: '#E4E4E7',
        inputBg: '#F4F4F5',
        modalBg: '#FFFFFF',
      };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={pageBg} />

      {/* HEADER matching transactions & savings modules */}
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

        <Text style={[styles.headerTitle, { color: '#000000' }]}>
          DEBTS
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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Total Debt Summary Card - Always white even in dark mode */}
        <View style={styles.cardContainer}>
          <View style={styles.cardShadowBackdrop} />
          <View style={[styles.summaryCard, { backgroundColor: '#FFFFFF', borderColor: '#000000' }]}>
            <Text style={styles.summaryLabel}>TOTAL DEBT</Text>
            <Text style={styles.summaryValue}>{fmt(total)}</Text>
          </View>
        </View>

        {/* Status Filters: Unpaid / Paid / All */}
        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((f) => {
            const active = activeFilter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setActiveFilter(f)}
                style={({ pressed }) => [
                  styles.filterTab,
                  {
                    backgroundColor: active ? '#000000' : (isDark ? '#1E1E1E' : '#FFFFFF'),
                    borderColor: '#000000',
                  },
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: active ? '#FFFFFF' : C.cardText },
                  ]}
                >
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <Text style={[styles.emptyText, { color: '#000000' }]}>Loading...</Text>
        ) : filteredDebts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: '#000000' }]}>
              No {activeFilter.toLowerCase()} debts found.
            </Text>
          </View>
        ) : (
          <View style={styles.debtList}>
            {filteredDebts.map((debt) => {
              const isPaid = Number(debt.amount) === 0;
              return (
                <View key={debt.id} style={styles.cardContainer}>
                  <View style={styles.cardShadowBackdrop} />
                  <View style={[styles.debtCard, { backgroundColor: C.cardBg, borderColor: '#000000' }]}>
                    <View style={styles.debtTop}>
                      <View style={[styles.debtIcon, { backgroundColor: pageBg, borderColor: '#000000' }]}>
                        <CreditCard color="#000000" size={18} strokeWidth={2.5} />
                      </View>
                      <View style={styles.debtCopy}>
                        <Text style={[styles.debtTitle, { color: C.cardText }]} numberOfLines={1}>
                          {debt.title}
                        </Text>
                        <Text style={[styles.debtMeta, { color: C.cardSubtext }]}>
                          {debt.category}  ·  Due: {debt.transaction_date}
                        </Text>
                      </View>
                      <Pressable onPress={() => setDeleteDebtTarget(debt)} hitSlop={8} style={({ pressed }) => pressed && styles.pressedBtn}>
                        <Trash2 color="#EF4444" size={18} strokeWidth={2.5} />
                      </Pressable>
                    </View>
                    <View style={styles.debtBottom}>
                      <View style={styles.amountContainer}>
                        <Text style={[styles.debtAmount, { color: C.cardText }]}>
                          {fmt(Number(debt.amount))}
                        </Text>
                        {isPaid && <Text style={styles.paidBadge}>Paid</Text>}
                      </View>
                      {!isPaid && (
                        <Pressable
                          onPress={() => {
                            setPayFor(debt);
                            setPayAmount('');
                            setPayError(null);
                          }}
                          style={({ pressed }) => [
                            styles.payBtn,
                            { backgroundColor: pageBg, borderColor: '#000000' },
                            pressed && styles.pressedBtn,
                          ]}
                        >
                          <Minus color="#000000" size={16} strokeWidth={2.8} />
                          <Text style={styles.payText}>Pay down</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <View style={styles.fabContainer}>
        <View style={styles.fabShadowBackdrop} />
        <Pressable
          onPress={openNew}
          style={({ pressed }) => [
            styles.fabBtn,
            { backgroundColor: '#000000' },
            pressed && styles.pressedBtn,
          ]}
          hitSlop={12}
        >
          <Plus color="#FFFFFF" size={28} strokeWidth={3} />
        </Pressable>
      </View>

      {/* Add Debt Modal */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.centeredModalShade}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingViewCentered}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCardWrapper}>
              <View style={styles.modalShadowBackdrop} />
              <View style={[styles.modalCardBody, { backgroundColor: C.modalBg, borderColor: '#000000' }]}>
                <View style={styles.modalTitleRow}>
                  <Text style={[styles.modalTitle, { color: C.cardText }]}>Add debt</Text>
                  <Pressable onPress={() => setModalOpen(false)} hitSlop={12}>
                    <X color={C.cardText} size={22} strokeWidth={2.5} />
                  </Pressable>
                </View>

                {error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={[styles.label, { color: C.cardSubtext }]}>CATEGORY</Text>
                  <View style={styles.chipRow}>
                    {DEBT_CATEGORIES.map((c) => {
                      const selected = category === c;
                      return (
                        <Pressable
                          key={c}
                          onPress={() => setCategory(c)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: selected ? pageBg : C.inputBg,
                              borderColor: '#000000',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: selected ? '#000000' : C.cardText },
                            ]}
                          >
                            {c}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.label, { color: C.cardSubtext }]}>TITLE</Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="What is this debt for?"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      { backgroundColor: C.inputBg, color: C.cardText, borderColor: '#000000' },
                    ]}
                    autoFocus
                  />

                  <Text style={[styles.label, { color: C.cardSubtext }]}>AMOUNT ({currency_code})</Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      { backgroundColor: C.inputBg, color: C.cardText, borderColor: '#000000' },
                    ]}
                    keyboardType="numeric"
                  />

                  <Text style={[styles.label, { color: C.cardSubtext }]}>DUE DATE (OPTIONAL)</Text>
                  <DatePickerInput
                    value={date}
                    onChange={setDate}
                    accent={pageBg}
                    onAccent={onAccent}
                    isDark={isDark}
                    placeholder="Select due date"
                  />
                </ScrollView>

                <Pressable
                  disabled={saving}
                  onPress={save}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: '#000000' },
                    saving && { opacity: 0.6 },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Pay Down Modal */}
      <Modal visible={!!payFor} transparent animationType="fade" onRequestClose={() => setPayFor(null)}>
        <View style={styles.centeredModalShade}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingViewCentered}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCardWrapper}>
              <View style={styles.modalShadowBackdrop} />
              <View style={[styles.modalCardBody, { backgroundColor: C.modalBg, borderColor: '#000000' }]}>
                <View style={styles.modalTitleRow}>
                  <Text style={[styles.modalTitle, { color: C.cardText }]} numberOfLines={1}>
                    Pay down {payFor?.title}
                  </Text>
                  <Pressable onPress={() => setPayFor(null)} hitSlop={12}>
                    <X color={C.cardText} size={22} strokeWidth={2.5} />
                  </Pressable>
                </View>

                <Text style={[styles.label, { color: C.cardSubtext }]}>
                  Current remaining balance: {payFor ? fmt(Number(payFor.amount)) : ''}
                </Text>

                {payError && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{payError}</Text>
                  </View>
                )}

                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={[styles.label, { color: C.cardSubtext }]}>AMOUNT TO PAY ({currency_code})</Text>
                  <TextInput
                    value={payAmount}
                    onChangeText={handlePayAmountChange}
                    placeholder="0"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      { backgroundColor: C.inputBg, color: C.cardText, borderColor: '#000000' },
                      payError ? { borderColor: '#EF4444' } : null,
                    ]}
                    keyboardType="numeric"
                    autoFocus
                  />
                </ScrollView>

                <Pressable
                  disabled={!!payError}
                  onPress={payDown}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: '#000000' },
                    payError && { opacity: 0.5 },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>Pay down</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Neo-brutalist Delete Alert Modal */}
      <Modal
        visible={!!deleteDebtTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteDebtTarget(null)}
      >
        <View style={styles.alertShade}>
          <View style={styles.alertCardWrapper}>
            <View style={styles.alertShadowBackdrop} />
            <View style={[styles.alertCardBody, { backgroundColor: C.modalBg }]}>
              <View style={styles.alertHeaderRow}>
                <View style={styles.alertIconBadge}>
                  <AlertTriangle color="#000000" size={20} strokeWidth={2.5} />
                </View>
                <Text style={[styles.alertTitle, { color: C.cardText }]}>Delete Debt?</Text>
              </View>

              <Text style={[styles.alertMessage, { color: C.cardSubtext }]}>
                Are you sure you want to delete "{deleteDebtTarget?.title}"? This action cannot be undone.
              </Text>

              <View style={styles.alertActionsRow}>
                <Pressable
                  onPress={() => setDeleteDebtTarget(null)}
                  style={({ pressed }) => [
                    styles.alertCancelBtn,
                    { backgroundColor: C.inputBg, borderColor: '#000000' },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={[styles.alertCancelText, { color: C.cardText }]}>Cancel</Text>
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
  safe: { flex: 1 },
  content: { padding: 18, paddingBottom: 100 },
  pressedBtn: { transform: [{ translateX: 2 }, { translateY: 2 }] },

  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#000000',
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
    borderWidth: 2,
    borderColor: '#000000',
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
    borderWidth: 2.5,
    borderColor: '#000000',
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },

  cardContainer: {
    position: 'relative',
    width: '100%',
    marginBottom: 16,
  },
  cardShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: '#000000',
    borderRadius: 16,
  },

  summaryCard: {
    borderRadius: 16,
    borderWidth: 3,
    padding: 18,
  },
  summaryLabel: {
    fontFamily: FONT_XB,
    fontSize: 12,
    letterSpacing: 0.5,
    color: '#52525B',
  },
  summaryValue: {
    fontFamily: FONT_XB,
    fontSize: 26,
    marginTop: 2,
    color: '#000000',
  },

  /* Status Filters */
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 2,
  },
  filterTabText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },

  debtList: {
    gap: 5,
  },
  debtCard: {
    borderRadius: 16,
    borderWidth: 3,
    padding: 16,
  },
  debtTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  debtIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  debtCopy: {
    flex: 1,
    gap: 2,
  },
  debtTitle: {
    fontFamily: FONT_XB,
    fontSize: 16,
  },
  debtMeta: {
    fontFamily: FONT_MED,
    fontSize: 11,
  },
  debtBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  debtAmount: {
    fontFamily: FONT_XB,
    fontSize: 16,
  },
  paidBadge: {
    fontFamily: FONT_XB,
    fontSize: 10,
    color: '#000000',
    backgroundColor: '#86EFAC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
  },
  payText: {
    fontFamily: FONT_XB,
    fontSize: 13,
    color: '#000000',
  },

  empty: {
    paddingVertical: 50,
    alignItems: 'center',
    paddingHorizontal: 25,
  },
  emptyText: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
    textAlign: 'center',
  },

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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },

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
    borderWidth: 3,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: FONT_XB,
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
  label: {
    fontFamily: FONT_XB,
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
    borderWidth: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
  },
  chipText: {
    fontFamily: FONT_BOLD,
    fontSize: 12,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    marginTop: 14,
  },
  primaryBtnText: {
    fontFamily: FONT_BOLD,
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
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#000000',
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
    borderWidth: 2,
    borderColor: '#000000',
  },
  alertTitle: {
    fontFamily: FONT_XB,
    fontSize: 18,
  },
  alertMessage: {
    fontFamily: FONT_MED,
    fontSize: 13,
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
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 2,
  },
  alertCancelText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },
  alertDeleteBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  alertDeleteText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 13,
  },
});