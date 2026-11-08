import { useCallback, useEffect, useState } from 'react';
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
import { router } from 'expo-router';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react-native';

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
const FONT_XB = 'Poppins-ExtraBold';

export default function SplitScreen() {
  const {
    accentForeground,
    isDark,
    onAccent,
    currency_code,
    updateSettings,
  } = useApp() as any;

  const pageBg = accentForeground || '#FDE047';

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
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  // Delete target state for neo-brutalist alert
  const [deleteSplitTarget, setDeleteSplitTarget] = useState<Split | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [totalAmount, setTotalAmount] = useState('');

  // Friend search / selection
  const [friendSearch, setFriendSearch] = useState('');
  const [whoOwes, setWhoOwes] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);

  const fmt = (value: number) => formatMoney(value, currency_code);

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

  const confirmDelete = async () => {
    if (!deleteSplitTarget) return;
    const split = deleteSplitTarget;
    setDeleteSplitTarget(null);

    const previous = splits;
    setSplits((current) => current.filter((item) => item.id !== split.id));

    const { error: deleteError } = await supabase
      .from('finance_splits')
      .delete()
      .eq('id', split.id);

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
      return split.peer_names.map((name) => ({
        displayName: name,
        sourceName: name,
      }));
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

      {/* HEADER matching savings, debts, and transactions modules */}
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
          SPLIT
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
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.summaryRow}>
          {/* You owe Summary Card */}
          <View style={[styles.cardContainer, { flex: 1 }]}>
            <View style={styles.cardShadowBackdrop} />
            <View style={[styles.summaryCard, { backgroundColor: '#FFFFFF', borderColor: '#000000' }]}>
              <View style={[styles.summaryIcon, { backgroundColor: pageBg, borderColor: '#000000' }]}>
                <ArrowUpRight color="#000000" size={16} strokeWidth={2.5} />
              </View>
              <Text style={styles.summaryLabel}>You owe</Text>
              <Text style={[styles.summaryValue, { color: '#DC2626' }]}>
                {fmt(youOwe)}
              </Text>
            </View>
          </View>

          {/* Owed to you Summary Card */}
          <View style={[styles.cardContainer, { flex: 1 }]}>
            <View style={styles.cardShadowBackdrop} />
            <View style={[styles.summaryCard, { backgroundColor: '#FFFFFF', borderColor: '#000000' }]}>
              <View style={[styles.summaryIcon, { backgroundColor: pageBg, borderColor: '#000000' }]}>
                <ArrowDownLeft color="#000000" size={16} strokeWidth={2.5} />
              </View>
              <Text style={styles.summaryLabel}>Owed to you</Text>
              <Text style={[styles.summaryValue, { color: '#16A34A' }]}>
                {fmt(owedToYou)}
              </Text>
            </View>
          </View>
        </View>

        {loading ? (
          <Text style={[styles.emptyText, { color: '#000000' }]}>
            Loading...
          </Text>
        ) : splits.length === 0 ? (
          <View style={styles.empty}>
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor: pageBg,
                  borderColor: '#000000',
                },
              ]}
            >
              <UsersRound color="#000000" size={24} strokeWidth={2.5} />
            </View>
            <Text style={[styles.emptyTitle, { color: '#000000' }]}>
              No splits yet
            </Text>
            <Text style={[styles.emptyText, { color: '#000000' }]}>
              Tap + to split a bill with peers.
            </Text>
          </View>
        ) : (
          <View style={styles.splitSections}>
            {([
              ['Bills you owe', billsYouOwe],
              ['Bills owed to you', billsOwedToYou],
            ] as const).map(([sectionTitle, sectionSplits]) => (
              <View key={sectionTitle} style={styles.splitSection}>
                <Text style={[styles.sectionTitle, { color: C.cardText }]}>
                  {sectionTitle}
                </Text>

                {sectionSplits.length === 0 ? (
                  <Text style={[styles.emptySectionText, { color: C.cardSubtext }]}>
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
                        <View key={split.id} style={styles.cardContainer}>
                          <View style={styles.cardShadowBackdrop} />
                          <Pressable
                            onPress={() => openSplit(split)}
                            style={[
                              styles.splitCard,
                              { backgroundColor: C.cardBg, borderColor: '#000000' },
                            ]}
                          >
                            <View style={styles.splitTop}>
                              <View
                                style={[
                                  styles.splitIcon,
                                  { backgroundColor: pageBg, borderColor: '#000000' },
                                ]}
                              >
                                <UsersRound
                                  color="#000000"
                                  size={18}
                                  strokeWidth={2.5}
                                />
                              </View>

                              <View style={styles.splitCopy}>
                                <Text
                                  style={[
                                    styles.splitTitle,
                                    { color: C.cardText },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {split.title}
                                </Text>

                                <Text
                                  style={[
                                    styles.splitMeta,
                                    { color: C.cardSubtext },
                                  ]}
                                >
                                  {incoming
                                    ? `You owe ${payerName}`
                                    : `${split.peer_names.join(', ')} owe you`}
                                </Text>
                              </View>

                              {!incoming && (
                                <Pressable
                                  onPress={() => setDeleteSplitTarget(split)}
                                  hitSlop={8}
                                  style={({ pressed }) => pressed && styles.pressedBtn}
                                >
                                  <Trash2
                                    color="#EF4444"
                                    size={18}
                                    strokeWidth={2.5}
                                  />
                                </Pressable>
                              )}
                            </View>

                            <View style={styles.splitDetails}>
                              <View style={styles.detailBlock}>
                                <Text
                                  style={[
                                    styles.detailLabel,
                                    { color: C.cardSubtext },
                                  ]}
                                >
                                  Total
                                </Text>
                                <Text
                                  style={[
                                    styles.detailValue,
                                    { color: C.cardText },
                                  ]}
                                >
                                  {fmt(Number(split.total_amount))}
                                </Text>
                              </View>

                              <View style={styles.detailBlock}>
                                <Text
                                  style={[
                                    styles.detailLabel,
                                    { color: C.cardSubtext },
                                  ]}
                                >
                                  {incoming ? 'You owe' : 'Owed to you'}
                                </Text>
                                <Text
                                  style={[
                                    styles.detailValue,
                                    { color: incoming ? '#DC2626' : '#16A34A' },
                                  ]}
                                >
                                  {fmt(incoming ? yourOutstanding : split.peer_names.reduce((sum, name) => sum + outstandingForName(split, name), 0))}
                                </Text>
                              </View>

                              <View style={styles.detailBlock}>
                                <Text
                                  style={[
                                    styles.detailLabel,
                                    { color: C.cardSubtext },
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
                                          { color: C.cardText },
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
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ))}
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
          <Plus
            color="#FFFFFF"
            size={28}
            strokeWidth={3}
          />
        </Pressable>
      </View>

      {/* New/Edit Split Modal */}
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
              <View
                style={[
                  styles.modalCardBody,
                  { backgroundColor: C.modalBg, borderColor: '#000000' },
                ]}
              >
                <View style={styles.modalTitleRow}>
                  <Text
                    style={[
                      styles.modalTitle,
                      { color: C.cardText },
                    ]}
                  >
                    {editingSplitId ? 'Edit split' : 'New split'}
                  </Text>

                  <Pressable
                    onPress={() => setModalOpen(false)}
                    hitSlop={12}
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
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text
                    style={[
                      styles.label,
                      { color: C.cardSubtext },
                    ]}
                  >
                    BILL TITLE
                  </Text>

                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="e.g. Dinner, Vacation"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      { backgroundColor: C.inputBg, color: C.cardText, borderColor: '#000000' },
                    ]}
                    autoFocus
                  />

                  <Text
                    style={[
                      styles.label,
                      { color: C.cardSubtext },
                    ]}
                  >
                    BILL AMOUNT ({currency_code})
                  </Text>

                  <TextInput
                    value={totalAmount}
                    onChangeText={setTotalAmount}
                    placeholder="3000"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      { backgroundColor: C.inputBg, color: C.cardText, borderColor: '#000000' },
                    ]}
                    keyboardType="numeric"
                  />

                  <Text
                    style={[
                      styles.label,
                      { color: C.cardSubtext },
                    ]}
                  >
                    SPLIT METHOD
                  </Text>

                  <View style={styles.chipRow}>
                    {(['equal', 'custom'] as const).map((method) => {
                      const selected = splitMethod === method;
                      return (
                        <Pressable
                          key={method}
                          onPress={() => setSplitMethod(method)}
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
                            {method === 'equal' ? 'Equal' : 'Custom'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text
                    style={[
                      styles.label,
                      { color: C.cardSubtext },
                    ]}
                  >
                    WHO OWES?
                  </Text>

                  <TextInput
                    value={friendSearch}
                    onChangeText={setFriendSearch}
                    placeholder="Search friends by username"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      { backgroundColor: C.inputBg, color: C.cardText, borderColor: '#000000' },
                    ]}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  {selectedFriends.length > 0 && (
                    <View style={styles.selectedSection}>
                      <Text
                        style={[
                          styles.selectedLabel,
                          { color: C.cardSubtext },
                        ]}
                      >
                        SELECTED
                      </Text>

                      <View style={styles.chipRow}>
                        {selectedFriends.map((friend) => (
                          <Pressable
                            key={friend.id}
                            onPress={() => toggleFriend(friend.id)}
                            style={[
                              styles.chip,
                              {
                                backgroundColor: pageBg,
                                borderColor: '#000000',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                { color: '#000000' },
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
                          { color: C.cardSubtext },
                        ]}
                      >
                        AMOUNT EACH PERSON OWES
                      </Text>

                      <View style={[styles.amountRow, { backgroundColor: C.inputBg, borderColor: '#000000' }]}>
                        <Text style={[styles.amountPerson, { color: C.cardText }]}>Me</Text>
                        <TextInput
                          value={customAmounts[currentUserId ?? ''] ?? customAmounts.me ?? ''}
                          onChangeText={(value) =>
                            setCustomAmounts((current) => ({ ...current, [currentUserId ?? 'me']: value }))
                          }
                          placeholder="0"
                          placeholderTextColor={C.cardSubtext}
                          keyboardType="decimal-pad"
                          style={[styles.amountInput, { backgroundColor: C.inputBg, color: C.cardText, borderColor: '#000000' }]}
                        />
                      </View>

                      {selectedFriends.map((friend) => (
                        <View
                          key={friend.id}
                          style={[styles.amountRow, { backgroundColor: C.inputBg, borderColor: '#000000' }]}
                        >
                          <Text style={[styles.amountPerson, { color: C.cardText }]} numberOfLines={1}>
                            {friend.display_name || friend.username}
                          </Text>
                          <TextInput
                            value={customAmounts[friend.id] ?? ''}
                            onChangeText={(value) =>
                              setCustomAmounts((current) => ({ ...current, [friend.id]: value }))
                            }
                            placeholder="0"
                            placeholderTextColor={C.cardSubtext}
                            keyboardType="decimal-pad"
                            style={[styles.amountInput, { backgroundColor: C.inputBg, color: C.cardText, borderColor: '#000000' }]}
                          />
                        </View>
                      ))}

                      <Text style={[styles.paymentHint, { color: C.cardSubtext }]}>
                        The amounts must add up to {fmt(parseFloat(totalAmount) || 0)}.
                      </Text>
                    </View>
                  )}

                  <View style={styles.friendResults}>
                    {filteredFriends.length === 0 ? (
                      <Text
                        style={[
                          styles.emptyFriendText,
                          { color: C.cardSubtext },
                        ]}
                      >
                        {friendSearch.trim()
                          ? 'No friends found.'
                          : 'No friends yet. Add friends in chat first.'}
                      </Text>
                    ) : (
                      <ScrollView
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        style={styles.friendResultsScroll}
                        contentContainerStyle={styles.friendResultsContent}
                        keyboardShouldPersistTaps="handled"
                      >
                        {filteredFriends.map((friend) => {
                          const selected = whoOwes.includes(friend.id);

                          return (
                            <Pressable
                              key={friend.id}
                              onPress={() => toggleFriend(friend.id)}
                              style={[
                                styles.friendRow,
                                { backgroundColor: C.inputBg, borderColor: '#000000' },
                                selected && { borderWidth: 2.5 },
                              ]}
                            >
                              <View style={[styles.friendAvatar, { backgroundColor: pageBg, borderColor: '#000000' }]}>
                                <Text
                                  style={[
                                    styles.friendAvatarText,
                                    { color: '#000000' },
                                  ]}
                                >
                                  {(friend.display_name ||
                                    friend.username ||
                                    '?')
                                    .charAt(0)
                                    .toUpperCase()}
                                </Text>
                              </View>

                              <View style={styles.friendCopy}>
                                <Text
                                  style={[
                                    styles.friendName,
                                    { color: C.cardText },
                                  ]}
                                >
                                  {friend.display_name ||
                                    friend.username}
                                </Text>

                                <Text
                                  style={[
                                    styles.friendUsername,
                                    { color: C.cardSubtext },
                                  ]}
                                >
                                  @{friend.username}
                                </Text>
                              </View>

                              {selected && (
                                <Text style={styles.selectedCheck}>✓</Text>
                              )}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                </ScrollView>

                <Pressable
                  disabled={saving}
                  onPress={saveSplit}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: '#000000' },
                    saving && { opacity: 0.6 },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>
                    {saving
                      ? 'Saving...'
                      : editingSplitId
                        ? 'Save changes'
                        : 'Save & ping peers'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Split Details Modal */}
      <Modal
        visible={!!selectedSplit}
        transparent
        animationType="fade"
        onRequestClose={closeSplit}
      >
        <View style={styles.centeredModalShade}>
          <View style={styles.modalCardWrapper}>
            <View style={styles.modalShadowBackdrop} />
            <View
              style={[
                styles.modalCardBody,
                { backgroundColor: C.modalBg, borderColor: '#000000' },
              ]}
            >
              {selectedSplit && (
                <>
                  <View style={styles.modalTitleRow}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.modalTitle,
                          { color: C.cardText },
                        ]}
                      >
                        {selectedSplit.title}
                      </Text>
                      <Text
                        style={[
                          styles.detailModalSubtitle,
                          { color: C.cardSubtext },
                        ]}
                      >
                        {fmt(Number(selectedSplit.total_amount))} · {isIncoming(selectedSplit)
                          ? `${getPayerName(selectedSplit)} paid`
                          : 'You paid'}
                      </Text>
                    </View>

                    <Pressable onPress={closeSplit} hitSlop={12}>
                      <X
                        color={C.cardText}
                        size={22}
                        strokeWidth={2.5}
                      />
                    </Pressable>
                  </View>

                  <Text
                    style={[
                      styles.label,
                      { color: C.cardSubtext },
                    ]}
                  >
                    WHO HAS PAID?
                  </Text>

                  <ScrollView
                    style={styles.modalScroll}
                    contentContainerStyle={styles.modalScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
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
                              { backgroundColor: C.inputBg, borderColor: '#000000' },
                            ]}
                          >
                            <View
                              style={[
                                styles.checkbox,
                                { borderColor: '#000000' },
                                paid && {
                                  backgroundColor: pageBg,
                                },
                              ]}
                            >
                              {paid && (
                                <Check color="#000000" size={14} strokeWidth={3} />
                              )}
                            </View>

                            <Text
                              style={[
                                styles.paidName,
                                { color: C.cardText },
                                paid && styles.paidNameCrossed,
                              ]}
                            >
                              {displayName}
                            </Text>

                            <Text
                              style={[
                                styles.paidAmount,
                                { color: C.cardSubtext },
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
                        { color: C.cardSubtext },
                      ]}
                    >
                      {isIncoming(selectedSplit) ? 'Tick your share when you have paid it.' : 'Tick someone when their share has been paid. Their name will be crossed out on the split dashboard.'}
                    </Text>
                  </ScrollView>

                  <View style={styles.detailActionRow}>
                    {!isIncoming(selectedSplit) && (
                      <Pressable
                        onPress={() => editSplit(selectedSplit)}
                        style={({ pressed }) => [
                          styles.detailActionButton,
                          { backgroundColor: C.inputBg, borderColor: '#000000' },
                          pressed && styles.pressedBtn,
                        ]}
                      >
                        <Pencil
                          color={C.cardText}
                          size={16}
                          strokeWidth={2.5}
                        />
                        <Text style={[styles.detailActionText, { color: C.cardText }]}>
                          Edit
                        </Text>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={closeSplit}
                      style={({ pressed }) => [
                        styles.detailActionButton,
                        { backgroundColor: '#000000', borderColor: '#000000', flex: 1 },
                        pressed && styles.pressedBtn,
                      ]}
                    >
                      <Text style={[styles.detailActionText, { color: '#FFFFFF' }]}>
                        Done
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Neo-brutalist Delete Alert Modal */}
      <Modal
        visible={!!deleteSplitTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteSplitTarget(null)}
      >
        <View style={styles.alertShade}>
          <View style={styles.alertCardWrapper}>
            <View style={styles.alertShadowBackdrop} />
            <View style={[styles.alertCardBody, { backgroundColor: C.modalBg }]}>
              <View style={styles.alertHeaderRow}>
                <View style={styles.alertIconBadge}>
                  <AlertTriangle color="#000000" size={20} strokeWidth={2.5} />
                </View>
                <Text style={[styles.alertTitle, { color: C.cardText }]}>Delete Split?</Text>
              </View>

              <Text style={[styles.alertMessage, { color: C.cardSubtext }]}>
                Are you sure you want to delete "{deleteSplitTarget?.title}"? This action cannot be undone.
              </Text>

              <View style={styles.alertActionsRow}>
                <Pressable
                  onPress={() => setDeleteSplitTarget(null)}
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
        onSelect={(code) =>
          updateSettings({ currency_code: code })
        }
        onClose={() => setCurrencyOpen(false)}
        accent={pageBg}
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

  summaryRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 0,
  },

  summaryCard: {
    borderRadius: 16,
    borderWidth: 3,
    padding: 16,
    gap: 6,
  },

  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },

  summaryLabel: {
    fontFamily: FONT_XB,
    fontSize: 12,
    letterSpacing: 0.5,
    color: '#52525B',
  },

  summaryValue: {
    fontFamily: FONT_XB,
    fontSize: 22,
    marginTop: 2,
  },

  splitSections: {
    gap: 20,
  },

  splitSection: {
    gap: 12,
  },

  sectionTitle: {
    fontFamily: FONT_XB,
    fontSize: 16,
    letterSpacing: 0.5,
  },

  emptySectionText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },

  splitList: {
    gap: 16,
  },

  splitCard: {
    borderRadius: 16,
    borderWidth: 3,
    padding: 16,
  },

  splitTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },

  splitIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },

  splitCopy: {
    flex: 1,
    gap: 2,
  },

  splitTitle: {
    fontFamily: FONT_XB,
    fontSize: 16,
  },

  splitMeta: {
    fontFamily: FONT_MED,
    fontSize: 11,
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
    fontFamily: FONT_XB,
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 3,
  },

  detailValue: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
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
    borderWidth: 2,
  },

  centeredModalShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    maxHeight: 580,
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

  selectedSection: {
    marginTop: 12,
    width: '100%',
  },

  selectedLabel: {
    fontFamily: FONT_XB,
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 7,
  },

  friendResults: {
    marginTop: 10,
    maxHeight: 220,
    width: '100%',
  },

  friendResultsScroll: {
    flexGrow: 0,
    maxHeight: 220,
  },

  friendResultsContent: {
    gap: 8,
  },

  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 2,
  },

  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderWidth: 2,
  },

  friendAvatarText: {
    fontFamily: FONT_XB,
    fontSize: 14,
  },

  friendCopy: {
    flex: 1,
    gap: 2,
  },

  friendName: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },

  friendUsername: {
    fontFamily: FONT_MED,
    fontSize: 11,
  },

  selectedCheck: {
    fontFamily: FONT_XB,
    fontSize: 18,
    marginRight: 5,
    color: '#000000',
  },

  emptyFriendText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },

  detailModalSubtitle: {
    fontFamily: FONT_MED,
    fontSize: 12,
    marginTop: 3,
  },

  paidList: {
    gap: 8,
    width: '100%',
  },

  paidRow: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  paidName: {
    flex: 1,
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },

  paidAmount: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },

  paidNameCrossed: {
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },

  paymentHint: {
    fontFamily: FONT_MED,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
    textAlign: 'left',
  },

  peerNamesWrap: {
    gap: 2,
  },

  customAmountsSection: {
    marginTop: 12,
    gap: 8,
    width: '100%',
  },

  amountRow: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },

  amountPerson: {
    flex: 1,
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },

  amountInput: {
    width: 100,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontFamily: FONT_BOLD,
    fontSize: 13,
    textAlign: 'right',
  },

  detailActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    width: '100%',
  },

  detailActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 2,
  },

  detailActionText: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },

  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    marginTop: 14,
    borderWidth: 2,
    borderColor: '#000000',
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