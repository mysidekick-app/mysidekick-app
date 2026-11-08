import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Modal,
  Pressable,
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

// ─── Types ───────────────────────────────────────────────────────────────────

type Opponent = 'computer' | 'friend';

type Cell = 'X' | 'O' | null;

type SessionState = {
  board: Cell[];
  xIsNext: boolean;
};

type SessionResult = 'x_wins' | 'o_wins' | 'draw';

// ─── Constants ───────────────────────────────────────────────────────────────

const WIN_POINTS_BY_DIFFICULTY: Record<string, number> = {
  easy: 100,
  medium: 200,
  hard: 300,
};

const DRAW_POINTS = 10;

// ─── Difficulty ──────────────────────────────────────────────────────────────

function configForDifficulty(
  difficulty: string,
): { size: number; win: number } {
  if (difficulty === 'easy') return { size: 3, win: 3 };
  if (difficulty === 'medium') return { size: 5, win: 4 };
  return { size: 7, win: 5 };
}

// ─── Board Helpers ────────────────────────────────────────────────────────────

function makeBoard(size: number): Cell[] {
  return Array(size * size).fill(null);
}

function checkWinner(
  board: Cell[],
  size: number,
  winLen: number,
): { winner: Cell; cells: number[] } | null {
  const idx = (r: number, c: number) => r * size + c;

  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = board[idx(r, c)];

      if (!cell) continue;

      for (const [dr, dc] of directions) {
        const cells: number[] = [idx(r, c)];

        for (let k = 1; k < winLen; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;

          if (
            nr < 0 ||
            nr >= size ||
            nc < 0 ||
            nc >= size
          ) {
            break;
          }

          if (board[idx(nr, nc)] !== cell) {
            break;
          }

          cells.push(idx(nr, nc));
        }

        if (cells.length === winLen) {
          return {
            winner: cell,
            cells,
          };
        }
      }
    }
  }

  return null;
}

function isDraw(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}

// ─── Minimax (3x3 only) ──────────────────────────────────────────────────────

function minimax(
  board: Cell[],
  depth: number,
  isMaximizing: boolean,
  size: number,
  winLen: number,
): number {
  const result = checkWinner(board, size, winLen);

  if (result) {
    return result.winner === 'O'
      ? 10 - depth
      : depth - 10;
  }

  if (isDraw(board)) {
    return 0;
  }

  if (isMaximizing) {
    let best = -Infinity;

    for (let i = 0; i < board.length; i++) {
      if (!board[i]) {
        board[i] = 'O';

        best = Math.max(
          best,
          minimax(
            board,
            depth + 1,
            false,
            size,
            winLen,
          ),
        );

        board[i] = null;
      }
    }

    return best;
  }

  let best = Infinity;

  for (let i = 0; i < board.length; i++) {
    if (!board[i]) {
      board[i] = 'X';

      best = Math.min(
        best,
        minimax(
          board,
          depth + 1,
          true,
          size,
          winLen,
        ),
      );

      board[i] = null;
    }
  }

  return best;
}

function bestMinimax(
  board: Cell[],
  size: number,
  winLen: number,
): number {
  let bestVal = -Infinity;
  let bestIdx = -1;

  const copy = [...board];

  for (let i = 0; i < copy.length; i++) {
    if (!copy[i]) {
      copy[i] = 'O';

      const val = minimax(
        copy,
        0,
        false,
        size,
        winLen,
      );

      copy[i] = null;

      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
  }

  return bestIdx;
}

// ─── Heuristic AI (larger boards) ────────────────────────────────────────────

function countLine(
  board: Cell[],
  size: number,
  winLen: number,
  player: Cell,
): Map<number, number> {
  const scores = new Map<number, number>();

  const idx = (r: number, c: number) => r * size + c;

  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of directions) {
        const window: number[] = [];
        let valid = true;

        for (let k = 0; k < winLen; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;

          if (
            nr < 0 ||
            nr >= size ||
            nc < 0 ||
            nc >= size
          ) {
            valid = false;
            break;
          }

          window.push(idx(nr, nc));
        }

        if (!valid) continue;

        const playerCount = window.filter(
          (i) => board[i] === player,
        ).length;

        const emptyCount = window.filter(
          (i) => board[i] === null,
        ).length;

        const blocked = window.some(
          (i) =>
            board[i] !== null &&
            board[i] !== player,
        );

        if (!blocked && emptyCount > 0) {
          for (const i of window) {
            if (board[i] === null) {
              scores.set(
                i,
                (scores.get(i) ?? 0) + playerCount,
              );
            }
          }
        }
      }
    }
  }

  return scores;
}

function heuristicMove(
  board: Cell[],
  size: number,
  winLen: number,
): number {
  const empty = board
    .map((c, i) => (c === null ? i : -1))
    .filter((i) => i >= 0);

  // Win if possible.
  for (const i of empty) {
    const copy = [...board];

    copy[i] = 'O';

    if (checkWinner(copy, size, winLen)) {
      return i;
    }
  }

  // Block the player if necessary.
  for (const i of empty) {
    const copy = [...board];

    copy[i] = 'X';

    if (checkWinner(copy, size, winLen)) {
      return i;
    }
  }

  const myScores = countLine(
    board,
    size,
    winLen,
    'O',
  );

  const oppScores = countLine(
    board,
    size,
    winLen,
    'X',
  );

  let bestIdx = -1;
  let bestScore = -Infinity;

  for (const i of empty) {
    const score =
      (myScores.get(i) ?? 0) * 2 +
      (oppScores.get(i) ?? 0);

    const boardRow = Math.floor(i / size);
    const boardCol = i % size;

    const centerBonus =
      1 /
      (1 +
        Math.abs(
          boardRow - (size - 1) / 2,
        ) +
        Math.abs(
          boardCol - (size - 1) / 2,
        ));

    const total = score + centerBonus;

    if (total > bestScore) {
      bestScore = total;
      bestIdx = i;
    }
  }

  return bestIdx !== -1
    ? bestIdx
    : empty[
        Math.floor(
          Math.random() * empty.length,
        )
      ];
}

function computeMove(
  board: Cell[],
  size: number,
  winLen: number,
): number {
  if (size <= 3) {
    return bestMinimax(
      board,
      size,
      winLen,
    );
  }

  return heuristicMove(
    board,
    size,
    winLen,
  );
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function TicTacToe() {
  const params =
    useLocalSearchParams<{
      sessionId?: string;
      opponent?: Opponent;
      difficulty?: string;
    }>();

  const sessionId =
    params.sessionId &&
    params.sessionId !== 'undefined'
      ? params.sessionId
      : null;

  const { width, height } =
    useWindowDimensions();

  const {
    isDark,
    accentForeground,
  } = useApp() as any;

  const accent = accentForeground || '#FDE047';
  const pageBg = accent;

  const COLORS = isDark
    ? DARK_PALETTE
    : LIGHT_PALETTE;

  const styles = makeStyles(COLORS);

  const opp: Opponent =
    params.opponent === 'friend'
      ? 'friend'
      : 'computer';

  const isVsComputer =
    opp === 'computer';

  // ─── Multiplayer state ────────────────────────────────────────────────    

  const [myId, setMyId] =
    useState<string | null>(null);

  const [createdBy, setCreatedBy] =
    useState<string | null>(null);

  const [opponentId, setOpponentId] =
    useState<string | null>(null);

  const [sessionLoaded, setSessionLoaded] =
    useState(false);

  const [sessionDifficulty, setSessionDifficulty] =
    useState<string | null>(null);

  const difficultyLevel =
    isVsComputer
      ? params.difficulty ?? 'easy'
      : sessionDifficulty ??
        params.difficulty ??
        'easy';

  const config =
    configForDifficulty(
      difficultyLevel,
    );

  const iAmX =
    myId && createdBy
      ? myId === createdBy
      : true;

  // ─── Game state ──────────────────────────────────────────────────────────

  const [board, setBoard] =
    useState<Cell[]>(() =>
      makeBoard(config.size),
    );

  const [xIsNext, setXIsNext] =
    useState(true);

  const [winResult, setWinResult] =
    useState<{
      winner: Cell;
      cells: number[];
    } | null>(null);

  const [draw, setDraw] =
    useState(false);

  const [modalVisible, setModalVisible] =
    useState(false);

  const [scoreSaved, setScoreSaved] =
    useState(false);

  // NEW: exit confirmation popup.
  const [exitModalVisible, setExitModalVisible] =
    useState(false);

  // Prevent any pending async/realtime work from completing after the player exits.
  const exitConfirmedRef = useRef(false);

  const isComputerTurn =
    opp === 'computer' &&
    !xIsNext &&
    !winResult &&
    !draw;

  // ─── Load current user ───────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setMyId(
          data.user?.id ?? null,
        );
      });
  }, []);

  // ─── Load / subscribe to multiplayer session ─────────────────────────────

  useEffect(() => {
    if (
      isVsComputer ||
      !sessionId ||
      !myId
    ) {
      return;
    }

    let channel:
      | ReturnType<
          typeof supabase.channel
        >
      | null = null;

    let cancelled = false;

    function applyRow(rowData: any) {
      if (
        !rowData ||
        cancelled
      ) {
        return;
      }

      setCreatedBy(
        rowData.created_by ?? null,
      );

      setOpponentId(
        rowData.opponent_id ?? null,
      );

      if (rowData.difficulty) {
        setSessionDifficulty(
          rowData.difficulty,
        );
      }

      const state:
        | SessionState
        | null =
        rowData.state ?? null;

      if (state) {
        setBoard(state.board);

        setXIsNext(
          state.xIsNext,
        );
      }

      if (
        rowData.status ===
          'completed' &&
        rowData.result
      ) {
        const result:
          | SessionResult =
          rowData.result;

        if (result === 'draw') {
          setDraw(true);
        } else {
          setWinResult({
            winner:
              result ===
              'x_wins'
                ? 'X'
                : 'O',

            cells:
              rowData.winning_cells ??
              [],
          });
        }
      }
    }

    async function init() {
      const { data: rowData } =
        await supabase
          .from('game_sessions')
          .select(
            'created_by, opponent_id, difficulty, state, status, result, winning_cells',
          )
          .eq('id', sessionId)
          .maybeSingle();

      if (!rowData) {
        setSessionLoaded(true);
        return;
      }

      const size =
        configForDifficulty(
          rowData.difficulty ??
            difficultyLevel,
        ).size;

      if (
        !rowData.state &&
        rowData.created_by === myId
      ) {
        const initState:
          SessionState = {
          board:
            makeBoard(size),

          xIsNext: true,
        };

        const {
          data: seeded,
        } = await supabase
          .from('game_sessions')
          .update({
            state: initState,

            turn_user_id:
              rowData.created_by,

            status: 'active',
          })
          .eq(
            'id',
            sessionId,
          )
          .select(
            'created_by, opponent_id, difficulty, state, status, result, winning_cells',
          )
          .maybeSingle();

        applyRow(
          seeded ?? {
            ...rowData,
            state: initState,
          },
        );
      } else {
        applyRow(rowData);
      }

      setSessionLoaded(true);

      if (cancelled) {
        return;
      }

      const channelName =
        `tictactoe_session_${sessionId}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}`;

      const nextChannel =
        supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'game_sessions',
              filter: `id=eq.${sessionId}`,
            },
            (payload) =>
              applyRow(
                payload.new,
              ),
          )
          .subscribe();

      channel = nextChannel;
    }

    init();

    return () => {
      cancelled = true;

      if (channel) {
        supabase.removeChannel(
          channel,
        );
      }
    };
  }, [
    isVsComputer,
    sessionId,
    myId,
  ]);

  // ─── Session lifecycle ───────────────────────────────────────────────────

  const abandonSession = useCallback(async () => {
    if (!sessionId) return;

    const { error } =
      await supabase
        .from('game_sessions')
        .update({
          status: 'abandoned',
          result: 'abandoned',
          turn_user_id: null,
        })
        .eq('id', sessionId)
        .eq('status', 'active');

    if (error) {
      console.error(
        'TIC-TAC-TOE ABANDON SESSION ERROR:',
        error,
      );
    }
  }, [sessionId]);

  // ─── Save score ──────────────────────────────────────────────────────────

  const saveScore =
    useCallback(
      async (
        result:
          | 'win'
          | 'loss'
          | 'draw',
        pts: number,
        forPlayerId?: string,
      ) => {
        const playerId =
          forPlayerId ?? myId;

        if (!playerId) {
          return false;
        }

        const { error } =
          await supabase
            .from('game_scores')
            .insert({
              session_id:
                sessionId,

              player_id:
                playerId,

              game:
                'tictactoe',

              mode:
                isVsComputer
                  ? 'solo'
                  : 'multiplayer',

              result,

              points: pts,

              difficulty:
                difficultyLevel,
            });

        if (error) {
          console.error(
            'TIC-TAC-TOE SCORE SAVE ERROR:',
            error,
          );

          return false;
        }

        return true;
      },
      [
        sessionId,
        isVsComputer,
        difficultyLevel,
        myId,
      ],
    );

  // ─── Solo scoring ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (
      !isVsComputer ||
      exitConfirmedRef.current
    ) {
      return;
    }

    const result =
      checkWinner(
        board,
        config.size,
        config.win,
      );

    if (result) {
      setWinResult(result);
      setModalVisible(true);

      if (!scoreSaved) {
        setScoreSaved(true);

        const playerWon =
          result.winner === 'X';

        saveScore(
          playerWon
            ? 'win'
            : 'loss',

          playerWon
            ? WIN_POINTS_BY_DIFFICULTY[
                difficultyLevel
              ] ?? 100
            : 0,
        );

        if (sessionId) {
          supabase
            .from('game_sessions')
            .update({
              status: 'completed',

              result:
                playerWon
                  ? 'x_wins'
                  : 'o_wins',

              winner_id:
                playerWon
                  ? myId
                  : null,

              winning_cells:
                result.cells,

              turn_user_id: null,
            })
            .eq('id', sessionId)
            .eq('status', 'active');
        }
      }

      return;
    }

    if (isDraw(board)) {
      setDraw(true);
      setModalVisible(true);

      if (!scoreSaved) {
        setScoreSaved(true);

        saveScore(
          'draw',
          DRAW_POINTS,
        );

        if (sessionId) {
          supabase
            .from('game_sessions')
            .update({
              status: 'completed',
              result: 'draw',
              winner_id: null,
              winning_cells: null,
              turn_user_id: null,
            })
            .eq('id', sessionId)
            .eq('status', 'active');
        }
      }
    }
  }, [
    isVsComputer,
    board,
    config.size,
    config.win,
    scoreSaved,
    saveScore,
    difficultyLevel,
    sessionId,
    myId,
  ]);

  // ─── Multiplayer completed state ─────────────────────────────────────────

  useEffect(() => {
    if (isVsComputer) {
      return;
    }

    if (winResult || draw) {
      setModalVisible(true);
    }
  }, [
    isVsComputer,
    winResult,
    draw,
  ]);

  // ─── Computer move ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!isComputerTurn) {
      return;
    }

    const timer =
      setTimeout(() => {
        const move =
          computeMove(
            board,
            config.size,
            config.win,
          );

        if (move === -1) {
          return;
        }

        const next = [
          ...board,
        ];

        next[move] = 'O';

        setBoard(next);
        setXIsNext(true);
      }, 250);

    return () =>
      clearTimeout(timer);
  }, [
    isComputerTurn,
    board,
    config.size,
    config.win,
  ]);

  // ─── Multiplayer move ────────────────────────────────────────────────────

  const applyFriendMove =
    useCallback(
      async (
        nextBoard: Cell[],
        nextXIsNext: boolean,
      ) => {
        if (
          !sessionId ||
          !createdBy
        ) {
          return;
        }

        const nextTurnUser =
          nextXIsNext
            ? createdBy
            : opponentId;

        const nextState:
          SessionState = {
          board: nextBoard,

          xIsNext:
            nextXIsNext,
        };

        const winner =
          checkWinner(
            nextBoard,
            config.size,
            config.win,
          );

        const drawn =
          !winner &&
          isDraw(nextBoard);

        if (
          !winner &&
          !drawn
        ) {
          await supabase
            .from('game_sessions')
            .update({
              state: nextState,

              turn_user_id:
                nextTurnUser,
            })
            .eq(
              'id',
              sessionId,
            )
            .eq(
              'status',
              'active',
            );

          setBoard(nextBoard);

          setXIsNext(
            nextXIsNext,
          );

          return;
        }

        const result:
          SessionResult =
          drawn
            ? 'draw'
            : winner!.winner ===
                'X'
              ? 'x_wins'
              : 'o_wins';

        const winnerId =
          drawn
            ? null
            : winner!.winner ===
                'X'
              ? createdBy
              : opponentId;

        const {
          data: closed,
        } = await supabase
          .from('game_sessions')
          .update({
            state: nextState,

            status: 'completed',

            result,

            winner_id:
              winnerId,

            winning_cells:
              winner?.cells ??
              null,

            turn_user_id:
              null,
          })
          .eq(
            'id',
            sessionId,
          )
          .eq(
            'status',
            'active',
          )
          .select('id')
          .maybeSingle();

        setBoard(nextBoard);

        setXIsNext(
          nextXIsNext,
        );

        if (drawn) {
          setDraw(true);
        } else {
          setWinResult(
            winner!,
          );
        }

        if (
          closed &&
          createdBy &&
          opponentId
        ) {
          if (drawn) {
            await saveScore(
              'draw',
              DRAW_POINTS,
              createdBy,
            );

            await saveScore(
              'draw',
              DRAW_POINTS,
              opponentId,
            );
          } else {
            await saveScore(
              'win',

              WIN_POINTS_BY_DIFFICULTY[
                difficultyLevel
              ] ?? 100,

              winnerId ??
                undefined,
            );

            const loserId =
              winnerId ===
              createdBy
                ? opponentId
                : createdBy;

            await saveScore(
              'loss',
              0,
              loserId,
            );
          }
        }
      },
      [
        sessionId,
        createdBy,
        opponentId,
        config.size,
        config.win,
        saveScore,
        difficultyLevel,
      ],
    );

  // ─── Turn permissions ────────────────────────────────────────────────────

  const myMark: Cell =
    isVsComputer
      ? 'X'
      : iAmX
        ? 'X'
        : 'O';

  const canMoveFriend =
    !isVsComputer &&
    sessionLoaded &&
    !winResult &&
    !draw &&
    ((xIsNext && iAmX) ||
      (!xIsNext && !iAmX));

  // ─── Cell press ──────────────────────────────────────────────────────────

  const handleCellPress =
    (index: number) => {
      if (
        board[index] ||
        winResult ||
        draw
      ) {
        return;
      }

      if (isVsComputer) {
        if (!xIsNext) {
          return;
        }

        const next = [
          ...board,
        ];

        next[index] = 'X';

        setBoard(next);
        setXIsNext(false);

        return;
      }

      if (!canMoveFriend) {
        return;
      }

      const next = [
        ...board,
      ];

      next[index] =
        myMark;

      applyFriendMove(
        next,
        !xIsNext,
      );
    };

  // ─── Game over actions ───────────────────────────────────────────────────

  const handlePlayAgain =
    () => {
      if (!isVsComputer) {
        router.back();
        return;
      }

      setBoard(
        makeBoard(
          config.size,
        ),
      );

      setXIsNext(true);
      setWinResult(null);
      setDraw(false);
      setModalVisible(false);
      setScoreSaved(false);

      exitConfirmedRef.current = false;
    };

  // ─── Exit confirmation ───────────────────────────────────────────────────

  const handleExitCompleted = useCallback(() => {
    setModalVisible(false);
    setExitModalVisible(false);

    router.replace('/modules/games');
  }, []);

  const handleExitPress =
    () => {
      setExitModalVisible(
        true,
      );
    };

  const handleCancelExit =
    () => {
      setExitModalVisible(
        false,
      );
    };

  const handleConfirmExit =
    async () => {
      exitConfirmedRef.current = true;

      setExitModalVisible(false);
      setModalVisible(false);

      await abandonSession();

      router.replace(
        '/modules/games',
      );
    };

  // ─── Status ──────────────────────────────────────────────────────────────

  const statusText =
    (() => {
      if (winResult) {
        if (isVsComputer) {
          return winResult.winner ===
            'X'
            ? 'You won!'
            : 'Computer wins!';
        }

        return winResult.winner ===
          myMark
          ? 'You won!'
          : 'You lost!';
      }

      if (draw) {
        return "It's a draw!";
      }

      if (isVsComputer) {
        return xIsNext
          ? 'Your turn (X)'
          : 'Computer thinking...';
      }

      if (!sessionLoaded) {
        return 'Loading game…';
      }

      return canMoveFriend
        ? `Your turn (${myMark})`
        : 'Waiting for opponent…';
    })();

  // ─── Render ──────────────────────────────────────────────────────────────

  const RESERVED_VERTICAL =
    180;

  const MAX_BOARD_DIM =
    520;

  const MIN_BOARD_DIM =
    260;

  const availableWidth =
    width - 32;

  const availableHeight =
    height -
    RESERVED_VERTICAL;

  const maxBoardDim =
    Math.max(
      MIN_BOARD_DIM,
      Math.min(
        availableWidth,
        availableHeight,
        MAX_BOARD_DIM,
      ),
    );

  const cellSize =
    Math.floor(
      maxBoardDim /
        config.size,
    );

  const actualBoardWidth =
    cellSize *
    config.size;

  const winningPoints =
    WIN_POINTS_BY_DIFFICULTY[
      difficultyLevel
    ] ?? 100;

  return (
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: pageBg },
      ]}
      edges={['top', 'bottom']}
    >
      <StatusBar barStyle="dark-content" backgroundColor={pageBg} />

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
            onPress={
              handleExitPress
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
          TIC-TAC-TOE
        </Text>

        <View style={styles.headerRight}>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 3, left: 3, right: -3, bottom: -3, backgroundColor: '#000000', borderRadius: 8 }} />
            <View
              style={[
                styles.levelBadge,
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
                  styles.levelLabel,
                  {
                    color: COLORS.text,
                    fontFamily: 'Poppins-Bold',
                  },
                ]}
              >
                {difficultyLevel.toUpperCase()}
              </Text>
            </View>
          </div>
        </View>
      </View>

      {/* Status */}

      <View
        style={[
          styles.statusBar,
          {
            borderBottomColor: COLORS.divider,
          },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            {
              color: COLORS.text,
              fontFamily: 'Poppins-Bold',
            },
          ]}
        >
          {statusText}
        </Text>
      </View>

      {/* Board */}

      <View
        style={
          styles.boardContainer
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
                styles.board,
                {
                  width:
                    actualBoardWidth,
                  height:
                    actualBoardWidth,
                },
              ]}
            >
              {Array.from(
                {
                  length:
                    config.size,
                },
                (_, boardRow) => (
                  <View
                    key={boardRow}
                    style={
                      styles.boardRow
                    }
                  >
                    {Array.from(
                      {
                        length:
                          config.size,
                      },
                      (_, boardCol) => {
                        const index =
                          boardRow *
                            config.size +
                          boardCol;

                        const cell =
                          board[index];

                        const isWinCell =
                          winResult?.cells.includes(
                            index,
                          ) ?? false;

                        // Check if this cell is user input (X in solo, or myMark in multiplayer)
                        const isUserInput = isVsComputer ? cell === 'X' : cell === myMark;

                        return (
                          <Pressable
                            key={
                              boardCol
                            }
                            onPress={() =>
                              handleCellPress(
                                index,
                              )
                            }
                            style={({ pressed }) => [
                              styles.cell,
                              {
                                backgroundColor: isWinCell ? accent : COLORS.card,
                                borderColor: isDark ? '#27272A' : '#D4D4D8', // faint grey grid lines
                              },
                              pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
                            ]}
                          >
                            {cell ===
                              'X' && (
                              <Text
                                style={[
                                  styles.cellText,
                                  {
                                    color: isUserInput ? '#EC4899' : '#000000',
                                    fontSize:
                                      cellSize *
                                      0.45,
                                    fontFamily: 'Poppins-ExtraBold',
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                X
                              </Text>
                            )}

                            {cell ===
                              'O' && (
                              <Text
                                style={[
                                  styles.cellText,
                                  {
                                    color: isUserInput ? '#EC4899' : COLORS.text,
                                    fontSize:
                                      cellSize *
                                      0.45,
                                    fontFamily: 'Poppins-ExtraBold',
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                O
                              </Text>
                            )}
                          </Pressable>
                        );
                      },
                    )}
                  </View>
                ),
              )}
            </View>
          </View>
        </div>
      </View>

      {/* ───────────────────────────────────────────────────────────────────
          GAME OVER MODAL
      ─────────────────────────────────────────────────────────────────── */}

      <Modal
        transparent
        visible={
          modalVisible
        }
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View
          style={
            styles.overlay
          }
        >
          <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 20 }} />
            <View
              style={[
                styles.modal,
                {
                  backgroundColor: COLORS.card,
                  borderColor: '#000000',
                  borderWidth: 3,
                  borderRadius: 20,
                },
              ]}
            >
              {draw ? (
                <>
                  <Text
                    style={
                      styles.modalEmoji
                    }
                  >
                    🤝
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
                    It's a Draw!
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
                    +{DRAW_POINTS}{' '}
                    points
                  </Text>
                </>
              ) : (
                isVsComputer
                  ? winResult?.winner ===
                    'X'
                  : winResult?.winner ===
                    myMark
              ) ? (
                <>
                  <Text
                    style={
                      styles.modalEmoji
                    }
                  >
                    🎉
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
                    You Win!
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
                    +{winningPoints}{' '}
                    points ·{' '}
                    {difficultyLevel.toUpperCase()}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={
                      styles.modalEmoji
                    }
                  >
                    😔
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
                    {isVsComputer
                      ? 'Computer Wins!'
                      : 'You Lost'}
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
                    Better luck next
                    time
                  </Text>
                </>
              )}

              <View
                style={
                  styles.modalBtns
                }
              >
                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    onPress={
                      handlePlayAgain
                    }
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
                      {isVsComputer
                        ? 'Play Again'
                        : 'Back to Games'}
                    </Text>
                  </Pressable>
                </div>

                {isVsComputer && (
                  <div style={{ position: 'relative', width: '100%' }}>
                    <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                    <Pressable
                      onPress={
                        handleExitCompleted
                      }
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
                )}
              </View>
            </View>
          </div>
        </View>
      </Modal>

      {/* ───────────────────────────────────────────────────────────────────
          EXIT CONFIRMATION MODAL
      ─────────────────────────────────────────────────────────────────── */}

      <Modal
        transparent
        visible={
          exitModalVisible
        }
        animationType="fade"
        onRequestClose={
          handleCancelExit
        }
      >
        <View
          style={
            styles.overlay
          }
        >
          <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 20 }} />
            <View
              style={[
                styles.exitModal,
                {
                  backgroundColor: COLORS.card,
                  borderColor: '#000000',
                  borderWidth: 3,
                  borderRadius: 20,
                },
              ]}
            >
              <Text
                style={[
                  styles.exitTitle,
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
                  styles.exitSub,
                  {
                    color: COLORS.muted,
                    fontFamily: 'Poppins-Medium',
                  },
                ]}
              >
                Are you sure you want to
                exit this game?
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
                Your current game will be
                cancelled and no points will
                be awarded.
              </Text>

              <View
                style={
                  styles.exitButtons
                }
              >
                <div style={{ position: 'relative', width: '100%' }}>
                  <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
                  <Pressable
                    onPress={
                      handleCancelExit
                    }
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      {
                        backgroundColor: COLORS.card,
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnPrimaryText,
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
                    onPress={
                      handleConfirmExit
                    }
                    style={({ pressed }) => [
                      styles.btnSecondary,
                      {
                        backgroundColor: '#000000',
                        borderColor: '#000000',
                        borderWidth: 2.5,
                        borderRadius: 12,
                      },
                      pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnSecondaryText,
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
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function makeStyles(C: typeof DARK_PALETTE) {
  return StyleSheet.create({
    safe: {
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

    levelBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
    },

    levelLabel: {
      fontSize: 11,
    },

    statusBar: {
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 0,
    },

    statusText: {
      fontSize: 14,
    },

    boardContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },

    gridContainer: {
      overflow: 'hidden',
    },

    board: {
      flexDirection: 'column',
    },

    boardRow: {
      flexDirection: 'row',
      flex: 1,
      width: '100%',
    },

    cell: {
      flex: 1,
      borderWidth: 1.5,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      margin: 1.5,
    },

    cellText: {
      // font specified inline
    },

    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },

    modal: {
      width: '100%',
      padding: 24,
      alignItems: 'center',
    },

    modalEmoji: {
      fontSize: 44,
      marginBottom: 8,
    },

    modalTitle: {
      fontSize: 22,
      marginBottom: 6,
      textAlign: 'center',
    },

    modalSub: {
      fontSize: 14,
      marginBottom: 4,
      textAlign: 'center',
    },

    modalBtns: {
      width: '100%',
      gap: 12,
      marginTop: 16,
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

    exitModal: {
      width: '100%',
      maxWidth: 420,
      padding: 24,
      alignItems: 'center',
    },

    exitTitle: {
      fontSize: 22,
      textAlign: 'center',
      marginBottom: 8,
    },

    exitSub: {
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },

    exitWarning: {
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: 8,
    },

    exitButtons: {
      width: '100%',
      gap: 12,
      marginTop: 16,
    },
  });
}