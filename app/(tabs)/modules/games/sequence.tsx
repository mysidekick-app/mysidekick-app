import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
const POINTS_PER_CORRECT = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
      `${upperAt(upperStart + i * upperStep)}${letterAt(
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

// ─── Component ──────────────────────────────────────────────────────────────

export default function SequenceScreen() {
  const params = useLocalSearchParams<{
    sessionId?: string;
    level?: string;
  }>();

  const difficulty = difficultyFromLevel(params.level);

  const { isDark, accentForeground, onAccent } = useApp();

  const colors = {
    background: isDark ? '#090909' : '#FBFAF8',
    section: isDark ? '#151515' : '#FFFFFF',
    text: isDark ? '#F4F2EE' : '#27241F',
    muted: isDark ? '#AAA59D' : '#8F8A82',
    border: isDark ? '#2A2A2A' : '#ECE9E4',
    accent: accentForeground,
    onAccent,
    correct: '#3FB37F',
    incorrect: '#FF6B6B',
  };

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

  const timerRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Don't run the timer while the game is over
    // or while the exit confirmation is open.
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
  }, [gameOver, showExitModal]);

  // ─── Exit handling ───────────────────────────────────────────────────────

  const handleRequestExit = useCallback(() => {
    if (gameOver) {
      // If the game has already ended, no confirmation is needed.
      router.push('/modules');
      return;
    }

    setShowExitModal(true);
  }, [gameOver]);

  const handleCancelExit = useCallback(() => {
    setShowExitModal(false);
  }, []);

  const handleConfirmExit = useCallback(() => {
    // Cancel the game completely.
    // Because score saving only happens when gameOver becomes true,
    // this unfinished game will not receive a score.
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setShowExitModal(false);
    setGameOver(true);

    router.push('/modules');
  }, []);

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
    correctCount * POINTS_PER_CORRECT;

  // ─── Score saving ────────────────────────────────────────────────────────

  const saveScore = useCallback(async () => {
    if (scoreSaved) return;

    setScoreSaved(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const playerId = user?.id;

    if (!playerId) return;

    await supabase.from('game_scores').insert({
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
  }, [
    scoreSaved,
    finalScore,
    difficulty,
    params.sessionId,
  ]);

  useEffect(() => {
    if (gameOver && !showExitModal) {
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
  }, [difficulty]);

  // ─── UI ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={[
        styles.safe,
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
          onPress={handleRequestExit}
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
          SEQUENCE
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
              {difficulty.toUpperCase()}
            </Text>
          </View>

          <Text
            style={[
              styles.timerText,
              {
                color:
                  secondsLeft <= 20
                    ? colors.incorrect
                    : colors.text,
              },
            ]}
          >
            {formatTime(secondsLeft)}
          </Text>
        </View>
      </View>

      {/* Score strip */}
      <View
        style={[
          styles.scoreStrip,
          { borderBottomColor: colors.border },
        ]}
      >
        <Text
          style={[
            styles.scoreStripText,
            { color: colors.muted },
          ]}
        >
          {correctCount} correct · {answeredCount} answered ·{' '}
          {finalScore} pts
        </Text>
      </View>

      <View style={styles.content}>
        {/* Sequence */}
        <View style={styles.sequenceRow}>
          {question.terms.map((term, index) => (
            <View
              key={index}
              style={[
                styles.termChip,
                {
                  backgroundColor: colors.section,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.termText,
                  { color: colors.text },
                ]}
              >
                {term}
              </Text>
            </View>
          ))}

          <View
            style={[
              styles.termChip,
              styles.blankChip,
              { borderColor: colors.accent },
            ]}
          >
            <Text
              style={[
                styles.termText,
                { color: colors.accent },
              ]}
            >
              ?
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.prompt,
            { color: colors.muted },
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

            let bg = colors.section;
            let borderColor = colors.border;
            let textColor = colors.text;

            if (checked) {
              if (isCorrectOption) {
                bg = colors.correct;
                borderColor = colors.correct;
                textColor = '#FFFFFF';
              } else if (isSelected) {
                bg = colors.incorrect;
                borderColor = colors.incorrect;
                textColor = '#FFFFFF';
              }
            } else if (isSelected) {
              bg = colors.accent;
              borderColor = colors.accent;
              textColor = colors.onAccent;
            }

            return (
              <Pressable
                key={opt}
                onPress={() => handleSelect(opt)}
                disabled={
                  checked ||
                  gameOver ||
                  showExitModal
                }
                style={[
                  styles.optionBtn,
                  {
                    backgroundColor: bg,
                    borderColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: textColor },
                  ]}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!checked ? (
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: colors.accent },
              selected === null && { opacity: 0.4 },
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
                { color: colors.onAccent },
              ]}
            >
              Check Answer
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: colors.accent },
            ]}
            onPress={handleNext}
            disabled={gameOver}
          >
            <Text
              style={[
                styles.actionBtnText,
                { color: colors.onAccent },
              ]}
            >
              Next
            </Text>
          </Pressable>
        )}
      </View>

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
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.section,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={styles.exitEmoji}>⚠️</Text>

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
                styles.exitMessage,
                { color: colors.muted },
              ]}
            >
              Your current game will be cancelled and your
              progress will be lost.
            </Text>

            <View style={styles.modalBtns}>
              <Pressable
                style={[
                  styles.btnSecondary,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
                onPress={handleCancelExit}
              >
                <Text
                  style={[
                    styles.btnSecondaryText,
                    { color: colors.text },
                  ]}
                >
                  Stay
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.btnPrimary,
                  {
                    backgroundColor: colors.accent,
                  },
                ]}
                onPress={handleConfirmExit}
              >
                <Text
                  style={[
                    styles.btnPrimaryText,
                    { color: colors.onAccent },
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
          GAME OVER
      ───────────────────────────────────────────────────────────────────── */}

      <Modal
        visible={gameOver && !showExitModal}
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
                styles.modalSub,
                { color: colors.muted },
              ]}
            >
              {correctCount} correct out of {answeredCount} ·{' '}
              {difficulty.toUpperCase()}
            </Text>

            <Text
              style={[
                styles.modalScore,
                { color: colors.accent },
              ]}
            >
              {finalScore} pts
            </Text>

            <View style={styles.modalBtns}>
              <Pressable
                style={[
                  styles.btnPrimary,
                  {
                    backgroundColor: colors.accent,
                  },
                ]}
                onPress={handlePlayAgain}
              >
                <Text
                  style={[
                    styles.btnPrimaryText,
                    { color: colors.onAccent },
                  ]}
                >
                  Play Again
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.btnSecondary,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => router.push('/modules')}
              >
                <Text
                  style={[
                    styles.btnSecondaryText,
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

// ─── Styles ─────────────────────────────────────────────────────────────────

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
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    minWidth: 46,
    textAlign: 'right',
  },

  scoreStrip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },

  scoreStripText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    textAlign: 'center',
  },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 20,
  },

  sequenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },

  termChip: {
    minWidth: 56,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  blankChip: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },

  termText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 18,
  },

  prompt: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
  },

  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },

  optionBtn: {
    minWidth: 100,
    flexGrow: 1,
    maxWidth: 160,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
  },

  optionText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
  },

  actionBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    marginTop: 8,
  },

  actionBtnText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
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
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    width: '90%',
    maxWidth: 360,
    gap: 8,
  },

  modalEmoji: {
    fontSize: 48,
  },

  exitEmoji: {
    fontSize: 42,
    marginBottom: 2,
  },

  modalTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 24,
    textAlign: 'center',
  },

  exitMessage: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 4,
    maxWidth: 280,
  },

  modalSub: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    textAlign: 'center',
  },

  modalScore: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 32,
    marginTop: 4,
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
  },
});