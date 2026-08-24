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

type Board = string[];
type Move = { from: number; to: number };
type GameStatus = 'playing' | 'white_wins' | 'black_wins' | 'draw';

// ─── Constants ────────────────────────────────────────────────────────────────

// We render pieces as text. In dark theme: player A = solid white, player B = outline white.
// In light theme: player A = solid black, player B = solid white.
// We use the "filled" unicode glyphs for solid and "outline" glyphs for outline.
const PIECE_FILLED: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};
const PIECE_OUTLINE: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const INITIAL_BOARD: Board = [
  'r','n','b','q','k','b','n','r',
  'p','p','p','p','p','p','p','p',
  '','','','','','','','',
  '','','','','','','','',
  '','','','','','','','',
  '','','','','','','','',
  'P','P','P','P','P','P','P','P',
  'R','N','B','Q','K','B','N','R',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isWhite(p: string): boolean { return p !== '' && p === p.toUpperCase(); }
function isBlack(p: string): boolean { return p !== '' && p === p.toLowerCase(); }
function inBounds(r: number, c: number): boolean { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function idx(r: number, c: number): number { return r * 8 + c; }
function row(i: number): number { return Math.floor(i / 8); }
function col(i: number): number { return i % 8; }

function getValidMoves(board: Board, from: number): number[] {
  const piece = board[from];
  if (!piece) return [];
  const r = row(from);
  const c = col(from);
  const white = isWhite(piece);
  const destinations: number[] = [];

  const addIfValid = (tr: number, tc: number): boolean => {
    if (!inBounds(tr, tc)) return false;
    const target = board[idx(tr, tc)];
    if (target === '') { destinations.push(idx(tr, tc)); return true; }
    if (white ? isBlack(target) : isWhite(target)) { destinations.push(idx(tr, tc)); }
    return false;
  };

  const addRay = (dr: number, dc: number) => {
    let tr = r + dr; let tc = c + dc;
    while (inBounds(tr, tc)) {
      const target = board[idx(tr, tc)];
      if (target === '') { destinations.push(idx(tr, tc)); }
      else { if (white ? isBlack(target) : isWhite(target)) { destinations.push(idx(tr, tc)); } break; }
      tr += dr; tc += dc;
    }
  };

  const p = piece.toUpperCase();

  if (p === 'P') {
    const dir = white ? -1 : 1;
    const startRow = white ? 6 : 1;
    if (inBounds(r + dir, c) && board[idx(r + dir, c)] === '') {
      destinations.push(idx(r + dir, c));
      if (r === startRow && board[idx(r + 2 * dir, c)] === '') { destinations.push(idx(r + 2 * dir, c)); }
    }
    for (const dc of [-1, 1]) {
      const tr = r + dir; const tc = c + dc;
      if (inBounds(tr, tc)) {
        const target = board[idx(tr, tc)];
        if (target !== '' && (white ? isBlack(target) : isWhite(target))) { destinations.push(idx(tr, tc)); }
      }
    }
  } else if (p === 'R') {
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) addRay(dr, dc);
  } else if (p === 'N') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) { addIfValid(r + dr, c + dc); }
  } else if (p === 'B') {
    for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) addRay(dr, dc);
  } else if (p === 'Q') {
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) addRay(dr, dc);
  } else if (p === 'K') {
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) { addIfValid(r + dr, c + dc); }
  }

  return destinations;
}

function getAllMovesFor(board: Board, forWhite: boolean): Move[] {
  const moves: Move[] = [];
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece) continue;
    if (forWhite !== isWhite(piece)) continue;
    const dests = getValidMoves(board, i);
    for (const to of dests) { moves.push({ from: i, to }); }
  }
  return moves;
}

function applyMove(board: Board, move: Move): Board {
  const next = [...board];
  const piece = next[move.from];
  next[move.to] = piece;
  next[move.from] = '';
  if (piece === 'P' && row(move.to) === 0) next[move.to] = 'Q';
  if (piece === 'p' && row(move.to) === 7) next[move.to] = 'q';
  return next;
}

function computeAIMove(board: Board, difficulty: string = 'medium'): Move | null {
  const moves = getAllMovesFor(board, false);
  if (moves.length === 0) return null;
  const captureValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100, P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };
  const scored = moves.map(m => {
    const target = board[m.to];
    let score = 0;
    if (target && captureValues[target]) score += captureValues[target] * 10;
    const r = row(m.to); const c = col(m.to);
    score += 7 - (Math.abs(3.5 - r) + Math.abs(3.5 - c));
    return { move: m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  // Easy: pick from top half randomly. Medium: pick from top 3. Hard: always best.
  if (difficulty === 'easy') {
    const pool = scored.slice(0, Math.max(3, Math.ceil(scored.length / 2)));
    return pool[Math.floor(Math.random() * pool.length)].move;
  }
  if (difficulty === 'medium') {
    const top = scored.slice(0, Math.min(3, scored.length));
    return top[Math.floor(Math.random() * top.length)].move;
  }
  const best = scored[0].score;
  const top = scored.filter(s => s.score === best);
  return top[Math.floor(Math.random() * top.length)].move;
}

function checkGameStatus(board: Board, whiteMoved: boolean): GameStatus {
  const hasWhiteKing = board.includes('K');
  const hasBlackKing = board.includes('k');
  if (!hasWhiteKing) return 'black_wins';
  if (!hasBlackKing) return 'white_wins';
  if (!whiteMoved) {
    const blackMoves = getAllMovesFor(board, false);
    if (blackMoves.length === 0) return 'white_wins';
  } else {
    const whiteMoves = getAllMovesFor(board, true);
    if (whiteMoves.length === 0) return 'black_wins';
  }
  return 'playing';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChessGame() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // Reserve space for the header + status bar so the board never
  // overflows vertically, and cap it so it doesn't become huge on
  // tablets/desktop. Never shrink below a usable minimum either.
  const RESERVED_VERTICAL = 140;
  const MAX_BOARD_SIZE = 560;
  const MIN_BOARD_SIZE = 280;
  const boardSize = Math.max(
    MIN_BOARD_SIZE,
    Math.min(screenWidth, screenHeight - RESERVED_VERTICAL, MAX_BOARD_SIZE)
  );
  const cellSize = boardSize / 8;
  const { isDark, accentForeground, onAccent } = useApp();

  // Board square colors: accent + theme color checkered
  const lightSquare = accentForeground;
  const darkSquare = isDark ? '#1A1A1A' : '#F0EEEA';

  // Piece colors by theme
  // Dark theme: solid white for white pieces, outline white for black pieces
  // Light theme: solid black for white pieces, solid white for black pieces
  const whitePieceColor = isDark ? '#FFFFFF' : '#1A1A1A';
  const blackPieceColor = isDark ? '#FFFFFF' : '#FFFFFF';
  // For outline effect in dark theme, we use a different approach: render filled for white, outline for black
  // Since RN Text doesn't support text-outline easily, we use color + opacity to differentiate
  const blackPieceOpacity = isDark ? 0.45 : 1;

  const colors = {
    background: isDark ? '#090909' : '#FBFAF8',
    section: isDark ? '#151515' : '#FFFFFF',
    text: isDark ? '#F4F2EE' : '#27241F',
    muted: isDark ? '#AAA59D' : '#8F8A82',
    border: isDark ? '#2A2A2A' : '#ECE9E4',
    accent: accentForeground,
    onAccent,
  };

  const params = useLocalSearchParams<{ sessionId?: string; opponent?: string; difficulty?: string }>();
  const sessionId = params.sessionId ?? 'chess-local';
  const opponent = (params.opponent ?? 'computer').toLowerCase();
  const isVsComputer = opponent !== 'friend';
  const difficulty = (params.difficulty ?? 'medium').toLowerCase();

  const [board, setBoard] = useState<Board>([...INITIAL_BOARD]);
  const [selected, setSelected] = useState<number | null>(null);
  const [validMoves, setValidMoves] = useState<number[]>([]);
  const [isWhiteTurn, setIsWhiteTurn] = useState(true);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [gamePoints, setGamePoints] = useState(0);
  const [isComputerThinking, setIsComputerThinking] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);

  const saveScore = useCallback(async (result: 'win' | 'loss' | 'draw', pts: number) => {
    if (scoreSaved) return;
    setScoreSaved(true);
    const { data: { user } } = await supabase.auth.getUser();
    const playerId = user?.id;
    if (!playerId) return;
    await supabase.from('game_scores').insert({
      session_id: sessionId && sessionId !== 'chess-local' ? sessionId : null,
      player_id: playerId,
      game: 'chess',
      mode: 'multiplayer',
      result,
      points: pts,
      difficulty: opponent === 'computer' ? difficulty : null,
    });
  }, [scoreSaved, sessionId, opponent, difficulty]);

  useEffect(() => {
    if (status === 'playing') return;
    let result: 'win' | 'loss' | 'draw';
    let pts = 0;
    if (status === 'white_wins') { result = 'win'; pts = 100; }
    else if (status === 'draw') { result = 'draw'; pts = 10; }
    else { result = 'loss'; pts = 0; }
    setGamePoints(pts);
    saveScore(result, pts);
    setShowModal(true);
  }, [status, saveScore]);

  const doComputerMove = useCallback((currentBoard: Board) => {
    setIsComputerThinking(true);
    setTimeout(async () => {
      const move = computeAIMove(currentBoard, difficulty);
      if (!move) { setStatus('white_wins'); setIsComputerThinking(false); return; }
      const nextBoard = applyMove(currentBoard, move);
      setBoard(nextBoard);
      setIsWhiteTurn(true);
      setIsComputerThinking(false);
      const newStatus = checkGameStatus(nextBoard, false);
      if (newStatus !== 'playing') { setStatus(newStatus); }
    }, 400);
  }, []);

  const handleCellPress = useCallback((index: number) => {
    if (status !== 'playing') return;
    if (isComputerThinking) return;
    const piece = board[index];

    if (selected !== null) {
      if (validMoves.includes(index)) {
        const move: Move = { from: selected, to: index };
        const nextBoard = applyMove(board, move);
        setBoard(nextBoard);
        setSelected(null);
        setValidMoves([]);
        if (isVsComputer) {
          setIsWhiteTurn(false);
          const newStatus = checkGameStatus(nextBoard, true);
          if (newStatus !== 'playing') { setStatus(newStatus); return; }
          doComputerMove(nextBoard);
        } else {
          const nextWhite = !isWhiteTurn;
          setIsWhiteTurn(nextWhite);
          const newStatus = checkGameStatus(nextBoard, isWhiteTurn);
          if (newStatus !== 'playing') { setStatus(newStatus); }
        }
        return;
      }
      setSelected(null);
      setValidMoves([]);
      if (!piece) return;
    }

    const canSelectWhite = isWhiteTurn && isWhite(piece);
    const canSelectBlack = !isWhiteTurn && isBlack(piece);
    if (canSelectWhite || canSelectBlack) {
      const moves = getValidMoves(board, index);
      setSelected(index);
      setValidMoves(moves);
    }
  }, [board, selected, validMoves, isWhiteTurn, isVsComputer, isComputerThinking, status, doComputerMove]);

  const handlePlayAgain = () => {
    setBoard([...INITIAL_BOARD]);
    setSelected(null);
    setValidMoves([]);
    setIsWhiteTurn(true);
    setStatus('playing');
    setGamePoints(0);
    setScoreSaved(false);
    setShowModal(false);
    setIsComputerThinking(false);
  };

  const statusText = () => {
    if (status !== 'playing') return '';
    if (isVsComputer) {
      if (isComputerThinking) return 'Computer thinking...';
      return 'Your turn';
    }
    return isWhiteTurn ? "White's turn" : "Black's turn";
  };

  const resultText = () => {
    if (status === 'white_wins') return isVsComputer ? 'You Win!' : 'White Wins!';
    if (status === 'black_wins') return isVsComputer ? 'Computer Wins!' : 'Black Wins!';
    return 'Draw!';
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.section }]}>
        <Pressable onPress={() => router.push('/modules')} style={[styles.headerBack, { backgroundColor: colors.accent }]}>
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.accent }]}>CHESS</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Status bar */}
      <View style={[styles.statusBar, { borderBottomColor: colors.border, backgroundColor: colors.section }]}>
        <Text style={[styles.statusText, { color: colors.accent }, isComputerThinking && { color: colors.muted }]}>
          {statusText()}
        </Text>
      </View>

      <View style={styles.boardWrap}>
        {/* Board — edge to edge, no coordinate labels */}
        <View style={[styles.board, { width: boardSize }]}>
            {Array.from({ length: 8 }, (_, r) =>
              Array.from({ length: 8 }, (_, c) => {
                const i = idx(r, c);
                const piece = board[i];
                const isLight = (r + c) % 2 === 0;
                const isSelected = selected === i;
                const isValid = validMoves.includes(i);
                const hasEnemy = isValid && piece !== '';

                let bgColor = isLight ? lightSquare : darkSquare;
                if (isSelected) bgColor = colors.accent;

                const isWhitePiece = piece !== '' && isWhite(piece);
                const pieceColor = isWhitePiece ? whitePieceColor : blackPieceColor;
                const pieceOpacity = isWhitePiece ? 1 : blackPieceOpacity;

                return (
                  <Pressable
                    key={i}
                    onPress={() => handleCellPress(i)}
                    style={[styles.cell, { width: cellSize, height: cellSize, backgroundColor: bgColor }]}
                  >
                    {isValid && !hasEnemy && (
                      <View style={[styles.validDot, { width: cellSize * 0.3, height: cellSize * 0.3, borderRadius: cellSize * 0.15, backgroundColor: isLight ? darkSquare : lightSquare, opacity: 0.5 }]} />
                    )}
                    {isValid && hasEnemy && (
                      <View style={[styles.captureRing, { width: cellSize - 4, height: cellSize - 4, borderRadius: 2, borderColor: isLight ? darkSquare : lightSquare }]} />
                    )}
                    {piece !== '' && (
                      <Text style={[styles.piece, { fontSize: cellSize * 0.6, color: pieceColor, opacity: pieceOpacity }]}>
                        {PIECE_FILLED[piece] ?? piece}
                      </Text>
                    )}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>

        {/* Game Over Modal */}
        <Modal visible={showModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.section, borderColor: colors.border }]}>
              <Text style={[styles.modalResult, { color: colors.text }]}>{resultText()}</Text>
              {gamePoints > 0 && <Text style={[styles.modalPoints, { color: colors.accent }]}>+{gamePoints} pts</Text>}
              <Text style={[styles.modalSub, { color: colors.muted }]}>
                {status === 'white_wins' && isVsComputer ? 'Excellent play! You defeated the computer.' : status === 'draw' ? 'A well-fought match.' : 'Great game!'}
              </Text>
              <View style={styles.modalButtons}>
                <Pressable style={[styles.modalBtnPrimary, { backgroundColor: colors.accent }]} onPress={handlePlayAgain}>
                  <Text style={[styles.modalBtnPrimaryText, { color: colors.onAccent }]}>Play Again</Text>
                </Pressable>
                <Pressable style={[styles.modalBtnSecondary, { borderColor: colors.border }]} onPress={() => router.back()}>
                  <Text style={[styles.modalBtnSecondaryText, { color: colors.muted }]}>Exit</Text>
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
  headerTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 16, letterSpacing: 2 },
  headerRight: { width: 38 },
  statusBar: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, alignItems: 'center' },
  statusText: { fontFamily: 'Poppins-Medium', fontSize: 13 },
  boardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  board: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  piece: { textAlign: 'center', lineHeight: undefined, includeFontPadding: false },
  validDot: { position: 'absolute' },
  captureRing: { position: 'absolute', borderWidth: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1, width: '90%' },
  modalResult: { fontFamily: 'Poppins-ExtraBold', fontSize: 28, textAlign: 'center', marginBottom: 6 },
  modalPoints: { fontFamily: 'Poppins-Bold', fontSize: 22, marginBottom: 8 },
  modalSub: { fontFamily: 'Poppins-Regular', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  modalButtons: { width: '100%', gap: 10 },
  modalBtnPrimary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnPrimaryText: { fontFamily: 'Poppins-Bold', fontSize: 15 },
  modalBtnSecondary: { backgroundColor: 'transparent', borderRadius: 12, borderWidth: 1, paddingVertical: 13, alignItems: 'center' },
  modalBtnSecondaryText: { fontFamily: 'Poppins-SemiBold', fontSize: 15 },
});