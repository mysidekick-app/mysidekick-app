import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ChevronLeft,
  Grid3X3,
  Hash,
  Search,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react-native';
import {
  Modal,
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

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

type GameKey = 'tictactoe' | 'sudoku' | 'wordsearch' | 'sequence';
type Mode = 'computer' | 'friend';
type Difficulty = 'easy' | 'medium' | 'hard';
type FilterType = 'all' | 'multiplayer' | 'solo';

interface GameDef {
  key: GameKey;
  name: string;
  icon: React.ComponentType<{ color: string; size: number }>;
  multiplayer: boolean;
}

interface Friend {
  id: string;
  display_name: string;
}

interface ActiveGame {
  id: string;
  game: GameKey;
  opponentName: string;
  isMyTurn: boolean;
  createdAt: string;
  expiresAt: number;
}

const ALL_GAMES: GameDef[] = [
  { key: 'tictactoe', name: 'Tic-Tac-Toe', icon: Grid3X3, multiplayer: true },
  { key: 'sudoku', name: 'Sudoku', icon: Hash, multiplayer: false },
  { key: 'wordsearch', name: 'Word Search', icon: Search, multiplayer: false },
  { key: 'sequence', name: 'Sequence', icon: TrendingUp, multiplayer: false },
];

const DIFFICULTIES: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
];

const GAME_REQUEST_LIFETIME_MS = 10 * 60 * 1000;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase();
}

function isAccentBlack(color?: string): boolean {
  if (!color) return false;
  const normalized = color.trim().toLowerCase();
  return (
    normalized === '#000000' ||
    normalized === '#000' ||
    normalized === 'black' ||
    normalized === 'rgb(0,0,0)' ||
    normalized === 'rgba(0,0,0,1)'
  );
}

export default function GamesScreen() {
  const { isDark, accentForeground, accentColor: rawAccent } = useApp() as any;

  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);

  const [filter, setFilter] = useState<FilterType>('all');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameDef | null>(null);
  const [mode, setMode] = useState<Mode>('computer');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [invitedFriend, setInvitedFriend] = useState<Friend | null>(null);
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Updated position rankings holder with only global and friends
  const [positions] = useState<Record<string, { global: string; friends: string }>>({
    tictactoe: { global: '#12', friends: '#1' },
    sudoku: { global: '#8', friends: '#1' },
    wordsearch: { global: '#24', friends: '#2' },
    sequence: { global: '#15', friends: '#1' },
  });

  useEffect(() => {
    loadFriends();
    loadActiveGames();

    const refreshTimer = setInterval(() => {
      loadActiveGames();
    }, 30000);

    return () => clearInterval(refreshTimer);
  }, []);

  async function loadFriends() {
    setFriendsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const myUid = user?.id;
      if (!myUid) {
        setFriends([]);
        return;
      }

      const { data: friendRows, error } = await supabase
        .from('friendships')
        .select('user_id, friend_user_id')
        .or(`user_id.eq.${myUid},friend_user_id.eq.${myUid}`);

      if (error) {
        setFriends([]);
        return;
      }

      const friendIds = [
        ...new Set(
          (friendRows ?? []).map((r) =>
            r.user_id === myUid ? r.friend_user_id : r.user_id
          )
        ),
      ];

      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      const { data: profileRows } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', friendIds);

      setFriends(
        (profileRows ?? []).map((p) => ({
          id: p.user_id,
          display_name: p.display_name ?? 'Friend',
        }))
      );
    } catch {
      setFriends([]);
    } finally {
      setFriendsLoading(false);
    }
  }

  async function loadActiveGames() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const myUid = user?.id;
      if (!myUid) {
        setActiveGames([]);
        return;
      }

      const { data: sessionRows, error } = await supabase
        .from('game_sessions')
        .select('id, game, created_by, opponent_id, turn_user_id, status, created_at')
        .eq('mode', 'multiplayer')
        .eq('opponent_type', 'friend')
        .eq('status', 'active')
        .or(`created_by.eq.${myUid},opponent_id.eq.${myUid}`);

      if (error || !sessionRows) {
        setActiveGames([]);
        return;
      }

      const now = Date.now();
      const validRows = sessionRows.filter((r) => {
        if (!r.created_at) return true;
        return now - new Date(r.created_at).getTime() < GAME_REQUEST_LIFETIME_MS;
      });

      const otherIds = [
        ...new Set(
          validRows
            .map((r) => (r.created_by === myUid ? r.opponent_id : r.created_by))
            .filter(Boolean)
        ),
      ];

      let nameById = new Map<string, string>();
      if (otherIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', otherIds as string[]);

        nameById = new Map(
          (profileRows ?? []).map((p) => [p.user_id, p.display_name ?? 'Friend'])
        );
      }

      setActiveGames(
        validRows.map((r) => {
          const otherId = r.created_by === myUid ? r.opponent_id : r.created_by;
          return {
            id: r.id,
            game: r.game as GameKey,
            opponentName: nameById.get(otherId) ?? 'Friend',
            isMyTurn: r.turn_user_id === myUid,
            createdAt: r.created_at,
            expiresAt: new Date(r.created_at).getTime() + GAME_REQUEST_LIFETIME_MS,
          };
        })
      );
    } catch {
      setActiveGames([]);
    }
  }

  useEffect(() => {
    if (activeGames.length === 0) return;
    const countdownTimer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(countdownTimer);
  }, [activeGames.length]);

  function formatRequestTime(ms: number): string {
    const remaining = Math.max(0, ms);
    const totalSeconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function openActiveGame(g: ActiveGame) {
    router.push({
      pathname: `/modules/games/${g.game}`,
      params: { sessionId: g.id, opponent: 'friend' },
    });
  }

  const filteredGames = ALL_GAMES.filter((g) => {
    if (filter === 'multiplayer') return g.multiplayer;
    if (filter === 'solo') return !g.multiplayer;
    return true;
  });

  const filteredFriends = friendSearch.trim()
    ? friends.filter((f) =>
        f.display_name.toLowerCase().includes(friendSearch.trim().toLowerCase())
      )
    : friends;

  function openSheet(game: GameDef) {
    setSelectedGame(game);
    setMode('computer');
    setDifficulty('easy');
    setInvitedFriend(null);
    setFriendSearch('');
    setSheetVisible(true);
  }

  function closeSheet() {
    if (loading) return;
    setSheetVisible(false);
    setSelectedGame(null);
  }

  async function handleStart() {
    if (!selectedGame) return;
    if (selectedGame.multiplayer && mode === 'friend' && !invitedFriend) return;
    if (loading) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const createdBy = user?.id;
      if (!createdBy) return;

      const { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .insert({
          game: selectedGame.key,
          mode: selectedGame.multiplayer ? 'multiplayer' : 'solo',
          opponent_type: selectedGame.multiplayer ? mode : null,
          opponent_id: selectedGame.multiplayer && mode === 'friend' ? invitedFriend?.id ?? null : null,
          difficulty,
          created_by: createdBy,
          status: 'active',
        })
        .select('id')
        .single();

      if (sessionError || !session?.id) return;

      const sessionId = session.id;
      setSheetVisible(false);
      setSelectedGame(null);

      router.push({
        pathname: `/modules/games/${selectedGame.key}`,
        params: { sessionId, opponent: mode, difficulty },
      });
    } catch (error) {
      console.error('START GAME ERROR:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
        backgroundColor={pageBg}
      />

      {/* STICKY HEADER */}
      <View style={[styles.headerContainer, { backgroundColor: pageBg }]}>
        <Pressable
          onPress={() => router.push('/modules')}
          style={({ pressed }) => [styles.neoBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={1}>
          GAMES
        </Text>

        <Pressable
          onPress={() => router.push('/modules/games/leaderboard')}
          style={({ pressed }) => [styles.trophyBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <Trophy color="#000000" size={22} strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* FILTER PILLS WITH NEO-BRUTALIST DROP SHADOW */}
      <View style={styles.filterContainer}>
        {(['all', 'multiplayer', 'solo'] as FilterType[]).map((f) => {
          const selected = filter === f;
          return (
            <View key={f} style={styles.filterWrapper}>
              <View style={styles.filterShadowBackdrop} />
              <Pressable
                onPress={() => setFilter(f)}
                style={({ pressed }) => [
                  styles.filterPill,
                  selected ? styles.filterPillActive : styles.filterPillInactive,
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: selected ? pageBg : '#000000' },
                  ]}
                >
                  {f.toUpperCase()}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* SCROLLABLE CARDS */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeGames.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.activeSectionTitle}>ACTIVE MULTIPLAYER GAMES</Text>
            {activeGames.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => openActiveGame(g)}
                style={[styles.activeCard, { borderColor: '#FFFFFF', backgroundColor: '#121212' }]}
              >
                <View>
                  <Text style={[styles.activeCardTitle, { color: pageBg }]}>
                    {g.game.toUpperCase()} vs {g.opponentName}
                  </Text>
                  <Text style={styles.activeCardSub}>
                    {g.isMyTurn ? 'Your turn' : 'Waiting for opponent'} · Expires in {formatRequestTime(g.expiresAt - nowMs)}
                  </Text>
                </View>
                {g.isMyTurn && <View style={[styles.turnDot, { backgroundColor: pageBg }]} />}
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.cardsStack}>
          {filteredGames.map((m, index) => {
            const pos = positions[m.key] || { global: '#--', friends: '#--' };

            return (
              <View
                key={m.key}
                style={[
                  styles.cardContainer,
                  index > 0 && styles.overlappingCard,
                ]}
              >
                <View style={styles.cardShadowBackdrop} />
                <Pressable
                  onPress={() => openSheet(m)}
                  style={({ pressed }) => [
                    styles.moduleCardBody,
                    {
                      backgroundColor: isDark ? '#000000' : '#FFFFFF',
                      borderColor: '#000000',
                    },
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <View style={styles.cardLeftContent}>
                    <Text
                      style={[
                        styles.moduleTitleText,
                        { color: isDark ? '#FFFFFF' : '#000000' },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {m.name.toUpperCase()}
                    </Text>
                    <View style={styles.arrowContainer}>
                      <ArrowRight
                        color={isDark ? '#FFFFFF' : '#000000'}
                        size={22}
                        strokeWidth={2.8}
                      />
                    </View>
                  </View>

                  <View style={styles.positionsRow}>
                    <View style={[styles.posBadge, { backgroundColor: pageBg }]}>
                      <Text style={styles.posLabel}>Global</Text>
                      <Text style={styles.posVal}>{pos.global}</Text>
                    </View>
                    <View style={[styles.posBadge, { backgroundColor: pageBg }]}>
                      <Text style={styles.posLabel}>Friends</Text>
                      <Text style={styles.posVal}>{pos.friends}</Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* GAME SETUP MODAL SHEET */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closeSheet} />
        <View style={[styles.sheet, { backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: pageBg }]}>
              {selectedGame?.name}
            </Text>
            <Pressable onPress={closeSheet} hitSlop={12}>
              <X color={isDark ? '#FFFFFF' : '#000000'} size={22} strokeWidth={2.5} />
            </Pressable>
          </View>

          {selectedGame?.multiplayer && (
            <View style={styles.pillRow}>
              <Pressable
                style={[
                  styles.pill,
                  mode === 'computer'
                    ? { backgroundColor: pageBg, borderColor: pageBg }
                    : { backgroundColor: isDark ? '#27272A' : '#F4F4F5', borderColor: '#000000' },
                ]}
                onPress={() => setMode('computer')}
              >
                <Text style={[styles.pillText, { color: mode === 'computer' ? '#000000' : (isDark ? '#FFFFFF' : '#000000') }]}>
                  VS Computer
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.pill,
                  mode === 'friend'
                    ? { backgroundColor: pageBg, borderColor: pageBg }
                    : { backgroundColor: isDark ? '#27272A' : '#F4F4F5', borderColor: '#000000' },
                ]}
                onPress={() => setMode('friend')}
              >
                <Text style={[styles.pillText, { color: mode === 'friend' ? '#000000' : (isDark ? '#FFFFFF' : '#000000') }]}>
                  Play with Friend
                </Text>
              </Pressable>
            </View>
          )}

          {(!selectedGame?.multiplayer || mode === 'computer') && (
            <>
              <Text style={[styles.sheetSectionLabel, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
                DIFFICULTY
              </Text>
              <View style={styles.pillRow}>
                {DIFFICULTIES.map((d) => (
                  <Pressable
                    key={d.key}
                    style={[
                      styles.pill,
                      difficulty === d.key
                        ? { backgroundColor: pageBg, borderColor: pageBg }
                        : { backgroundColor: isDark ? '#27272A' : '#F4F4F5', borderColor: '#000000' },
                    ]}
                    onPress={() => setDifficulty(d.key)}
                  >
                    <Text style={[styles.pillText, { color: difficulty === d.key ? '#000000' : (isDark ? '#FFFFFF' : '#000000') }]}>
                      {d.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {selectedGame?.multiplayer && mode === 'friend' && (
            <>
              <Text style={[styles.sheetSectionLabel, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
                INVITE FRIEND
              </Text>
              <View style={[styles.searchBar, { backgroundColor: isDark ? '#27272A' : '#F4F4F5', borderColor: '#000000' }]}>
                <Search color={isDark ? '#A1A1AA' : '#52525B'} size={16} />
                <TextInput
                  style={[styles.searchInput, { color: isDark ? '#FFFFFF' : '#000000' }]}
                  value={friendSearch}
                  onChangeText={setFriendSearch}
                  placeholder="Search friends..."
                  placeholderTextColor={isDark ? '#A1A1AA' : '#52525B'}
                />
              </View>

              {friendsLoading ? (
                <Text style={styles.friendsHint}>Loading friends…</Text>
              ) : friends.length === 0 ? (
                <Text style={styles.friendsHint}>No friends yet — add some first!</Text>
              ) : (
                <ScrollView style={styles.friendsList} showsVerticalScrollIndicator={false}>
                  {filteredFriends.map((f) => {
                    const selected = invitedFriend?.id === f.id;
                    return (
                      <Pressable
                        key={f.id}
                        onPress={() => setInvitedFriend(selected ? null : f)}
                        style={[
                          styles.friendRow,
                          {
                            backgroundColor: isDark ? '#27272A' : '#F4F4F5',
                            borderColor: selected ? pageBg : '#000000',
                          },
                        ]}
                      >
                        <View style={[styles.avatar, { borderColor: '#000000' }]}>
                          <Text style={[styles.avatarText, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                            {initialsFor(f.display_name)}
                          </Text>
                        </View>
                        <Text style={[styles.friendRowName, { color: isDark ? '#FFFFFF' : '#000000' }]} numberOfLines={1}>
                          {f.display_name}
                        </Text>
                        {selected && <View style={[styles.selectedDot, { backgroundColor: pageBg }]} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.startBtn,
              { backgroundColor: '#000000', borderWidth: 2, borderColor: pageBg },
              pressed && styles.pressedBtn,
            ]}
            onPress={handleStart}
            disabled={loading}
          >
            <Text style={[styles.startBtnText, { color: pageBg }]}>
              {loading ? 'Starting…' : selectedGame?.multiplayer && mode === 'friend' ? 'Send Invitation' : 'Start Match'}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pressedBtn: { transform: [{ translateX: 2 }, { translateY: 2 }] },

  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    zIndex: 100,
  },
  neoBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 20,
    letterSpacing: 1,
    color: '#000000',
    textAlign: 'center',
    flex: 1,
  },

  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  filterWrapper: {
    position: 'relative',
  },
  filterShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: '#000000',
    borderRadius: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#000000',
  },
  filterPillActive: {
    backgroundColor: '#000000',
  },
  filterPillInactive: {
    backgroundColor: '#FFFFFF',
  },
  filterPillText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 50,
  },
  cardsStack: {
    paddingTop: 4,
  },
  cardContainer: {
    position: 'relative',
    width: '100%',
  },
  overlappingCard: {
    marginTop: 12,
  },
  cardShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -7,
    bottom: -7,
    backgroundColor: '#000000',
    borderRadius: 16,
  },
  moduleCardBody: {
    borderRadius: 16,
    borderWidth: 3,
    paddingVertical: 22,
    paddingHorizontal: 20,
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 135,
    gap: 14,
  },
  cardLeftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  moduleTitleText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 22,
    letterSpacing: 0.8,
  },
  arrowContainer: {
    transform: [{ rotate: '-45deg' }],
  },
  positionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  posBadge: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#000000',
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  posLabel: {
    fontFamily: 'Poppins-Bold',
    fontSize: 9,
    color: '#000000',
    opacity: 0.75,
  },
  posVal: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 13,
    color: '#000000',
    marginTop: 2,
  },

  activeSectionTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 12,
    letterSpacing: 1,
    color: '#000000',
    marginBottom: 8,
  },
  activeCard: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  activeCardTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 14,
  },
  activeCardSub: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: '#A1A1AA',
    marginTop: 2,
  },
  turnDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 3,
    borderColor: '#000000',
    paddingTop: 22,
    paddingBottom: 34,
    paddingHorizontal: 22,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 20,
  },
  sheetSectionLabel: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 2,
  },
  pillText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    padding: 0,
  },
  friendsHint: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
    color: '#71717A',
  },
  friendsList: {
    maxHeight: 160,
    marginTop: 8,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  friendRowName: {
    flex: 1,
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
  },
  startBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  startBtnText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
});