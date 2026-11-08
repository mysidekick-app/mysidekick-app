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

// ─── Types ───────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard';

type Question = {
  terms: string[];
  answer: string;
  options: string[];
};

const SESSION_SECONDS = 180;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPointsPerCorrect(difficulty: Difficulty): number {
  if (difficulty === 'easy') return 10;
  if (difficulty === 'medium') return 20;
  return 30;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function letterAt(code: number): string {
  const wrapped = ((code % 26) + 26) % 26;
  return String.fromCharCode(97 + wrapped);
}

function upperAt(code: number): string {
  const wrapped = ((code % 26) + 26) % 26;
  return String.fromCharCode(65 + wrapped);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function uniqueOptions(
  answer: string,
  distractors: string[],
): string[] {
  const seen = new Set([answer]);
  const filtered: string[] = [];

  for (const d of distractors) {
    if (!seen.has(d)) {
      seen.add(d);
      filtered.push(d);
    }

    if (filtered.length === 3) break;
  }

  let guard = 0;

  while (filtered.length < 3 && guard < 20) {
    const candidate = `${answer}${guard}`;

    if (!seen.has(candidate)) {
      seen.add(candidate);
      filtered.push(candidate);
    }

    guard++;
  }

  return shuffle([answer, ...filtered]);
}

// Easy: numeric arithmetic sequence
function generateEasy(): Question {
  const step = randInt(1, 5);
  const start = randInt(1, 15);

  const terms = [0, 1, 2, 3].map((i) =>
    String(start + i * step),
  );

  const answerNum = start + 4 * step;
  const answer = String(answerNum);

  const distractors = [
    String(answerNum + step),
    String(answerNum - step),
    String(answerNum + (step === 1 ? 2 : 1)),
    String(answerNum - (step === 1 ? 2 : 1)),
  ].filter((d) => Number(d) > 0);

  return {
    terms,
    answer,
    options: uniqueOptions(answer, distractors),
  };
}

// Medium: number + letter pairs
function generateMedium(): Question {
  const numStep = randInt(1, 3);
  const numStart = randInt(1, 10);

  const letterStep = randInt(1, 3);
  const letterStart = randInt(0, 25);

  const terms = [0, 1, 2, 3].map(
    (i) =>
      `${numStart + i * numStep}${letterAt(
        letterStart + i * letterStep,
      )}`,
  );

  const answerNum = numStart + 4 * numStep;

  const answerLetter = letterAt(
    letterStart + 4 * letterStep,
  );

  const answer = `${answerNum}${answerLetter}`;

  const distractors = [
    `${answerNum + numStep}${answerLetter}`,

    `${answerNum}${letterAt(
      letterStart + 4 * letterStep + letterStep,
    )}`,

    `${answerNum - numStep}${letterAt(
      letterStart + 4 * letterStep - letterStep,
    )}`,
  ];

  return {
    terms,
    answer,
    options: uniqueOptions(answer, distractors),
  };
}

// Hard: three-part alphanumeric code
function generateHard(): Question {
  const upperStep = randInt(1, 2);
  const upperStart = randInt(0, 25);

  const lowerStep = randInt(2, 4);
  const lowerStart = randInt(0, 25);

  const numStep = randInt(1, 5);
  const numStart = randInt(1, 9);

  const terms = [0, 1, 2, 3].map(
    (i) =>
      `${upperAt(
        upperStart + i * upperStep,
      )}${letterAt(
        lowerStart + i * lowerStep,
      )}${numStart + i * numStep}`,
  );

  const answer = `${upperAt(
    upperStart + 4 * upperStep,
  )}${letterAt(
    lowerStart + 4 * lowerStep,
  )}${numStart + 4 * numStep}`;

  const distractors = [
    `${upperAt(
      upperStart + 4 * upperStep,
    )}${letterAt(
      lowerStart + 4 * lowerStep,
    )}${numStart + 4 * numStep + numStep}`,

    `${upperAt(
      upperStart + 4 * upperStep + 1,
    )}${letterAt(
      lowerStart + 4 * lowerStep,
    )}${numStart + 4 * numStep}`,

    `${upperAt(
      upperStart + 4 * upperStep,
    )}${letterAt(
      lowerStart + 4 * lowerStep + lowerStep,
    )}${numStart + 4 * numStep}`,
  ];

  return {
    terms,
    answer,
    options: uniqueOptions(answer, distractors),
  };
}

function generateQuestion(difficulty: Difficulty): Question {
  if (difficulty === 'easy') return generateEasy();

  if (difficulty === 'medium') return generateMedium();

  return generateHard();
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');

  const s = (seconds % 60)
    .toString()
    .padStart(2, '0');

  return `${m}:${s}`;
}

function difficultyFromLevel(
  level: string | undefined,
): Difficulty {
  const n = parseInt(level ?? '1', 10);

  if (n <= 1) return 'easy';

  if (n <= 3) return 'medium';

  return 'hard';
}

function difficultyFromParams(
  difficultyParam: string | undefined,
  levelParam: string | undefined,
): Difficulty {
  if (
    difficultyParam === 'easy' ||
    difficultyParam === 'medium' ||
    difficultyParam === 'hard'
  ) {
    return difficultyParam;
  }

  return difficultyFromLevel(levelParam);
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

// ─── Component ──────────────────────────────────────────────────────────────

export default function SequenceScreen() {
  const params = useLocalSearchParams<{
    sessionId?: string;
    level?: string;
    difficulty?: string;
  }>();

  const difficulty = difficultyFromParams(
    params.difficulty,
    params.level,
  );

  const { isDark, accentForeground, onAccent } = useApp() as any;

  const accent = accentForeground || '#FDE047';
  const pageBg = accent;

  const COLORS = isDark
    ? DARK_PALETTE
    : LIGHT_PALETTE;

  const styles = makeStyles(COLORS);

  const [question, setQuestion] = useState<Question>(() =>
    generateQuestion(difficulty),
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);

  const [secondsLeft, setSecondsLeft] =
    useState(SESSION_SECONDS);

  const [gameOver, setGameOver] = useState(false);

  // Exit confirmation modal
  const [showExitModal, setShowExitModal] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);

  const exitConfirmedRef = useRef(false);

  const timerRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const sessionId =
    params.sessionId && params.sessionId !== 'undefined'
      ? params.sessionId
      : null;

  const abandonSession = useCallback(async () => {
    if (!sessionId) return;

    const { error } = await supabase
      .from('game_sessions')
      .update({
        status: 'abandoned',
        result: 'abandoned',
      })
      .eq('id', sessionId)
      .eq('status', 'active');

    if (error) {
      console.error(
        'SEQUENCE ABANDON SESSION ERROR:',
        error,
      );
    }
  }, [sessionId]);

  const completeSession = useCallback(async () => {
    if (!sessionId) return;

    const { error } = await supabase
      .from('game_sessions')
      .update({
        status: 'completed',
        result: 'completed',
      })
      .eq('id', sessionId)
      .eq('status', 'active');

    if (error) {
      console.error(
        'SEQUENCE COMPLETE SESSION ERROR:',
        error,
      );
    }
  }, [sessionId]);

  // ─── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (gameOver || showExitModal) {
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

          setGameOver(true);

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
  }, [gameOver, showExitModal, completeSession]);

  // ─── Exit handling ───────────────────────────────────────────────────────

  const handleRequestExit = useCallback(() => {
    if (gameOver) {
      router.replace('/modules/games');
      return;
    }

    setShowExitModal(true);
  }, [gameOver]);

  const handleCancelExit = useCallback(() => {
    setShowExitModal(false);
  }, []);

  const handleConfirmExit = useCallback(async () => {
    exitConfirmedRef.current = true;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setShowExitModal(false);

    await abandonSession();

    router.replace('/modules/games');
  }, [abandonSession]);

  // ─── Answer handling ─────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (option: string) => {
      if (checked || gameOver || showExitModal) return;

      setSelected(option);
    },
    [checked, gameOver, showExitModal],
  );

  const handleCheck = useCallback(() => {
    if (
      selected === null ||
      checked ||
      gameOver ||
      showExitModal
    ) {
      return;
    }

    setChecked(true);

    setAnsweredCount((c) => c + 1);

    if (selected === question.answer) {
      setCorrectCount((c) => c + 1);
    }
  }, [
    selected,
    checked,
    gameOver,
    showExitModal,
    question,
  ]);

  const handleNext = useCallback(() => {
    if (gameOver) return;

    setQuestion(generateQuestion(difficulty));
    setSelected(null);
    setChecked(false);
  }, [difficulty, gameOver]);

  const finalScore =
    correctCount * getPointsPerCorrect(difficulty);

  // ─── Score saving ────────────────────────────────────────────────────────

  const saveScore = useCallback(async () => {
    if (scoreSaved) return;

    setScoreSaved(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const playerId = user?.id;

    if (!playerId) return;

    const { error } = await supabase
      .from('game_scores')
      .insert({
        session_id:
          params.sessionId &&
          params.sessionId !== 'undefined'
            ? params.sessionId
            : null,
        player_id: playerId,
        game: 'sequence',
        mode: 'solo',
        points: finalScore,
        difficulty,
      });

    if (error) {
      console.error(
        'SEQUENCE SAVE SCORE ERROR:',
        error,
      );
    }
  }, [
    scoreSaved,
    finalScore,
    difficulty,
    params.sessionId,
  ]);

  useEffect(() => {
    if (
      gameOver &&
      !showExitModal &&
      !exitConfirmedRef.current
    ) {
      saveScore();
    }
  }, [gameOver, showExitModal, saveScore]);

  // ─── Play Again ──────────────────────────────────────────────────────────

  const handlePlayAgain = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setSecondsLeft(SESSION_SECONDS);
    setCorrectCount(0);
    setAnsweredCount(0);
    setGameOver(false);
    setScoreSaved(false);

    setQuestion(generateQuestion(difficulty));

    setSelected(null);
    setChecked(false);
    setShowExitModal(false);

    exitConfirmedRef.current = false;
  }, [difficulty]);

  // ─── UI ───────────────────────────────────────────────────────────────────

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
            onPress={handleRequestExit}
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
          SEQUENCE
        </Text>

        <View style={styles.headerRight}>
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
                  { color: COLORS.text, fontFamily: 'Poppins-Bold' },
                ]}
              >
                {difficulty.toUpperCase()}
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
              {formatTime(secondsLeft)}
            </Text>
          </div>
        </View>
      </View>

      {/* Score strip */}

      <View
        style={[
          styles.scoreStrip,
          { borderBottomColor: COLORS.divider },
        ]}
      >
        <Text
          style={[
            styles.scoreStripText,
            { color: COLORS.text, fontFamily: 'Poppins-Bold' },
          ]}
        >
          {correctCount} correct · {answeredCount} answered ·{' '}
          {finalScore} pts
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Sequence */}

        <View style={styles.sequenceRow}>
          {question.terms.map((term, index) => (
            <div key={index} style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
              <View
                style={[
                  styles.termChip,
                  {
                    backgroundColor: COLORS.card,
                    borderColor: '#000000',
                    borderWidth: 2.5,
                    borderRadius: 12,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.termText,
                    { color: COLORS.text, fontFamily: 'Poppins-ExtraBold' },
                  ]}
                >
                  {term}
                </Text>
              </View>
            </div>
          ))}

          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 }} />
            <View
              style={[
                styles.termChip,
                styles.blankChip,
                { backgroundColor: COLORS.card, borderColor: '#000000', borderWidth: 2.5, borderRadius: 12 },
              ]}
            >
              <Text
                style={[
                  styles.termText,
                  { color: accent, fontFamily: 'Poppins-ExtraBold' },
                ]}
              >
                ?
              </Text>
            </View>
          </div>
        </View>

        <Text
          style={[
            styles.prompt,
            { color: COLORS.text, fontFamily: 'Poppins-Bold' },
          ]}
        >
          What comes next?
        </Text>

        {/* Options */}

        <View style={styles.optionsGrid}>
          {question.options.map((opt) => {
            const isSelected = selected === opt;

            const isCorrectOption =
              opt === question.answer;

            let bg = COLORS.card;
            let textColor = COLORS.text;

            if (checked) {
              if (isCorrectOption) {
                bg = '#22C55E';
                textColor = '#FFFFFF';
              } else if (isSelected) {
                bg = '#EF4444';
                textColor = '#FFFFFF';
              }
            } else if (isSelected) {
              bg = '#000000';
              textColor = '#FFFFFF';
            }

            return (
              <div key={opt} style={styles.optionContainer}>
                <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 14 }} />
                <Pressable
                  onPress={() => handleSelect(opt)}
                  disabled={
                    checked ||
                    gameOver ||
                    showExitModal
                  }
                  style={({ pressed }) => [
                    styles.optionBtn,
                    {
                      backgroundColor: bg,
                      borderColor: '#000000',
                      borderWidth: 2.5,
                      borderRadius: 14,
                    },
                    pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: textColor, fontFamily: 'Poppins-ExtraBold' },
                    ]}
                  >
                    {opt}
                  </Text>
                </Pressable>
              </div>
            );
          })}
        </View>

        {!checked ? (
          <div style={{ position: 'relative', width: '100%', maxWidth: 300, marginTop: 8 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 14 }} />
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: '#000000', borderColor: '#000000', borderWidth: 2.5, borderRadius: 14 },
                selected === null && { opacity: 0.5 },
                pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
              ]}
              onPress={handleCheck}
              disabled={
                selected === null ||
                gameOver ||
                showExitModal
              }
            >
              <Text
                style={[
                  styles.actionBtnText,
                  { color: '#FFFFFF', fontFamily: 'Poppins-ExtraBold' },
                ]}
              >
                Check Answer
              </Text>
            </Pressable>
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', maxWidth: 300, marginTop: 8 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 14 }} />
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: '#000000', borderColor: '#000000', borderWidth: 2.5, borderRadius: 14 },
                pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
              ]}
              onPress={handleNext}
              disabled={gameOver}
            >
              <Text
                style={[
                  styles.actionBtnText,
                  { color: '#FFFFFF', fontFamily: 'Poppins-ExtraBold' },
                ]}
              >
                Next
              </Text>
            </Pressable>
          </div>
        )}
      </ScrollView>

      {/* ─────────────────────────────────────────────────────────────────────
          EXIT CONFIRMATION
      ───────────────────────────────────────────────────────────────────── */}

      <Modal
        visible={showExitModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleCancelExit}
      >
        <View style={styles.modalOverlay}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 20 }} />
            <View
              style={[
                styles.modalCard,
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
                  styles.modalTitle,
                  { color: COLORS.text, fontFamily: 'Poppins-ExtraBold' },
                ]}
              >
                Exit Game?
              </Text>

              <Text
                style={[
                  styles.exitMessage,
                  { color: COLORS.muted, fontFamily: 'Poppins-Medium' },
                ]}
              >
                Your current game will be cancelled and your
                progress will be lost.
              </Text>

              <View style={styles.modalBtns}>
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
                    onPress={handleCancelExit}
                  >
                    <Text
                      style={[
                        styles.btnSecondaryText,
                        { color: COLORS.text, fontFamily: 'Poppins-ExtraBold' },
                      ]}
                    >
                      Stay
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
                    onPress={handleConfirmExit}
                  >
                    <Text
                      style={[
                        styles.btnPrimaryText,
                        { color: '#FFFFFF', fontFamily: 'Poppins-ExtraBold' },
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
          GAME OVER
      ───────────────────────────────────────────────────────────────────── */}

      <Modal
        visible={gameOver && !showExitModal}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
            <div style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 20 }} />
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: COLORS.card,
                  borderColor: '#000000',
                  borderWidth: 3,
                  borderRadius: 20,
                },
              ]}
            >
              <Text style={styles.modalEmoji}>⏱️</Text>

              <Text
                style={[
                  styles.modalTitle,
                  { color: COLORS.text, fontFamily: 'Poppins-ExtraBold' },
                ]}
              >
                Time's Up!
              </Text>

              <Text
                style={[
                  styles.modalSub,
                  { color: COLORS.muted, fontFamily: 'Poppins-Medium' },
                ]}
              >
                {correctCount} correct out of {answeredCount} ·{' '}
                {difficulty.toUpperCase()}
              </Text>

              <Text
                style={[
                  styles.modalScore,
                  { color: COLORS.text, fontFamily: 'Poppins-ExtraBold' },
                ]}
              >
                {finalScore} pts
              </Text>

              <View style={styles.modalBtns}>
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
                    onPress={handlePlayAgain}
                  >
                    <Text
                      style={[
                        styles.btnPrimaryText,
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
                      router.replace('/modules/games')
                    }
                  >
                    <Text
                      style={[
                        styles.btnSecondaryText,
                        { color: COLORS.text, fontFamily: 'Poppins-ExtraBold' },
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

// ─── Styles ─────────────────────────────────────────────────────────────────

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

    scoreStrip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 0,
      alignItems: 'center',
    },

    scoreStripText: {
      fontSize: 13,
      textAlign: 'center',
    },

    content: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      paddingTop: 40,
      gap: 24,
    },

    sequenceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 12,
    },

    termChip: {
      minWidth: 64,
      paddingHorizontal: 16,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },

    blankChip: {
      // border specified inline
    },

    termText: {
      fontSize: 20,
    },

    prompt: {
      fontSize: 15,
    },

    optionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 16,
      width: '100%',
      maxWidth: 380,
    },

    optionContainer: {
      position: 'relative',
      minWidth: 120,
      flexGrow: 1,
      maxWidth: 170,
    },

    optionBtn: {
      width: '100%',
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },

    optionText: {
      fontSize: 16,
    },

    actionBtn: {
      width: '100%',
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },

    actionBtnText: {
      fontSize: 16,
      letterSpacing: 1,
    },

    // ─── Modals ──────────────────────────────────────────────────────────────

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
      fontSize: 48,
    },

    modalTitle: {
      fontSize: 22,
      letterSpacing: 0.5,
      textAlign: 'center',
    },

    exitMessage: {
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 21,
      marginTop: 4,
    },

    modalSub: {
      fontSize: 14,
      textAlign: 'center',
    },

    modalScore: {
      fontSize: 32,
      marginTop: 4,
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