import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Modal,
  Pressable,
  ScrollView,
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
  }, [timerRunning]);

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

      setShowWin(true);
    }
  }, [
    board,
    puzzleData.solution,
    timerRunning,
    difficulty,
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
        player_id: playerId,
        game: 'sudoku',
        mode: 'solo',
        points: score,
        difficulty,
      });
    },
    [scoreSaved, difficulty]
  );

  useEffect(() => {
    if (showWin) {
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
  }, [genLevel]);

  // ─── Exit confirmation ─────────────────────────────────────────────────────

  const handleBackPress = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  const handleContinueGame = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  const handleExitGame = useCallback(() => {
    setShowExitConfirm(false);
    router.push('/modules');
  }, []);

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
        { backgroundColor: colors.background },
      ]}
    >
      {/* Header */}

      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          onPress={handleBackPress}
          style={[
            styles.headerBack,
            { backgroundColor: colors.accent },
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
            { color: colors.accent },
          ]}
        >
          SUDOKU
        </Text>

        <View style={styles.headerRight}>
          <View
            style={[
              styles.levelPill,
              {
                backgroundColor: colors.section,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.levelText,
                { color: colors.muted },
              ]}
            >
              {difficultyLabel(difficulty)}
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

      {/* Game */}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.gridContainer,
            { borderColor: colors.accent },
          ]}
        >
          <View style={styles.grid}>
            {board.map((value, index) => {
              const s = getCellStyle(index);

              return (
                <Pressable
                  key={index}
                  style={[styles.cell, s.cell]}
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

        {/* Number pad */}

        <View style={styles.numPad}>
          <View style={styles.numRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(
              (num) => (
                <Pressable
                  key={num}
                  style={({ pressed }) => [
                    styles.numBtn,
                    {
                      backgroundColor: colors.section,
                      borderColor: colors.border,
                    },
                    pressed && {
                      borderColor: colors.accent,
                    },
                  ]}
                  onPress={() =>
                    handleNumberPress(num)
                  }
                >
                  <Text
                    style={[
                      styles.numBtnText,
                      { color: colors.accent },
                    ]}
                  >
                    {num}
                  </Text>
                </Pressable>
              )
            )}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.clearBtn,
              {
                backgroundColor: colors.section,
                borderColor: colors.border,
              },
              pressed && {
                borderColor: '#FF6B6B',
                backgroundColor:
                  'rgba(220,50,50,0.15)',
              },
            ]}
            onPress={handleClear}
          >
            <Text
              style={[
                styles.clearBtnText,
                { color: colors.muted },
              ]}
            >
              Clear
            </Text>
          </Pressable>
        </View>

        {/* Check */}

        <Pressable
          style={({ pressed }) => [
            styles.checkBtn,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleCheck}
        >
          <Text
            style={[
              styles.checkBtnText,
              { color: colors.onAccent },
            ]}
          >
            Check Puzzle
          </Text>
        </Pressable>
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
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.section,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={styles.modalEmoji}>🚪</Text>

            <Text
              style={[
                styles.modalTitle,
                { color: colors.text },
              ]}
            >
              Exit Game?
            </Text>

            <Text
              style={[
                styles.modalSubtitle,
                { color: colors.muted },
              ]}
            >
              Are you sure you want to leave this
              Sudoku puzzle?
            </Text>

            <Text
              style={[
                styles.exitWarning,
                { color: colors.muted },
              ]}
            >
              Your current progress will be lost.
            </Text>

            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: colors.accent,
                  },
                  pressed && { opacity: 0.75 },
                ]}
                onPress={handleContinueGame}
              >
                <Text
                  style={[
                    styles.modalBtnPrimaryText,
                    { color: colors.onAccent },
                  ]}
                >
                  Continue Game
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnSecondary,
                  {
                    backgroundColor:
                      colors.background,
                    borderColor: colors.border,
                  },
                  pressed && { opacity: 0.75 },
                ]}
                onPress={handleExitGame}
              >
                <Text
                  style={[
                    styles.modalBtnSecondaryText,
                    { color: colors.text },
                  ]}
                >
                  Exit Game
                </Text>
              </Pressable>
            </View>
          </View>
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
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.section,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={styles.modalEmoji}>⭐</Text>

            <Text
              style={[
                styles.modalTitle,
                { color: colors.text },
              ]}
            >
              Puzzle Complete!
            </Text>

            <Text
              style={[
                styles.modalSubtitle,
                { color: colors.muted },
              ]}
            >
              {difficultyLabel(difficulty)}
            </Text>

            <View
              style={[
                styles.modalStats,
                { backgroundColor: colors.background },
              ]}
            >
              <View style={styles.modalStat}>
                <Text
                  style={[
                    styles.modalStatLabel,
                    { color: colors.muted },
                  ]}
                >
                  Time Left
                </Text>

                <Text
                  style={[
                    styles.modalStatValue,
                    { color: colors.accent },
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
                    { color: colors.muted },
                  ]}
                >
                  Score
                </Text>

                <Text
                  style={[
                    styles.modalStatValue,
                    { color: colors.accent },
                  ]}
                >
                  {finalScore} pts
                </Text>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: colors.accent,
                  },
                  pressed && { opacity: 0.75 },
                ]}
                onPress={handlePlayAgain}
              >
                <Text
                  style={[
                    styles.modalBtnPrimaryText,
                    { color: colors.onAccent },
                  ]}
                >
                  Play Again
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnSecondary,
                  {
                    backgroundColor:
                      colors.background,
                    borderColor: colors.border,
                  },
                  pressed && { opacity: 0.75 },
                ]}
                onPress={handleExitGame}
              >
                <Text
                  style={[
                    styles.modalBtnSecondaryText,
                    { color: colors.text },
                  ]}
                >
                  Exit
                </Text>
              </Pressable>
            </View>
          </View>
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
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.section,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={styles.modalEmoji}>⏱️</Text>

            <Text
              style={[
                styles.modalTitle,
                { color: colors.text },
              ]}
            >
              Time's Up!
            </Text>

            <Text
              style={[
                styles.modalSubtitle,
                { color: colors.muted },
              ]}
            >
              {difficultyLabel(difficulty)} · no
              points awarded
            </Text>

            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: colors.accent,
                  },
                  pressed && { opacity: 0.75 },
                ]}
                onPress={handlePlayAgain}
              >
                <Text
                  style={[
                    styles.modalBtnPrimaryText,
                    { color: colors.onAccent },
                  ]}
                >
                  Try Again
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnSecondary,
                  {
                    backgroundColor:
                      colors.background,
                    borderColor: colors.border,
                  },
                  pressed && { opacity: 0.75 },
                ]}
                onPress={handleExitGame}
              >
                <Text
                  style={[
                    styles.modalBtnSecondaryText,
                    { color: colors.text },
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
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
    letterSpacing: 2,
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

  scrollContent: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
    gap: 20,
  },

  gridContainer: {
    borderWidth: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },

  grid: {
    width: 342,
    height: 342,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  cell: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },

  cellText: {
    fontSize: 17,
    textAlign: 'center',
  },

  numPad: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },

  numRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },

  numBtn: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  numBtnText: {
    fontSize: 20,
    fontWeight: '700',
  },

  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },

  clearBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },

  checkBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
    width: '80%',
  },

  checkBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
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
    borderWidth: 1,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    gap: 12,
  },

  modalEmoji: {
    fontSize: 52,
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
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
    borderRadius: 12,
    padding: 16,
    width: '100%',
    gap: 16,
    marginTop: 4,
  },

  modalStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },

  modalStatLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  modalStatValue: {
    fontSize: 22,
    fontWeight: '800',
  },

  modalDivider: {
    width: 1,
    height: 40,
  },

  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    width: '100%',
  },

  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },

  modalBtnSecondary: {
    borderWidth: 1,
  },

  modalBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
  },

  modalBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
});