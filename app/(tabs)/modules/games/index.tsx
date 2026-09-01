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
  ChevronLeft,
  Crown,
  Grid3X3,
  Hash,
  Search,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react-native';

import { router } from 'expo-router';

import { useApp } from '@/components/AppProvider';

import { supabase } from '@/lib/supabase';

import { useEffect, useState } from 'react';

type GameKey =
  | 'chess'
  | 'tictactoe'
  | 'sudoku'
  | 'wordsearch'
  | 'sequence';

type Mode = 'computer' | 'friend';

type Difficulty = 'easy' | 'medium' | 'hard';

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
}

const MULTIPLAYER_GAMES: GameDef[] = [
  {
    key: 'chess',
    name: 'Chess',
    icon: Crown,
    multiplayer: true,
  },
  {
    key: 'tictactoe',
    name: 'Tic-Tac-Toe',
    icon: Grid3X3,
    multiplayer: true,
  },
];

const SOLO_GAMES: GameDef[] = [
  {
    key: 'sudoku',
    name: 'Sudoku',
    icon: Hash,
    multiplayer: false,
  },
  {
    key: 'wordsearch',
    name: 'Word Search',
    icon: Search,
    multiplayer: false,
  },
  {
    key: 'sequence',
    name: 'Sequence',
    icon: TrendingUp,
    multiplayer: false,
  },
];

const DIFFICULTIES: {
  key: Difficulty;
  label: string;
}[] = [
  {
    key: 'easy',
    label: 'Easy',
  },
  {
    key: 'medium',
    label: 'Medium',
  },
  {
    key: 'hard',
    label: 'Hard',
  },
];

const GAME_NAMES: Record<GameKey, string> = {
  chess: 'Chess',
  tictactoe: 'Tic-Tac-Toe',
  sudoku: 'Sudoku',
  wordsearch: 'Word Search',
  sequence: 'Sequence',
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);

  const first = parts[0]?.[0] ?? '?';

  const second =
    parts.length > 1
      ? parts[parts.length - 1][0]
      : '';

  return (first + second).toUpperCase();
}

export default function GamesScreen() {
  const {
    isDark,
    accentForeground,
    accentWash,
    onAccent,
  } = useApp();

  const colors = {
    bg: isDark ? '#090909' : '#FBFAF8',
    card: isDark ? '#151515' : '#FFFFFF',
    border: isDark ? '#2A2A2A' : '#ECE9E4',
    text: isDark ? '#F4F2EE' : '#27241F',
    muted: isDark ? '#AAA59D' : '#8F8A82',
    sheet: isDark ? '#151515' : '#FFFFFF',
    accent: accentForeground,
    accentWash,
    onAccent,
  };

  const [sheetVisible, setSheetVisible] = useState(false);

  const [selectedGame, setSelectedGame] =
    useState<GameDef | null>(null);

  const [mode, setMode] =
    useState<Mode>('computer');

  const [difficulty, setDifficulty] =
    useState<Difficulty>('easy');

  const [invitedFriend, setInvitedFriend] =
    useState<Friend | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [friends, setFriends] =
    useState<Friend[]>([]);

  const [friendsLoading, setFriendsLoading] =
    useState(false);

  const [friendSearch, setFriendSearch] =
    useState('');

  const [activeGames, setActiveGames] =
    useState<ActiveGame[]>([]);

  const [, setMyId] =
    useState<string | null>(null);

  useEffect(() => {
    loadFriends();
    loadActiveGames();
  }, []);

  async function loadFriends() {
    setFriendsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const myUid = user?.id;

      if (!myUid) {
        setFriends([]);
        return;
      }

      const { data: friendRows, error } =
        await supabase
          .from('friendships')
          .select('user_id, friend_user_id')
          .or(
            `user_id.eq.${myUid},friend_user_id.eq.${myUid}`
          );

      if (error) {
        console.error(
          'LOAD FRIENDS ERROR:',
          error
        );

        setFriends([]);
        return;
      }

      const friendIds = [
        ...new Set(
          (friendRows ?? []).map((r) =>
            r.user_id === myUid
              ? r.friend_user_id
              : r.user_id
          )
        ),
      ];

      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      const {
        data: profileRows,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', friendIds);

      if (profileError) {
        console.error(
          'LOAD FRIEND PROFILES ERROR:',
          profileError
        );

        setFriends([]);
        return;
      }

      setFriends(
        (profileRows ?? []).map((p) => ({
          id: p.user_id,
          display_name:
            p.display_name ?? 'Friend',
        }))
      );
    } catch (error) {
      console.error(
        'LOAD FRIENDS UNEXPECTED ERROR:',
        error
      );

      setFriends([]);
    } finally {
      setFriendsLoading(false);
    }
  }

  async function loadActiveGames() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const myUid = user?.id;

      setMyId(myUid ?? null);

      if (!myUid) {
        setActiveGames([]);
        return;
      }

      const {
        data: sessionRows,
        error,
      } = await supabase
        .from('game_sessions')
        .select(
          'id, game, created_by, opponent_id, turn_user_id, status'
        )
        .eq('mode', 'multiplayer')
        .eq('opponent_type', 'friend')
        .eq('status', 'active')
        .or(
          `created_by.eq.${myUid},opponent_id.eq.${myUid}`
        );

      if (error) {
        console.error(
          'LOAD ACTIVE GAMES ERROR:',
          error
        );

        setActiveGames([]);
        return;
      }

      const rows = sessionRows ?? [];

      if (rows.length === 0) {
        setActiveGames([]);
        return;
      }

      const otherIds = [
        ...new Set(
          rows
            .map((r) =>
              r.created_by === myUid
                ? r.opponent_id
                : r.created_by
            )
            .filter(Boolean)
        ),
      ];

      if (otherIds.length === 0) {
        setActiveGames([]);
        return;
      }

      const {
        data: profileRows,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', otherIds as string[]);

      if (profileError) {
        console.error(
          'LOAD ACTIVE GAME PROFILES ERROR:',
          profileError
        );

        setActiveGames([]);
        return;
      }

      const nameById = new Map(
        (profileRows ?? []).map((p) => [
          p.user_id,
          p.display_name ?? 'Friend',
        ])
      );

      setActiveGames(
        rows.map((r) => {
          const otherId =
            r.created_by === myUid
              ? r.opponent_id
              : r.created_by;

          return {
            id: r.id,
            game: r.game as GameKey,
            opponentName:
              nameById.get(otherId) ?? 'Friend',
            isMyTurn:
              r.turn_user_id === myUid,
          };
        })
      );
    } catch (error) {
      console.error(
        'LOAD ACTIVE GAMES UNEXPECTED ERROR:',
        error
      );

      setActiveGames([]);
    }
  }

  function openActiveGame(g: ActiveGame) {
    router.push({
      pathname: `/modules/games/${g.game}`,
      params: {
        sessionId: g.id,
        opponent: 'friend',
      },
    });
  }

  const filteredFriends = friendSearch.trim()
    ? friends.filter((f) =>
        f.display_name
          .toLowerCase()
          .includes(
            friendSearch.trim().toLowerCase()
          )
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

  function toggleFriend(friend: Friend) {
    setInvitedFriend((prev) =>
      prev?.id === friend.id
        ? null
        : friend
    );
  }

  async function handleStart() {
    if (!selectedGame) return;

    if (
      selectedGame.multiplayer &&
      mode === 'friend' &&
      !invitedFriend
    ) {
      return;
    }

    if (loading) return;

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error(
          'GET USER ERROR:',
          userError
        );
        return;
      }

      const createdBy = user?.id;

      if (!createdBy) {
        console.error(
          'START GAME ERROR: No authenticated user found.'
        );
        return;
      }

      const gameName = selectedGame.key;

      const opponentType =
        selectedGame.multiplayer
          ? mode
          : null;

      const opponentId =
        selectedGame.multiplayer &&
        mode === 'friend'
          ? invitedFriend?.id ?? null
          : null;

      console.log(
        'STARTING GAME:',
        gameName,
        {
          mode: selectedGame.multiplayer
            ? 'multiplayer'
            : 'solo',
          opponentType,
          opponentId,
          difficulty,
          createdBy,
        }
      );

      const {
        data: session,
        error: sessionError,
      } = await supabase
        .from('game_sessions')
        .insert({
          game: gameName,
          mode: selectedGame.multiplayer
            ? 'multiplayer'
            : 'solo',
          opponent_type: opponentType,
          opponent_id: opponentId,
          difficulty,
          created_by: createdBy,
          status: 'active',
        })
        .select('id')
        .single();

      if (sessionError) {
        console.error(
          'CREATE GAME SESSION ERROR:',
          sessionError
        );
        return;
      }

      if (!session?.id) {
        console.error(
          'CREATE GAME SESSION ERROR: No session ID returned.'
        );
        return;
      }

      const sessionId = session.id;

      console.log(
        'GAME SESSION CREATED:',
        sessionId
      );

      setSheetVisible(false);
      setSelectedGame(null);

      switch (gameName) {
        case 'chess':
          router.push({
            pathname:
              '/modules/games/chess',
            params: {
              sessionId,
              opponent: mode,
              difficulty,
            },
          });
          break;

        case 'tictactoe':
          router.push({
            pathname:
              '/modules/games/tictactoe',
            params: {
              sessionId,
              opponent: mode,
              difficulty,
            },
          });
          break;

        case 'sudoku':
          router.push({
            pathname:
              '/modules/games/sudoku',
            params: {
              sessionId,
              difficulty,
            },
          });
          break;

        case 'wordsearch':
          router.push({
            pathname:
              '/modules/games/wordsearch',
            params: {
              sessionId,
              difficulty,
            },
          });
          break;

        case 'sequence':
          router.push({
            pathname:
              '/modules/games/sequence',
            params: {
              sessionId,
              difficulty,
            },
          });
          break;

        default:
          console.error(
            'Unknown game:',
            gameName
          );
      }
    } catch (error) {
      console.error(
        'START GAME UNEXPECTED ERROR:',
        error
      );
    } finally {
      setLoading(false);
    }
  }

  function renderTile(game: GameDef) {
    const Icon = game.icon;

    return (
      <Pressable
        key={game.key}
        style={({ pressed }) => [
          styles.tile,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
          pressed && {
            opacity: 0.75,
          },
        ]}
        onPress={() => openSheet(game)}
      >
        <View
          style={[
            styles.tileIconWrap,
            {
              backgroundColor:
                colors.accent,
            },
          ]}
        >
          <Icon
            color="#FFFFFF"
            size={24}
          />
        </View>

        <Text
          style={[
            styles.tileName,
            {
              color: colors.text,
            },
          ]}
        >
          {game.name}
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.root,
        {
          backgroundColor:
            colors.bg,
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
            router.push('/modules')
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
          GAMES
        </Text>

        <Pressable
          style={styles.headerBtn}
          onPress={() =>
            router.push(
              '/modules/games/leaderboard'
            )
          }
        >
          <Trophy
            color={colors.text}
            size={22}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.scroll
        }
        showsVerticalScrollIndicator={false}
      >
        {activeGames.length > 0 && (
          <>
            <Text
              style={[
                styles.sectionLabel,
                {
                  color: colors.muted,
                },
              ]}
            >
              YOUR GAMES
            </Text>

            <View
              style={{
                gap: 8,
                marginBottom: 24,
              }}
            >
              {activeGames.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() =>
                    openActiveGame(g)
                  }
                  style={[
                    styles.activeRow,
                    {
                      backgroundColor:
                        colors.card,
                      borderColor:
                        colors.border,
                    },
                  ]}
                >
                  <View>
                    <Text
                      style={[
                        styles.activeRowTitle,
                        {
                          color:
                            colors.text,
                        },
                      ]}
                    >
                      {GAME_NAMES[g.game]} vs{' '}
                      {g.opponentName}
                    </Text>

                    <Text
                      style={[
                        styles.activeRowSub,
                        {
                          color:
                            colors.muted,
                        },
                      ]}
                    >
                      {g.isMyTurn
                        ? 'Your turn'
                        : 'Waiting for opponent'}
                    </Text>
                  </View>

                  {g.isMyTurn && (
                    <View
                      style={[
                        styles.turnDot,
                        {
                          backgroundColor:
                            colors.accent,
                        },
                      ]}
                    />
                  )}
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text
          style={[
            styles.sectionLabel,
            {
              color: colors.muted,
            },
          ]}
        >
          MULTIPLAYER
        </Text>

        <View style={styles.grid}>
          {MULTIPLAYER_GAMES.map(
            renderTile
          )}
        </View>

        <Text
          style={[
            styles.sectionLabel,
            {
              marginTop: 24,
              color: colors.muted,
            },
          ]}
        >
          SOLO
        </Text>

        <View style={styles.grid}>
          {SOLO_GAMES.map(renderTile)}
        </View>
      </ScrollView>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!loading) {
            closeSheet();
          }
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (!loading) {
              closeSheet();
            }
          }}
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor:
                colors.sheet,
            },
          ]}
        >
          <View
            style={styles.sheetHeader}
          >
            <Text
              style={[
                styles.sheetTitle,
                {
                  color: colors.accent,
                },
              ]}
            >
              {selectedGame?.name}
            </Text>

            <Pressable
              onPress={() => {
                if (!loading) {
                  closeSheet();
                }
              }}
              style={[
                styles.sheetClose,
                {
                  backgroundColor:
                    colors.card,
                },
              ]}
            >
              <X
                color={colors.muted}
                size={20}
              />
            </Pressable>
          </View>

          {selectedGame?.multiplayer && (
            <View
              style={styles.pillRow}
            >
              <Pressable
                style={[
                  styles.pill,
                  {
                    borderColor:
                      colors.border,
                    backgroundColor:
                      colors.card,
                  },
                  mode === 'computer' && {
                    backgroundColor:
                      colors.accent,
                    borderColor:
                      colors.accent,
                  },
                ]}
                onPress={() =>
                  setMode('computer')
                }
              >
                <Text
                  style={[
                    styles.pillText,
                    {
                      color:
                        colors.muted,
                    },
                    mode === 'computer' && {
                      color:
                        colors.onAccent,
                    },
                  ]}
                >
                  VS Computer
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.pill,
                  {
                    borderColor:
                      colors.border,
                    backgroundColor:
                      colors.card,
                  },
                  mode === 'friend' && {
                    backgroundColor:
                      colors.accent,
                    borderColor:
                      colors.accent,
                  },
                ]}
                onPress={() =>
                  setMode('friend')
                }
              >
                <Text
                  style={[
                    styles.pillText,
                    {
                      color:
                        colors.muted,
                    },
                    mode === 'friend' && {
                      color:
                        colors.onAccent,
                    },
                  ]}
                >
                  Play with Friend
                </Text>
              </Pressable>
            </View>
          )}

          {(
            !selectedGame?.multiplayer ||
            mode === 'computer' ||
            selectedGame.key !== 'chess'
          ) && (
            <>
              <Text
                style={[
                  styles.sheetSectionLabel,
                  {
                    color:
                      colors.muted,
                  },
                ]}
              >
                DIFFICULTY
              </Text>

              <View
                style={styles.pillRow}
              >
                {DIFFICULTIES.map(
                  (d) => (
                    <Pressable
                      key={d.key}
                      style={[
                        styles.pill,
                        {
                          borderColor:
                            colors.border,
                          backgroundColor:
                            colors.card,
                        },
                        difficulty ===
                          d.key && {
                          backgroundColor:
                            colors.accent,
                          borderColor:
                            colors.accent,
                        },
                      ]}
                      onPress={() =>
                        setDifficulty(
                          d.key
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.pillText,
                          {
                            color:
                              colors.muted,
                          },
                          difficulty ===
                            d.key && {
                            color:
                              colors.onAccent,
                          },
                        ]}
                      >
                        {d.label}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            </>
          )}

          {selectedGame?.multiplayer &&
            mode === 'friend' && (
              <>
                <Text
                  style={[
                    styles.sheetSectionLabel,
                    {
                      color:
                        colors.muted,
                    },
                  ]}
                >
                  INVITE FRIENDS
                </Text>

                <View
                  style={[
                    styles.searchBar,
                    {
                      backgroundColor:
                        colors.card,
                      borderColor:
                        colors.border,
                    },
                  ]}
                >
                  <Search
                    color={colors.muted}
                    size={16}
                  />

                  <TextInput
                    style={[
                      styles.searchInput,
                      {
                        color:
                          colors.text,
                      },
                    ]}
                    value={friendSearch}
                    onChangeText={
                      setFriendSearch
                    }
                    placeholder="Search friends by name..."
                    placeholderTextColor={
                      colors.muted
                    }
                    autoCapitalize="none"
                  />
                </View>

                {friendsLoading ? (
                  <Text
                    style={[
                      styles.friendsHint,
                      {
                        color:
                          colors.muted,
                      },
                    ]}
                  >
                    Loading friends…
                  </Text>
                ) : friends.length ===
                  0 ? (
                  <Text
                    style={[
                      styles.friendsHint,
                      {
                        color:
                          colors.muted,
                      },
                    ]}
                  >
                    No friends yet — add
                    some first!
                  </Text>
                ) : filteredFriends.length ===
                  0 ? (
                  <Text
                    style={[
                      styles.friendsHint,
                      {
                        color:
                          colors.muted,
                      },
                    ]}
                  >
                    No matches for "
                    {friendSearch}"
                  </Text>
                ) : (
                  <ScrollView
                    style={
                      styles.friendsList
                    }
                    showsVerticalScrollIndicator={
                      false
                    }
                  >
                    {filteredFriends.map(
                      (f) => {
                        const selected =
                          invitedFriend?.id ===
                          f.id;

                        return (
                          <Pressable
                            key={f.id}
                            onPress={() =>
                              toggleFriend(
                                f
                              )
                            }
                            style={[
                              styles.friendRow,
                              {
                                borderColor:
                                  colors.border,
                                backgroundColor:
                                  colors.card,
                              },
                              selected && {
                                borderColor:
                                  colors.accent,
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.avatar,
                                {
                                  backgroundColor:
                                    colors.bg,
                                  borderColor:
                                    colors.border,
                                },
                                selected && {
                                  borderColor:
                                    colors.accent,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.avatarText,
                                  {
                                    color:
                                      colors.text,
                                  },
                                ]}
                              >
                                {initialsFor(
                                  f.display_name
                                )}
                              </Text>
                            </View>

                            <Text
                              style={[
                                styles.friendRowName,
                                {
                                  color:
                                    colors.text,
                                },
                              ]}
                              numberOfLines={
                                1
                              }
                            >
                              {
                                f.display_name
                              }
                            </Text>

                            {selected && (
                              <View
                                style={[
                                  styles.selectedDot,
                                  {
                                    backgroundColor:
                                      colors.accent,
                                  },
                                ]}
                              />
                            )}
                          </Pressable>
                        );
                      }
                    )}
                  </ScrollView>
                )}
              </>
            )}

          <Pressable
            style={({ pressed }) => [
              styles.startBtn,
              {
                backgroundColor:
                  colors.accent,
              },
              pressed && {
                opacity: 0.85,
              },
              loading && {
                opacity: 0.6,
              },
              selectedGame?.multiplayer &&
                mode === 'friend' &&
                !invitedFriend && {
                  opacity: 0.4,
                },
            ]}
            onPress={handleStart}
            disabled={
              loading ||
              !selectedGame ||
              (selectedGame.multiplayer &&
                mode === 'friend' &&
                !invitedFriend)
            }
          >
            <Text
              style={[
                styles.startBtnText,
                {
                  color:
                    colors.onAccent,
                },
              ]}
            >
              {loading
                ? 'Starting…'
                : selectedGame?.multiplayer
                ? 'Start Match'
                : 'Start Game'}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  headerBack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 20,
    letterSpacing: 2,
  },

  scroll: {
    padding: 16,
    paddingBottom: 48,
  },

  sectionLabel: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 14,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  tile: {
    flexBasis: '31%',
    flexGrow: 0,
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },

  tileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tileName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 4,
  },

  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  activeRowTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
  },

  activeRowSub: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    marginTop: 2,
  },

  turnDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor:
      'rgba(0,0,0,0.6)',
  },

  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 16,
  },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  sheetTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 20,
  },

  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sheetSectionLabel: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: -4,
  },

  pillRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },

  pill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },

  pillText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  searchInput: {
    flex: 1,
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    padding: 0,
  },

  friendsHint: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },

  friendsList: {
    maxHeight: 180,
  },

  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },

  friendRowName: {
    flex: 1,
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
  },

  selectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
  },

  startBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },

  startBtnText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
  },
});