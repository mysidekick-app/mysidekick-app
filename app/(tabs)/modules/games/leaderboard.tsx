import { useCallback, useEffect, useState } from 'react';

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ChevronLeft,
  Trophy,
} from 'lucide-react-native';

import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';

type GameFilter =
  | 'all'
  | 'chess'
  | 'tictactoe'
  | 'sudoku'
  | 'wordsearch'
  | 'sequence';

type LeaderboardRow = {
  player_id: string;
  display_name: string;
  total_points: number;
  wins: number;
  draws: number;
  games_played: number;
};

const GAME_FILTERS: {
  key: GameFilter;
  label: string;
}[] = [
  { key: 'all', label: 'All' },
  { key: 'chess', label: 'Chess' },
  {
    key: 'tictactoe',
    label: 'Tic-Tac-Toe',
  },
  { key: 'sudoku', label: 'Sudoku' },
  {
    key: 'wordsearch',
    label: 'Word Search',
  },
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
  const {
    isDark,
    accentForeground,
    onAccent,
  } = useApp();

  const colors = {
    background: isDark
      ? '#090909'
      : '#FBFAF8',

    card: isDark
      ? '#151515'
      : '#FFFFFF',

    border: isDark
      ? '#2A2A2A'
      : '#ECE9E4',

    text: isDark
      ? '#F4F2EE'
      : '#27241F',

    muted: isDark
      ? '#AAA59D'
      : '#8F8A82',

    accent: accentForeground,
    onAccent,
  };

  const [filter, setFilter] =
    useState<GameFilter>('all');

  const [rows, setRows] =
    useState<LeaderboardRow[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [myId, setMyId] =
    useState<string | null>(null);

  const fetchLeaderboard = useCallback(
    async (activeFilter: GameFilter) => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const currentUserId =
        user?.id ?? null;

      setMyId(currentUserId);

      if (!currentUserId) {
        setRows([]);
        setLoading(false);
        return;
      }

      /*
       * Find every connection involving the
       * current user.
       */
      const { data: friendRows } =
        await supabase
          .from('friendships')
          .select(
            'user_id, friend_user_id',
          )
          .or(
            `user_id.eq.${currentUserId},friend_user_id.eq.${currentUserId}`,
          );

      const friendIds = (
        friendRows ?? []
      ).map((row) =>
        row.user_id === currentUserId
          ? row.friend_user_id
          : row.user_id,
      );

      const scopedIds = [
        ...new Set([
          currentUserId,
          ...friendIds,
        ]),
      ];

      /*
       * Profiles are the source of truth for
       * display names.
       */
      const { data: profileRows } =
        await supabase
          .from('profiles')
          .select(
            'user_id, display_name',
          )
          .in(
            'user_id',
            scopedIds,
          );

      const nameById = new Map<
        string,
        string
      >();

      for (const profile of
        profileRows ?? []) {
        nameById.set(
          profile.user_id,
          profile.display_name ??
            'Player',
        );
      }

      /*
       * Get actual recorded leaderboard
       * values for all people in scope.
       */
      let query = supabase
        .from('game_leaderboard')
        .select(
          'game, player_id, display_name, total_points, wins, draws, games_played',
        )
        .in(
          'player_id',
          scopedIds,
        );

      if (activeFilter !== 'all') {
        query = query.eq(
          'game',
          activeFilter,
        );
      }

      const {
        data: scoreRows,
        error,
      } = await query;

      if (error) {
        console.error(
          'LEADERBOARD ERROR:',
          error,
        );
      }

      /*
       * Aggregate by player.
       *
       * For All:
       *   Chess + Tic-Tac-Toe + Sudoku
       *   + Word Search + Sequence
       *
       * For an individual filter:
       *   only that game's row is used.
       */
      const totals = new Map<
        string,
        LeaderboardRow
      >();

      for (const score of
        scoreRows ?? []) {
        const playerId =
          score.player_id;

        const existing =
          totals.get(playerId);

        if (existing) {
          existing.total_points +=
            Number(
              score.total_points ?? 0,
            );

          existing.wins += Number(
            score.wins ?? 0,
          );

          existing.draws += Number(
            score.draws ?? 0,
          );

          existing.games_played +=
            Number(
              score.games_played ?? 0,
            );
        } else {
          totals.set(playerId, {
            player_id: playerId,

            display_name:
              nameById.get(playerId) ??
              score.display_name ??
              'Player',

            total_points: Number(
              score.total_points ?? 0,
            ),

            wins: Number(
              score.wins ?? 0,
            ),

            draws: Number(
              score.draws ?? 0,
            ),

            games_played: Number(
              score.games_played ?? 0,
            ),
          });
        }
      }

      /*
       * Add every connected person who doesn't
       * yet have a leaderboard row.
       *
       * This is what makes a friend with zero
       * games/points appear.
       */
      for (const playerId of
        scopedIds) {
        if (!totals.has(playerId)) {
          totals.set(playerId, {
            player_id: playerId,

            display_name:
              nameById.get(playerId) ??
              'Player',

            total_points: 0,
            wins: 0,
            draws: 0,
            games_played: 0,
          });
        }
      }

      /*
       * Rank by total points.
       *
       * If points are tied, use wins as the
       * secondary ordering, then games played,
       * then name for a stable order.
       */
      const sorted = [
        ...totals.values(),
      ].sort((a, b) => {
        if (
          b.total_points !==
          a.total_points
        ) {
          return (
            b.total_points -
            a.total_points
          );
        }

        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }

        if (
          b.games_played !==
          a.games_played
        ) {
          return (
            b.games_played -
            a.games_played
          );
        }

        return a.display_name.localeCompare(
          b.display_name,
        );
      });

      setRows(sorted);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    fetchLeaderboard(filter);
  }, [filter, fetchLeaderboard]);

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          backgroundColor:
            colors.background,
        },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            borderBottomColor:
              colors.border,
          },
        ]}
      >
        <Pressable
          style={[
            styles.headerBack,
            {
              backgroundColor:
                colors.accent,
            },
          ]}
          onPress={() =>
            router.back()
          }
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.4}
          />
        </Pressable>

        <Text
          style={[
            styles.headerTitle,
            {
              color: colors.accent,
            },
          ]}
        >
          LEADERBOARD
        </Text>

        <View
          style={styles.headerRight}
        >
          <Trophy
            size={22}
            color={colors.accent}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.filterRow
        }
        style={[
          styles.filterScroll,
          {
            borderBottomColor:
              colors.border,
          },
        ]}
      >
        {GAME_FILTERS.map((game) => (
          <Pressable
            key={game.key}
            onPress={() =>
              setFilter(game.key)
            }
            style={[
              styles.filterPill,
              {
                borderColor:
                  colors.border,
                backgroundColor:
                  colors.card,
              },
              filter === game.key && {
                backgroundColor:
                  colors.accent,
                borderColor:
                  colors.accent,
              },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                {
                  color:
                    colors.muted,
                },
                filter === game.key && {
                  color:
                    colors.onAccent,
                },
              ]}
            >
              {game.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {loading ? (
          <View
            style={styles.centerState}
          >
            <Text
              style={[
                styles.mutedText,
                {
                  color:
                    colors.muted,
                },
              ]}
            >
              Loading scores…
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.card,
              {
                backgroundColor:
                  colors.card,
                borderColor:
                  colors.border,
              },
            ]}
          >
            {rows.map(
              (entry, index) => {
                const rank =
                  index + 1;

                const medalColor =
                  getRankColor(
                    rank,
                  );

                const isMe =
                  entry.player_id ===
                  myId;

                /*
                 * Your row uses the global
                 * accent as its background.
                 */
                const rowBackground =
                  isMe
                    ? colors.accent
                    : colors.card;

                const primaryText =
                  isMe
                    ? colors.onAccent
                    : colors.text;

                const secondaryText =
                  isMe
                    ? colors.onAccent
                    : colors.muted;

                return (
                  <View
                    key={
                      entry.player_id
                    }
                    style={[
                      styles.row,
                      {
                        backgroundColor:
                          rowBackground,
                        borderBottomColor:
                          isMe
                            ? colors.onAccent
                            : colors.border,
                      },
                      index <
                        rows.length - 1 && {
                        borderBottomWidth: 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.rank,
                        {
                          color:
                            isMe
                              ? colors.onAccent
                              : medalColor ||
                                colors.text,
                        },
                      ]}
                    >
                      #{rank}
                    </Text>

                    <View
                      style={
                        styles.rowMiddle
                      }
                    >
                      <Text
                        style={[
                          styles.playerName,
                          {
                            color:
                              primaryText,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {
                          entry.display_name
                        }

                        {isMe
                          ? ' (You)'
                          : ''}
                      </Text>

                      <Text
                        style={[
                          styles.gameStats,
                          {
                            color:
                              secondaryText,
                          },
                        ]}
                      >
                        {entry.wins}W ·{' '}
                        {entry.draws}D ·{' '}
                        {
                          entry.games_played
                        }{' '}
                        played
                      </Text>
                    </View>

                    <View
                      style={
                        styles.scoreWrap
                      }
                    >
                      <Text
                        style={[
                          styles.score,
                          {
                            color:
                              isMe
                                ? colors.onAccent
                                : medalColor ||
                                  colors.text,
                          },
                        ]}
                      >
                        {entry.total_points.toLocaleString()}
                      </Text>

                      <Text
                        style={[
                          styles.pointsLabel,
                          {
                            color:
                              secondaryText,
                          },
                        ]}
                      >
                        pts
                      </Text>
                    </View>
                  </View>
                );
              },
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },

  headerBack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerRight: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 16,
    letterSpacing: 1.5,
  },

  filterScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
  },

  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },

  filterPillText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },

  rank: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    width: 32,
  },

  rowMiddle: {
    flex: 1,
    gap: 2,
  },

  playerName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
  },

  gameStats: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
  },

  scoreWrap: {
    alignItems: 'flex-end',
    minWidth: 60,
  },

  score: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
    textAlign: 'right',
  },

  pointsLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 9,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },

  emptyText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
  },

  mutedText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    textAlign: 'center',
  },

  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
});