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
  | 'tictactoe'
  | 'sudoku'
  | 'wordsearch'
  | 'sequence';

type LeaderboardRow = {
  player_id: string;
  display_name: string | null;
  total_points: number;
  wins: number;
  draws: number;
  games_played: number;
};

const GAME_FILTERS: {
  key: GameFilter;
  label: string;
}[] = [
  {
    key: 'all',
    label: 'All',
  },
  {
    key: 'tictactoe',
    label: 'Tic-Tac-Toe',
  },
  {
    key: 'sudoku',
    label: 'Sudoku',
  },
  {
    key: 'wordsearch',
    label: 'Word Search',
  },
  {
    key: 'sequence',
    label: 'Sequence',
  },
];

function getRankDisplay(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';

  return `#${rank}`;
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

  const fetchLeaderboard =
    useCallback(
      async (
        activeFilter: GameFilter
      ) => {
        setLoading(true);

        const {
          data: { user },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (userError) {
          console.error(
            'LEADERBOARD USER ERROR:',
            userError
          );
        }

        const currentUserId =
          user?.id ?? null;

        setMyId(currentUserId);

        if (!currentUserId) {
          setRows([]);
          setLoading(false);
          return;
        }

        /*
         * FRIENDS
         *
         * friendships uses:
         * user_id
         * friend_user_id
         *
         * A friendship can have the current
         * user in either column, so check both.
         */

        const {
          data: friendRows,
          error: friendError,
        } =
          await supabase
            .from('friendships')
            .select(
              'user_id, friend_user_id'
            )
            .or(
              `user_id.eq.${currentUserId},friend_user_id.eq.${currentUserId}`
            );

        if (friendError) {
          console.error(
            'LEADERBOARD FRIEND ERROR:',
            friendError
          );

          setRows([]);
          setLoading(false);
          return;
        }

        /*
         * Extract the OTHER person from each
         * friendship row.
         */

        const friendIds = [
          ...new Set(
            (friendRows ?? [])
              .map((friendship) => {
                if (
                  friendship.user_id ===
                  currentUserId
                ) {
                  return friendship.friend_user_id;
                }

                if (
                  friendship.friend_user_id ===
                  currentUserId
                ) {
                  return friendship.user_id;
                }

                return null;
              })
              .filter(
                (
                  id
                ): id is string =>
                  Boolean(id)
              )
          ),
        ];

        /*
         * Include yourself so you always appear
         * alongside your friends.
         */

        const scopedIds = [
          currentUserId,
          ...friendIds.filter(
            (id) =>
              id !== currentUserId
          ),
        ];

        /*
         * PROFILES
         */

        const {
          data: profileRows,
          error: profileError,
        } =
          await supabase
            .from('profiles')
            .select(
              'user_id, display_name'
            )
            .in(
              'user_id',
              scopedIds
            );

        if (profileError) {
          console.error(
            'LEADERBOARD PROFILE ERROR:',
            profileError
          );
        }

        const nameById =
          new Map<string, string>();

        for (
          const profile of
            profileRows ?? []
        ) {
          nameById.set(
            profile.user_id,
            profile.display_name ??
              'Player'
          );
        }

        /*
         * GAME SCORES
         *
         * Only retrieve scores belonging to
         * yourself and your friends.
         */

        let query = supabase
          .from('game_scores')
          .select(
            'player_id, game, result, points'
          )
          .in(
            'player_id',
            scopedIds
          )
          .in('game', [
            'tictactoe',
            'sudoku',
            'wordsearch',
            'sequence',
          ]);

        if (
          activeFilter !== 'all'
        ) {
          query = query.eq(
            'game',
            activeFilter
          );
        }

        const {
          data: scoreRows,
          error: scoreError,
        } =
          await query;

        if (scoreError) {
          console.error(
            'LEADERBOARD SCORE ERROR:',
            scoreError
          );

          setRows([]);
          setLoading(false);
          return;
        }

        /*
         * AGGREGATE SCORES
         */

        const totals =
          new Map<
            string,
            LeaderboardRow
          >();

        for (
          const score of
            scoreRows ?? []
        ) {
          const playerId =
            score.player_id;

          if (!playerId) {
            continue;
          }

          /*
           * Never count abandoned games.
           */

          if (
            score.result ===
            'abandoned'
          ) {
            continue;
          }

          const points =
            Number(
              score.points ?? 0
            );

          const isWin =
            score.result ===
              'win' ||
            score.result ===
              'x_wins' ||
            score.result ===
              'o_wins';

          const isDraw =
            score.result ===
            'draw';

          const existing =
            totals.get(
              playerId
            );

          if (existing) {
            existing.total_points +=
              points;

            existing.games_played +=
              1;

            if (isWin) {
              existing.wins += 1;
            }

            if (isDraw) {
              existing.draws += 1;
            }
          } else {
            totals.set(
              playerId,
              {
                player_id:
                  playerId,

                display_name:
                  nameById.get(
                    playerId
                  ) ??
                  'Player',

                total_points:
                  points,

                wins:
                  isWin ? 1 : 0,

                draws:
                  isDraw ? 1 : 0,

                games_played: 1,
              }
            );
          }
        }

        /*
         * Add yourself/friends even if they have
         * not played the selected game yet.
         */

        for (
          const playerId of
            scopedIds
        ) {
          if (
            !totals.has(
              playerId
            )
          ) {
            totals.set(
              playerId,
              {
                player_id:
                  playerId,

                display_name:
                  nameById.get(
                    playerId
                  ) ??
                  'Player',

                total_points: 0,

                wins: 0,

                draws: 0,

                games_played: 0,
              }
            );
          }
        }

        /*
         * SORT
         *
         * 1. Points
         * 2. Wins
         * 3. Games played
         * 4. Name
         */

        const sorted = [
          ...totals.values(),
        ].sort(
          (
            a,
            b
          ) => {
            if (
              b.total_points !==
              a.total_points
            ) {
              return (
                b.total_points -
                a.total_points
              );
            }

            if (
              b.wins !==
              a.wins
            ) {
              return (
                b.wins -
                a.wins
              );
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

            return (
              (
                a.display_name ??
                'Player'
              ).localeCompare(
                b.display_name ??
                  'Player'
              )
            );
          }
        );

        setRows(sorted);
        setLoading(false);
      },
      []
    );

  useEffect(() => {
    fetchLeaderboard(
      filter
    );
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
      {/* Header */}

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
              color:
                colors.accent,
            },
          ]}
        >
          LEADERBOARD
        </Text>

        <View
          style={
            styles.headerRight
          }
        >
          <Trophy
            size={22}
            color={
              colors.accent
            }
          />
        </View>
      </View>

      {/* Game filters */}

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
        {GAME_FILTERS.map(
          (game) => (
            <Pressable
              key={game.key}
              onPress={() =>
                setFilter(
                  game.key
                )
              }
              style={[
                styles.filterPill,
                {
                  borderColor:
                    colors.border,
                  backgroundColor:
                    colors.card,
                },
                filter ===
                  game.key && {
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
                  filter ===
                    game.key && {
                    color:
                      colors.onAccent,
                  },
                ]}
              >
                {game.label}
              </Text>
            </Pressable>
          )
        )}
      </ScrollView>

      {/* Leaderboard */}

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
            style={
              styles.centerState
            }
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
        ) : rows.length ===
          0 ? (
          <View
            style={
              styles.emptyState
            }
          >
            <Trophy
              size={36}
              color={
                colors.muted
              }
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
              No scores yet.
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
              Play a game to
              appear on the
              leaderboard!
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
              (
                entry,
                index
              ) => {
                const rank =
                  index + 1;

                const isMe =
                  entry.player_id ===
                  myId;

                return (
                  <View
                    key={
                      entry.player_id
                    }
                    style={[
                      styles.row,

                      {
                        backgroundColor:
                          isMe
                            ? colors.accent
                            : colors.card,
                      },

                      index <
                        rows.length -
                          1 && {
                        borderBottomWidth:
                          1,

                        borderBottomColor:
                          isMe
                            ? colors.onAccent
                            : colors.border,
                      },
                    ]}
                  >
                    {/* Rank */}

                    <Text
                      style={[
                        styles.rank,
                        {
                          color:
                            isMe
                              ? colors.onAccent
                              : colors.text,
                        },

                        rank <= 3 &&
                          styles.medalRank,
                      ]}
                    >
                      {getRankDisplay(
                        rank
                      )}
                    </Text>

                    {/* Player */}

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
                              isMe
                                ? colors.onAccent
                                : colors.text,
                          },
                        ]}
                        numberOfLines={
                          1
                        }
                      >
                        {entry.display_name ??
                          'Player'}

                        {isMe
                          ? ' (You)'
                          : ''}
                      </Text>

                      <Text
                        style={[
                          styles.gameStats,
                          {
                            color:
                              isMe
                                ? colors.onAccent
                                : colors.muted,

                            opacity:
                              isMe
                                ? 0.9
                                : 1,
                          },
                        ]}
                      >
                        {entry.wins}
                        W ·{' '}
                        {entry.draws}
                        D ·{' '}
                        {
                          entry.games_played
                        }{' '}
                        played
                      </Text>
                    </View>

                    {/* Score */}

                    <Text
                      style={[
                        styles.score,
                        {
                          color:
                            isMe
                              ? colors.onAccent
                              : colors.text,
                        },
                      ]}
                    >
                      {entry.total_points.toLocaleString()}
                    </Text>
                  </View>
                );
              }
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
    },

    header: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      paddingHorizontal:
        16,

      paddingTop: 28,

      paddingVertical:
        14,

      borderBottomWidth:
        1,
    },

    headerBack: {
      width: 38,

      height: 38,

      borderRadius: 19,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    headerRight: {
      width: 38,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    headerTitle: {
      fontFamily:
        'Poppins-ExtraBold',

      fontSize: 16,

      letterSpacing: 1.5,
    },

    filterScroll: {
      flexGrow: 0,

      borderBottomWidth:
        1,
    },

    filterRow: {
      flexDirection:
        'row',

      gap: 8,

      paddingHorizontal:
        16,

      paddingVertical:
        12,
    },

    filterPill: {
      paddingHorizontal:
        14,

      paddingVertical:
        7,

      borderRadius: 18,

      borderWidth: 1,
    },

    filterPillText: {
      fontFamily:
        'Poppins-Medium',

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
      flexDirection:
        'row',

      alignItems:
        'center',

      paddingHorizontal:
        16,

      paddingVertical:
        12,

      gap: 12,
    },

    rank: {
      fontFamily:
        'Poppins-Bold',

      fontSize: 14,

      width: 32,

      textAlign:
        'left',
    },

    medalRank: {
      fontSize: 21,

      lineHeight: 25,
    },

    rowMiddle: {
      flex: 1,

      gap: 2,
    },

    playerName: {
      fontFamily:
        'Poppins-Medium',

      fontSize: 14,
    },

    gameStats: {
      fontFamily:
        'Poppins-Regular',

      fontSize: 11,
    },

    score: {
      fontFamily:
        'Poppins-Bold',

      fontSize: 15,

      textAlign:
        'right',

      minWidth: 56,
    },

    emptyState: {
      alignItems:
        'center',

      justifyContent:
        'center',

      paddingVertical:
        60,

      gap: 10,
    },

    emptyText: {
      fontFamily:
        'Poppins-SemiBold',

      fontSize: 16,
    },

    mutedText: {
      fontFamily:
        'Poppins-Regular',

      fontSize: 13,

      textAlign:
        'center',
    },

    centerState: {
      flex: 1,

      alignItems:
        'center',

      justifyContent:
        'center',

      paddingTop: 80,

      gap: 12,
    },
  });