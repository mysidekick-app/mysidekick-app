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
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react-native';

import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { CurrencyPickerModal } from '@/components/CurrencyPickerModal';
import { formatMoney } from '@/components/currencies';

type Split = {
  id: string;
  title: string;
  total_amount: number;
  owed_to: string;
  owed_by: string;
  peer_names: string[];
  share_amount: number;
  created_at: string;
};

type Friend = {
  id: string;
  display_name: string;
  username: string;
};

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

export default function SplitScreen() {
  const {
    accentForeground,
    isDark,
    onAccent,
    currency_code,
    updateSettings,
  } = useApp();

  const [splits, setSplits] = useState<Split[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [paidBy, setPaidBy] = useState<'me' | 'someone'>('me');
  const [paidByName, setPaidByName] = useState('');

  // Friend search / selection
  const [friendSearch, setFriendSearch] = useState('');
  const [whoOwes, setWhoOwes] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);

  const fmt = (value: number) => formatMoney(value, currency_code);

  /*
   * Load splits and friends.
   *
   * IMPORTANT:
   * finance_splits has user_id and RLS is based on auth.uid().
   * We therefore get the current user first and explicitly use
   * that user_id when reading and creating splits.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError('You must be signed in to load your splits.');
        setLoading(false);
        return;
      }

      // Load the user's splits.
      const {
        data: splitRows,
        error: splitErr,
      } = await supabase
        .from('finance_splits')
        .select(
          'id, title, total_amount, owed_to, owed_by, peer_names, share_amount, created_at'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (splitErr) {
        console.error('finance_splits load error:', splitErr);
        setError(
          `Your splits could not be loaded. ${splitErr.message || ''}`.trim()
        );
      } else {
        setSplits((splitRows ?? []) as Split[]);
      }

      // Load accepted friendships.
      const {
        data: friendRows,
        error: friendErr,
      } = await supabase
        .from('social_friends')
        .select('id, friend_id')
        .eq('status', 'accepted');

      if (friendErr) {
        console.error('social_friends load error:', friendErr);
        setFriends([]);
        setLoading(false);
        return;
      }

      const friendIds = (friendRows ?? [])
        .map((friend) => friend.friend_id)
        .filter(Boolean);

      if (friendIds.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }

      const {
        data: profiles,
        error: profileErr,
      } = await supabase
        .from('social_profiles')
        .select('id, display_name, username')
        .in('id', friendIds)
        .order('username', { ascending: true });

      if (profileErr) {
        console.error('social_profiles load error:', profileErr);
        setFriends([]);
      } else {
        setFriends((profiles ?? []) as Friend[]);
      }
    } catch (err) {
      console.error('Split load error:', err);
      setError('Your splits could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setTitle('');
    setTotalAmount('');
    setPaidBy('me');
    setPaidByName('');
    setFriendSearch('');
    setWhoOwes([]);
    setError(null);
    setModalOpen(true);
  };

  const toggleFriend = (friendId: string) => {
    setWhoOwes((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId]
    );
  };

  /*
   * Friends shown underneath the username search box.
   *
   * Search works against both username and display name.
   */
  const filteredFriends = friends.filter((friend) => {
    const search = friendSearch.trim().toLowerCase();

    if (!search) {
      return true;
    }

    return (
      friend.username?.toLowerCase().includes(search) ||
      friend.display_name?.toLowerCase().includes(search)
    );
  });

  const selectedFriends = friends.filter((friend) =>
    whoOwes.includes(friend.id)
  );

  const saveSplit = async () => {
    setError(null);

    const total = parseFloat(totalAmount);

    if (!title.trim()) {
      setError('Give this split a title.');
      return;
    }

    if (!total || total <= 0) {
      setError('Enter the total amount.');
      return;
    }

    if (paidBy === 'someone' && !paidByName.trim()) {
      setError("Enter the person's name.");
      return;
    }

    if (whoOwes.length === 0) {
      setError('Search for and select at least one friend who owes.');
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError('You must be signed in to save a split.');
      return;
    }

    const owedTo = paidBy === 'me' ? 'Me' : paidByName.trim();

    const peerNames = selectedFriends.map(
      (friend) => friend.display_name || friend.username
    );

    /*
     * The split is divided between you and everyone selected.
     */
    const share = total / (peerNames.length + 1);

    setSaving(true);

    try {
      /*
       * IMPORTANT:
       * user_id is required by the finance_splits table and its
       * INSERT RLS policy requires auth.uid() = user_id.
       */
      const {
        data,
        error: saveErr,
      } = await supabase
        .from('finance_splits')
        .insert({
          user_id: user.id,
          title: title.trim(),
          total_amount: total,
          owed_to: owedTo,
          owed_by: peerNames.join(', '),
          peer_names: peerNames,
          share_amount: share,
        })
        .select(
          'id, title, total_amount, owed_to, owed_by, peer_names, share_amount, created_at'
        )
        .single();

      if (saveErr || !data) {
        console.error('finance_splits save error:', saveErr);

        setError(
          `The split could not be saved. ${
            saveErr?.message || ''
          }`.trim()
        );

        setSaving(false);
        return;
      }

      const saved = data as Split;

      setSplits((current) => [saved, ...current]);

      /*
       * Send split pings.
       *
       * These are intentionally non-blocking. If the notification
       * tables have their own RLS restrictions, the split itself
       * has already been saved successfully.
       */
      const message = `Split reminder: ${saved.title} - ${fmt(
        saved.share_amount
      )} owed to ${saved.owed_to}`;

      if (peerNames.length > 0) {
        const { error: pingError } = await supabase
          .from('finance_split_pings')
          .insert(
            peerNames.map((name) => ({
              split_id: saved.id,
              peer_name: name,
              message,
            }))
          );

        if (pingError) {
          console.warn('Split ping error:', pingError);
        }
      }

      /*
       * Also send a social message to each selected friend.
       * Again, failure here should not undo the saved split.
       */
      if (selectedFriends.length > 0) {
        const results = await Promise.all(
          selectedFriends.map((friend) =>
            supabase.from('social_messages').insert({
              conversation_id: `direct:${friend.id}`,
              sender_id: user.id,
              content: message,
            })
          )
        );

        results.forEach((result) => {
          if (result.error) {
            console.warn('Social message error:', result.error);
          }
        });
      }

      setModalOpen(false);
      setFriendSearch('');
      setWhoOwes([]);
    } catch (err) {
      console.error('Save split error:', err);
      setError('The split could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const previous = splits;

    setSplits((current) => current.filter((split) => split.id !== id));

    const { error: deleteError } = await supabase
      .from('finance_splits')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Delete split error:', deleteError);
      setError('Could not delete the split.');
      setSplits(previous);
    }
  };

  const youOwe = splits
    .filter(
      (split) =>
        split.owed_by.toLowerCase().includes('me') ||
        split.owed_by.toLowerCase().includes('you')
    )
    .reduce((sum, split) => sum + Number(split.share_amount), 0);

  const owedToYou = splits
    .filter(
      (split) =>
        split.owed_to.toLowerCase() === 'me' ||
        split.owed_to.toLowerCase() === 'you'
    )
    .reduce((sum, split) => sum + Number(split.share_amount), 0);

  return (
    <SafeAreaView
      style={[styles.safe, isDark && styles.safeDark]}
    >
      <PageHeader
        title="Split"
        financeMode
        onSetCurrency={() => setCurrencyOpen(true)}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.summaryRow}>
          <View
            style={[
              styles.summaryCard,
              isDark && styles.cardDark,
              { flex: 1 },
            ]}
          >
            <View
              style={[
                styles.summaryIcon,
                { backgroundColor: accentForeground },
              ]}
            >
              <ArrowUpRight color={onAccent} size={16} />
            </View>

            <Text
              style={[
                styles.summaryLabel,
                isDark && styles.darkMuted,
              ]}
            >
              You owe
            </Text>

            <Text
              style={[
                styles.summaryValue,
                { color: '#E05252' },
              ]}
            >
              {fmt(youOwe)}
            </Text>
          </View>

          <View
            style={[
              styles.summaryCard,
              isDark && styles.cardDark,
              { flex: 1 },
            ]}
          >
            <View
              style={[
                styles.summaryIcon,
                { backgroundColor: accentForeground },
              ]}
            >
              <ArrowDownLeft color={onAccent} size={16} />
            </View>

            <Text
              style={[
                styles.summaryLabel,
                isDark && styles.darkMuted,
              ]}
            >
              Owed to you
            </Text>

            <Text
              style={[
                styles.summaryValue,
                { color: '#3E9D66' },
              ]}
            >
              {fmt(owedToYou)}
            </Text>
          </View>
        </View>

        {loading ? (
          <Text
            style={[
              styles.emptyText,
              isDark && styles.darkMuted,
            ]}
          >
            Loading...
          </Text>
        ) : splits.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={[
                styles.emptyText,
                isDark && styles.darkMuted,
              ]}
            >
              No splits yet. Tap + to split a bill with peers.
            </Text>
          </View>
        ) : (
          <View style={styles.splitList}>
            {splits.map((split) => {
              const youAreOwer =
                split.owed_by.toLowerCase().includes('me') ||
                split.owed_by.toLowerCase().includes('you');

              return (
                <View
                  key={split.id}
                  style={[
                    styles.splitCard,
                    isDark && styles.cardDark,
                  ]}
                >
                  <View style={styles.splitTop}>
                    <View
                      style={[
                        styles.splitIcon,
                        {
                          backgroundColor: accentForeground,
                        },
                      ]}
                    >
                      <UsersRound
                        color={onAccent}
                        size={18}
                      />
                    </View>

                    <View style={styles.splitCopy}>
                      <Text
                        style={[
                          styles.splitTitle,
                          isDark && styles.darkText,
                        ]}
                        numberOfLines={1}
                      >
                        {split.title}
                      </Text>

                      <Text
                        style={[
                          styles.splitMeta,
                          isDark && styles.darkMuted,
                        ]}
                      >
                        {split.owed_by} owes {split.owed_to}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => remove(split.id)}
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

                  <View style={styles.splitDetails}>
                    <View style={styles.detailBlock}>
                      <Text
                        style={[
                          styles.detailLabel,
                          isDark && styles.darkMuted,
                        ]}
                      >
                        Total
                      </Text>

                      <Text
                        style={[
                          styles.detailValue,
                          isDark && styles.darkText,
                        ]}
                      >
                        {fmt(Number(split.total_amount))}
                      </Text>
                    </View>

                    <View style={styles.detailBlock}>
                      <Text
                        style={[
                          styles.detailLabel,
                          isDark && styles.darkMuted,
                        ]}
                      >
                        Your share
                      </Text>

                      <Text
                        style={[
                          styles.detailValue,
                          {
                            color: youAreOwer
                              ? '#E05252'
                              : '#3E9D66',
                          },
                        ]}
                      >
                        {fmt(Number(split.share_amount))}
                      </Text>
                    </View>

                    <View style={styles.detailBlock}>
                      <Text
                        style={[
                          styles.detailLabel,
                          isDark && styles.darkMuted,
                        ]}
                      >
                        Split with
                      </Text>

                      <Text
                        style={[
                          styles.detailValue,
                          isDark && styles.darkText,
                        ]}
                        numberOfLines={1}
                      >
                        {split.peer_names.join(', ')}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={openNew}
        style={[
          styles.fab,
          { backgroundColor: accentForeground },
        ]}
        hitSlop={12}
      >
        <Plus
          color={onAccent}
          size={26}
          strokeWidth={2.6}
        />
      </Pressable>

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
                New split
              </Text>

              <Pressable
                onPress={() => setModalOpen(false)}
              >
                <X
                  color={
                    isDark ? '#F4F2EE' : '#5A5751'
                  }
                  size={21}
                />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingBottom: 8,
              }}
            >
              <Text
                style={[
                  styles.label,
                  isDark && styles.darkMuted,
                ]}
              >
                Bill title
              </Text>

              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Dinner, Vacation"
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
                Bill amount ({currency_code})
              </Text>

              <TextInput
                value={totalAmount}
                onChangeText={setTotalAmount}
                placeholder="3000"
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
                Who is owed?
              </Text>

              <View style={styles.chipRow}>
                <Pressable
                  onPress={() => setPaidBy('me')}
                  style={[
                    styles.chip,
                    paidBy === 'me' && {
                      backgroundColor:
                        accentForeground,
                      borderColor:
                        accentForeground,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isDark && styles.darkMuted,
                      paidBy === 'me' && {
                        color: onAccent,
                        fontFamily: FONT_SEMI,
                      },
                    ]}
                  >
                    I paid the bill
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setPaidBy('someone')}
                  style={[
                    styles.chip,
                    paidBy === 'someone' && {
                      backgroundColor:
                        accentForeground,
                      borderColor:
                        accentForeground,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isDark && styles.darkMuted,
                      paidBy === 'someone' && {
                        color: onAccent,
                        fontFamily: FONT_SEMI,
                      },
                    ]}
                  >
                    Someone else paid
                  </Text>
                </Pressable>
              </View>

              {paidBy === 'someone' && (
                <>
                  <Text
                    style={[
                      styles.label,
                      isDark && styles.darkMuted,
                    ]}
                  >
                    Person's name
                  </Text>

                  <TextInput
                    value={paidByName}
                    onChangeText={setPaidByName}
                    placeholder="Who paid the bill?"
                    placeholderTextColor="#9B978F"
                    style={[
                      styles.input,
                      isDark && styles.inputDark,
                    ]}
                  />
                </>
              )}

              {/* WHO OWES */}
              <Text
                style={[
                  styles.label,
                  isDark && styles.darkMuted,
                ]}
              >
                Who owes?
              </Text>

              <TextInput
                value={friendSearch}
                onChangeText={setFriendSearch}
                placeholder="Search friends by username"
                placeholderTextColor="#9B978F"
                style={[
                  styles.input,
                  isDark && styles.inputDark,
                ]}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Selected friends */}
              {selectedFriends.length > 0 && (
                <View style={styles.selectedSection}>
                  <Text
                    style={[
                      styles.selectedLabel,
                      isDark && styles.darkMuted,
                    ]}
                  >
                    Selected
                  </Text>

                  <View style={styles.chipRow}>
                    {selectedFriends.map((friend) => (
                      <Pressable
                        key={friend.id}
                        onPress={() =>
                          toggleFriend(friend.id)
                        }
                        style={[
                          styles.chip,
                          {
                            backgroundColor:
                              accentForeground,
                            borderColor:
                              accentForeground,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            {
                              color: onAccent,
                              fontFamily: FONT_SEMI,
                            },
                          ]}
                        >
                          @{friend.username}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Search results */}
              <View style={styles.friendResults}>
                {filteredFriends.length === 0 ? (
                  <Text
                    style={[
                      styles.emptyFriendText,
                      isDark && styles.darkMuted,
                    ]}
                  >
                    {friendSearch.trim()
                      ? 'No friends found.'
                      : 'No friends yet. Add friends in chat first.'}
                  </Text>
                ) : (
                  filteredFriends.map((friend) => {
                    const selected = whoOwes.includes(
                      friend.id
                    );

                    return (
                      <Pressable
                        key={friend.id}
                        onPress={() =>
                          toggleFriend(friend.id)
                        }
                        style={[
                          styles.friendRow,
                          isDark &&
                            styles.friendRowDark,
                          selected &&
                            styles.friendRowSelected,
                        ]}
                      >
                        <View style={styles.friendAvatar}>
                          <Text
                            style={[
                              styles.friendAvatarText,
                              {
                                color: onAccent,
                              },
                            ]}
                          >
                            {(friend.display_name ||
                              friend.username ||
                              '?')
                              .charAt(0)
                              .toUpperCase()}
                          </Text>
                        </View>

                        <View
                          style={styles.friendCopy}
                        >
                          <Text
                            style={[
                              styles.friendName,
                              isDark &&
                                styles.darkText,
                            ]}
                          >
                            {friend.display_name ||
                              friend.username}
                          </Text>

                          <Text
                            style={[
                              styles.friendUsername,
                              isDark &&
                                styles.darkMuted,
                            ]}
                          >
                            @{friend.username}
                          </Text>
                        </View>

                        {selected && (
                          <Text
                            style={[
                              styles.selectedCheck,
                              {
                                color:
                                  accentForeground,
                              },
                            ]}
                          >
                            ✓
                          </Text>
                        )}
                      </Pressable>
                    );
                  })
                )}
              </View>
            </ScrollView>

            <Pressable
              disabled={saving}
              onPress={saveSplit}
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
                {saving
                  ? 'Saving...'
                  : 'Save & ping peers'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <CurrencyPickerModal
        visible={currencyOpen}
        currentCode={currency_code}
        onSelect={(code) =>
          updateSettings({ currency_code: code })
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

  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },

  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    padding: 16,
    gap: 6,
  },

  cardDark: {
    backgroundColor: '#111',
    borderColor: '#2A2A2A',
  },

  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryLabel: {
    fontFamily: FONT_SEMI,
    fontSize: 12,
    color: '#77746E',
  },

  summaryValue: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
  },

  splitList: {
    gap: 12,
  },

  splitCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    padding: 16,
  },

  splitTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },

  splitIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  splitCopy: {
    flex: 1,
    gap: 3,
  },

  splitTitle: {
    fontFamily: FONT_MED,
    fontSize: 15,
    color: '#27241F',
  },

  splitMeta: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#908B83',
  },

  splitDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },

  detailBlock: {
    flex: 1,
  },

  detailLabel: {
    fontFamily: FONT,
    fontSize: 10,
    color: '#908B83',
    marginBottom: 3,
  },

  detailValue: {
    fontFamily: FONT_SEMI,
    fontSize: 13,
    color: '#27241F',
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

  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
    maxHeight: '92%',
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
    backgroundColor: '#FFF',
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

  chipText: {
    fontFamily: FONT,
    fontSize: 13,
    color: '#77746E',
  },

  /*
   * Selected friend section
   */
  selectedSection: {
    marginTop: 12,
  },

  selectedLabel: {
    fontFamily: FONT_MED,
    fontSize: 11,
    color: '#77746E',
    marginBottom: 7,
  },

  /*
   * Friend search results
   */
  friendResults: {
    marginTop: 10,
    gap: 6,
  },

  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    backgroundColor: '#FFF',
  },

  friendRowDark: {
    backgroundColor: '#1E1E1E',
    borderColor: '#363636',
  },

  friendRowSelected: {
    borderColor: '#D8D4CC',
  },

  friendAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#77746E',
    marginRight: 11,
  },

  friendAvatarText: {
    fontFamily: FONT_SEMI,
    fontSize: 15,
  },

  friendCopy: {
    flex: 1,
    gap: 2,
  },

  friendName: {
    fontFamily: FONT_MED,
    fontSize: 13,
    color: '#27241F',
  },

  friendUsername: {
    fontFamily: FONT,
    fontSize: 11,
    color: '#908B83',
  },

  selectedCheck: {
    fontFamily: FONT_BOLD,
    fontSize: 19,
    marginRight: 5,
  },

  emptyFriendText: {
    fontFamily: FONT,
    fontSize: 13,
    color: '#908B83',
    textAlign: 'center',
    paddingVertical: 12,
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