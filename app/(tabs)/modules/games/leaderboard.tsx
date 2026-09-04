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

type GameScore = {
  player_id: string;
  game: string;
  mode: string | null;
  result: string | null;
  points: number | null;
  difficulty: string | null;
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

/**
 * Normalise result values coming from the different games.
 *
 * Chess uses values such as:
 *   white_wins
 *   black_wins
 *   draw
 *
 * Tic-Tac-Toe may use:
 *   win
 *   loss
 *   draw
 *
 * Other games may simply record their points without a result.
 */
function getResultType(
  score: GameScore,
): 'win' | 'draw' | 'loss' | 'other' {
  const result = String(score.result ?? '')
    .trim()
    .toLowerCase();

  if (!result) {
    return 'other';
  }

  if (
    result === 'draw' ||
    result === 'drawn' ||
    result === 'tie' ||
    result === 'tied'
  ) {
    return 'draw';
  }

  /*
   * Chess stores the winning side as white_wins /
   * black_wins. The actual player who owns the score
   * receives the score row, so a non-zero score is
   * treated as a win for leaderboard purposes.
   */
  if (
    result === 'white_wins' ||
    result === 'black_wins'
  ) {
    return Number(score.points ?? 0) > 0
      ? 'win'
      : 'loss';
  }

  if (
    result === 'win' ||
    result === 'won' ||
    result === 'winner' ||
    result === 'won_game'
  ) {
    return 'win';
  }

  if (
    result === 'loss' ||
    result === 'lost' ||
    result === 'lose' ||
    result === 'loser'
  ) {
    return 'loss';
  }

  return 'other';
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

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.error(
            'LEADERBOARD USER ERROR:',
            userError,
          );
        }

        const currentUserId =
          user?.id ?? null;

        setMyId(currentUserId);

        if (!currentUserId) {
          setRows([]);
          return;
        }

        /*
         * --------------------------------------------------
         * 1. Find all friends connected to the current user
         * --------------------------------------------------
         */

        const {
          data: friendRows,
          error: friendshipError,
        } = await supabase
          .from('friendships')
          .select(
            'user_id, friend_user_id',
          )
          .or(
            `user_id.eq.${currentUserId},friend_user_id.eq.${currentUserId}`,
          );

        if (friendshipError) {
          console.error(
            'LEADERBOARD FRIENDSHIP ERROR:',
            friendshipError,
          );
        }

        const friendIds = (
          friendRows ?? []
        )
          .map((row) =>
            row.user_id === currentUserId
              ? row.friend_user_id
              : row.user_id,
          )
          .filter(
            (id): id is string =>
              typeof id === 'string' &&
              id.length > 0 &&
              id !== currentUserId,
          );

        /*
         * The leaderboard contains:
         *
         *   You
         *   + all your friends
         */
        const scopedIds = [
          ...new Set([
            currentUserId,
            ...friendIds,
          ]),
        ];

        /*
         * --------------------------------------------------
         * 2. Get profile names
         * --------------------------------------------------
         *
         * profiles.user_id is the link to auth.users.id.
         * We deliberately use profiles as the source of
         * truth rather than a display_name stored on a score.
         */

        const {
          data: profileRows,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select(
            'user_id, display_name',
          )
          .in(
            'user_id',
            scopedIds,
          );

        if (profileError) {
          console.error(
            'LEADERBOARD PROFILE ERROR:',
            profileError,
          );
        }

        const nameById = new Map<
          string,
          string
        >();

        for (
          const profile of profileRows ?? []
        ) {
          const name =
            typeof profile.display_name ===
              'string'
              ? profile.display_name.trim()
              : '';

          if (name) {
            nameById.set(
              profile.user_id,
              name,
            );
          }
        }

        /*
         * --------------------------------------------------
         * 3. Read the actual game scores
         * --------------------------------------------------
         *
         * This is the important change.
         *
         * The games write to game_scores, so the leaderboard
         * must read game_scores directly.
         */

        let scoreQuery = supabase
          .from('game_scores')
          .select(
            `
              player_id,
              game,
              mode,
              result,
              points,
              difficulty
            `,
          )
          .in(
            'player_id',
            scopedIds,
          );

        if (activeFilter !== 'all') {
          scoreQuery = scoreQuery.eq(
            'game',
            activeFilter,
          );
        }

        const {
          data: scoreRows,
          error: scoreError,
        } = await scoreQuery;

        if (scoreError) {
          console.error(
            'LEADERBOARD SCORE ERROR:',
            scoreError,
          );

          setRows([]);
          return;
        }

        /*
         * --------------------------------------------------
         * 4. Aggregate scores by player
         * --------------------------------------------------
         */

        const totals = new Map<
          string,
          LeaderboardRow
        >();

        for (
          const rawScore of
            scoreRows ?? []
        ) {
          const score =
            rawScore as GameScore;

          const playerId =
            score.player_id;

          if (!playerId) {
            continue;
          }

          const points = Number(
            score.points ?? 0,
          );

          const resultType =
            getResultType(score);

          const existing =
            totals.get(playerId);

          if (existing) {
            existing.total_points +=
              points;

            /*
             * Only count games that have an
             * actual recorded result.
             *
             * Solo games such as Sudoku,
             * Word Search and Sequence may
             * not store a result field.
             *
             * Those are still counted as played.
             */
            existing.games_played += 1;

            if (resultType === 'win') {
              existing.wins += 1;
            }

            if (resultType === 'draw') {
              existing.draws += 1;
            }
          } else {
            totals.set(playerId, {
              player_id: playerId,

              display_name:
                nameById.get(playerId) ??
                'Player',

              total_points: points,

              wins:
                resultType === 'win'
                  ? 1
                  : 0,

              draws:
                resultType === 'draw'
                  ? 1
                  : 0,

              games_played: 1,
            });
          }
        }

        /*
         * --------------------------------------------------
         * 5. Add friends who have not played yet
         * --------------------------------------------------
         *
         * This means a friend still appears on the
         * leaderboard with:
         *
         *   0 pts
         *   0W
         *   0D
         *   0 played
         */

        for (
          const playerId of scopedIds
        ) {
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
         * --------------------------------------------------
         * 6. Sort leaderboard
         * --------------------------------------------------
         *
         * Primary:
         *   Total points
         *
         * Secondary:
         *   Wins
         *
         * Third:
         *   Games played
         *
         * Fourth:
         *   Name
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
      } catch (error) {
        console.error(
          'LEADERBOARD UNEXPECTED ERROR:',
          error,
        );

        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchLeaderboard(filter);
  }, [
    filter,
    fetchLeaderboard,
  ]);

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
        ) : rows.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              {
                backgroundColor:
                  colors.card,
                borderColor:
                  colors.border,
              },
            ]}
          >
            <Trophy
              size={30}
              color={colors.muted}
            />

            <Text
              style={[
                styles.emptyText,
                {
                  color:
                    colors.text,
                },
              ]}
            >
              No scores yet
            </Text>

            <Text
              style={[
                styles.mutedText,
                {
                  color:
                    colors.muted,
                },
              ]}
            >
              Play a game to appear on
              the leaderboard.
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
    paddingHorizontal: 30,
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
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