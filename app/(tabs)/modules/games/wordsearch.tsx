import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
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

// ─── Theme Palettes ──────────────────────────────────────────────────────────

const DARK_PALETTE = {
  bg: '#090909',
  card: '#121212',
  cardBorder: '#000000',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  divider: '#262626',
  inputBg: '#1E1E1E',
};

const LIGHT_PALETTE = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  cardBorder: '#000000',
  text: '#000000',
  muted: '#52525B',
  divider: '#E4E4E7',
  inputBg: '#F4F4F5',
};

export default function WordSearchScreen() {
  const params = useLocalSearchParams<{
    difficulty?: string;
    level?: string;
    sessionId?: string;
  }>();

  const { isDark, accentForeground, onAccent } = useApp() as any;

  const accent = accentForeground || '#FDE047';
  const pageBg = accent;

  const COLORS = isDark
    ? DARK_PALETTE
    : LIGHT_PALETTE;

  const styles = makeStyles(COLORS);

  const { width, height } = useWindowDimensions();

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

  useEffect(() => {
    foundWordsRef.current = foundWords;
  }, [foundWords]);

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

        const activeSessionId =
          activeSessionIdRef.current;

        if (!activeSessionId) {
          throw new Error(
            'No active game session ID was found.',
          );
        }

        const points =
          wordsFound * POINTS_PER_WORD;

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

      setSelectedCells(new Set());
    }, [
      foundWords,
      puzzle,
      recordScore,
      selectedCells,
      timerRunning,
    ]);

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
          { backgroundColor: pageBg },
        ]}
        edges={['top', 'bottom']}
      >
        <StatusBar barStyle="dark-content" backgroundColor={pageBg} />
        <View
          style={
            styles.initializing
          }
        >
          <div style={{ position: 'relative', width: 64, height: 64, marginBottom: 8 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 }} />
            <View
              style={[
                styles.initializingIcon,
                {
                  backgroundColor: COLORS.card,
                  borderColor: '#000000',
                  borderWidth: 2.5,
                  borderRadius: 16,
                },
              ]}
            >
              <Text
                style={[
                  styles.initializingIconText,
                  {
                    color: COLORS.text,
                    fontFamily: 'Poppins-ExtraBold',
                  },
                ]}
              >
                W
              </Text>
            </View>
          </div>

          <Text
            style={[
              styles.initializingTitle,
              {
                color: '#000000',
                fontFamily: 'Poppins-ExtraBold',
              },
            ]}
          >
            Starting Word Search
          </Text>

          <Text
            style={[
              styles.initializingSub,
              {
                color: COLORS.muted,
                fontFamily: 'Poppins-Regular',
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
          { backgroundColor: pageBg },
        ]}
        edges={['top', 'bottom']}
      >
        <StatusBar barStyle="dark-content" backgroundColor={pageBg} />

        <View
          style={[
            styles.header,
            { borderBottomColor: '#000000', paddingBottom: 10, paddingTop: 12 },
          ]}
        >
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 8 }} />
            <Pressable
              onPress={() =>
                router.replace(
                  '/modules/games',
                )
              }
              style={({ pressed }) => [
                styles.headerBack,
                { backgroundColor: '#000000', borderColor: '#000000', borderWidth: 2 },
                pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
              ]}
              hitSlop={12}
            >
              <ChevronLeft
                color="#FFFFFF"
                size={22}
                strokeWidth={2.8}
              />
            </Pressable>
          </div>

          <Text
            style={[
              styles.headerTitle,
              {
                color: '#000000',
                fontFamily: 'Poppins-ExtraBold',
                fontSize: 22,
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
                color: '#000000',
                fontFamily: 'Poppins-ExtraBold',
              },
            ]}
          >
            Couldn’t Start Game
          </Text>

          <Text
            style={[
              styles.errorMessage,
              {
                color: COLORS.muted,
                fontFamily: 'Poppins-Regular',
              },
            ]}
          >
            {initializationError ??
              'The puzzle could not be initialized.'}
          </Text>

          <div style={{ position: 'relative', width: '80%', maxWidth: 220 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 14 }} />
            <Pressable
              style={({ pressed }) => [
                styles.checkBtn,
                {
                  backgroundColor: '#000000',
                  borderColor: '#000000',
                  borderWidth: 2.5,
                  borderRadius: 14,
                },
                pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
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
                    color: '#FFFFFF',
                    fontFamily: 'Poppins-ExtraBold',
                  },
                ]}
              >
                Try Again
              </Text>
            </Pressable>
          </div>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: pageBg },
      ]}
      edges={['top', 'bottom']}
    >
      <StatusBar barStyle="dark-content" backgroundColor={pageBg} />

      <View
        style={
          styles.screenContent
        }
      >
        <View
          style={[
            styles.header,
            { borderBottomColor: '#000000', paddingBottom: 10, paddingTop: 12 },
          ]}
        >
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 8 }} />
            <Pressable
              onPress={() =>
                setShowExitConfirm(
                  true,
                )
              }
              style={({ pressed }) => [
                styles.headerBack,
                { backgroundColor: '#000000', borderColor: '#000000', borderWidth: 2 },
                pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
              ]}
              hitSlop={12}
            >
              <ChevronLeft
                color="#FFFFFF"
                size={22}
                strokeWidth={2.8}
              />
            </Pressable>
          </div>

          <Text
            style={[
              styles.headerTitle,
              {
                color: '#000000',
                fontFamily: 'Poppins-ExtraBold',
                fontSize: 22,
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
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 3, left: 3, right: -3, bottom: -3, backgroundColor: '#000000', borderRadius: 8 }} />
              <View
                style={[
                  styles.levelPill,
                  {
                    backgroundColor: COLORS.card,
                    borderColor: '#000000',
                    borderWidth: 2,
                    borderRadius: 8,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.levelText,
                    {
                      color: COLORS.text,
                      fontFamily: 'Poppins-Bold',
                    },
                  ]}
                >
                  {difficultyLabel(
                    difficulty,
                  )}
                </Text>
              </View>
            </div>

            <div style={{ paddingHorizontal: 4 }}>
              <Text
                style={[
                  styles.timerText,
                  {
                    color:
                      secondsLeft <= 20
                        ? '#DC2626'
                        : '#000000',
                    fontFamily: 'Poppins-Bold',
                  },
                ]}
              >
                {formatTime(
                  secondsLeft,
                )}
              </Text>
            </div>
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
                          ? '#000000'
                          : COLORS.card,
                        borderColor: '#000000',
                        borderWidth: 1.5,
                        borderRadius: 6,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.wordChipText,
                        {
                          color: found
                            ? '#FFFFFF'
                            : COLORS.text,
                          fontFamily: 'Poppins-Bold',
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
          <div style={{ position: 'relative', width: '100%' }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 14 }} />
            <Pressable
              style={({ pressed }) => [
                styles.checkBtn,
                {
                  backgroundColor: '#000000',
                  borderColor: '#000000',
                  borderWidth: 2.5,
                  borderRadius: 14,
                },
                pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
              ]}
              onPress={checkSelection}
            >
              <Text
                style={[
                  styles.checkBtnText,
                  {
                    color: '#FFFFFF',
                    fontFamily: 'Poppins-ExtraBold',
                  },
                ]}
              >
                Check Word
              </Text>
            </Pressable>
          </div>

          <Text
            style={[
              styles.scoreText,
              {
                color: '#000000',
                fontFamily: 'Poppins-Bold',
              },
            ]}
          >
            {foundWords.size}/{words.length} found · {currentScore} pts
          </Text>
        </View>

        <Text
          style={[
            styles.instructionText,
            { color: '#000000', fontFamily: 'Poppins-Bold' },
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
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 }} />
              <View
                style={[
                  styles.gridContainer,
                  { backgroundColor: COLORS.card, borderColor: '#000000', borderWidth: 3, borderRadius: 16, padding: 8 },
                ]}
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
                          style={({ pressed }) => [
                            styles.cell,
                            {
                              width:
                                cellSize,
                              height:
                                cellSize,
                              backgroundColor:
                                highlighted
                                  ? accent
                                  : COLORS.card,
                              borderColor: '#000000',
                            },
                            pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
                          ]}
                        >
                          <Text
                            style={[
                              styles.cellText,
                              {
                                color: highlighted ? '#000000' : COLORS.text,
                                fontSize:
                                  Math.max(
                                    9,
                                    cellSize *
                                      0.42,
                                  ),
                                fontFamily: 'Poppins-ExtraBold',
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
            </div>
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
          <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 }} />
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: COLORS.card,
                  borderColor: '#000000',
                  borderWidth: 3,
                  borderRadius: 16,
                },
              ]}
            >

              <Text
                style={[
                  styles.modalTitle,
                  {
                    color: COLORS.text,
                    fontFamily: 'Poppins-ExtraBold',
                  },
                ]}
              >
                Exit Game?
              </Text>

              <Text
                style={[
                  styles.modalSub,
                  {
                    color: COLORS.muted,
                    fontFamily: 'Poppins-Medium',
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
                    color: COLORS.muted,
                    fontFamily: 'Poppins-Regular',
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
                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnSecondary,
                      {
                        backgroundColor: COLORS.card,
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
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
                          color: COLORS.text,
                          fontFamily: 'Poppins-ExtraBold',
                        },
                      ]}
                    >
                      Keep Playing
                    </Text>
                  </Pressable>
                </div>

                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      {
                        backgroundColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={
                      handleExitGame
                    }
                  >
                    <Text
                      style={[
                        styles.btnPrimaryText,
                        {
                          color: '#FFFFFF',
                          fontFamily: 'Poppins-ExtraBold',
                        },
                      ]}
                    >
                      Exit Game
                    </Text>
                  </Pressable>
                </div>
              </View>
            </View>
          </div>
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
          <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 }} />
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: COLORS.card,
                  borderColor: '#000000',
                  borderWidth: 3,
                  borderRadius: 16,
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
                    color: COLORS.text,
                    fontFamily: 'Poppins-ExtraBold',
                  },
                ]}
              >
                All Words Found!
              </Text>

              <Text
                style={[
                  styles.modalSub,
                  {
                    color: COLORS.muted,
                    fontFamily: 'Poppins-Medium',
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
                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      {
                        backgroundColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={
                      handlePlayAgain
                    }
                  >
                    <Text
                      style={[
                        styles.btnPrimaryText,
                        {
                          color: '#FFFFFF',
                          fontFamily: 'Poppins-ExtraBold',
                        },
                      ]}
                    >
                      Play Again
                    </Text>
                  </Pressable>
                </div>

                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnSecondary,
                      {
                        backgroundColor: COLORS.card,
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={
                      handleExitGame
                    }
                  >
                    <Text
                      style={[
                        styles.btnSecondaryText,
                        {
                          color: COLORS.text,
                          fontFamily: 'Poppins-ExtraBold',
                        },
                      ]}
                    >
                      Exit Game
                    </Text>
                  </Pressable>
                </div>
              </View>
            </View>
          </div>
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
          <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 }} />
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: COLORS.card,
                  borderColor: '#000000',
                  borderWidth: 3,
                  borderRadius: 16,
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
                    color: COLORS.text,
                    fontFamily: 'Poppins-ExtraBold',
                  },
                ]}
              >
                Time's Up!
              </Text>

              <Text
                style={[
                  styles.modalSub,
                  {
                    color: COLORS.muted,
                    fontFamily: 'Poppins-Medium',
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
                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      {
                        backgroundColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={
                      handlePlayAgain
                    }
                  >
                    <Text
                      style={[
                        styles.btnPrimaryText,
                        {
                          color: '#FFFFFF',
                          fontFamily: 'Poppins-ExtraBold',
                        },
                      ]}
                    >
                      Play Again
                    </Text>
                  </Pressable>
                </div>

                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnSecondary,
                      {
                        backgroundColor: COLORS.card,
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={
                      handleExitGame
                    }
                  >
                    <Text
                      style={[
                        styles.btnSecondaryText,
                        {
                          color: COLORS.text,
                          fontFamily: 'Poppins-ExtraBold',
                        },
                      ]}
                    >
                      Exit Game
                    </Text>
                  </Pressable>
                </div>
              </View>
            </View>
          </div>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: typeof DARK_PALETTE) {
  return StyleSheet.create({
    safe: {
      flex: 1,
    },

    screenContent: {
      flex: 1,
      minHeight: 0,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      borderBottomWidth: 0,
      zIndex: 100,
    },

    headerBack: {
      width: 40,
      height: 40,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },

    headerTitle: {
      letterSpacing: 1,
    },

    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    levelPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
    },

    levelText: {
      fontSize: 11,
    },

    timerText: {
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
    },

    wordChipText: {
      fontSize: 11,
    },

    gridWrap: {
      minHeight: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 24,
      paddingBottom: 4,
    },

    gridContainer: {
      overflow: 'hidden',
    },

    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignSelf: 'center',
    },

    cell: {
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    cellText: {
      // font specified inline
    },

    gameControlsTop: {
      width: '100%',
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 4,
      alignItems: 'center',
      gap: 8,
    },

    scoreText: {
      fontSize: 13,
      paddingTop: 2,
    },

    checkBtn: {
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      minHeight: 48,
      flexShrink: 0,
    },

    checkBtnText: {
      fontSize: 15,
      letterSpacing: 1.2,
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
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },

    initializingIconText: {
      fontSize: 30,
    },

    initializingTitle: {
      fontSize: 20,
      textAlign: 'center',
    },

    initializingSub: {
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
      fontSize: 22,
      textAlign: 'center',
    },

    errorMessage: {
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
      padding: 24,
      alignItems: 'center',
      width: '100%',
      gap: 12,
    },

    modalEmoji: {
      fontSize: 44,
    },

    modalTitle: {
      fontSize: 22,
      letterSpacing: 0.5,
      textAlign: 'center',
    },

    modalSub: {
      fontSize: 14,
      textAlign: 'center',
    },

    exitWarning: {
      fontSize: 13,
      textAlign: 'center',
      marginTop: -4,
    },

    modalBtns: {
      flexDirection: 'column',
      gap: 12,
      marginTop: 12,
      width: '100%',
    },

    btnPrimary: {
      width: '100%',
      paddingVertical: 14,
      alignItems: 'center',
    },

    btnPrimaryText: {
      fontSize: 15,
      letterSpacing: 1,
    },

    btnSecondary: {
      width: '100%',
      paddingVertical: 14,
      alignItems: 'center',
    },

    btnSecondaryText: {
      fontSize: 15,
      letterSpacing: 1,
      textAlign: 'center',
    },
  });
}