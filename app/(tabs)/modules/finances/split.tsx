import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Pencil,
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
import {
  ensureDirectConversation,
  sendChatMessage,
} from '@/app/(tabs)/chat/chatHelpers';

type Split = {
  id: string;
  title: string;
  total_amount: number;
  owed_to: string;
  user_id: string;
  peer_user_ids?: string[] | null;
  owed_by: string;
  peer_names: string[];
  share_amount: number;
  created_at: string;
  paid_names?: string[] | null;
  split_method?: 'equal' | 'custom' | null;
  custom_amounts?: { id: string; name: string; amount: number }[] | null;
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [payerNames, setPayerNames] = useState<Record<string, string>>({});
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedSplit, setSelectedSplit] = useState<Split | null>(null);
  const [paidNames, setPaidNames] = useState<string[]>([]);
  const [savingPaidStatus, setSavingPaidStatus] = useState(false);
  const [editingSplitId, setEditingSplitId] = useState<string | null>(null);
  const [splitMethod, setSplitMethod] = useState<'equal' | 'custom'>('equal');
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [editingPaidNames, setEditingPaidNames] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [totalAmount, setTotalAmount] = useState('');

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

      setCurrentUserId(user.id);

      // Load bills created by this user plus bills where this user is a participant.
      const {
        data: splitRows,
        error: splitErr,
      } = await supabase
        .from('finance_splits')
        .select(
          'id, user_id, title, total_amount, owed_to, owed_by, peer_names, peer_user_ids, share_amount, created_at, paid_names, split_method, custom_amounts'
        )
        .or(`user_id.eq.${user.id},peer_user_ids.cs.{${user.id}}`)
        .order('created_at', { ascending: false });

      if (splitErr) {
        console.error('finance_splits load error:', splitErr);
        setError(
          `Your splits could not be loaded. ${splitErr.message || ''}`.trim()
        );
      } else {
        const loadedSplits = (splitRows ?? []) as Split[];
        setSplits(loadedSplits);

        const creatorIds = [...new Set(loadedSplits.map((split) => split.user_id).filter((id) => id && id !== user.id))];
        if (creatorIds.length > 0) {
          const { data: creatorProfiles } = await supabase
            .from('social_profiles')
            .select('user_id, display_name, username')
            .in('user_id', creatorIds);

          const names: Record<string, string> = {};
          (creatorProfiles ?? []).forEach((profile: any) => {
            names[profile.user_id] = profile.display_name || profile.username || 'Peer';
          });
          setPayerNames(names);
        } else {
          setPayerNames({});
        }
      }

      // Use the same friendship system as Chat.
      //
      // Chat uses the `friendships` table with:
      //   user_id
      //   friend_user_id
      //
      // We check both sides because either person can be stored
      // as the first user in the friendship row.
      const {
        data: friendshipRows,
        error: friendshipError,
      } = await supabase
        .from('friendships')
        .select('user_id, friend_user_id')
        .or(`user_id.eq.${user.id},friend_user_id.eq.${user.id}`);

      if (friendshipError) {
        console.error(
          'LOAD SPLIT FRIENDSHIPS ERROR:',
          friendshipError
        );
        setFriends([]);
        setLoading(false);
        return;
      }

      const friendIds: string[] = [
        ...new Set<string>(
          (friendshipRows ?? [])
            .map(
              (row: {
                user_id: string;
                friend_user_id: string;
              }) =>
                row.user_id === user.id
                  ? row.friend_user_id
                  : row.user_id
            )
            .filter(Boolean)
        ),
      ];

      if (!friendIds.length) {
        setFriends([]);
        setLoading(false);
        return;
      }

      // social_profiles stores the profile owner in `user_id`.
      // This is also how Chat loads the user's connected friends.
      const {
        data: profiles,
        error: profileErr,
      } = await supabase
        .from('social_profiles')
        .select('user_id, display_name, username')
        .in('user_id', friendIds)
        .order('username', { ascending: true });

      if (profileErr) {
        console.error(
          'LOAD SPLIT FRIEND PROFILES ERROR:',
          profileErr
        );
        setFriends([]);
      } else {
        setFriends(
          (profiles ?? []).map((profile: any) => ({
            id: profile.user_id,
            display_name: profile.display_name ?? '',
            username: profile.username ?? '',
          })) as Friend[]
        );
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
    setEditingSplitId(null);
    setTitle('');
    setTotalAmount('');
    setFriendSearch('');
    setWhoOwes([]);
    setSplitMethod('equal');
    setCustomAmounts({});
    setError(null);
    setModalOpen(true);
  };

  const editSplit = (split: Split) => {
    setEditingPaidNames(split.paid_names ?? []);
    setSelectedSplit(null);
    setEditingSplitId(split.id);
    setTitle(split.title);
    setTotalAmount(String(split.total_amount));
    setFriendSearch('');

    const selectedIds = split.peer_user_ids?.length
      ? split.peer_user_ids.filter((id) => id !== split.user_id)
      : friends
          .filter((friend) => split.peer_names.includes(friend.display_name || friend.username))
          .map((friend) => friend.id);
    setWhoOwes(selectedIds);

    const method = split.split_method === 'custom' ? 'custom' : 'equal';
    setSplitMethod(method);

    const amounts: Record<string, string> = {};
    if (split.custom_amounts?.length) {
      split.custom_amounts.forEach((item) => {
        amounts[item.id] = String(item.amount);
      });
    } else {
      const participantCount = split.owed_by
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean).length || 1;
      const equal = Number(split.total_amount) / participantCount;
      amounts[split.user_id] = String(equal);
      split.peer_names.forEach((name) => {
        const friend = friends.find((item) => (item.display_name || item.username) === name);
        if (friend) amounts[friend.id] = String(equal);
      });
    }
    setCustomAmounts(amounts);
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

    if (whoOwes.length === 0) {
      setError('Search for and select at least one friend who owes.');
      return;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError('You must be signed in to save a split.');
      return;
    }

    const owedTo = 'Me';
    const peerNames = selectedFriends.map((friend) => friend.display_name || friend.username);
    const participantNames = ['Me', ...peerNames];
    const peerUserIds = selectedFriends.map((friend) => friend.id);

    const amountRows: { id: string; name: string; amount: number }[] = [];
    if (splitMethod === 'equal') {
      const equal = total / participantNames.length;
      amountRows.push({ id: user.id, name: 'Me', amount: equal });
      selectedFriends.forEach((friend) => {
        amountRows.push({
          id: friend.id,
          name: friend.display_name || friend.username,
          amount: equal,
        });
      });
    } else {
      amountRows.push({
        id: user.id,
        name: 'Me',
        amount: Number(customAmounts[user.id] || customAmounts.me || 0),
      });
      selectedFriends.forEach((friend) => {
        amountRows.push({
          id: friend.id,
          name: friend.display_name || friend.username,
          amount: Number(customAmounts[friend.id] || 0),
        });
      });

      if (amountRows.some((item) => !Number.isFinite(item.amount) || item.amount < 0)) {
        setError('Enter a valid amount for everyone in the split.');
        return;
      }

      const assigned = amountRows.reduce((sum, item) => sum + item.amount, 0);
      if (Math.abs(assigned - total) > 0.01) {
        setError(`Custom amounts must add up to ${fmt(total)}.`);
        return;
      }
    }

    const myAmount = amountRows.find((item) => item.id === user.id)?.amount ?? 0;
    const owedByNames = participantNames;

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        peer_user_ids: peerUserIds,
        title: title.trim(),
        total_amount: total,
        owed_to: owedTo,
        owed_by: owedByNames.join(', '),
        peer_names: peerNames,
        share_amount: myAmount,
        paid_names: editingSplitId ? editingPaidNames : [],
        split_method: splitMethod,
        custom_amounts: amountRows,
      };

      let data: any = null;
      let saveErr: any = null;

      if (editingSplitId) {
        const result = await supabase
          .from('finance_splits')
          .update(payload)
          .eq('id', editingSplitId)
          .select('id, user_id, title, total_amount, owed_to, owed_by, peer_names, peer_user_ids, share_amount, created_at, paid_names, split_method, custom_amounts')
          .single();
        data = result.data;
        saveErr = result.error;
      } else {
        const result = await supabase
          .from('finance_splits')
          .insert(payload)
          .select('id, user_id, title, total_amount, owed_to, owed_by, peer_names, peer_user_ids, share_amount, created_at, paid_names, split_method, custom_amounts')
          .single();
        data = result.data;
        saveErr = result.error;
      }

      if (saveErr || !data) {
        console.error('finance_splits save error:', saveErr);
        setError(`The split could not be saved. ${saveErr?.message || ''}`.trim());
        return;
      }

      const saved = data as Split;
      setSplits((current) =>
        editingSplitId
          ? current.map((split) => (split.id === saved.id ? saved : split))
          : [saved, ...current]
      );

      // Only a new split sends chat messages. Editing should not spam peers.
      if (!editingSplitId) {
        for (const friend of selectedFriends) {
          const peerAmount = amountRows.find((item) => item.id === friend.id)?.amount ?? 0;
          const message = `You owe ${owedTo} ${fmt(peerAmount)} for ${saved.title}`;
          try {
            const conversation = await ensureDirectConversation(user.id, friend.id);
            if (conversation.error || !conversation.id) continue;
            const messageResult = await sendChatMessage(conversation.id, user.id, message);
            if (messageResult?.error) console.warn('Split peer message error:', messageResult.error);
          } catch (messageError) {
            console.warn(`Could not message ${friend.display_name || friend.username} about split:`, messageError);
          }
        }
      }

      setModalOpen(false);
      setEditingSplitId(null);
      setFriendSearch('');
      setWhoOwes([]);
      setCustomAmounts({});
      setEditingPaidNames([]);
    } catch (err) {
      console.error('Save split error:', err);
      setError('The split could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const openSplit = (split: Split) => {
    setSelectedSplit(split);
    setPaidNames(split.paid_names ?? []);
  };

  const closeSplit = () => {
    setSelectedSplit(null);
    setPaidNames([]);
    setSavingPaidStatus(false);
  };

  const togglePaid = async (name: string) => {
    if (!selectedSplit || savingPaidStatus) return;

    const nextPaid = paidNames.includes(name)
      ? paidNames.filter((item) => item !== name)
      : [...paidNames, name];

    setPaidNames(nextPaid);
    setSavingPaidStatus(true);

    const { data, error } = await supabase.rpc(
      'mark_finance_split_paid',
      {
        p_split_id: selectedSplit.id,
        p_paid_names: nextPaid,
      }
    );

    if (error || !data) {
      console.error('Update split paid status error:', error);
      setPaidNames(paidNames);
      setError('Could not update payment status.');
    } else {
      const updated = data as Split;
      setSelectedSplit(updated);
      setSplits((current) =>
        current.map((split) =>
          split.id === updated.id ? updated : split
        )
      );
    }

    setSavingPaidStatus(false);
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

  const getParticipantAmounts = (split: Split) => {
    if (split.custom_amounts?.length) {
      return split.custom_amounts.reduce<Record<string, number>>((map, item) => {
        map[item.name] = Number(item.amount);
        return map;
      }, {});
    }

    const names = split.owed_by.split(',').map((name) => name.trim()).filter(Boolean);
    const equal = names.length ? Number(split.total_amount) / names.length : 0;
    return names.reduce<Record<string, number>>((map, name) => {
      map[name] = equal;
      return map;
    }, {});
  };

  const getAmountForUser = (split: Split, userId: string) => {
    const row = split.custom_amounts?.find((item) => item.id === userId);
    if (row) return Number(row.amount);

    const participantIds = [split.user_id, ...(split.peer_user_ids ?? [])];
    if (participantIds.includes(userId)) {
      return Number(split.total_amount) / Math.max(participantIds.length, 1);
    }

    // Backward compatibility for older bills that did not store user IDs.
    if (userId === currentUserId && split.user_id === currentUserId) {
      return Number(split.share_amount);
    }

    return 0;
  };

  const outstandingForName = (split: Split, name: string) => {
    const amount = getParticipantAmounts(split)[name] ?? 0;
    return (split.paid_names ?? []).includes(name) ? 0 : amount;
  };

  const getDisplayParticipants = (split: Split) => {
    const incoming = isIncoming(split);

    if (!incoming) {
      return [
        { displayName: 'Me', sourceName: 'Me' },
        ...split.peer_names.map((name) => ({ displayName: name, sourceName: name })),
      ];
    }

    if (split.custom_amounts?.length) {
      return split.custom_amounts.map((item) => ({
        displayName: item.id === currentUserId
          ? 'Me'
          : item.id === split.user_id
            ? getPayerName(split)
            : item.name,
        sourceName: item.name,
      }));
    }

    return split.owed_by
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({
        displayName: name === 'Me' ? getPayerName(split) : name,
        sourceName: name,
      }));
  };

  const isIncoming = (split: Split) => split.user_id !== currentUserId;

  const getPayerName = (split: Split) => {
    if (!isIncoming(split)) return 'Me';
    return payerNames[split.user_id] || split.owed_to || 'Peer';
  };

  const getMyOutstanding = (split: Split) => {
    if (!currentUserId) return 0;

    const amountRow = split.custom_amounts?.find((item) => item.id === currentUserId);
    const amount = amountRow
      ? Number(amountRow.amount)
      : getAmountForUser(split, currentUserId);

    const myName = amountRow?.name || 'Me';
    const paid = (split.paid_names ?? []).includes(myName) ||
      (myName !== 'Me' && (split.paid_names ?? []).includes('Me'));

    return paid ? 0 : amount;
  };

  const youOwe = splits
    .filter((split) => isIncoming(split))
    .reduce((sum, split) => sum + getMyOutstanding(split), 0);

  const owedToYou = splits
    .filter((split) => !isIncoming(split))
    .reduce((sum, split) => {
      return sum + split.peer_names.reduce((peerSum, name) => peerSum + outstandingForName(split, name), 0);
    }, 0);

  const billsYouOwe = splits.filter((split) => isIncoming(split));
  const billsOwedToYou = splits.filter((split) => !isIncoming(split));

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
          <View style={styles.splitSections}>
            {([
              ['Bills you owe', billsYouOwe],
              ['Bills owed to you', billsOwedToYou],
            ] as const).map(([sectionTitle, sectionSplits]) => (
              <View key={sectionTitle} style={styles.splitSection}>
                <Text
                  style={[
                    styles.sectionTitle,
                    isDark && styles.darkText,
                  ]}
                >
                  {sectionTitle}
                </Text>

                {sectionSplits.length === 0 ? (
                  <Text
                    style={[
                      styles.emptySectionText,
                      isDark && styles.darkMuted,
                    ]}
                  >
                    {sectionTitle === 'Bills you owe'
                      ? 'You have no outstanding bills.'
                      : 'No one owes you right now.'}
                  </Text>
                ) : (
                  <View style={styles.splitList}>
                    {sectionSplits.map((split) => {
                      const incoming = isIncoming(split);
                      const yourOutstanding = getMyOutstanding(split);
                      const payerName = getPayerName(split);

                      return (
                        <Pressable
                          key={split.id}
                          onPress={() => openSplit(split)}
                          style={[
                            styles.splitCard,
                            isDark && styles.cardDark,
                          ]}
                        >
                          <View style={styles.splitTop}>
                            <View
                              style={[
                                styles.splitIcon,
                                { backgroundColor: accentForeground },
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
                                {incoming
                                  ? `You owe ${payerName}`
                                  : `${split.peer_names.join(', ')} owe you`}
                              </Text>
                            </View>

                            {!incoming && (
                              <Pressable
                                onPress={() => remove(split.id)}
                                hitSlop={8}
                              >
                                <Trash2
                                  color={isDark ? '#5A5751' : '#C8C5BE'}
                                  size={16}
                                />
                              </Pressable>
                            )}
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
                                {incoming ? 'You owe' : 'Owed to you'}
                              </Text>
                              <Text
                                style={[
                                  styles.detailValue,
                                  { color: incoming ? '#E05252' : '#3E9D66' },
                                ]}
                              >
                                {fmt(incoming ? yourOutstanding : split.peer_names.reduce((sum, name) => sum + outstandingForName(split, name), 0))}
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
                              <View style={styles.peerNamesWrap}>
                                {getDisplayParticipants(split).map(({ displayName, sourceName }) => {
                                  const paid = (split.paid_names ?? []).includes(sourceName);
                                  return (
                                    <Text
                                      key={`${split.id}-${sourceName}`}
                                      style={[
                                        styles.detailValue,
                                        isDark && styles.darkText,
                                        paid && styles.paidNameCrossed,
                                      ]}
                                    >
                                      {displayName}
                                    </Text>
                                  );
                                })}
                              </View>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ))}
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardModal}
          >
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
                {editingSplitId ? 'Edit split' : 'New split'}
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
                Split method
              </Text>

              <View style={styles.chipRow}>
                {(['equal', 'custom'] as const).map((method) => (
                  <Pressable
                    key={method}
                    onPress={() => setSplitMethod(method)}
                    style={[
                      styles.chip,
                      splitMethod === method && {
                        backgroundColor: accentForeground,
                        borderColor: accentForeground,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isDark && styles.darkMuted,
                        splitMethod === method && {
                          color: onAccent,
                          fontFamily: FONT_SEMI,
                        },
                      ]}
                    >
                      {method === 'equal' ? 'Equal' : 'Custom'}
                    </Text>
                  </Pressable>
                ))}
              </View>

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

              {splitMethod === 'custom' && (
                <View style={styles.customAmountsSection}>
                  <Text
                    style={[
                      styles.selectedLabel,
                      isDark && styles.darkMuted,
                    ]}
                  >
                    Amount each person owes
                  </Text>

                  <View style={[styles.amountRow, isDark && styles.friendRowDark]}>
                    <Text style={[styles.amountPerson, isDark && styles.darkText]}>Me</Text>
                    <TextInput
                      value={customAmounts[currentUserId ?? ''] ?? customAmounts.me ?? ''}
                      onChangeText={(value) =>
                        setCustomAmounts((current) => ({ ...current, [currentUserId ?? 'me']: value }))
                      }
                      placeholder="0"
                      placeholderTextColor="#9B978F"
                      keyboardType="decimal-pad"
                      style={[styles.amountInput, isDark && styles.inputDark]}
                    />
                  </View>

                  {selectedFriends.map((friend) => (
                    <View
                      key={friend.id}
                      style={[styles.amountRow, isDark && styles.friendRowDark]}
                    >
                      <Text style={[styles.amountPerson, isDark && styles.darkText]}>
                        {friend.display_name || friend.username}
                      </Text>
                      <TextInput
                        value={customAmounts[friend.id] ?? ''}
                        onChangeText={(value) =>
                          setCustomAmounts((current) => ({ ...current, [friend.id]: value }))
                        }
                        placeholder="0"
                        placeholderTextColor="#9B978F"
                        keyboardType="decimal-pad"
                        style={[styles.amountInput, isDark && styles.inputDark]}
                      />
                    </View>
                  ))}

                  <Text style={[styles.paymentHint, isDark && styles.darkMuted]}>
                    The amounts must add up to {fmt(parseFloat(totalAmount) || 0)}.
                  </Text>
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
                  : editingSplitId
                    ? 'Save changes'
                    : 'Save & ping peers'}
              </Text>
            </Pressable>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={!!selectedSplit}
        transparent
        animationType="slide"
        onRequestClose={closeSplit}
      >
        <View style={styles.modalShade}>
          <View
            style={[
              styles.detailModalCard,
              isDark && styles.modalDark,
            ]}
          >
            {selectedSplit && (
              <>
                <View style={styles.modalTitleRow}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.modalTitle,
                        isDark && styles.darkText,
                      ]}
                    >
                      {selectedSplit.title}
                    </Text>
                    <Text
                      style={[
                        styles.detailModalSubtitle,
                        isDark && styles.darkMuted,
                      ]}
                    >
                      {fmt(Number(selectedSplit.total_amount))} · {isIncoming(selectedSplit)
                        ? `${getPayerName(selectedSplit)} paid`
                        : 'You paid'}
                    </Text>
                  </View>

                  <Pressable onPress={closeSplit} hitSlop={10}>
                    <X
                      color={isDark ? '#F4F2EE' : '#5A5751'}
                      size={21}
                    />
                  </Pressable>
                </View>

                <Text
                  style={[
                    styles.detailModalLabel,
                    isDark && styles.darkMuted,
                  ]}
                >
                  Who has paid?
                </Text>

                <View style={styles.paidList}>
                  {getDisplayParticipants(selectedSplit).map(({ displayName, sourceName }) => {
                      const paid = paidNames.includes(sourceName);

                      return (
                        <Pressable
                          key={`${selectedSplit.id}-${sourceName}`}
                          onPress={() => {
                            if (!selectedSplit || !isIncoming(selectedSplit)) {
                              togglePaid(sourceName);
                              return;
                            }

                            if (sourceName === (selectedSplit.custom_amounts?.find((item) => item.id === currentUserId)?.name || '')) {
                              togglePaid(sourceName);
                            }
                          }}
                          style={[
                            styles.paidRow,
                            isDark && styles.friendRowDark,
                          ]}
                        >
                          <View
                            style={[
                              styles.checkbox,
                              paid && {
                                backgroundColor: accentForeground,
                                borderColor: accentForeground,
                              },
                            ]}
                          >
                            {paid && (
                              <Check color={onAccent} size={15} strokeWidth={3} />
                            )}
                          </View>

                          <Text
                            style={[
                              styles.paidName,
                              isDark && styles.darkText,
                              paid && styles.paidNameCrossed,
                            ]}
                          >
                            {displayName}
                          </Text>

                          <Text
                            style={[
                              styles.paidAmount,
                              isDark && styles.darkMuted,
                              paid && styles.paidNameCrossed,
                            ]}
                          >
                            {fmt(
                              getParticipantAmounts(selectedSplit)[sourceName] ??
                                Number(selectedSplit.share_amount)
                            )}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                <Text
                  style={[
                    styles.paymentHint,
                    isDark && styles.darkMuted,
                  ]}
                >
                  {isIncoming(selectedSplit) ? 'Tick your share when you have paid it.' : 'Tick someone when their share has been paid. Their name will be crossed out on the split dashboard.'}
                </Text>

                <View style={styles.detailActionRow}>
                  {!isIncoming(selectedSplit) && (
                    <Pressable
                      onPress={() => editSplit(selectedSplit)}
                    style={[
                      styles.detailActionButton,
                      styles.editActionButton,
                      isDark && styles.editActionButtonDark,
                    ]}
                  >
                    <Pencil
                      color={isDark ? '#F4F2EE' : '#5A5751'}
                      size={16}
                    />
                    <Text
                      style={[
                        styles.saveText,
                        { color: isDark ? '#F4F2EE' : '#5A5751' },
                      ]}
                    >
                      Edit
                    </Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={closeSplit}
                    style={[
                      styles.detailActionButton,
                      { backgroundColor: accentForeground },
                    ]}
                  >
                    <Text
                      style={[styles.saveText, { color: onAccent }]}
                    >
                      Done
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
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

  splitSections: {
    gap: 24,
  },

  splitSection: {
    gap: 10,
  },

  sectionTitle: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
    color: '#27241F',
  },

  emptySectionText: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#908B83',
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
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  modalShade: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  keyboardModal: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  modalCard: {
    backgroundColor: '#FFF',
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 18,
    height: '88%',
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

  detailModalCard: {
    backgroundColor: '#FFF',
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 18,
    maxHeight: '78%',
  },

  detailModalSubtitle: {
    fontFamily: FONT,
    fontSize: 12,
    marginTop: 3,
    color: '#908B83',
  },

  detailModalLabel: {
    fontFamily: FONT_MED,
    fontSize: 13,
    color: '#77746E',
    marginTop: 8,
    marginBottom: 8,
  },

  paidList: {
    gap: 8,
  },

  paidRow: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C8C5BE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  paidName: {
    flex: 1,
    fontFamily: FONT_MED,
    fontSize: 14,
    color: '#27241F',
  },

  paidAmount: {
    fontFamily: FONT_SEMI,
    fontSize: 13,
    color: '#77746E',
  },

  paidNameCrossed: {
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },

  paymentHint: {
    fontFamily: FONT,
    fontSize: 11,
    lineHeight: 16,
    color: '#908B83',
    marginTop: 12,
  },

  peerNamesWrap: {
    gap: 2,
  },

  customAmountsSection: {
    marginTop: 12,
    gap: 8,
  },

  amountRow: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ECE9E4',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  amountPerson: {
    flex: 1,
    fontFamily: FONT_MED,
    fontSize: 13,
    color: '#27241F',
  },

  amountInput: {
    width: 105,
    borderWidth: 1,
    borderColor: '#E1DED8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: FONT,
    fontSize: 14,
    color: '#282724',
    backgroundColor: '#FFF',
    textAlign: 'right',
  },

  detailActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },

  detailActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },

  editActionButton: {
    backgroundColor: '#F3F1ED',
    borderWidth: 1,
    borderColor: '#E1DED8',
  },

  editActionButtonDark: {
    backgroundColor: '#222',
    borderColor: '#363636',
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