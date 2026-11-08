import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { ChevronLeft } from 'lucide-react-native';

import { useLocalSearchParams, router } from 'expo-router';

import { supabase } from '@/lib/supabase';

import { useApp } from '@/components/AppProvider';

import { generateSudoku } from '@/components/games-utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard';

const TIME_LIMIT = 180;

const POINTS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 100,
  medium: 200,
  hard: 300,
};

const LEVEL_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 1,
  medium: 3,
  hard: 5,
};

function difficultyFromParams(
  difficultyParam?: string,
  levelParam?: string
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

function difficultyLabel(d: Difficulty): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');

  const s = (seconds % 60).toString().padStart(2, '0');

  return `${m}:${s}`;
}

function getBoxIndex(row: number, col: number): number {
  return Math.floor(row / 3) * 3 + Math.floor(col / 3);
}

function hasConflict(
  board: number[],
  index: number,
  value: number
): boolean {
  if (value === 0) return false;

  const row = Math.floor(index / 9);
  const col = index % 9;
  const box = getBoxIndex(row, col);

  for (let i = 0; i < 81; i++) {
    if (i === index) continue;

    const r = Math.floor(i / 9);
    const c = i % 9;
    const b = getBoxIndex(r, c);

    if (
      (r === row || c === col || b === box) &&
      board[i] === value
    ) {
      return true;
    }
  }

  return false;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SudokuScreen() {
  const params = useLocalSearchParams<{
    difficulty?: string;
    level?: string;
    sessionId?: string;
  }>();

  const [difficulty] = useState<Difficulty>(() =>
    difficultyFromParams(params.difficulty, params.level)
  );

  const genLevel = LEVEL_BY_DIFFICULTY[difficulty];

  const { isDark, accentForeground, onAccent } = useApp();

  const colors = {
    background: isDark ? '#090909' : '#FBFAF8',
    section: isDark ? '#151515' : '#FFFFFF',
    text: isDark ? '#F4F2EE' : '#27241F',
    muted: isDark ? '#AAA59D' : '#8F8A82',
    border: isDark ? '#2A2A2A' : '#ECE9E4',
    givenBg: isDark ? '#292929' : '#F3F2EF',
    accent: accentForeground,
    onAccent,
  };

  const [puzzleData, setPuzzleData] = useState(() =>
    generateSudoku(genLevel)
  );

  const [board, setBoard] = useState<number[]>(() => [
    ...puzzleData.puzzle,
  ]);

  const given = puzzleData.puzzle.map((v) => v !== 0);

  const [selected, setSelected] = useState<number | null>(null);

  const [wrongCells, setWrongCells] = useState<Set<number>>(
    new Set()
  );

  const [secondsLeft, setSecondsLeft] = useState(TIME_LIMIT);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [timerRunning, setTimerRunning] = useState(true);

  const [showWin, setShowWin] = useState(false);

  const [showTimeUp, setShowTimeUp] = useState(false);

  // New: exit confirmation modal
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const [finalScore, setFinalScore] = useState(0);

  const [scoreSaved, setScoreSaved] = useState(false);

  const exitConfirmedRef = useRef(false);

  const sessionId =
    params.sessionId && params.sessionId !== 'undefined'
      ? params.sessionId
      : null;

  const abandonSession = useCallback(async () => {
    if (!sessionId) return;

    const { error } = await supabase
      .from('game_sessions')
      .update({ status: 'abandoned', result: 'abandoned' })
      .eq('id', sessionId)
      .eq('status', 'active');

    if (error) {
      console.error('SUDOKU ABANDON SESSION ERROR:', error);
    }
  }, [sessionId]);

  const completeSession = useCallback(async () => {
    if (!sessionId) return;

    const { error } = await supabase
      .from('game_sessions')
      .update({ status: 'completed', result: 'completed' })
      .eq('id', sessionId)
      .eq('status', 'active');

    if (error) {
      console.error('SUDOKU COMPLETE SESSION ERROR:', error);
    }
  }, [sessionId]);

  // ─── Timer ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!timerRunning) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          setTimerRunning(false);
          if (!exitConfirmedRef.current) {
            completeSession();
          }
          setShowTimeUp(true);

          return 0;
        }

        return s - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timerRunning, completeSession]);

  // ─── Board interaction ─────────────────────────────────────────────────────

  const handleCellPress = useCallback(
    (index: number) => {
      if (!timerRunning) return;

      setSelected(index);
    },
    [timerRunning]
  );

  const handleNumberPress = useCallback(
    (num: number) => {
      if (
        !timerRunning ||
        selected === null ||
        given[selected]
      ) {
        return;
      }

      setBoard((prev) => {
        const next = [...prev];
        next[selected] = num;
        return next;
      });

      setWrongCells((prev) => {
        if (prev.has(selected)) {
          const next = new Set(prev);
          next.delete(selected);
          return next;
        }

        return prev;
      });
    },
    [selected, given, timerRunning]
  );

  const handleClear = useCallback(() => {
    if (
      !timerRunning ||
      selected === null ||
      given[selected]
    ) {
      return;
    }

    setBoard((prev) => {
      const next = [...prev];
      next[selected] = 0;
      return next;
    });

    setWrongCells((prev) => {
      if (prev.has(selected)) {
        const next = new Set(prev);
        next.delete(selected);
        return next;
      }

      return prev;
    });
  }, [selected, given, timerRunning]);

  // ─── Check puzzle ──────────────────────────────────────────────────────────

  const handleCheck = useCallback(() => {
    if (!timerRunning) return;

    const wrong = new Set<number>();

    let allFilled = true;

    for (let i = 0; i < 81; i++) {
      if (board[i] === 0) {
        allFilled = false;
        continue;
      }

      if (board[i] !== puzzleData.solution[i]) {
        wrong.add(i);
      }
    }

    setWrongCells(wrong);

    if (allFilled && wrong.size === 0) {
      setTimerRunning(false);

      setFinalScore(POINTS_BY_DIFFICULTY[difficulty]);

      if (!exitConfirmedRef.current) {
        completeSession();
      }

      setShowWin(true);
    }
  }, [
    board,
    puzzleData.solution,
    timerRunning,
    difficulty,
    completeSession,
  ]);

  // ─── Save score ────────────────────────────────────────────────────────────

  const saveScore = useCallback(
    async (score: number) => {
      if (scoreSaved) return;

      setScoreSaved(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const playerId = user?.id;

      if (!playerId) return;

      await supabase.from('game_scores').insert({
        session_id: sessionId,
        player_id: playerId,
        game: 'sudoku',
        mode: 'solo',
        points: score,
        difficulty,
      });
    },
    [scoreSaved, difficulty, sessionId]
  );

  useEffect(() => {
    if (showWin && !exitConfirmedRef.current) {
      saveScore(finalScore);
    }
  }, [showWin, finalScore, saveScore]);

  // ─── Play again ────────────────────────────────────────────────────────────

  const handlePlayAgain = useCallback(() => {
    const nextPuzzle = generateSudoku(genLevel);

    setPuzzleData(nextPuzzle);

    setBoard([...nextPuzzle.puzzle]);

    setSelected(null);

    setWrongCells(new Set());

    setSecondsLeft(TIME_LIMIT);

    setTimerRunning(true);

    setShowWin(false);

    setShowTimeUp(false);

    setShowExitConfirm(false);

    setScoreSaved(false);

    setFinalScore(0);
    exitConfirmedRef.current = false;
  }, [genLevel]);

  // ─── Exit confirmation ─────────────────────────────────────────────────────

  const handleBackPress = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  const handleContinueGame = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  const handleExitGame = useCallback(async () => {
    exitConfirmedRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimerRunning(false);
    setShowExitConfirm(false);
    setShowWin(false);
    setShowTimeUp(false);
    await abandonSession();
    router.replace('/modules/games');
  }, [abandonSession]);

  // ─── Cell styling ──────────────────────────────────────────────────────────

  function getCellStyle(index: number) {
    const row = Math.floor(index / 9);
    const col = index % 9;

    const isGiven = given[index];
    const isSelected = selected === index;
    const isWrong = wrongCells.has(index);

    const value = board[index];

    const isConflict =
      !isGiven &&
      value !== 0 &&
      hasConflict(board, index, value) &&
      !isSelected;

    const borderRight =
      (col + 1) % 3 === 0 && col !== 8 ? 2 : 0.5;

    const borderBottom =
      (row + 1) % 3 === 0 && row !== 8 ? 2 : 0.5;

    const borderRightColor =
      (col + 1) % 3 === 0 && col !== 8
        ? colors.accent
        : colors.border;

    const borderBottomColor =
      (row + 1) % 3 === 0 && row !== 8
        ? colors.accent
        : colors.border;

    let backgroundColor = isGiven
      ? colors.givenBg
      : colors.section;

    if (isSelected) {
      backgroundColor = colors.accent;
    } else if (isWrong) {
      backgroundColor = 'rgba(220,50,50,0.3)';
    } else if (isConflict) {
      backgroundColor = 'rgba(220,50,50,0.15)';
    }

    return {
      cell: {
        backgroundColor,
        borderRightWidth: borderRight,
        borderBottomWidth: borderBottom,
        borderRightColor,
        borderBottomColor,
      },

      text: {
        color: isSelected
          ? colors.onAccent
          : isGiven
            ? colors.text
            : isWrong
              ? '#FF6B6B'
              : colors.accent,

        fontWeight: isGiven
          ? ('700' as const)
          : ('400' as const),
      },
    };
  }

  const CELL_SIZE = 38;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: accentForeground },
      ]}
      edges={['top', 'bottom']}
    >
      <StatusBar barStyle="dark-content" backgroundColor={accentForeground} />

      {/* Header */}

      <View
        style={[
          styles.header,
          { borderBottomColor: '#000000', paddingBottom: 10, paddingTop: 12 },
        ]}
      >
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 8 }} />
          <Pressable
            onPress={handleBackPress}
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
          SUDOKU
        </Text>

        <View style={styles.headerRight}>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 3, left: 3, right: -3, bottom: -3, backgroundColor: '#000000', borderRadius: 8 }} />
            <View
              style={[
                styles.levelPill,
                {
                  backgroundColor: colors.section,
                  borderColor: '#000000',
                  borderWidth: 2,
                  borderRadius: 8,
                },
              ]}
            >
              <Text
                style={[
                  styles.levelText,
                  { color: colors.text, fontFamily: 'Poppins-Bold' },
                ]}
              >
                {difficultyLabel(difficulty)}
              </Text>
            </View>
          </div>

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
            {formatTime(secondsLeft)}
          </Text>
        </View>
      </View>

      {/* Game */}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 }} />
          <View
            style={[
              styles.gridContainer,
              { borderColor: '#000000', backgroundColor: isDark ? '#121212' : '#FFFFFF', borderWidth: 3, borderRadius: 16, padding: 8 },
            ]}
          >
            <View style={styles.grid}>
              {board.map((value, index) => {
                const s = getCellStyle(index);

                return (
                  <Pressable
                    key={index}
                    style={({ pressed }) => [
                      styles.cell,
                      s.cell,
                      pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
                    ]}
                    onPress={() => handleCellPress(index)}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        s.text,
                      ]}
                    >
                      {value !== 0 ? value.toString() : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </div>

        {/* Number pad */}

        <View style={styles.numPad}>
          <View style={styles.numRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(
              (num) => (
                <div key={num} style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 3, left: 3, right: -3, bottom: -3, backgroundColor: '#000000', borderRadius: 10 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.numBtn,
                      {
                        backgroundColor: colors.section,
                        borderColor: '#000000',
                        borderWidth: 2,
                        borderRadius: 10,
                      },
                      pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
                    ]}
                    onPress={() =>
                      handleNumberPress(num)
                    }
                  >
                    <Text
                      style={[
                        styles.numBtnText,
                        { color: colors.text, fontFamily: 'Poppins-ExtraBold' },
                      ]}
                    >
                      {num}
                    </Text>
                  </Pressable>
                </div>
              )
            )}
          </View>

          <div style={{ position: 'relative', width: '100%' }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
            <Pressable
              style={({ pressed }) => [
                styles.clearBtn,
                {
                  backgroundColor: colors.section,
                  borderColor: '#000000',
                  borderWidth: 2.5,
                  borderRadius: 12,
                },
                pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
              ]}
              onPress={handleClear}
            >
              <Text
                style={[
                  styles.clearBtnText,
                  { color: colors.text, fontFamily: 'Poppins-ExtraBold', letterSpacing: 1 },
                ]}
              >
                Clear
              </Text>
            </Pressable>
          </div>
        </View>

        {/* Check */}

        <div style={{ position: 'relative', width: '100%' }}>
          <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 14 }} />
          <Pressable
            style={({ pressed }) => [
              styles.checkBtn,
              { backgroundColor: '#000000', borderColor: '#000000', borderWidth: 2.5, borderRadius: 14 },
              pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
            ]}
            onPress={handleCheck}
          >
            <Text
              style={[
                styles.checkBtnText,
                { color: '#FFFFFF', fontFamily: 'Poppins-ExtraBold', letterSpacing: 1.2 },
              ]}
            >
              Check Puzzle
            </Text>
          </Pressable>
        </div>
      </ScrollView>

      {/* ─────────────────────────────────────────────────────────────────────
          Exit Confirmation Modal
      ───────────────────────────────────────────────────────────────────── */}

      <Modal
        visible={showExitConfirm}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleContinueGame}
      >
        <View style={styles.modalOverlay}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 }} />
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.section,
                  borderColor: '#000000',
                  borderWidth: 3,
                  borderRadius: 16,
                },
              ]}
            >

              <Text
                style={[
                  styles.modalTitle,
                  { color: colors.text, fontFamily: 'Poppins-ExtraBold' },
                ]}
              >
                Exit Game?
              </Text>

              <Text
                style={[
                  styles.modalSubtitle,
                  { color: colors.muted, fontFamily: 'Poppins-Medium' },
                ]}
              >
                Are you sure you want to leave this
                Sudoku puzzle?
              </Text>

              <Text
                style={[
                  styles.exitWarning,
                  { color: colors.muted, fontFamily: 'Poppins-Regular' },
                ]}
              >
                Your current progress will be lost.
              </Text>

              <View style={styles.modalButtons}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalBtn,
                      {
                        backgroundColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={handleContinueGame}
                  >
                    <Text
                      style={[
                        styles.modalBtnPrimaryText,
                        { color: '#FFFFFF', fontFamily: 'Poppins-ExtraBold' },
                      ]}
                    >
                      Continue Game
                    </Text>
                  </Pressable>
                </div>

                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalBtn,
                      styles.modalBtnSecondary,
                      {
                        backgroundColor: colors.section,
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={handleExitGame}
                  >
                    <Text
                      style={[
                        styles.modalBtnSecondaryText,
                        { color: colors.text, fontFamily: 'Poppins-ExtraBold' },
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

      {/* ─────────────────────────────────────────────────────────────────────
          Win Modal
      ───────────────────────────────────────────────────────────────────── */}

      <Modal
        visible={showWin}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 }} />
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.section,
                  borderColor: '#000000',
                  borderWidth: 3,
                  borderRadius: 16,
                },
              ]}
            >
              <Text style={styles.modalEmoji}>⭐</Text>

              <Text
                style={[
                  styles.modalTitle,
                  { color: colors.text, fontFamily: 'Poppins-ExtraBold' },
                ]}
              >
                Puzzle Complete!
              </Text>

              <Text
                style={[
                  styles.modalSubtitle,
                  { color: colors.muted, fontFamily: 'Poppins-Medium' },
                ]}
              >
                {difficultyLabel(difficulty)}
              </Text>

              <View
                style={[
                  styles.modalStats,
                  { backgroundColor: colors.givenBg, borderColor: '#000000', borderWidth: 2, borderRadius: 12 },
                ]}
              >
                <View style={styles.modalStat}>
                  <Text
                    style={[
                      styles.modalStatLabel,
                      { color: colors.muted, fontFamily: 'Poppins-Bold' },
                    ]}
                  >
                    Time Left
                  </Text>

                  <Text
                    style={[
                      styles.modalStatValue,
                      { color: colors.text, fontFamily: 'Poppins-ExtraBold' },
                    ]}
                  >
                    {formatTime(secondsLeft)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.modalDivider,
                    { backgroundColor: colors.border },
                  ]}
                />

                <View style={styles.modalStat}>
                  <Text
                    style={[
                      styles.modalStatLabel,
                      { color: colors.muted, fontFamily: 'Poppins-Bold' },
                    ]}
                  >
                    Score
                  </Text>

                  <Text
                    style={[
                      styles.modalStatValue,
                      { color: colors.text, fontFamily: 'Poppins-ExtraBold' },
                    ]}
                  >
                    {finalScore} pts
                  </Text>
                </View>
              </View>

              <View style={styles.modalButtons}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalBtn,
                      {
                        backgroundColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={handlePlayAgain}
                  >
                    <Text
                      style={[
                        styles.modalBtnPrimaryText,
                        { color: '#FFFFFF', fontFamily: 'Poppins-ExtraBold' },
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
                      styles.modalBtn,
                      styles.modalBtnSecondary,
                      {
                        backgroundColor: colors.section,
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={handleExitGame}
                  >
                    <Text
                      style={[
                        styles.modalBtnSecondaryText,
                        { color: colors.text, fontFamily: 'Poppins-ExtraBold' },
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

      {/* ─────────────────────────────────────────────────────────────────────
          Time's Up Modal
      ───────────────────────────────────────────────────────────────────── */}

      <Modal
        visible={showTimeUp}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 }} />
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.section,
                  borderColor: '#000000',
                  borderWidth: 3,
                  borderRadius: 16,
                },
              ]}
            >
              <Text style={styles.modalEmoji}>⏱️</Text>

              <Text
                style={[
                  styles.modalTitle,
                  { color: colors.text, fontFamily: 'Poppins-ExtraBold' },
                ]}
              >
                Time's Up!
              </Text>

              <Text
                style={[
                  styles.modalSubtitle,
                  { color: colors.muted, fontFamily: 'Poppins-Medium' },
                ]}
              >
                {difficultyLabel(difficulty)} · no
                points awarded
              </Text>

              <View style={styles.modalButtons}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalBtn,
                      {
                        backgroundColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={handlePlayAgain}
                  >
                    <Text
                      style={[
                        styles.modalBtnPrimaryText,
                        { color: '#FFFFFF', fontFamily: 'Poppins-ExtraBold' },
                      ]}
                    >
                      Try Again
                    </Text>
                  </Pressable>
                </div>

                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalBtn,
                      styles.modalBtnSecondary,
                      {
                        backgroundColor: colors.section,
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                    onPress={handleExitGame}
                  >
                    <Text
                      style={[
                        styles.modalBtnSecondaryText,
                        { color: colors.text, fontFamily: 'Poppins-ExtraBold' },
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
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

  scrollContent: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 18,
    paddingBottom: 100,
  },

  gridContainer: {
    overflow: 'hidden',
  },

  grid: {
    width: 333,
    height: 333,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  cell: {
    width: 37,
    height: 37,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },

  cellText: {
    fontSize: 16,
    textAlign: 'center',
  },

  numPad: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },

  numRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },

  numBtn: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  numBtnText: {
    fontSize: 18,
  },

  clearBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    width: '100%',
  },

  clearBtnText: {
    fontSize: 15,
  },

  checkBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },

  checkBtnText: {
    fontSize: 15,
  },

  // ─── Modals ───────────────────────────────────────────────────────────────

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

  modalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },

  exitWarning: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: -4,
  },

  modalStats: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    width: '100%',
    gap: 12,
    marginTop: 4,
  },

  modalStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },

  modalStatLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  modalStatValue: {
    fontSize: 18,
  },

  modalDivider: {
    width: 2,
    height: 30,
  },

  modalButtons: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 12,
    width: '100%',
  },

  modalBtn: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
  },

  modalBtnSecondary: {
    // border specified inline
  },

  modalBtnPrimaryText: {
    fontSize: 15,
    letterSpacing: 1,
  },

  modalBtnSecondaryText: {
    fontSize: 15,
    letterSpacing: 1,
  },
});