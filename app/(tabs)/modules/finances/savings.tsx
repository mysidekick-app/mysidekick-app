import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  StatusBar,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import {
  AlertTriangle,
  ChevronLeft,
  MoreVertical,
  PiggyBank,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { DatePickerInput } from '@/components/DatePickerInput';
import { CurrencyPickerModal } from '@/components/CurrencyPickerModal';
import { formatMoney } from '@/components/currencies';

type Goal = {
  id: string;
  user_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  due_date: string | null;
};

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

const GOAL_FIELDS =
  'id, user_id, title, target_amount, current_amount, due_date';

export default function SavingsScreen() {
  const {
    accentForeground,
    accentWash,
    isDark,
    onAccent,
    currency_code,
    updateSettings,
  } = useApp() as any;

  const pageBg = accentForeground || '#FDE047';

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [saving, setSaving] = useState(false);

  const [contribFor, setContribFor] = useState<Goal | null>(null);
  const [contribAmount, setContribAmount] = useState('');
  const [contributing, setContributing] = useState(false);

  const [deleteGoalTarget, setDeleteGoalTarget] = useState<Goal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fmt = (value: number) =>
    formatMoney(value, currency_code);

  const getCurrentUser = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    return user;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const user = await getCurrentUser();

    if (!user) {
      setGoals([]);
      setError('You must be signed in to view your savings.');
      setLoading(false);
      return;
    }

    const { data, error: loadErr } = await supabase
      .from('savings_goals')
      .select(GOAL_FIELDS)
      .eq('user_id', user.id)
      .order('created_at', {
        ascending: true,
      });

    if (loadErr) {
      console.error('Savings load error:', loadErr);
      setError('Your savings could not be loaded.');
    } else {
      setGoals((data ?? []) as Goal[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setTitle('');
    setTarget('');
    setDueDate('');
    setError(null);
    setModalOpen(true);
  };

  const closeNewModal = () => {
    if (saving) return;

    setModalOpen(false);
    setError(null);
  };

  const saveGoal = async () => {
    if (saving) return;

    const trimmedTitle = title.trim();
    const value = Number.parseFloat(target);

    if (!trimmedTitle) {
      setError('Give your goal a name.');
      return;
    }

    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a target amount greater than zero.');
      return;
    }

    setSaving(true);
    setError(null);

    const user = await getCurrentUser();

    if (!user) {
      setError('You must be signed in to create a savings goal.');
      setSaving(false);
      return;
    }

    const { data, error: saveErr } = await supabase
      .from('savings_goals')
      .insert({
        user_id: user.id,
        title: trimmedTitle,
        target_amount: value,
        current_amount: 0,
        due_date: dueDate.trim() || null,
      })
      .select(GOAL_FIELDS)
      .maybeSingle();

    if (saveErr || !data) {
      console.error('Savings create error:', saveErr);
      setError(
        saveErr?.message ||
          'The goal could not be saved.'
      );
      setSaving(false);
      return;
    }

    setGoals((current) => [
      ...current,
      data as Goal,
    ]);

    setModalOpen(false);

    setTitle('');
    setTarget('');
    setDueDate('');
    setSaving(false);
  };

  const openContribution = (goal: Goal) => {
    setError(null);
    setContribFor(goal);
    setContribAmount('');
  };

  const closeContribution = () => {
    if (contributing) return;

    setContribFor(null);
    setContribAmount('');
    setError(null);
  };

  const addContribution = async () => {
    if (!contribFor || contributing) return;

    const value = Number.parseFloat(
      contribAmount
    );

    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }

    setContributing(true);
    setError(null);

    const user = await getCurrentUser();

    if (!user) {
      setError(
        'You must be signed in to update your savings.'
      );
      setContributing(false);
      return;
    }

    const { data: existingGoal, error: goalErr } =
      await supabase
        .from('savings_goals')
        .select(
          'id, user_id, current_amount'
        )
        .eq('id', contribFor.id)
        .eq('user_id', user.id)
        .maybeSingle();

    if (
      goalErr ||
      !existingGoal
    ) {
      console.error(
        'Savings goal lookup error:',
        goalErr
      );

      setError(
        'Could not find this savings goal.'
      );

      setContributing(false);
      return;
    }

    const currentAmount = Number(
      existingGoal.current_amount ?? 0
    );

    const nextAmount =
      currentAmount + value;

    const { error: updateErr } =
      await supabase
        .from('savings_goals')
        .update({
          current_amount: nextAmount,
        })
        .eq('id', contribFor.id)
        .eq('user_id', user.id);

    if (updateErr) {
      console.error(
        'Savings contribution error:',
        updateErr
      );

      setError(
        'Could not update the goal.'
      );

      setContributing(false);
      return;
    }

    setGoals((current) =>
      current.map((goal) =>
        goal.id === contribFor.id
          ? {
              ...goal,
              current_amount: nextAmount,
            }
          : goal
      )
    );

    setContribFor(null);
    setContribAmount('');
    setContributing(false);
  };

  const confirmDelete = async () => {
    if (!deleteGoalTarget) return;
    const goal = deleteGoalTarget;
    setDeleteGoalTarget(null);
    setDeletingId(goal.id);

    const previousGoals = goals;

    setGoals((current) =>
      current.filter(
        (item) =>
          item.id !== goal.id
      )
    );

    const user = await getCurrentUser();

    if (!user) {
      setGoals(previousGoals);
      setError(
        'You must be signed in to delete this goal.'
      );
      setDeletingId(null);
      return;
    }

    const { error: deleteErr } =
      await supabase
        .from('savings_goals')
        .delete()
        .eq('id', goal.id)
        .eq('user_id', user.id);

    if (deleteErr) {
      console.error(
        'Savings delete error:',
        deleteErr
      );

      setGoals(previousGoals);

      setError(
        'Could not delete the savings goal.'
      );
    }

    setDeletingId(null);
  };

  const totalSaved = goals.reduce(
    (sum, goal) =>
      sum + Number(goal.current_amount || 0),
    0
  );

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
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: pageBg },
      ]}
    >
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

        <Text style={[styles.headerTitle, { color: '#000000' }]}>
          SAVINGS
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

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        )}

        {/* Summary Card */}
        <View style={styles.cardContainer}>
          <View style={styles.cardShadowBackdrop} />
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: '#FFFFFF', borderColor: '#000000' },
            ]}
          >
            <Text style={styles.summaryLabel}>
              TOTAL SAVED
            </Text>

            <Text style={styles.summaryValue}>
              {fmt(totalSaved)}
            </Text>
          </View>
        </View>

        {/* Loading */}
        {loading ? (
          <Text style={[styles.emptyText, { color: '#000000' }]}>
            Loading your savings...
          </Text>
        ) : goals.length === 0 ? (
          /* Empty state */
          <View style={styles.empty}>
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor: accentForeground,
                  borderColor: '#000000',
                },
              ]}
            >
              <PiggyBank
                color="#000000"
                size={24}
                strokeWidth={2.5}
              />
            </View>

            <Text style={[styles.emptyTitle, { color: '#000000' }]}>
              No savings goals yet
            </Text>

            <Text style={[styles.emptyText, { color: '#000000' }]}>
              Tap + to create your first savings goal.
            </Text>
          </View>
        ) : (
          /* Goals */
          <View style={styles.goalList}>
            {goals.map((goal) => {
              const currentAmount = Number(
                goal.current_amount || 0
              );

              const targetAmount = Number(
                goal.target_amount || 0
              );

              const pct =
                targetAmount > 0
                  ? Math.min(
                      100,
                      (currentAmount /
                        targetAmount) *
                        100
                    )
                  : 0;

              return (
                <View
                  key={goal.id}
                  style={styles.cardContainer}
                >
                  <View style={styles.cardShadowBackdrop} />
                  <View
                    style={[
                      styles.goalCard,
                      {
                        backgroundColor: C.cardBg,
                        borderColor: '#000000',
                      },
                    ]}
                  >
                    <View
                      style={styles.goalTop}
                    >
                      <View
                        style={[
                          styles.goalIcon,
                          {
                            backgroundColor:
                              accentForeground,
                            borderColor: '#000000',
                          },
                        ]}
                      >
                        <PiggyBank
                          color="#000000"
                          size={18}
                          strokeWidth={2.5}
                        />
                      </View>

                      <View
                        style={styles.goalCopy}
                      >
                        <Text
                          style={[
                            styles.goalTitle,
                            { color: C.cardText },
                          ]}
                          numberOfLines={1}
                        >
                          {goal.title}
                        </Text>

                        <Text
                          style={[
                            styles.goalMeta,
                            { color: C.cardSubtext },
                          ]}
                        >
                          {fmt(
                            currentAmount
                          )}{' '}
                          of{' '}
                          {fmt(
                            targetAmount
                          )}
                          {goal.due_date
                            ? `  ·  due ${goal.due_date}`
                            : ''}
                        </Text>
                      </View>

                      <Pressable
                        onPress={() =>
                          setDeleteGoalTarget(goal)
                        }
                        disabled={
                          deletingId ===
                          goal.id
                        }
                        hitSlop={12}
                        style={({ pressed }) => [
                          styles.deleteButton,
                          pressed && {
                            opacity: 0.55,
                          },
                          deletingId ===
                            goal.id && {
                            opacity: 0.35,
                          },
                        ]}
                      >
                        <Trash2
                          color="#EF4444"
                          size={18}
                          strokeWidth={2.5}
                        />
                      </Pressable>
                    </View>

                    {/* Progress */}
                    <View
                      style={[
                        styles.track,
                        { backgroundColor: C.trackBg, borderColor: '#000000' },
                      ]}
                    >
                      <View
                        style={[
                          styles.fill,
                          {
                            width: `${pct}%`,
                            backgroundColor:
                              accentForeground,
                          },
                        ]}
                      />
                    </View>

                    {/* Percentage */}
                    <View
                      style={
                        styles.progressRow
                      }
                    >
                      <Text
                        style={[
                          styles.progressText,
                          { color: C.cardSubtext },
                        ]}
                      >
                        {Math.round(pct)}%
                      </Text>

                      <Text
                        style={[
                          styles.progressText,
                          { color: C.cardSubtext },
                        ]}
                      >
                        {fmt(
                          currentAmount
                        )}{' '}
                        saved
                      </Text>
                    </View>

                    {/* Add contribution */}
                    <Pressable
                      onPress={() =>
                        openContribution(
                          goal
                        )
                      }
                      style={({ pressed }) => [
                        styles.contribBtn,
                        {
                          backgroundColor:
                            accentForeground,
                          borderColor: '#000000',
                        },
                        pressed && styles.pressedBtn,
                      ]}
                    >
                      <Plus
                        color="#000000"
                        size={16}
                        strokeWidth={2.8}
                      />

                      <Text
                        style={
                          styles.contribText
                        }
                      >
                        Add to goal
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add Goal FAB */}
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
          <Plus
            color="#FFFFFF"
            size={28}
            strokeWidth={3}
          />
        </Pressable>
      </View>

      {/* New Goal Modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={
          closeNewModal
        }
      >
        <View style={styles.centeredModalShade}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingViewCentered}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCardWrapper}>
              <View style={styles.modalShadowBackdrop} />
              <View
                style={[
                  styles.modalCardBody,
                  { backgroundColor: C.modalBg, borderColor: '#000000' },
                ]}
              >
                <View
                  style={
                    styles.modalTitleRow
                  }
                >
                  <Text
                    style={[
                      styles.modalTitle,
                      { color: C.cardText },
                    ]}
                  >
                    New savings goal
                  </Text>

                  <Pressable
                    onPress={
                      closeNewModal
                    }
                    hitSlop={12}
                    disabled={saving}
                  >
                    <X
                      color={C.cardText}
                      size={22}
                      strokeWidth={2.5}
                    />
                  </Pressable>
                </View>

                {error && (
                  <View style={styles.errorBox}>
                    <Text
                      style={styles.errorText}
                    >
                      {error}
                    </Text>
                  </View>
                )}

                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text
                    style={[
                      styles.label,
                      { color: C.cardSubtext },
                    ]}
                  >
                    GOAL NAME
                  </Text>

                  <TextInput
                    value={title}
                    onChangeText={
                      setTitle
                    }
                    placeholder="e.g. Emergency fund"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      {
                        backgroundColor: C.inputBg,
                        color: C.cardText,
                        borderColor: '#000000',
                      },
                    ]}
                    autoFocus
                    editable={!saving}
                  />

                  <Text
                    style={[
                      styles.label,
                      { color: C.cardSubtext },
                    ]}
                  >
                    TARGET AMOUNT ({currency_code})
                  </Text>

                  <TextInput
                    value={target}
                    onChangeText={
                      setTarget
                    }
                    placeholder="50000"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      {
                        backgroundColor: C.inputBg,
                        color: C.cardText,
                        borderColor: '#000000',
                      },
                    ]}
                    keyboardType="decimal-pad"
                    editable={!saving}
                  />

                  <Text
                    style={[
                      styles.label,
                      { color: C.cardSubtext },
                    ]}
                  >
                    DUE DATE (OPTIONAL)
                  </Text>

                  <DatePickerInput
                    value={dueDate}
                    onChange={
                      setDueDate
                    }
                    label=""
                    accent={
                      accentForeground
                    }
                    onAccent={onAccent}
                    isDark={isDark}
                    placeholder="Select date"
                  />
                </ScrollView>

                <Pressable
                  disabled={saving}
                  onPress={
                    saveGoal
                  }
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: '#000000' },
                    saving && {
                      opacity: 0.6,
                    },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: '#FFFFFF' },
                    ]}
                  >
                    {saving
                      ? 'Saving...'
                      : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Add Contribution Modal */}
      <Modal
        visible={!!contribFor}
        transparent
        animationType="fade"
        onRequestClose={
          closeContribution
        }
      >
        <View style={styles.centeredModalShade}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingViewCentered}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCardWrapper}>
              <View style={styles.modalShadowBackdrop} />
              <View
                style={[
                  styles.modalCardBody,
                  { backgroundColor: C.modalBg, borderColor: '#000000' },
                ]}
              >
                <View
                  style={
                    styles.modalTitleRow
                  }
                >
                  <Text
                    style={[
                      styles.modalTitle,
                      { color: C.cardText },
                    ]}
                    numberOfLines={1}
                  >
                    Add to{' '}
                    {contribFor?.title}
                  </Text>

                  <Pressable
                    onPress={
                      closeContribution
                    }
                    hitSlop={12}
                    disabled={
                      contributing
                    }
                  >
                    <X
                      color={C.cardText}
                      size={22}
                      strokeWidth={2.5}
                    />
                  </Pressable>
                </View>

                {error && (
                  <View style={styles.errorBox}>
                    <Text
                      style={styles.errorText}
                    >
                      {error}
                    </Text>
                  </View>
                )}

                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text
                    style={[
                      styles.label,
                      { color: C.cardSubtext },
                    ]}
                  >
                    AMOUNT ({currency_code})
                  </Text>

                  <TextInput
                    value={
                      contribAmount
                    }
                    onChangeText={
                      setContribAmount
                    }
                    placeholder="500"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      {
                        backgroundColor: C.inputBg,
                        color: C.cardText,
                        borderColor: '#000000',
                      },
                    ]}
                    keyboardType="decimal-pad"
                    autoFocus
                    editable={
                      !contributing
                    }
                  />
                </ScrollView>

                <Pressable
                  disabled={
                    contributing
                  }
                  onPress={
                    addContribution
                  }
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: '#000000' },
                    contributing && {
                      opacity: 0.6,
                    },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: '#FFFFFF' },
                    ]}
                  >
                    {contributing
                      ? 'Adding...'
                      : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Neo-brutalist Delete Alert Modal */}
      <Modal
        visible={!!deleteGoalTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteGoalTarget(null)}
      >
        <View style={styles.alertShade}>
          <View style={styles.alertCardWrapper}>
            <View style={styles.alertShadowBackdrop} />
            <View style={[styles.alertCardBody, { backgroundColor: C.modalBg }]}>
              <View style={styles.alertHeaderRow}>
                <View style={styles.alertIconBadge}>
                  <AlertTriangle color="#000000" size={20} strokeWidth={2.5} />
                </View>
                <Text style={[styles.alertTitle, { color: C.cardText }]}>Delete Goal?</Text>
              </View>

              <Text style={[styles.alertMessage, { color: C.cardSubtext }]}>
                Are you sure you want to delete "{deleteGoalTarget?.title}"? This action cannot be undone.
              </Text>

              <View style={styles.alertActionsRow}>
                <Pressable
                  onPress={() => setDeleteGoalTarget(null)}
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

      {/* Currency Picker */}
      <CurrencyPickerModal
        visible={
          currencyOpen
        }
        currentCode={
          currency_code
        }
        onSelect={(code) =>
          updateSettings({
            currency_code:
              code,
          })
        }
        onClose={() =>
          setCurrencyOpen(false)
        }
        accent={
          accentForeground
        }
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
    paddingBottom: 100,
  },

  pressedBtn: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },

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

  goalList: {
    gap: 5,
  },

  goalCard: {
    borderRadius: 16,
    borderWidth: 3,
    padding: 16,
  },

  goalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },

  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },

  goalCopy: {
    flex: 1,
    gap: 2,
  },

  goalTitle: {
    fontFamily: FONT_XB,
    fontSize: 16,
  },

  goalMeta: {
    fontFamily: FONT_MED,
    fontSize: 11,
  },

  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  track: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    borderWidth: 2,
  },

  fill: {
    height: '100%',
    borderRadius: 3,
  },

  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },

  progressText: {
    fontFamily: FONT_BOLD,
    fontSize: 11,
  },

  contribBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 2,
  },

  contribText: {
    fontFamily: FONT_XB,
    fontSize: 13,
    color: '#000000',
  },

  empty: {
    paddingVertical: 50,
    alignItems: 'center',
    paddingHorizontal: 25,
  },

  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 2.5,
  },

  emptyTitle: {
    fontFamily: FONT_XB,
    fontSize: 18,
    marginBottom: 6,
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