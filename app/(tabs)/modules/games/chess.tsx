import { useCallback, useEffect, useRef, useState } from 'react';
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
type SessionState = { board: Board; isWhiteTurn: boolean };

// ─── Constants ────────────────────────────────────────────────────────────────

const PIECE_FILLED: Record<string, string> = {
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
  const RESERVED_VERTICAL = 140;
  const MAX_BOARD_SIZE = 560;
  const MIN_BOARD_SIZE = 280;
  const boardSize = Math.max(
    MIN_BOARD_SIZE,
    Math.min(screenWidth, screenHeight - RESERVED_VERTICAL, MAX_BOARD_SIZE)
  );
  const cellSize = boardSize / 8;
  const { isDark, accentForeground, onAccent } = useApp();

  // Board: clean black/white checkerboard (per design request).
  const lightSquare = '#FFFFFF';
  const darkSquare = '#000000';

  // Pieces: mine = solid global accent color, opponent's = solid grey.
  // No outline/opacity effect — both are fully solid.
  const myPieceColor = accentForeground;
  const opponentPieceColor = '#9A9A9A';

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
  const sessionId = params.sessionId && params.sessionId !== 'undefined' ? params.sessionId : null;
  const opponentParam = (params.opponent ?? 'computer').toLowerCase();
  const isVsComputer = opponentParam !== 'friend';
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

  // ─── Multiplayer (friend) session state ─────────────────────────────────
  const [myId, setMyId] = useState<string | null>(null);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const myColor: 'white' | 'black' = myId && createdBy && myId === createdBy ? 'white' : 'black';

  // Load my user id once.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  // Load / subscribe to the shared session row for friend games.
  useEffect(() => {
    if (isVsComputer || !sessionId || !myId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function applyRow(rowData: any) {
      if (!rowData || cancelled) return;
      setCreatedBy(rowData.created_by ?? null);
      setOpponentId(rowData.opponent_id ?? null);
      const state: SessionState | null = rowData.state ?? null;
      if (state) {
        setBoard(state.board);
        setIsWhiteTurn(state.isWhiteTurn);
      }
      if (rowData.status === 'completed' && rowData.result) {
        setStatus(rowData.result as GameStatus);
      }
    }

    async function init() {
      const { data: rowData } = await supabase
        .from('game_sessions')
        .select('created_by, opponent_id, state, status, result')
        .eq('id', sessionId)
        .maybeSingle();

      if (!rowData) { setSessionLoaded(true); return; }

      // First-time setup: only the session creator seeds the initial
      // board state, so we never race two clients writing it.
      if (!rowData.state && rowData.created_by === myId) {
        const initState: SessionState = { board: [...INITIAL_BOARD], isWhiteTurn: true };
        const { data: seeded } = await supabase
          .from('game_sessions')
          .update({ state: initState, turn_user_id: rowData.created_by, status: 'active' })
          .eq('id', sessionId)
          .select('created_by, opponent_id, state, status, result')
          .maybeSingle();
        await applyRow(seeded ?? { ...rowData, state: initState });
      } else {
        await applyRow(rowData);
      }
      setSessionLoaded(true);

      channel = supabase
        .channel(`chess_session_${sessionId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
          (payload) => applyRow(payload.new)
        )
        .subscribe();
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [isVsComputer, sessionId, myId]);

  const saveScore = useCallback(async (result: 'win' | 'loss' | 'draw', pts: number, forPlayerId?: string) => {
    const playerId = forPlayerId ?? myId;
    if (!playerId) return;
    await supabase.from('game_scores').insert({
      session_id: sessionId,
      player_id: playerId,
      game: 'chess',
      mode: isVsComputer ? 'solo' : 'multiplayer',
      result,
      points: pts,
      difficulty: isVsComputer ? difficulty : null,
    });
  }, [sessionId, isVsComputer, difficulty, myId]);

  // vs-computer: local scoring, unchanged behavior.
  useEffect(() => {
    if (!isVsComputer) return;
    if (status === 'playing') return;
    if (scoreSaved) return;
    setScoreSaved(true);
    let result: 'win' | 'loss' | 'draw';
    let pts = 0;
    if (status === 'white_wins') { result = 'win'; pts = 100; }
    else if (status === 'draw') { result = 'draw'; pts = 10; }
    else { result = 'loss'; pts = 0; }
    setGamePoints(pts);
    saveScore(result, pts);
    setShowModal(true);
  }, [isVsComputer, status, scoreSaved, saveScore]);

  // Friend mode: show modal whenever a completed status arrives (from
  // either the local move or the realtime subscription).
  useEffect(() => {
    if (isVsComputer) return;
    if (status === 'playing') return;
    setShowModal(true);
    if (myColor === 'white') setGamePoints(status === 'white_wins' ? 100 : status === 'draw' ? 10 : 0);
    else setGamePoints(status === 'black_wins' ? 100 : status === 'draw' ? 10 : 0);
  }, [isVsComputer, status, myColor]);

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
  }, [difficulty]);

  // Apply a move to the shared session (friend mode). Uses a
  // status='active' guard on the update so only one client's move can
  // ever close out the game — this is what prevents double-scoring
  // when a winning move triggers on both devices at once.
  const applyFriendMove = useCallback(async (nextBoard: Board, nextIsWhiteTurn: boolean, newStatus: GameStatus) => {
    if (!sessionId || !createdBy) return;
    const nextTurnUser = nextIsWhiteTurn ? createdBy : opponentId;
    const nextState: SessionState = { board: nextBoard, isWhiteTurn: nextIsWhiteTurn };

    if (newStatus === 'playing') {
      await supabase
        .from('game_sessions')
        .update({ state: nextState, turn_user_id: nextTurnUser })
        .eq('id', sessionId)
        .eq('status', 'active');
      setBoard(nextBoard);
      setIsWhiteTurn(nextIsWhiteTurn);
      return;
    }

    const winnerId = newStatus === 'white_wins' ? createdBy : newStatus === 'black_wins' ? opponentId : null;
    const { data: closed } = await supabase
      .from('game_sessions')
      .update({ state: nextState, status: 'completed', result: newStatus, winner_id: winnerId, turn_user_id: null })
      .eq('id', sessionId)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();

    setBoard(nextBoard);
    setIsWhiteTurn(nextIsWhiteTurn);
    setStatus(newStatus);

    // Only the client that actually flipped status active→completed
    // records the score, so a completion is never counted twice.
    if (closed && createdBy && opponentId) {
      if (newStatus === 'draw') {
        await saveScore('draw', 10, createdBy);
        await saveScore('draw', 10, opponentId);
      } else {
        await saveScore('win', 100, winnerId ?? undefined);
        const loserId = winnerId === createdBy ? opponentId : createdBy;
        await saveScore('loss', 0, loserId);
      }
    }
  }, [sessionId, createdBy, opponentId, saveScore]);

  const canMoveFriend = !isVsComputer
    && sessionLoaded
    && status === 'playing'
    && ((myColor === 'white') === isWhiteTurn);

  const handleCellPress = useCallback((index: number) => {
    if (status !== 'playing') return;
    if (isVsComputer) {
      if (isComputerThinking) return;
    } else {
      if (!canMoveFriend) return;
    }
    const piece = board[index];

    if (selected !== null) {
      if (validMoves.includes(index)) {
        const move: Move = { from: selected, to: index };
        const nextBoard = applyMove(board, move);
        setSelected(null);
        setValidMoves([]);
        if (isVsComputer) {
          setBoard(nextBoard);
          setIsWhiteTurn(false);
          const newStatus = checkGameStatus(nextBoard, true);
          if (newStatus !== 'playing') { setStatus(newStatus); return; }
          doComputerMove(nextBoard);
        } else {
          const nextTurn = !isWhiteTurn;
          const newStatus = checkGameStatus(nextBoard, isWhiteTurn);
          applyFriendMove(nextBoard, nextTurn, newStatus);
        }
        return;
      }
      setSelected(null);
      setValidMoves([]);
      if (!piece) return;
    }

    const canSelectWhite = isWhiteTurn && isWhite(piece);
    const canSelectBlack = !isWhiteTurn && isBlack(piece);
    const canSelectMine = isVsComputer ? canSelectWhite : (myColor === 'white' ? canSelectWhite : canSelectBlack);
    if (canSelectMine) {
      const moves = getValidMoves(board, index);
      setSelected(index);
      setValidMoves(moves);
    }
  }, [board, selected, validMoves, isWhiteTurn, isVsComputer, isComputerThinking, status, doComputerMove, canMoveFriend, applyFriendMove, myColor]);

  const handlePlayAgain = () => {
    if (!isVsComputer) { router.back(); return; }
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
    if (!sessionLoaded) return 'Loading game…';
    return canMoveFriend ? 'Your turn' : "Waiting for opponent…";
  };

  const resultText = () => {
    if (isVsComputer) {
      if (status === 'white_wins') return 'You Win!';
      if (status === 'black_wins') return 'Computer Wins!';
      return 'Draw!';
    }
    if (status === 'draw') return 'Draw!';
    const iWon = (status === 'white_wins' && myColor === 'white') || (status === 'black_wins' && myColor === 'black');
    return iWon ? 'You Win!' : 'You Lose!';
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

                const pieceIsMine = piece !== '' && (isVsComputer ? isWhite(piece) : (myColor === 'white' ? isWhite(piece) : isBlack(piece)));
                const pieceColor = pieceIsMine ? myPieceColor : opponentPieceColor;

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
                      <Text style={[styles.piece, { fontSize: cellSize * 0.6, color: pieceColor }]}>
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
                {status === 'draw' ? 'A well-fought match.' : 'Great game!'}
              </Text>
              <View style={styles.modalButtons}>
                <Pressable style={[styles.modalBtnPrimary, { backgroundColor: colors.accent }]} onPress={handlePlayAgain}>
                  <Text style={[styles.modalBtnPrimaryText, { color: colors.onAccent }]}>{isVsComputer ? 'Play Again' : 'Back to Games'}</Text>
                </Pressable>
                {isVsComputer && (
                  <Pressable style={[styles.modalBtnSecondary, { borderColor: colors.border }]} onPress={() => router.back()}>
                    <Text style={[styles.modalBtnSecondaryText, { color: colors.muted }]}>Exit</Text>
                  </Pressable>
                )}
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