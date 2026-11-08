import { useCallback, useEffect, useState } from 'react';

import {
  Pressable,
  ScrollView,
  StatusBar,
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

export default function LeaderboardScreen() {
  const {
    isDark,
    accentForeground,
    accentColor: rawAccent,
    onAccent,
  } = useApp() as any;

  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);

  const colors = {
    background: pageBg,
    card: isDark ? '#121212' : '#FFFFFF',
    cardText: isDark ? '#FFFFFF' : '#000000',
    cardMuted: isDark ? '#A1A1AA' : '#52525B',
    border: '#000000',
    text: '#000000',
    accent: pageBg,
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

        const scopedIds = [
          currentUserId,
          ...friendIds.filter(
            (id) =>
              id !== currentUserId
          ),
        ];

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
      <StatusBar
        barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

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
        <View style={styles.shadowBackdropSmall}>
          <View style={styles.shadowBackdropSmallInner} />
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.headerBack,
            pressed && styles.pressedBtn,
          ]}
          onPress={() =>
            router.back()
          }
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.8}
          />
        </Pressable>

        <Text
          style={[
            styles.headerTitle,
            {
              color: '#000000',
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
            color="#000000"
            strokeWidth={2.5}
          />
        </View>
      </View>

      {/* Independent Game Filters */}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {GAME_FILTERS.map((game) => {
          const selected = filter === game.key;
          return (
            <div key={game.key} style={styles.filterWrapper}>
              <div style={styles.filterShadowBackdrop} />
              <Pressable
                onPress={() => setFilter(game.key)}
                style={({ pressed }) => [
                  styles.filterPill,
                  {
                    borderColor: '#000000',
                    backgroundColor: selected
                      ? '#000000'
                      : '#FFFFFF',
                  },
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    {
                      color: selected
                        ? pageBg
                        : '#000000',
                    },
                  ]}
                >
                  {game.label}
                </Text>
              </Pressable>
            </div>
          );
        })}
      </ScrollView>

      {/* Leaderboard Card Board */}

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
                  color: '#000000',
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
              color="#000000"
              strokeWidth={2.5}
            />

            <Text
              style={[
                styles.emptyText,
                {
                  color: '#000000',
                },
              ]}
            >
              No scores yet.
            </Text>

            <Text
              style={[
                styles.mutedText,
                {
                  color: '#000000',
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
            style={
              styles.cardContainer
            }
          >
            <View style={styles.cardShadowBackdrop} />
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
                              ? pageBg
                              : colors.card,
                        },

                        index <
                          rows.length -
                            1 && {
                          borderBottomWidth:
                            2,

                          borderBottomColor:
                            isMe
                              ? '#000000'
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
                                ? '#000000'
                                : colors.cardText,
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
                                  ? '#000000'
                                  : colors.cardText,
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
                                  ? '#000000'
                                  : colors.cardMuted,

                              opacity:
                                isMe
                                  ? 0.85
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
                                ? '#000000'
                                : isDark
                                  ? pageBg
                                  : '#000000',
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
    pressedBtn: {
      transform: [{ translateX: 2 }, { translateY: 2 }],
    },

    header: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      paddingHorizontal:
        20,

      paddingTop: 12,

      paddingBottom: 10,

      zIndex: 100,
    },

    headerBack: {
      width: 40,

      height: 40,

      borderRadius: 8,

      backgroundColor: '#000000',

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    shadowBackdropSmall: {
      position: 'absolute',
      top: 16,
      left: 24,
      width: 40,
      height: 40,
      backgroundColor: '#000000',
      borderRadius: 8,
    },
    shadowBackdropSmallInner: {
      width: '100%',
      height: '100%',
    },

    headerRight: {
      width: 40,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    headerTitle: {
      fontFamily:
        'Poppins-ExtraBold',

      fontSize: 20,

      letterSpacing: 1,
    },

    filterScroll: {
      flexGrow: 0,
      marginVertical: 6,
    },

    filterRow: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 6,
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
      paddingVertical: 9,
      borderRadius: 8,
      borderWidth: 2,
    },

    filterPillText: {
      fontFamily:
        'Poppins-Bold',

      fontSize: 12,
    },

    scroll: {
      flex: 1,
    },

    scrollContent: {
      paddingHorizontal: 18,

      paddingTop: 8,

      paddingBottom: 40,
    },

    cardContainer: {
      position: 'relative',
      width: '100%',
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

    card: {
      borderRadius: 16,

      borderWidth: 3,

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
        14,

      gap: 12,
    },

    rank: {
      fontFamily:
        'Poppins-ExtraBold',

      fontSize: 15,

      width: 36,

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
        'Poppins-ExtraBold',

      fontSize: 15,
    },

    gameStats: {
      fontFamily:
        'Poppins-Medium',

      fontSize: 11,
    },

    score: {
      fontFamily:
        'Poppins-ExtraBold',

      fontSize: 16,

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
        'Poppins-Bold',

      fontSize: 16,
    },

    mutedText: {
      fontFamily:
        'Poppins-Medium',

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