import { useCallback, useEffect, useState } from 'react';

import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  PiggyBank,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';

import { PageHeader } from '@/components/PageHeader';
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
  } = useApp();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [saving, setSaving] = useState(false);

  const [contribFor, setContribFor] = useState<Goal | null>(null);
  const [contribAmount, setContribAmount] = useState('');
  const [contributing, setContributing] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fmt = (value: number) =>
    formatMoney(value, currency_code);

  /*
   * Load the authenticated user.
   *
   * We get this directly from Supabase rather than depending
   * on AppProvider exposing the user.
   */
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

  /*
   * Load only the current user's savings goals.
   */
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

  /*
   * Open the New Goal modal.
   */
  const openNew = () => {
    setTitle('');
    setTarget('');
    setDueDate('');
    setError(null);
    setModalOpen(true);
  };

  /*
   * Close the New Goal modal.
   */
  const closeNewModal = () => {
    if (saving) return;

    setModalOpen(false);
    setError(null);
  };

  /*
   * Create a new savings goal.
   */
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

  /*
   * Open contribution modal.
   */
  const openContribution = (goal: Goal) => {
    setError(null);
    setContribFor(goal);
    setContribAmount('');
  };

  /*
   * Close contribution modal.
   */
  const closeContribution = () => {
    if (contributing) return;

    setContribFor(null);
    setContribAmount('');
    setError(null);
  };

  /*
   * Add money to an existing savings goal.
   */
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

    /*
     * Make sure the goal belongs to the current user.
     */
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

    /*
     * Update using BOTH id and user_id.
     */
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

    /*
     * Update local state immediately.
     */
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

  /*
   * Delete a savings goal.
   */
  const remove = async (goal: Goal) => {
    if (deletingId) return;

    setError(null);

    Alert.alert(
      'Delete savings goal?',
      `"${goal.title}" will be permanently removed.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(goal.id);

            const previousGoals = goals;

            /*
             * Optimistically remove from the UI.
             */
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

            /*
             * Delete only if the goal belongs
             * to the authenticated user.
             */
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
          },
        },
      ]
    );
  };

  const totalSaved = goals.reduce(
    (sum, goal) =>
      sum + Number(goal.current_amount || 0),
    0
  );

  return (
    <SafeAreaView
      style={[
        styles.safe,
        isDark && styles.safeDark,
      ]}
    >
      <PageHeader
        title="Savings"
        financeMode
        onSetCurrency={() =>
          setCurrencyOpen(true)
        }
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
          <Text
            style={[
              styles.summaryLabel,
              isDark && styles.darkMuted,
            ]}
          >
            Total saved
          </Text>

          <Text
            style={[
              styles.summaryValue,
              {
                color: accentForeground,
              },
            ]}
          >
            {fmt(totalSaved)}
          </Text>
        </View>

        {/* Loading */}
        {loading ? (
          <Text
            style={[
              styles.emptyText,
              isDark && styles.darkMuted,
            ]}
          >
            Loading your savings...
          </Text>
        ) : goals.length === 0 ? (
          /* Empty state */
          <View style={styles.empty}>
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor:
                    accentWash,
                },
              ]}
            >
              <PiggyBank
                color={accentForeground}
                size={25}
              />
            </View>

            <Text
              style={[
                styles.emptyTitle,
                isDark && styles.darkText,
              ]}
            >
              No savings goals yet
            </Text>

            <Text
              style={[
                styles.emptyText,
                isDark && styles.darkMuted,
              ]}
            >
              Tap + to create your first
              savings goal.
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
                  style={[
                    styles.goalCard,
                    isDark &&
                      styles.cardDark,
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
                        },
                      ]}
                    >
                      <PiggyBank
                        color={onAccent}
                        size={18}
                      />
                    </View>

                    <View
                      style={styles.goalCopy}
                    >
                      <Text
                        style={[
                          styles.goalTitle,
                          isDark &&
                            styles.darkText,
                        ]}
                        numberOfLines={1}
                      >
                        {goal.title}
                      </Text>

                      <Text
                        style={[
                          styles.goalMeta,
                          isDark &&
                            styles.darkMuted,
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
                        remove(goal)
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
                        color={
                          isDark
                            ? '#E5A39C'
                            : '#C53A2F'
                        }
                        size={17}
                      />
                    </Pressable>
                  </View>

                  {/* Progress */}
                  <View
                    style={[
                      styles.track,
                      isDark &&
                        styles.trackDark,
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
                        isDark &&
                          styles.darkMuted,
                      ]}
                    >
                      {Math.round(pct)}%
                    </Text>

                    <Text
                      style={[
                        styles.progressText,
                        isDark &&
                          styles.darkMuted,
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
                          accentWash,
                      },
                      pressed && {
                        opacity: 0.7,
                      },
                    ]}
                  >
                    <Plus
                      color={
                        accentForeground
                      }
                      size={15}
                    />

                    <Text
                      style={[
                        styles.contribText,
                        {
                          color:
                            accentForeground,
                        },
                      ]}
                    >
                      Add to goal
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add Goal FAB */}
      <Pressable
        onPress={openNew}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor:
              accentForeground,
          },
          pressed && {
            opacity: 0.8,
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

      {/* New Goal Modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={
          closeNewModal
        }
      >
        <View
          style={styles.modalShade}
        >
          <View
            style={[
              styles.modalCard,
              isDark &&
                styles.modalDark,
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
                  isDark &&
                    styles.darkText,
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
                  color={
                    isDark
                      ? '#F4F2EE'
                      : '#5A5751'
                  }
                  size={21}
                />
              </Pressable>
            </View>

            {error && (
              <Text
                style={[
                  styles.error,
                  {
                    marginBottom: 4,
                  },
                ]}
              >
                {error}
              </Text>
            )}

            <Text
              style={[
                styles.label,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              Goal name
            </Text>

            <TextInput
              value={title}
              onChangeText={
                setTitle
              }
              placeholder="e.g. Emergency fund"
              placeholderTextColor="#9B978F"
              style={[
                styles.input,
                isDark &&
                  styles.inputDark,
              ]}
              autoFocus
              editable={!saving}
            />

            <Text
              style={[
                styles.label,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              Target amount (
              {currency_code})
            </Text>

            <TextInput
              value={target}
              onChangeText={
                setTarget
              }
              placeholder="50000"
              placeholderTextColor="#9B978F"
              style={[
                styles.input,
                isDark &&
                  styles.inputDark,
              ]}
              keyboardType="decimal-pad"
              editable={!saving}
            />

            <Text
              style={[
                styles.label,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              Due date (optional)
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

            <Pressable
              disabled={saving}
              onPress={
                saveGoal
              }
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor:
                    accentForeground,
                },
                saving && {
                  opacity: 0.55,
                },
                pressed &&
                  !saving && {
                    opacity: 0.8,
                  },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  {
                    color:
                      onAccent,
                  },
                ]}
              >
                {saving
                  ? 'Saving...'
                  : 'Create goal'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Add Contribution Modal */}
      <Modal
        visible={!!contribFor}
        transparent
        animationType="slide"
        onRequestClose={
          closeContribution
        }
      >
        <View
          style={styles.modalShade}
        >
          <View
            style={[
              styles.modalCard,
              isDark &&
                styles.modalDark,
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
                  isDark &&
                    styles.darkText,
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
                  color={
                    isDark
                      ? '#F4F2EE'
                      : '#5A5751'
                  }
                  size={21}
                />
              </Pressable>
            </View>

            {error && (
              <Text
                style={[
                  styles.error,
                  {
                    marginBottom: 4,
                  },
                ]}
              >
                {error}
              </Text>
            )}

            <Text
              style={[
                styles.label,
                isDark &&
                  styles.darkMuted,
              ]}
            >
              Amount ({currency_code})
            </Text>

            <TextInput
              value={
                contribAmount
              }
              onChangeText={
                setContribAmount
              }
              placeholder="500"
              placeholderTextColor="#9B978F"
              style={[
                styles.input,
                isDark &&
                  styles.inputDark,
              ]}
              keyboardType="decimal-pad"
              autoFocus
              editable={
                !contributing
              }
            />

            <Pressable
              disabled={
                contributing
              }
              onPress={
                addContribution
              }
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor:
                    accentForeground,
                },
                contributing && {
                  opacity: 0.55,
                },
                pressed &&
                  !contributing && {
                    opacity: 0.8,
                  },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  {
                    color:
                      onAccent,
                  },
                ]}
              >
                {contributing
                  ? 'Adding...'
                  : 'Add'}
              </Text>
            </Pressable>
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
    backgroundColor: '#FBFAF8',
  },

  safeDark: {
    backgroundColor: '#090909',
  },

  content: {
    padding: 16,
    paddingBottom: 100,
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

  goalList: {
    gap: 12,
  },

  goalCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    padding: 16,
  },

  goalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },

  goalIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  goalCopy: {
    flex: 1,
    gap: 3,
  },

  goalTitle: {
    fontFamily: FONT_MED,
    fontSize: 15,
    color: '#27241F',
  },

  goalMeta: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#908B83',
  },

  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F0EEEA',
    overflow: 'hidden',
  },

  trackDark: {
    backgroundColor: '#292929',
  },

  fill: {
    height: 8,
    borderRadius: 4,
  },

  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },

  progressText: {
    fontFamily: FONT,
    fontSize: 11,
    color: '#908B83',
  },

  contribBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 12,
  },

  contribText: {
    fontFamily: FONT_SEMI,
    fontSize: 13,
  },

  empty: {
    paddingVertical: 50,
    alignItems: 'center',
    paddingHorizontal: 25,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  emptyTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 17,
    color: '#27241F',
    marginBottom: 6,
  },

  emptyText: {
    fontFamily: FONT,
    fontSize: 14,
    color: '#908B83',
    textAlign: 'center',
  },

  fab: {
    position: 'absolute',
    bottom: 24,
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

  modalShade: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor:
      'rgba(0,0,0,0.45)',
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
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  modalTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    color: '#27241F',
    flex: 1,
    marginRight: 12,
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