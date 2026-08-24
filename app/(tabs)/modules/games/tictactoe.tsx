import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';

// ─── Types ───────────────────────────────────────────────────────────────────

type Opponent = 'computer' | 'friend';
type Cell = 'X' | 'O' | null;

// Difficulty-based board config: easy=3x3, medium=5x5, hard=7x7.
// Board size and win-length still scale with difficulty; point
// values are flat per your scoring rule (win=100, draw=10).
function configForDifficulty(difficulty: string): { size: number; win: number } {
  if (difficulty === 'easy') return { size: 3, win: 3 };
  if (difficulty === 'medium') return { size: 5, win: 4 };
  return { size: 7, win: 5 };
}

const WIN_POINTS = 100;
const DRAW_POINTS = 10;

// ─── Board Helpers ─────────────────────────────────────────────────────────────

function makeBoard(size: number): Cell[] {
  return Array(size * size).fill(null);
}

function checkWinner(board: Cell[], size: number, winLen: number): { winner: Cell; cells: number[] } | null {
  const idx = (r: number, c: number) => r * size + c;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = board[idx(r, c)];
      if (!cell) continue;
      for (const [dr, dc] of directions) {
        const cells: number[] = [idx(r, c)];
        for (let k = 1; k < winLen; k++) {
          const nr = r + dr * k; const nc = c + dc * k;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
          if (board[idx(nr, nc)] !== cell) break;
          cells.push(idx(nr, nc));
        }
        if (cells.length === winLen) return { winner: cell, cells };
      }
    }
  }
  return null;
}

function isDraw(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}

// ─── Minimax (3x3 only) ───────────────────────────────────────────────────────

function minimax(board: Cell[], depth: number, isMaximizing: boolean, size: number, winLen: number): number {
  const result = checkWinner(board, size, winLen);
  if (result) return result.winner === 'O' ? 10 - depth : depth - 10;
  if (isDraw(board)) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) { board[i] = 'O'; best = Math.max(best, minimax(board, depth + 1, false, size, winLen)); board[i] = null; }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) { board[i] = 'X'; best = Math.min(best, minimax(board, depth + 1, true, size, winLen)); board[i] = null; }
    }
    return best;
  }
}

function bestMinimax(board: Cell[], size: number, winLen: number): number {
  let bestVal = -Infinity; let bestIdx = -1; const copy = [...board];
  for (let i = 0; i < copy.length; i++) {
    if (!copy[i]) { copy[i] = 'O'; const val = minimax(copy, 0, false, size, winLen); copy[i] = null; if (val > bestVal) { bestVal = val; bestIdx = i; } }
  }
  return bestIdx;
}

// ─── Heuristic AI (larger boards) ─────────────────────────────────────────────

function countLine(board: Cell[], size: number, winLen: number, player: Cell): Map<number, number> {
  const scores = new Map<number, number>();
  const idx = (r: number, c: number) => r * size + c;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of directions) {
        const window: number[] = [];
        let valid = true;
        for (let k = 0; k < winLen; k++) {
          const nr = r + dr * k; const nc = c + dc * k;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) { valid = false; break; }
          window.push(idx(nr, nc));
        }
        if (!valid) continue;
        const playerCount = window.filter((i) => board[i] === player).length;
        const emptyCount = window.filter((i) => board[i] === null).length;
        const blocked = window.some((i) => board[i] !== null && board[i] !== player);
        if (!blocked && emptyCount > 0) {
          for (const i of window) { if (board[i] === null) scores.set(i, (scores.get(i) ?? 0) + playerCount); }
        }
      }
    }
  }
  return scores;
}

function heuristicMove(board: Cell[], size: number, winLen: number): number {
  const empty = board.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);

  for (const i of empty) { const copy = [...board]; copy[i] = 'O'; if (checkWinner(copy, size, winLen)) return i; }
  for (const i of empty) { const copy = [...board]; copy[i] = 'X'; if (checkWinner(copy, size, winLen)) return i; }

  const myScores = countLine(board, size, winLen, 'O');
  const oppScores = countLine(board, size, winLen, 'X');
  let bestIdx = -1; let bestScore = -Infinity;

  for (const i of empty) {
    const score = (myScores.get(i) ?? 0) * 2 + (oppScores.get(i) ?? 0);
    const row = Math.floor(i / size); const col = i % size;
    const centerBonus = 1 / (1 + Math.abs(row - (size - 1) / 2) + Math.abs(col - (size - 1) / 2));
    const total = score + centerBonus;
    if (total > bestScore) { bestScore = total; bestIdx = i; }
  }
  return bestIdx !== -1 ? bestIdx : empty[Math.floor(Math.random() * empty.length)];
}

function computeMove(board: Cell[], size: number, winLen: number): number {
  if (size <= 3) return bestMinimax(board, size, winLen);
  return heuristicMove(board, size, winLen);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TicTacToe() {
  const { sessionId, opponent = 'computer', difficulty = 'easy' } = useLocalSearchParams<{ sessionId: string; opponent: Opponent; difficulty: string }>();
  const { width, height } = useWindowDimensions();
  const { isDark, accentForeground, onAccent } = useApp();

  const colors = {
    bg: isDark ? '#090909' : '#FBFAF8',
    card: isDark ? '#151515' : '#FFFFFF',
    border: isDark ? '#2A2A2A' : '#ECE9E4',
    text: isDark ? '#F4F2EE' : '#27241F',
    muted: isDark ? '#AAA59D' : '#8F8A82',
    accent: accentForeground,
    onAccent,
  };

  const opp: Opponent = opponent === 'friend' ? 'friend' : 'computer';
  const config = configForDifficulty(difficulty);
  const [difficultyLevel] = useState(difficulty);

  const [board, setBoard] = useState<Cell[]>(() => makeBoard(config.size));
  const [xIsNext, setXIsNext] = useState(true);
  const [winResult, setWinResult] = useState<{ winner: Cell; cells: number[] } | null>(null);
  const [draw, setDraw] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const isComputerTurn = opp === 'computer' && !xIsNext && !winResult && !draw;

  // Board sizing — scale to fill available space (bounded by
  // both width and height so it never overflows vertically),
  // capped so it doesn't become oversized on tablets/desktop.
  const RESERVED_VERTICAL = 180;
  const MAX_BOARD_DIM = 520;
  const MIN_BOARD_DIM = 260;
  const availableWidth = width - 32;
  const availableHeight = height - RESERVED_VERTICAL;
  const maxBoardDim = Math.max(
    MIN_BOARD_DIM,
    Math.min(availableWidth, availableHeight, MAX_BOARD_DIM)
  );
  const cellSize = Math.floor(maxBoardDim / config.size);
  const actualBoardWidth = cellSize * config.size;

  const saveScore = useCallback(async (result: 'win' | 'loss' | 'draw') => {
    if (scoreSaved) return;
    setScoreSaved(true);
    const pts = result === 'win' ? WIN_POINTS : result === 'draw' ? DRAW_POINTS : 0;
    const { data: { user } } = await supabase.auth.getUser();
    const playerId = user?.id;
    if (!playerId) return;
    await supabase.from('game_scores').insert({
      session_id: sessionId && sessionId !== 'undefined' ? sessionId : null,
      player_id: playerId,
      game: 'tictactoe',
      mode: 'multiplayer',
      result,
      points: pts,
      difficulty: difficultyLevel,
    });
  }, [scoreSaved, sessionId, difficultyLevel]);

  useEffect(() => {
    const result = checkWinner(board, config.size, config.win);
    if (result) {
      setWinResult(result);
      setModalVisible(true);
      saveScore(result.winner === 'X' ? 'win' : 'loss');
      return;
    }
    if (isDraw(board)) { setDraw(true); setModalVisible(true); saveScore('draw'); }
  }, [board, config.size, config.win, saveScore]);

  useEffect(() => {
    if (!isComputerTurn) return;
    const timer = setTimeout(() => {
      const idx = computeMove(board, config.size, config.win);
      if (idx === -1) return;
      const next = [...board]; next[idx] = 'O'; setBoard(next); setXIsNext(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [isComputerTurn, board, config.size, config.win]);

  const handleCellPress = (index: number) => {
    if (board[index] || winResult || draw) return;
    if (opp === 'computer' && !xIsNext) return;
    const next = [...board]; next[index] = xIsNext ? 'X' : 'O'; setBoard(next); setXIsNext(!xIsNext);
  };

  const handlePlayAgain = () => {
    setBoard(makeBoard(config.size));
    setXIsNext(true);
    setWinResult(null);
    setDraw(false);
    setModalVisible(false);
    setScoreSaved(false);
  };

  const statusText = (() => {
    if (winResult) return winResult.winner === 'X' ? 'You won!' : opp === 'computer' ? 'Computer wins!' : 'O wins!';
    if (draw) return "It's a draw!";
    if (opp === 'computer') return xIsNext ? 'Your turn (X)' : 'Computer thinking...';
    return xIsNext ? 'Your turn (X)' : "O's turn";
  })();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.push('/modules')} style={[styles.headerBack, { backgroundColor: colors.accent }]} hitSlop={8}>
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.accent }]}>TIC-TAC-TOE</Text>
        <View style={[styles.levelBadge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.levelLabel, { color: colors.onAccent }]}>{difficultyLevel.toUpperCase()}</Text>
        </View>
      </View>

      {/* Status */}
      <View style={[styles.statusBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.statusText, { color: colors.text }]}>{statusText}</Text>
      </View>

      {/* Board */}
      <View style={styles.boardContainer}>
        <View style={[styles.board, { width: actualBoardWidth, height: actualBoardWidth }]}>
          {Array.from({ length: config.size }, (_, row) => (
            <View key={row} style={styles.boardRow}>
              {Array.from({ length: config.size }, (_, col) => {
                const index = row * config.size + col;
                const cell = board[index];
                const isWinCell = winResult?.cells.includes(index) ?? false;
                return (
                  <Pressable
                    key={col}
                    onPress={() => handleCellPress(index)}
                    style={[styles.cell, { borderColor: colors.border }, isWinCell && { backgroundColor: colors.accent }]}
                  >
                    {cell === 'X' && <Text style={[styles.cellText, { color: colors.accent, fontSize: cellSize * 0.45 }]} numberOfLines={1}>X</Text>}
                    {cell === 'O' && <Text style={[styles.cellText, { color: colors.text, fontSize: cellSize * 0.45 }]} numberOfLines={1}>O</Text>}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Game Over Modal */}
      <Modal transparent visible={modalVisible} animationType="fade" onRequestClose={() => {}}>
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {draw ? (
              <>
                <Text style={styles.modalEmoji}>🤝</Text>
                <Text style={[styles.modalTitle, { color: colors.text }]}>It's a Draw!</Text>
                <Text style={[styles.modalSub, { color: colors.muted }]}>+{DRAW_POINTS} points</Text>
              </>
            ) : winResult?.winner === 'X' ? (
              <>
                <Text style={styles.modalEmoji}>🎉</Text>
                <Text style={[styles.modalTitle, { color: colors.accent }]}>You Win!</Text>
                <Text style={[styles.modalSub, { color: colors.muted }]}>+{WIN_POINTS} points · {difficultyLevel.toUpperCase()}</Text>
                <Text style={[styles.modalNext, { color: colors.muted }]}>Try again for a higher score!</Text>
              </>
            ) : (
              <>
                <Text style={styles.modalEmoji}>😔</Text>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{opp === 'computer' ? 'Computer Wins!' : 'O Wins!'}</Text>
                <Text style={[styles.modalSub, { color: colors.muted }]}>Better luck next time</Text>
              </>
            )}
            <View style={styles.modalBtns}>
              <Pressable onPress={handlePlayAgain} style={[styles.btnPrimary, { backgroundColor: colors.accent }]}>
                <Text style={[styles.btnPrimaryText, { color: colors.onAccent }]}>Play Again</Text>
              </Pressable>
              <Pressable onPress={() => router.back()} style={[styles.btnSecondary, { backgroundColor: colors.border }]}>
                <Text style={[styles.btnSecondaryText, { color: colors.text }]}>Exit</Text>
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
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 28, paddingVertical: 12, borderBottomWidth: 1 },
  headerBack: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 16, letterSpacing: 1 },
  levelBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  levelLabel: { fontFamily: 'Poppins-Bold', fontSize: 11, letterSpacing: 0.5 },
  statusBar: { alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  statusText: { fontFamily: 'Poppins-Medium', fontSize: 14 },
  boardContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  board: { flexDirection: 'column' },
  boardRow: { flexDirection: 'row', flex: 1, width: '100%' },
  cell: { flex: 1, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center', margin: 1 },
  cellText: { fontFamily: 'Poppins-Bold' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: '100%', borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1 },
  modalEmoji: { fontSize: 48, marginBottom: 8 },
  modalTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 26, marginBottom: 6, textAlign: 'center' },
  modalSub: { fontFamily: 'Poppins-Medium', fontSize: 15, marginBottom: 4 },
  modalNext: { fontFamily: 'Poppins-Regular', fontSize: 13, marginBottom: 24 },
  modalBtns: { width: '100%', gap: 12 },
  btnPrimary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText: { fontFamily: 'Poppins-Bold', fontSize: 16 },
  btnSecondary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnSecondaryText: { fontFamily: 'Poppins-SemiBold', fontSize: 16 },
});