import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Trophy } from 'lucide-react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';

type GameFilter = 'all' | 'chess' | 'tictactoe' | 'sudoku' | 'wordsearch' | 'sequence';

type LeaderboardRow = {
  player_id: string;
  display_name: string | null;
  total_points: number;
  wins: number;
  draws: number;
  games_played: number;
};

const GAME_FILTERS: { key: GameFilter; label: string }[] = [

  { key: 'chess', label: 'Chess' },
  { key: 'tictactoe', label: 'Tic-Tac-Toe' },
  { key: 'sudoku', label: 'Sudoku' },
  { key: 'wordsearch', label: 'Word Search' },
  { key: 'sequence', label: 'Sequence' },
];

const GOLD = '#FFD700';
const SILVER = '#C0C0C0';
const BRONZE = '#CD7F32';

function getRankColor(rank: number): string {
  if (rank === 1) return GOLD;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return '';
}

export default function LeaderboardScreen() {
  const { isDark, accentForeground, onAccent } = useApp();

  const colors = {
    background: isDark ? '#090909' : '#FBFAF8',
    card: isDark ? '#151515' : '#FFFFFF',
    border: isDark ? '#2A2A2A' : '#ECE9E4',
    text: isDark ? '#F4F2EE' : '#27241F',
    muted: isDark ? '#AAA59D' : '#8F8A82',
    accent: accentForeground,
    onAccent,
  };

  const [filter, setFilter] = useState<GameFilter>('all');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async (activeFilter: GameFilter) => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    const currentUserId = user?.id ?? null;
    setMyId(currentUserId);
    if (!currentUserId) { setRows([]); setLoading(false); return; }

    // Pull friend ids in both directions, plus the current user,
    // so the leaderboard always includes "me" alongside friends.
    const { data: friendRows } = await supabase
      .from('friendships')
      .select('user_id, friend_user_id')
      .or(`user_id.eq.${currentUserId},friend_user_id.eq.${currentUserId}`);

    const friendIds = (friendRows ?? []).map((r) =>
      r.user_id === currentUserId ? r.friend_user_id : r.user_id
    );
    const scopedIds = [...new Set([currentUserId, ...friendIds])];

    // Pull display names for everyone in scope up front. This is
    // what lets friends who haven't played yet still show up on
    // the board — game_leaderboard only has rows for people with
    // at least one played game, so anyone missing gets a 0 row.
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', scopedIds);

    const nameById = new Map(
      (profileRows ?? []).map((p) => [p.user_id, p.display_name ?? 'Player'])
    );

    let query = supabase
      .from('game_leaderboard')
      .select('game, player_id, display_name, total_points, wins, draws, games_played')
      .in('player_id', scopedIds);

    if (activeFilter !== 'all') {
      query = query.eq('game', activeFilter);
    }

    const { data } = await query;

    // Aggregate across games (for 'all') or pass through per-game
    // rows, keyed by player, so each player appears exactly once.
    const totals = new Map<string, LeaderboardRow>();
    for (const r of data ?? []) {
      const existing = totals.get(r.player_id);
      if (existing) {
        existing.total_points += r.total_points;
        existing.wins += r.wins;
        existing.draws += r.draws;
        existing.games_played += r.games_played;
      } else {
        totals.set(r.player_id, {
          player_id: r.player_id,
          display_name: nameById.get(r.player_id) ?? r.display_name,
          total_points: r.total_points,
          wins: r.wins,
          draws: r.draws,
          games_played: r.games_played,
        });
      }
    }

    // Anyone in scope (me + every friend) who has no score rows at
    // all — including for solo games — still shows up, at 0.
    for (const id of scopedIds) {
      if (!totals.has(id)) {
        totals.set(id, {
          player_id: id,
          display_name: nameById.get(id) ?? 'Player',
          total_points: 0,
          wins: 0,
          draws: 0,
          games_played: 0,
        });
      }
    }

    setRows([...totals.values()].sort((a, b) => b.total_points - a.total_points));
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeaderboard(filter); }, [filter, fetchLeaderboard]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={[styles.headerBack, { backgroundColor: colors.accent }]} onPress={() => router.back()}>
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.accent }]}>LEADERBOARD</Text>
        <View style={styles.headerRight}>
          <Trophy size={22} color={colors.accent} />
        </View>
      </View>

      {/* Game filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={[styles.filterScroll, { borderBottomColor: colors.border }]}
      >
        {GAME_FILTERS.map((g) => (
          <Pressable
            key={g.key}
            onPress={() => setFilter(g.key)}
            style={[
              styles.filterPill,
              { borderColor: colors.border, backgroundColor: colors.card },
              filter === g.key && { backgroundColor: colors.accent, borderColor: colors.accent },
            ]}
          >
            <Text style={[styles.filterPillText, { color: colors.muted }, filter === g.key && { color: colors.onAccent }]}>
              {g.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centerState}>
            <Text style={[styles.mutedText, { color: colors.muted }]}>Loading scores…</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyState}>
            <Trophy size={36} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.text }]}>No scores yet.</Text>
            <Text style={[styles.mutedText, { color: colors.muted }]}>Play a game with friends to see rankings here!</Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {rows.map((entry, index) => {
              const rank = index + 1;
              const rankColor = getRankColor(rank) || colors.text;
              const isMe = entry.player_id === myId;
              return (
                <View
                  key={entry.player_id}
                  style={[
                    styles.row,
                    index < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    isMe && { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' },
                  ]}
                >
                  <Text style={[styles.rank, { color: rankColor }]}>#{rank}</Text>
                  <View style={styles.rowMiddle}>
                    <Text style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
                      {entry.display_name ?? 'Player'}{isMe ? ' (You)' : ''}
                    </Text>
                    <Text style={[styles.gameStats, { color: colors.muted }]}>
                      {entry.wins}W · {entry.draws}D · {entry.games_played} played
                    </Text>
                  </View>
                  <Text style={[styles.score, { color: rankColor }]}>{entry.total_points.toLocaleString()}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 28, paddingVertical: 14, borderBottomWidth: 1 },
  headerBack: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerRight: { width: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 16, letterSpacing: 1.5 },
  filterScroll: { flexGrow: 0, borderBottomWidth: 1 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  filterPillText: { fontFamily: 'Poppins-Medium', fontSize: 12 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  rank: { fontFamily: 'Poppins-Bold', fontSize: 14, width: 32 },
  rowMiddle: { flex: 1, gap: 2 },
  playerName: { fontFamily: 'Poppins-Medium', fontSize: 14 },
  gameStats: { fontFamily: 'Poppins-Regular', fontSize: 11 },
  score: { fontFamily: 'Poppins-Bold', fontSize: 15, textAlign: 'right', minWidth: 56 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontFamily: 'Poppins-SemiBold', fontSize: 16 },
  mutedText: { fontFamily: 'Poppins-Regular', fontSize: 13, textAlign: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
});