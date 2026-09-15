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

import { randomWordsForLevel } from '@/components/games-utils';

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

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [-1, 1],
] as const;

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

function difficultyLabel(d: Difficulty) {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/**
 * Generates a word-search puzzle where words ARE allowed to overlap.
 *
 * Same letter on the same cell = allowed.
 * Different letter on the same cell = not allowed.
 * Words can cross horizontally, vertically and diagonally.
 */
function generateGrid(
  words: string[],
  gridSize: number,
): { grid: string[]; placements: Placement[] } {
  const cleanedWords = words
    .map((word) => word.toUpperCase().replace(/[^A-Z]/g, ''))
    .filter((word) => word.length >= 2 && word.length <= gridSize);

  if (!cleanedWords.length) {
    return {
      grid: [],
      placements: [],
    };
  }

  for (
    let generationAttempt = 0;
    generationAttempt < 200;
    generationAttempt++
  ) {
    const grid = Array(gridSize * gridSize).fill('');
    const placements: Placement[] = [];

    const wordsToPlace = [...cleanedWords].sort(
      (a, b) => b.length - a.length,
    );

    let failed = false;

    for (const word of wordsToPlace) {
      const candidates: Array<{
        row: number;
        col: number;
        dr: number;
        dc: number;
        cells: number[];
        overlapCount: number;
      }> = [];

      for (const [dr, dc] of DIRECTIONS) {
        for (let row = 0; row < gridSize; row++) {
          for (let col = 0; col < gridSize; col++) {
            const endRow = row + dr * (word.length - 1);
            const endCol = col + dc * (word.length - 1);

            if (
              endRow < 0 ||
              endRow >= gridSize ||
              endCol < 0 ||
              endCol >= gridSize
            ) {
              continue;
            }

            const cells: number[] = [];

            let valid = true;
            let overlapCount = 0;

            for (let i = 0; i < word.length; i++) {
              const r = row + dr * i;
              const c = col + dc * i;
              const index = r * gridSize + c;

              const existingLetter = grid[index];

              if (
                existingLetter !== '' &&
                existingLetter !== word[i]
              ) {
                valid = false;
                break;
              }

              if (existingLetter === word[i]) {
                overlapCount++;
              }

              cells.push(index);
            }

            if (valid) {
              candidates.push({
                row,
                col,
                dr,
                dc,
                cells,
                overlapCount,
              });
            }
          }
        }
      }

      if (!candidates.length) {
        failed = true;
        break;
      }

      candidates.sort((a, b) => {
        if (b.overlapCount !== a.overlapCount) {
          return b.overlapCount - a.overlapCount;
        }

        return Math.random() - 0.5;
      });

      const bestOverlap = candidates[0].overlapCount;

      const bestCandidates = candidates.filter(
        (candidate) =>
          candidate.overlapCount >= Math.max(0, bestOverlap - 1),
      );

      const selected =
        bestCandidates[
          Math.floor(Math.random() * bestCandidates.length)
        ];

      for (let i = 0; i < word.length; i++) {
        const r = selected.row + selected.dr * i;
        const c = selected.col + selected.dc * i;

        grid[r * gridSize + c] = word[i];
      }

      placements.push({
        word,
        row: selected.row,
        col: selected.col,
        dr: selected.dr,
        dc: selected.dc,
        cells: selected.cells,
      });
    }

    if (
      !failed &&
      placements.length === cleanedWords.length
    ) {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

      for (let i = 0; i < grid.length; i++) {
        if (grid[i] === '') {
          grid[i] =
            letters[
              Math.floor(Math.random() * letters.length)
            ];
        }
      }

      const orderedPlacements = cleanedWords
        .map((word) =>
          placements.find(
            (placement) => placement.word === word,
          ),
        )
        .filter(Boolean) as Placement[];

      return {
        grid,
        placements: orderedPlacements,
      };
    }
  }

  return {
    grid: [],
    placements: [],
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
    difficultyFromParams(
      params.difficulty,
      params.level,
    ),
  );

  const sessionId =
    typeof params.sessionId === 'string'
      ? params.sessionId
      : '';

  const gridSize =
    GRID_SIZE_BY_DIFFICULTY[difficulty];

  const wordCount =
    WORD_COUNT_BY_DIFFICULTY[difficulty];

  const genLevel =
    GEN_LEVEL_BY_DIFFICULTY[difficulty];

  const [initializing, setInitializing] =
    useState(true);

  const [initializationError, setInitializationError] =
    useState<string | null>(null);

  const [words, setWords] =
    useState<string[]>([]);

  const [puzzle, setPuzzle] = useState<{
    grid: string[];
    placements: Placement[];
  } | null>(null);

  const [selectedCells, setSelectedCells] =
    useState<Set<number>>(new Set());

  // Lock the parent scroll while the player is dragging
  // across the grid to select a word.
  const [foundCells, setFoundCells] =
    useState<Set<number>>(new Set());

  const [foundWords, setFoundWords] =
    useState<Set<string>>(new Set());

  const [showWin, setShowWin] =
    useState(false);

  const [showTimeUp, setShowTimeUp] =
    useState(false);

  const [showExitConfirm, setShowExitConfirm] =
    useState(false);

  const [scoreSaved, setScoreSaved] =
    useState(false);

  const [wordsAreaHeight, setWordsAreaHeight] =
    useState(0);

  const [secondsLeft, setSecondsLeft] =
    useState(TIME_LIMIT);

  const [timerRunning, setTimerRunning] =
    useState(false);

  const timerRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null,
    );

  const gameEndedRef =
    useRef(false);

  const exitConfirmedRef =
    useRef(false);

  const scoreSavingRef =
    useRef(false);

  const scoreFinalizedRef =
    useRef(false);

  const activeSessionIdRef =
    useRef<string>(sessionId);

  const foundWordsRef =
    useRef<Set<string>>(new Set());

  /**
   * Always keep the synchronous ref up to date.
   *
   * The timer uses this ref so it cannot accidentally
   * save an older React state value when time reaches zero.
   */
  useEffect(() => {
    foundWordsRef.current = foundWords;
  }, [foundWords]);

  /**
   * Initialize the game and create a session when
   * one was not supplied by the route.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setInitializing(true);
        setInitializationError(null);

        scoreFinalizedRef.current = false;
        scoreSavingRef.current = false;
        exitConfirmedRef.current = false;
        gameEndedRef.current = false;

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

        /**
         * If there is no session ID in the route,
         * create the session now.
         */
        if (!activeSessionId) {
          const { data: session, error } =
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

          if (error) {
            throw new Error(
              `Could not create game session: ${error.message}`,
            );
          }

          activeSessionId = session.id;
        }

        /**
         * IMPORTANT:
         *
         * Always store the real session ID.
         *
         * This is the ID that must be used when inserting
         * game_scores and completing the session.
         */
        activeSessionIdRef.current =
          activeSessionId;

        const generatedWords =
          randomWordsForLevel(
            genLevel,
            wordCount,
          ).map((word) =>
            word
              .toUpperCase()
              .replace(/[^A-Z]/g, ''),
          );

        if (!generatedWords?.length) {
          throw new Error(
            'Could not generate words for this puzzle.',
          );
        }

        const generatedPuzzle =
          generateGrid(
            generatedWords,
            gridSize,
          );

        if (
          !generatedPuzzle.grid.length ||
          generatedPuzzle.placements.length !==
            generatedWords.length
        ) {
          throw new Error(
            'Could not generate a complete Word Search puzzle. Please try again.',
          );
        }

        if (
          cancelled ||
          exitConfirmedRef.current
        ) {
          return;
        }

        foundWordsRef.current =
          new Set();

        setWords(generatedWords);

        setPuzzle(generatedPuzzle);

        setSelectedCells(new Set());

        setFoundCells(new Set());

        setFoundWords(new Set());

        setSecondsLeft(TIME_LIMIT);

        setScoreSaved(false);

        setShowWin(false);

        setShowTimeUp(false);

        gameEndedRef.current = false;

        setTimerRunning(true);
      } catch (error) {
        if (!cancelled) {
          setInitializationError(
            error instanceof Error
              ? error.message
              : 'Could not start the game.',
          );
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    })();

    return () => {
      cancelled = true;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    sessionId,
    difficulty,
    genLevel,
    gridSize,
    wordCount,
  ]);

  /**
   * Save the score.
   *
   * This is used for:
   * - completing all words
   * - running out of time
   *
   * Time-up is a COMPLETED game, not an abandoned game.
   */
  const recordScore = useCallback(
    async (
      wordsFound: number,
      result: 'win' | 'loss',
    ) => {
      if (
        exitConfirmedRef.current ||
        scoreSavingRef.current ||
        scoreFinalizedRef.current
      ) {
        return;
      }

      scoreSavingRef.current = true;

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user?.id) {
          throw new Error(
            authError?.message ??
              'No authenticated player was found.',
          );
        }

        if (exitConfirmedRef.current) {
          return;
        }

        /**
         * Read the REAL session ID.
         */
        const activeSessionId =
          activeSessionIdRef.current;

        if (!activeSessionId) {
          throw new Error(
            'No active game session ID was found.',
          );
        }

        const points =
          wordsFound * POINTS_PER_WORD;

        /**
         * Save the player's score.
         */
        const {
          error: scoreError,
        } = await supabase
          .from('game_scores')
          .insert({
            session_id: activeSessionId,
            player_id: user.id,
            game: 'wordsearch',
            mode: 'solo',
            result,
            points,
            difficulty,
            level: genLevel,
          });

        if (scoreError) {
          throw new Error(
            `Could not save score: ${scoreError.message}`,
          );
        }

        /**
         * The score was successfully inserted.
         * Now mark the session completed.
         */
        if (
          !exitConfirmedRef.current
        ) {
          const {
            error: sessionError,
          } = await supabase
            .from('game_sessions')
            .update({
              status: 'completed',
              winner_id:
                result === 'win'
                  ? user.id
                  : null,
              result,
            })
            .eq(
              'id',
              activeSessionId,
            )
            .eq(
              'created_by',
              user.id,
            );

          if (sessionError) {
            console.error(
              'WORD SEARCH COMPLETE SESSION ERROR:',
              sessionError,
            );
          }
        }

        scoreFinalizedRef.current =
          true;

        if (
          !exitConfirmedRef.current
        ) {
          setScoreSaved(true);
        }
      } catch (error) {
        /**
         * IMPORTANT:
         *
         * Do NOT permanently mark the score as finalized
         * when the database insert fails.
         *
         * This allows the time-up effect to retry if necessary.
         */
        scoreFinalizedRef.current =
          false;

        console.error(
          'WORD SEARCH SCORE SAVE ERROR:',
          error,
        );
      } finally {
        scoreSavingRef.current =
          false;
      }
    },
    [difficulty, genLevel],
  );

  /**
   * TIMER
   *
   * The timer ONLY counts down here.
   *
   * When it reaches zero, it stops the game and changes
   * secondsLeft to 0.
   *
   * The separate time-up effect below is responsible
   * for saving the score.
   */
  useEffect(() => {
    if (
      !timerRunning ||
      gameEndedRef.current ||
      exitConfirmedRef.current
    ) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      return;
    }

    timerRef.current =
      setInterval(() => {
        setSecondsLeft(
          (current) => {
            if (current <= 1) {
              if (timerRef.current) {
                clearInterval(
                  timerRef.current,
                );

                timerRef.current = null;
              }

              gameEndedRef.current =
                true;

              setTimerRunning(false);

              return 0;
            }

            return current - 1;
          },
        );
      }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(
          timerRef.current,
        );

        timerRef.current = null;
      }
    };
  }, [timerRunning]);

  /**
   * TIME-UP FINALIZATION
   *
   * This is the important fix.
   *
   * When secondsLeft becomes 0:
   *
   * 1. Read foundWordsRef.current.
   * 2. Calculate points from the words already found.
   * 3. Save the score.
   * 4. Mark the game session completed.
   * 5. Show the Time's Up modal.
   *
   * Example:
   * 6 words found = 60 points.
   */
  useEffect(() => {
    if (
      secondsLeft !== 0 ||
      exitConfirmedRef.current ||
      scoreFinalizedRef.current
    ) {
      return;
    }

    const wordsFoundAtTimeUp =
      foundWordsRef.current.size;

    setShowTimeUp(true);

    // Try more than once in case the first Supabase request is interrupted
    // exactly when the timer reaches zero. The score is only finalized after
    // the database insert succeeds, so a retry cannot intentionally replace a
    // failed save with a completed/abandoned state.
    let cancelled = false;

    const saveTimeUpScore = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (cancelled || exitConfirmedRef.current || scoreFinalizedRef.current) {
          return;
        }

        await recordScore(wordsFoundAtTimeUp, 'loss');

        if (scoreFinalizedRef.current) {
          return;
        }

        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
      }
    };

    void saveTimeUpScore();

    return () => {
      cancelled = true;
    };
  }, [secondsLeft, recordScore]);

  const currentScore =
    foundWords.size *
    POINTS_PER_WORD;

  const HEADER_HEIGHT = 74;

  const WORDS_AREA_HEIGHT =
    wordsAreaHeight > 0
      ? wordsAreaHeight
      : difficulty === 'easy'
        ? 70
        : difficulty === 'medium'
          ? 105
          : 150;
  const INSTRUCTION_HEIGHT = 30;

  const BOTTOM_CONTROLS_HEIGHT = 0;

  const availableGridHeight =
    Math.max(
      120,
      height -
        HEADER_HEIGHT -
        WORDS_AREA_HEIGHT -
        INSTRUCTION_HEIGHT -
        BOTTOM_CONTROLS_HEIGHT -
        24,
    );

  const MAX_BOARD_SIZE = 520;

  const availableGridWidth =
    Math.max(
      120,
      Math.min(
        width - 24,
        MAX_BOARD_SIZE,
      ),
    );

  const cellSize =
    Math.max(
      12,
      Math.floor(
        Math.min(
          availableGridWidth,
          MAX_BOARD_SIZE,
        ) / gridSize,
      ),
    );

  const toggleCell = useCallback((index: number) => {
    if (
      !timerRunning ||
      gameEndedRef.current ||
      exitConfirmedRef.current ||
      !puzzle
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
  }, [puzzle, timerRunning]);

  const checkSelection =
    useCallback(() => {
      if (
        !timerRunning ||
        gameEndedRef.current ||
        exitConfirmedRef.current ||
        !puzzle ||
        selectedCells.size < 2
      ) {
        return;
      }

      // A word is valid only when the tapped letters exactly match
      // one of the generated word placements. This lets the player
      // tap letters individually in any order.
      const placement = puzzle.placements.find((candidate) => {
        if (candidate.cells.length !== selectedCells.size) {
          return false;
        }

        const candidateCells = new Set(candidate.cells);

        for (const cell of selectedCells) {
          if (!candidateCells.has(cell)) {
            return false;
          }
        }

        return true;
      });

      if (
        placement &&
        !foundWords.has(placement.word)
      ) {
        const next = new Set(foundWords);
        next.add(placement.word);

        // Keep the ref immediately in sync so the timer can never
        // save an older word count.
        foundWordsRef.current = next;
        setFoundWords(next);

        setFoundCells((previous) => {
          const nextCells = new Set(previous);

          placement.cells.forEach((cell) => {
            nextCells.add(cell);
          });

          return nextCells;
        });

        if (next.size === puzzle.placements.length) {
          gameEndedRef.current = true;

          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          setTimerRunning(false);

          void recordScore(next.size, 'win');
          setShowWin(true);
        }
      }

      // Always clear the current selection after checking.
      setSelectedCells(new Set());
    }, [
      foundWords,
      puzzle,
      recordScore,
      selectedCells,
      timerRunning,
    ]);

  /**
   * Explicit exit remains ABANDONED.
   *
   * This is different from time-up.
   */
  const handleExitGame =
    useCallback(async () => {
      if (
        exitConfirmedRef.current
      ) {
        return;
      }

      exitConfirmedRef.current =
        true;

      gameEndedRef.current =
        true;

      if (timerRef.current) {
        clearInterval(
          timerRef.current,
        );

        timerRef.current = null;
      }

      setTimerRunning(false);

      setShowExitConfirm(false);

      setShowWin(false);

      setShowTimeUp(false);

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      const activeSessionId =
        activeSessionIdRef.current;

      if (
        activeSessionId &&
        user?.id
      ) {
        const { error } =
          await supabase
            .from('game_sessions')
            .update({
              status: 'abandoned',
              winner_id: null,
              result: 'abandoned',
            })
            .eq(
              'id',
              activeSessionId,
            )
            .eq(
              'created_by',
              user.id,
            );

        if (error) {
          console.error(
            'ABANDON GAME SESSION ERROR:',
            error,
          );
        }
      }

      router.replace(
        '/modules/games',
      );
    }, []);

  const handlePlayAgain =
    useCallback(
      () =>
        router.replace({
          pathname:
            '/modules/games/wordsearch',
          params: {
            difficulty,
          },
        }),
      [difficulty],
    );

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
        <View
          style={
            styles.initializing
          }
        >
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
                  color:
                    colors.onAccent,
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
                color:
                  colors.text,
              },
            ]}
          >
            Starting Word Search
          </Text>

          <Text
            style={[
              styles.initializingSub,
              {
                color:
                  colors.muted,
              },
            ]}
          >
            Preparing your puzzle…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (
    initializationError ||
    !puzzle ||
    !words.length
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
                color:
                  colors.accent,
              },
            ]}
          >
            WORD SEARCH
          </Text>

          <View
            style={
              styles.headerRight
            }
          />
        </View>

        <View
          style={
            styles.errorState
          }
        >
          <Text
            style={[
              styles.errorTitle,
              {
                color:
                  colors.text,
              },
            ]}
          >
            Couldn’t Start Game
          </Text>

          <Text
            style={[
              styles.errorMessage,
              {
                color:
                  colors.muted,
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
                  color:
                    colors.onAccent,
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
        style={
          styles.screenContent
        }
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
              setShowExitConfirm(
                true,
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
              color:
                isDark ? '#FFFFFF' : accentForeground,
            },
          ]}
        >
            WORD SEARCH
          </Text>

          <View
            style={
              styles.headerRight
            }
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
                    color:
                      colors.muted,
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
              {formatTime(
                secondsLeft,
              )}
            </Text>
          </View>
        </View>

          <View
          style={styles.wordsContainer}
          onLayout={(event) => {
            const measuredHeight = event.nativeEvent.layout.height;
            if (measuredHeight !== wordsAreaHeight) {
              setWordsAreaHeight(measuredHeight);
            }
          }}
        >
            <View style={styles.wordsRow}>
              {words.map((word, index) => {
                const found = foundWords.has(word);

                return (
                  <View
                    key={`${word}-${index}`}
                    style={[
                      styles.wordChip,
                      {
                        backgroundColor: found
                          ? colors.accent
                          : colors.section,
                        borderColor: found
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
                          textDecorationLine: 'line-through',
                        },
                      ]}
                    >
                      {word}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

        <View style={styles.gameControlsTop}>
          <Pressable
            style={[
              styles.checkBtn,
              {
                backgroundColor: colors.accent,
              },
            ]}
            onPress={checkSelection}
          >
            <Text
              style={[
                styles.checkBtnText,
                {
                  color: colors.onAccent,
                },
              ]}
            >
              Check Word
            </Text>
          </Pressable>

          <Text
            style={[
              styles.scoreText,
              {
                color: colors.muted,
              },
            ]}
          >
            {foundWords.size}/{words.length} found · {currentScore} pts
          </Text>
        </View>

        <Text
          style={[
            styles.instructionText,
            { color: colors.muted },
          ]}
        >
          Tap each letter to highlight a word
        </Text>

        <View
          style={styles.gameArea}
        >
          <ScrollView
            style={styles.boardScroll}
            contentContainerStyle={styles.boardScrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View
              style={
                styles.gridWrap
              }
            >
            <View
              style={[
                styles.grid,
                {
                  width:
                    cellSize *
                    gridSize,
                  height:
                    cellSize *
                    gridSize,
                },
              ]}
            >
              {puzzle.grid.map(
                (
                  letter,
                  index,
                ) => {
                  const highlighted =
                    foundCells.has(
                      index,
                    ) ||
                    selectedCells.has(
                      index,
                    );

                  return (
                    <Pressable
                      key={index}
                      onPress={() => toggleCell(index)}
                      disabled={!timerRunning || gameEndedRef.current || exitConfirmedRef.current}
                      style={[
                        styles.cell,
                        {
                          width:
                            cellSize,
                          height:
                            cellSize,
                          backgroundColor:
                            highlighted
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
                              highlighted
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
          </ScrollView>
        </View>


      </View>

      {/* EXIT CONFIRMATION */}

      <Modal
        visible={
          showExitConfirm
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setShowExitConfirm(
            false,
          )
        }
      >
        <View
          style={
            styles.modalOverlay
          }
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
                  color:
                    colors.text,
                },
              ]}
            >
              Exit Game?
            </Text>

            <Text
              style={[
                styles.modalSub,
                {
                  color:
                    colors.muted,
                },
              ]}
            >
              Are you sure you want
              to leave this game?
            </Text>

            <Text
              style={[
                styles.exitWarning,
                {
                  color:
                    colors.muted,
                },
              ]}
            >
              Your current game will
              be cancelled and no
              points will be awarded.
            </Text>

            <View
              style={
                styles.modalBtns
              }
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
                  Exit Game
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* WIN */}

      <Modal
        visible={showWin}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View
          style={
            styles.modalOverlay
          }
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
              style={
                styles.modalEmoji
              }
            >
              ⭐
            </Text>

            <Text
              style={[
                styles.modalTitle,
                {
                  color:
                    colors.text,
                },
              ]}
            >
              All Words Found!
            </Text>

            <Text
              style={[
                styles.modalSub,
                {
                  color:
                    colors.muted,
                },
              ]}
            >
              {difficultyLabel(
                difficulty,
              )}{' '}
              · {currentScore} pts
            </Text>

            <View
              style={
                styles.modalBtns
              }
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
                onPress={
                  handleExitGame
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
                  Exit Game
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* TIME UP */}

      <Modal
        visible={showTimeUp}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View
          style={
            styles.modalOverlay
          }
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
              style={
                styles.modalEmoji
              }
            >
              ⏱️
            </Text>

            <Text
              style={[
                styles.modalTitle,
                {
                  color:
                    colors.text,
                },
              ]}
            >
              Time's Up!
            </Text>

            <Text
              style={[
                styles.modalSub,
                {
                  color:
                    colors.muted,
                },
              ]}
            >
              {foundWords.size}/
              {words.length} found ·{' '}
              {currentScore} pts
            </Text>

            <View
              style={
                styles.modalBtns
              }
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
                onPress={
                  handleExitGame
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
                  Exit Game
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

  screenContent: {
    flex: 1,
    minHeight: 0,
  },

  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 25,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE9E4',
    zIndex: 100,
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

  gameArea: {
    flex: 1,
    minHeight: 0,
  },

  boardScroll: {
    flex: 1,
    minHeight: 0,
  },

  boardScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },

  instructionText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  wordsContainer: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  wordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
    paddingBottom: 4,
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

  gameControlsTop: {
    width: '100%',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: 'center',
    gap: 4,
  },

  bottomControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 48,
    height: 96,
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    zIndex: 9999,
    elevation: 9999,
  },

  scoreText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    paddingTop: 6,
  },

  checkBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 48,
    flexShrink: 0,
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

  exitWarning: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
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