import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';
import { randomWordsForLevel, randInt, shuffle } from '@/components/games-utils';

type Difficulty = 'easy' | 'medium' | 'hard';

type Placement = {
  word: string;
  row: number;
  col: number;
  dr: number;
  dc: number;
  cells: number[];
};

const TIME_LIMIT = 180;
const POINTS_PER_WORD = 10;

const WORD_COUNT_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 30,
};

const GRID_SIZE_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 10,
  medium: 13,
  hard: 16,
};

const GEN_LEVEL_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 1,
  medium: 3,
  hard: 5,
};

function difficultyFromParams(
  difficultyParam?: string,
  levelParam?: string,
): Difficulty {
  if (
    difficultyParam === 'easy' ||
    difficultyParam === 'medium' ||
    difficultyParam === 'hard'
  ) {
    return difficultyParam;
  }

  const n = parseInt(levelParam ?? '1', 10);

  if (n <= 1) return 'easy';
  if (n <= 3) return 'medium';
  return 'hard';
}

function difficultyLabel(difficulty: Difficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');

  const remainingSeconds = (seconds % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${remainingSeconds}`;
}

function generateGrid(
  words: string[],
  gridSize: number,
): {
  grid: string[];
  placements: Placement[];
} {
  const grid: string[] = Array(gridSize * gridSize).fill('');
  const placements: Placement[] = [];

  const directions = shuffle([
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, -1],
    [-1, 1],
  ]);

  for (const word of words) {
    let placed = false;

    for (let attempt = 0; attempt < 100 && !placed; attempt++) {
      const [dr, dc] = directions[attempt % directions.length];

      const maxRow =
        dr > 0
          ? gridSize - word.length
          : dr < 0
            ? word.length - 1
            : gridSize - 1;

      const minRow = dr < 0 ? word.length - 1 : 0;

      const maxCol =
        dc > 0
          ? gridSize - word.length
          : dc < 0
            ? word.length - 1
            : gridSize - 1;

      const minCol = dc < 0 ? word.length - 1 : 0;

      if (maxRow < minRow || maxCol < minCol) {
        continue;
      }

      const row = randInt(minRow, maxRow);
      const col = randInt(minCol, maxCol);

      let canPlace = true;
      const cells: number[] = [];

      for (let i = 0; i < word.length; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        const index = r * gridSize + c;

        if (grid[index] !== '' && grid[index] !== word[i]) {
          canPlace = false;
          break;
        }

        cells.push(index);
      }

      if (canPlace) {
        for (let i = 0; i < word.length; i++) {
          const r = row + dr * i;
          const c = col + dc * i;

          grid[r * gridSize + c] = word[i];
        }

        placements.push({
          word,
          row,
          col,
          dr,
          dc,
          cells,
        });

        placed = true;
      }
    }
  }

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === '') {
      grid[i] =
        letters[Math.floor(Math.random() * letters.length)];
    }
  }

  return {
    grid,
    placements,
  };
}

export default function WordSearchScreen() {
  const params = useLocalSearchParams<{
    difficulty?: string;
    level?: string;
    sessionId?: string;
  }>();

  const { isDark, accentForeground, onAccent } = useApp();
  const { width, height } = useWindowDimensions();

  const colors = {
    background: isDark ? '#090909' : '#FBFAF8',
    section: isDark ? '#151515' : '#FFFFFF',
    text: isDark ? '#F4F2EE' : '#27241F',
    muted: isDark ? '#AAA59D' : '#8F8A82',
    border: isDark ? '#2A2A2A' : '#ECE9E4',
    accent: accentForeground,
    onAccent,
  };

  const [difficulty] = useState<Difficulty>(() =>
    difficultyFromParams(params.difficulty, params.level),
  );

  const sessionId =
    typeof params.sessionId === 'string'
      ? params.sessionId
      : '';

  const gridSize = GRID_SIZE_BY_DIFFICULTY[difficulty];
  const wordCount = WORD_COUNT_BY_DIFFICULTY[difficulty];
  const genLevel = GEN_LEVEL_BY_DIFFICULTY[difficulty];

  /*
   * The puzzle is initialized explicitly.
   *
   * Nothing is rendered until initialization succeeds.
   */
  const [initializing, setInitializing] = useState(true);
  const [initializationError, setInitializationError] =
    useState<string | null>(null);

  const [words, setWords] = useState<string[]>([]);
  const [puzzle, setPuzzle] = useState<{
    grid: string[];
    placements: Placement[];
  } | null>(null);

  const [selectedCells, setSelectedCells] =
    useState<Set<number>>(new Set());

  const [foundWords, setFoundWords] =
    useState<Set<string>>(new Set());

  const [showWin, setShowWin] = useState(false);
  const [showTimeUp, setShowTimeUp] = useState(false);
  const [showExitConfirm, setShowExitConfirm] =
    useState(false);

  const [scoreSaved, setScoreSaved] = useState(false);
  const [secondsLeft, setSecondsLeft] =
    useState(TIME_LIMIT);

  const [timerRunning, setTimerRunning] =
    useState(false);

  const timerRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const gameEndedRef = useRef(false);
  const scoreSavingRef = useRef(false);

  /*
   * Explicit game initialization.
   *
   * 1. Verify the authenticated user.
   * 2. Create the game session if one wasn't supplied.
   * 3. Generate the puzzle.
   * 4. Only then start the game.
   */
  useEffect(() => {
    let cancelled = false;

    const initializeGame = async () => {
      try {
        setInitializing(true);
        setInitializationError(null);

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw new Error(
            `Unable to authenticate player: ${authError.message}`,
          );
        }

        if (!user?.id) {
          throw new Error(
            'You must be logged in to start a game.',
          );
        }

        let activeSessionId = sessionId;

        /*
         * If Games already created a session and passed its ID,
         * use it. Otherwise create one here.
         */
        if (!activeSessionId) {
          const { data: session, error: sessionError } =
            await supabase
              .from('game_sessions')
              .insert({
                created_by: user.id,
                game: 'wordsearch',
                mode: 'solo',
                status: 'active',
              })
              .select('id')
              .single();

          if (sessionError) {
            console.error(
              'CREATE GAME SESSION ERROR:',
              sessionError,
            );

            throw new Error(
              `Could not create game session: ${sessionError.message}`,
            );
          }

          activeSessionId = session.id;
        }

        /*
         * Generate words only after authentication/session
         * initialization succeeds.
         */
        const generatedWords = randomWordsForLevel(
          genLevel,
          wordCount,
        );

        if (
          !generatedWords ||
          generatedWords.length === 0
        ) {
          throw new Error(
            'Could not generate words for this puzzle.',
          );
        }

        const generatedPuzzle = generateGrid(
          generatedWords,
          gridSize,
        );

        if (
          !generatedPuzzle.grid.length ||
          !generatedPuzzle.placements.length
        ) {
          throw new Error(
            'Could not generate the Word Search puzzle.',
          );
        }

        if (cancelled) return;

        setWords(generatedWords);
        setPuzzle(generatedPuzzle);

        /*
         * Initialization is complete.
         * Now the game can start.
         */
        setSecondsLeft(TIME_LIMIT);
        setTimerRunning(true);
        gameEndedRef.current = false;
      } catch (error) {
        console.error(
          'WORD SEARCH INITIALIZATION ERROR:',
          error,
        );

        if (cancelled) return;

        setInitializationError(
          error instanceof Error
            ? error.message
            : 'Could not start the game.',
        );
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    };

    initializeGame();

    return () => {
      cancelled = true;
    };
  }, [
    sessionId,
    difficulty,
    genLevel,
    gridSize,
    wordCount,
  ]);

  /*
   * Timer.
   */
  useEffect(() => {
    if (!timerRunning) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          gameEndedRef.current = true;
          setTimerRunning(false);
          setShowTimeUp(true);

          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timerRunning]);

  /*
   * Record the completed game in game_scores.
   *
   * IMPORTANT:
   * game_leaderboard is a VIEW.
   * We never insert/update it directly.
   *
   * game_scores is the actual source table.
   */
  const recordScore = useCallback(
    async (
      wordsFound: number,
      result: 'win' | 'time_up',
    ) => {
      if (scoreSavingRef.current || scoreSaved) {
        return;
      }

      scoreSavingRef.current = true;

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw new Error(
            `Could not identify player: ${authError.message}`,
          );
        }

        const playerId = user?.id;

        if (!playerId) {
          throw new Error(
            'No authenticated player was found.',
          );
        }

        const points =
          wordsFound * POINTS_PER_WORD;

        /*
         * The session ID may have been supplied by the
         * Games screen. If not, this score can still be
         * recorded with a null session_id.
         */
        const scorePayload = {
          session_id: sessionId || null,
          player_id: playerId,
          game: 'wordsearch',
          mode: 'solo',
          result,
          points,
          difficulty,
          level: genLevel,
        };

        console.log(
          'RECORDING WORD SEARCH SCORE:',
          scorePayload,
        );

        const { error: scoreError } =
          await supabase
            .from('game_scores')
            .insert(scorePayload);

        if (scoreError) {
          console.error(
            'RECORD GAME SCORE ERROR:',
            scoreError,
          );

          throw new Error(
            `Could not save score: ${scoreError.message}`,
          );
        }

        /*
         * Mark the session as completed after the score
         * has successfully been written.
         */
        if (sessionId) {
          const {
            error: sessionUpdateError,
          } = await supabase
            .from('game_sessions')
            .update({
              status: 'completed',
              winner_id:
                result === 'win'
                  ? playerId
                  : null,
              result,
            })
            .eq('id', sessionId)
            .eq('created_by', playerId);

          if (sessionUpdateError) {
            console.error(
              'UPDATE GAME SESSION ERROR:',
              sessionUpdateError,
            );
          }
        }

        setScoreSaved(true);

        console.log(
          'WORD SEARCH SCORE SAVED SUCCESSFULLY:',
          points,
        );
      } catch (error) {
        console.error(
          'WORD SEARCH SCORE SAVE ERROR:',
          error,
        );

        /*
         * We intentionally don't set scoreSaved on failure.
         * That means the app can retry instead of permanently
         * losing the score.
         */
      } finally {
        scoreSavingRef.current = false;
      }
    },
    [
      difficulty,
      genLevel,
      scoreSaved,
      sessionId,
    ],
  );

  /*
   * Save score after winning.
   */
  useEffect(() => {
    if (!showWin) return;

    recordScore(foundWords.size, 'win');
  }, [
    showWin,
    foundWords.size,
    recordScore,
  ]);

  /*
   * Save score when time runs out.
   */
  useEffect(() => {
    if (!showTimeUp) return;

    recordScore(foundWords.size, 'time_up');
  }, [
    showTimeUp,
    foundWords.size,
    recordScore,
  ]);

  /*
   * Select/deselect a cell.
   */
  const handleCellPress = useCallback(
    (index: number) => {
      if (
        !timerRunning ||
        gameEndedRef.current
      ) {
        return;
      }

      setSelectedCells((previous) => {
        const next = new Set(previous);

        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }

        return next;
      });
    },
    [timerRunning],
  );

  /*
   * Check selected word.
   */
  const checkSelection = useCallback(() => {
    if (
      !timerRunning ||
      gameEndedRef.current ||
      !puzzle
    ) {
      return;
    }

    if (selectedCells.size < 2) {
      return;
    }

    const selected = [...selectedCells];

    const first = selected[0];
    const last =
      selected[selected.length - 1];

    const r1 = Math.floor(first / gridSize);
    const c1 = first % gridSize;

    const r2 = Math.floor(last / gridSize);
    const c2 = last % gridSize;

    const dr = Math.sign(r2 - r1);
    const dc = Math.sign(c2 - c1);

    const len =
      Math.max(
        Math.abs(r2 - r1),
        Math.abs(c2 - c1),
      ) + 1;

    if (len < 2) {
      setSelectedCells(new Set());
      return;
    }

    const cells: number[] = [];

    for (let i = 0; i < len; i++) {
      cells.push(
        (r1 + dr * i) * gridSize +
          (c1 + dc * i),
      );
    }

    const word = cells
      .map((index) => puzzle.grid[index])
      .join('');

    const reversed = word
      .split('')
      .reverse()
      .join('');

    for (const placement of puzzle.placements) {
      if (
        placement.word === word ||
        placement.word === reversed
      ) {
        if (!foundWords.has(placement.word)) {
          const newFound = new Set(foundWords);

          newFound.add(placement.word);

          setFoundWords(newFound);

          if (
            newFound.size ===
            puzzle.placements.length
          ) {
            gameEndedRef.current = true;
            setTimerRunning(false);
            setShowWin(true);
          }
        }

        break;
      }
    }

    setSelectedCells(new Set());
  }, [
    foundWords,
    gridSize,
    puzzle,
    selectedCells,
    timerRunning,
  ]);

  /*
   * Exit game.
   */
  const handleExitGame = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setTimerRunning(false);
    gameEndedRef.current = true;
    setShowExitConfirm(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (sessionId && user?.id) {
      const { error } = await supabase
        .from('game_sessions')
        .update({
          status: 'abandoned',
          winner_id: null,
          result: 'abandoned',
        })
        .eq('id', sessionId)
        .eq('created_by', user.id);

      if (error) {
        console.error(
          'ABANDON GAME SESSION ERROR:',
          error,
        );
      }
    }

    router.replace('/modules/games');
  };

  /*
   * Play another game.
   */
  const handlePlayAgain = () => {
    router.replace({
      pathname: '/modules/games/wordsearch',
      params: {
        difficulty,
      },
    });
  };

  const currentScore =
    foundWords.size * POINTS_PER_WORD;

  const HEADER_HEIGHT = 74;
  const WORDS_AREA_HEIGHT = 72;
  const BUTTON_AREA_HEIGHT = 86;
  const BODY_VERTICAL_PADDING = 24;

  const availableGridHeight = Math.max(
    120,
    height -
      HEADER_HEIGHT -
      WORDS_AREA_HEIGHT -
      BUTTON_AREA_HEIGHT -
      BODY_VERTICAL_PADDING,
  );

  const MAX_BOARD_SIZE = 520;

  const availableGridWidth = Math.max(
    120,
    Math.min(width - 24, MAX_BOARD_SIZE),
  );

  const availableGridHeightCapped =
    Math.min(
      availableGridHeight,
      MAX_BOARD_SIZE,
    );

  const cellSize = Math.max(
    12,
    Math.floor(
      Math.min(
        availableGridWidth,
        availableGridHeightCapped,
      ) / gridSize,
    ),
  );

  /*
   * Initialization screen.
   *
   * The actual puzzle is NOT rendered until
   * initialization has succeeded.
   */
  if (initializing) {
    return (
      <SafeAreaView
        style={[
          styles.safe,
          {
            backgroundColor:
              colors.background,
          },
        ]}
      >
        <View style={styles.initializing}>
          <View
            style={[
              styles.initializingIcon,
              {
                backgroundColor:
                  colors.accent,
              },
            ]}
          >
            <Text
              style={[
                styles.initializingIconText,
                {
                  color: colors.onAccent,
                },
              ]}
            >
              W
            </Text>
          </View>

          <Text
            style={[
              styles.initializingTitle,
              {
                color: colors.text,
              },
            ]}
          >
            Starting Word Search
          </Text>

          <Text
            style={[
              styles.initializingSub,
              {
                color: colors.muted,
              },
            ]}
          >
            Preparing your puzzle…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  /*
   * Initialization failed.
   */
  if (
    initializationError ||
    !puzzle ||
    words.length === 0
  ) {
    return (
      <SafeAreaView
        style={[
          styles.safe,
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
            onPress={() =>
              router.replace(
                '/modules/games',
              )
            }
            style={[
              styles.headerBack,
              {
                backgroundColor:
                  colors.accent,
              },
            ]}
            hitSlop={10}
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
            WORD SEARCH
          </Text>

          <View
            style={styles.headerRight}
          />
        </View>

        <View style={styles.errorState}>
          <Text
            style={[
              styles.errorTitle,
              {
                color: colors.text,
              },
            ]}
          >
            Couldn’t Start Game
          </Text>

          <Text
            style={[
              styles.errorMessage,
              {
                color: colors.muted,
              },
            ]}
          >
            {initializationError ??
              'The puzzle could not be initialized.'}
          </Text>

          <Pressable
            style={[
              styles.checkBtn,
              {
                backgroundColor:
                  colors.accent,
              },
            ]}
            onPress={() =>
              router.replace({
                pathname:
                  '/modules/games/wordsearch',
                params: {
                  difficulty,
                },
              })
            }
          >
            <Text
              style={[
                styles.checkBtnText,
                {
                  color: colors.onAccent,
                },
              ]}
            >
              Try Again
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.safe,
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
          onPress={() =>
            setShowExitConfirm(true)
          }
          style={[
            styles.headerBack,
            {
              backgroundColor:
                colors.accent,
            },
          ]}
          hitSlop={10}
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
          WORD SEARCH
        </Text>

        <View
          style={styles.headerRight}
        >
          <View
            style={[
              styles.levelPill,
              {
                backgroundColor:
                  colors.section,
                borderColor:
                  colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.levelText,
                {
                  color: colors.muted,
                },
              ]}
            >
              {difficultyLabel(
                difficulty,
              )}
            </Text>
          </View>

          <Text
            style={[
              styles.timerText,
              {
                color:
                  secondsLeft <= 20
                    ? '#FF6B6B'
                    : colors.text,
              },
            ]}
          >
            {formatTime(secondsLeft)}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          style={styles.wordsScroll}
          contentContainerStyle={
            styles.wordsRow
          }
        >
          {words.map((word) => {
            const found =
              foundWords.has(word);

            return (
              <View
                key={word}
                style={[
                  styles.wordChip,
                  {
                    backgroundColor:
                      found
                        ? colors.accent
                        : colors.section,
                    borderColor:
                      found
                        ? colors.accent
                        : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.wordChipText,
                    {
                      color: found
                        ? colors.onAccent
                        : colors.text,
                    },
                    found && {
                      textDecorationLine:
                        'line-through',
                    },
                  ]}
                >
                  {word}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.gridWrap}>
          <View
            style={[
              styles.grid,
              {
                width:
                  cellSize * gridSize,
              },
            ]}
          >
            {puzzle.grid.map(
              (letter, index) => {
                const isSelected =
                  selectedCells.has(index);

                return (
                  <Pressable
                    key={index}
                    onPress={() =>
                      handleCellPress(
                        index,
                      )
                    }
                    style={[
                      styles.cell,
                      {
                        width: cellSize,
                        height: cellSize,
                        backgroundColor:
                          isSelected
                            ? colors.accent
                            : colors.section,
                        borderColor:
                          colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        {
                          color:
                            isSelected
                              ? colors.onAccent
                              : colors.text,
                          fontSize:
                            Math.max(
                              9,
                              cellSize *
                                0.42,
                            ),
                        },
                      ]}
                    >
                      {letter}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>
        </View>

        <View
          style={styles.buttonArea}
        >
          <Text
            style={[
              styles.scoreText,
              {
                color: colors.muted,
              },
            ]}
          >
            {foundWords.size}/
            {words.length} found ·{' '}
            {currentScore} pts
          </Text>

          <Pressable
            style={[
              styles.checkBtn,
              {
                backgroundColor:
                  colors.accent,
              },
            ]}
            onPress={checkSelection}
          >
            <Text
              style={[
                styles.checkBtnText,
                {
                  color:
                    colors.onAccent,
                },
              ]}
            >
              Check Word
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Exit confirmation */}
      <Modal
        visible={showExitConfirm}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setShowExitConfirm(false)
        }
      >
        <View
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor:
                  colors.section,
                borderColor:
                  colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                {
                  color: colors.text,
                },
              ]}
            >
              Exit Game?
            </Text>

            <Text
              style={[
                styles.modalSub,
                {
                  color: colors.muted,
                },
              ]}
            >
              Your game will end and no
              points will be awarded for
              this game.
            </Text>

            <View
              style={styles.modalBtns}
            >
              <Pressable
                style={[
                  styles.btnSecondary,
                  {
                    borderColor:
                      colors.border,
                  },
                ]}
                onPress={() =>
                  setShowExitConfirm(
                    false,
                  )
                }
              >
                <Text
                  style={[
                    styles.btnSecondaryText,
                    {
                      color:
                        colors.text,
                    },
                  ]}
                >
                  Keep Playing
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.btnPrimary,
                  {
                    backgroundColor:
                      colors.accent,
                  },
                ]}
                onPress={
                  handleExitGame
                }
              >
                <Text
                  style={[
                    styles.btnPrimaryText,
                    {
                      color:
                        colors.onAccent,
                    },
                  ]}
                >
                  Exit
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Win modal */}
      <Modal
        visible={showWin}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor:
                  colors.section,
                borderColor:
                  colors.border,
              },
            ]}
          >
            <Text
              style={styles.modalEmoji}
            >
              ⭐
            </Text>

            <Text
              style={[
                styles.modalTitle,
                {
                  color: colors.text,
                },
              ]}
            >
              All Words Found!
            </Text>

            <Text
              style={[
                styles.modalSub,
                {
                  color: colors.muted,
                },
              ]}
            >
              {difficultyLabel(
                difficulty,
              )}{' '}
              · {currentScore} pts
            </Text>

            <View
              style={styles.modalBtns}
            >
              <Pressable
                style={[
                  styles.btnPrimary,
                  {
                    backgroundColor:
                      colors.accent,
                  },
                ]}
                onPress={
                  handlePlayAgain
                }
              >
                <Text
                  style={[
                    styles.btnPrimaryText,
                    {
                      color:
                        colors.onAccent,
                    },
                  ]}
                >
                  Play Again
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.btnSecondary,
                  {
                    borderColor:
                      colors.border,
                  },
                ]}
                onPress={() =>
                  router.replace(
                    '/modules/games',
                  )
                }
              >
                <Text
                  style={[
                    styles.btnSecondaryText,
                    {
                      color:
                        colors.text,
                    },
                  ]}
                >
                  Exit
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Time-up modal */}
      <Modal
        visible={showTimeUp}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor:
                  colors.section,
                borderColor:
                  colors.border,
              },
            ]}
          >
            <Text
              style={styles.modalEmoji}
            >
              ⏱️
            </Text>

            <Text
              style={[
                styles.modalTitle,
                {
                  color: colors.text,
                },
              ]}
            >
              Time's Up!
            </Text>

            <Text
              style={[
                styles.modalSub,
                {
                  color: colors.muted,
                },
              ]}
            >
              {foundWords.size}/
              {words.length} found ·{' '}
              {currentScore} pts
            </Text>

            <View
              style={styles.modalBtns}
            >
              <Pressable
                style={[
                  styles.btnPrimary,
                  {
                    backgroundColor:
                      colors.accent,
                  },
                ]}
                onPress={
                  handlePlayAgain
                }
              >
                <Text
                  style={[
                    styles.btnPrimaryText,
                    {
                      color:
                        colors.onAccent,
                    },
                  ]}
                >
                  Play Again
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.btnSecondary,
                  {
                    borderColor:
                      colors.border,
                  },
                ]}
                onPress={() =>
                  router.replace(
                    '/modules/games',
                  )
                }
              >
                <Text
                  style={[
                    styles.btnSecondaryText,
                    {
                      color:
                        colors.text,
                    },
                  ]}
                >
                  Exit
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
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

  headerTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 16,
    letterSpacing: 1.5,
  },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  levelPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  levelText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
  },

  timerText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    minWidth: 42,
    textAlign: 'right',
  },

  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },

  wordsScroll: {
    flexGrow: 0,
    height: 72,
  },

  wordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignContent: 'center',
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 2,
  },

  wordChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },

  wordChipText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
  },

  gridWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
  },

  cell: {
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cellText: {
    fontFamily: 'Poppins-Bold',
  },

  buttonArea: {
    alignItems: 'center',
    gap: 7,
    paddingTop: 6,
    paddingBottom: 8,
    minHeight: 86,
  },

  scoreText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
  },

  checkBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 48,
  },

  checkBtnText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
  },

  initializing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 10,
  },

  initializingIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  initializingIconText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 30,
  },

  initializingTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 20,
    textAlign: 'center',
  },

  initializingSub: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    textAlign: 'center',
  },

  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },

  errorTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 22,
    textAlign: 'center',
  },

  errorMessage: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 8,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  modalCard: {
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    width: '90%',
    gap: 8,
  },

  modalEmoji: {
    fontSize: 48,
  },

  modalTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 24,
    textAlign: 'center',
  },

  modalSub: {
    fontFamily: 'Poppins-Medium',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  modalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    width: '100%',
  },

  btnPrimary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },

  btnPrimaryText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
  },

  btnSecondary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },

  btnSecondaryText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
    textAlign: 'center',
  },
});