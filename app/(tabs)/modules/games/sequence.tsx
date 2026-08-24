import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
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

const SESSION_SECONDS = 180; // 3 minutes
const POINTS_PER_CORRECT = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function letterAt(code: number): string {
  const wrapped = ((code % 26) + 26) % 26;
  return String.fromCharCode(97 + wrapped); // a-z
}

function upperAt(code: number): string {
  const wrapped = ((code % 26) + 26) % 26;
  return String.fromCharCode(65 + wrapped); // A-Z
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueOptions(answer: string, distractors: string[]): string[] {
  const seen = new Set([answer]);
  const filtered: string[] = [];
  for (const d of distractors) {
    if (!seen.has(d)) { seen.add(d); filtered.push(d); }
    if (filtered.length === 3) break;
  }
  // Fallback in the rare case of collisions — pad with tweaked variants.
  let guard = 0;
  while (filtered.length < 3 && guard < 20) {
    const candidate = `${answer}${guard}`;
    if (!seen.has(candidate)) { seen.add(candidate); filtered.push(candidate); }
    guard++;
  }
  return shuffle([answer, ...filtered]);
}

// Easy: numeric arithmetic sequence, e.g. 2, 5, 8, 11, _
function generateEasy(): Question {
  const step = randInt(1, 5);
  const start = randInt(1, 15);
  const terms = [0, 1, 2, 3].map((i) => String(start + i * step));
  const answerNum = start + 4 * step;
  const answer = String(answerNum);
  const distractors = [
    String(answerNum + step),
    String(answerNum - step),
    String(answerNum + (step === 1 ? 2 : 1)),
    String(answerNum - (step === 1 ? 2 : 1)),
  ].filter((d) => Number(d) > 0);
  return { terms, answer, options: uniqueOptions(answer, distractors) };
}

// Medium: number+letter pairs, e.g. 1a, 3c, 5e, 7g, _
function generateMedium(): Question {
  const numStep = randInt(1, 3);
  const numStart = randInt(1, 10);
  const letterStep = randInt(1, 3);
  const letterStart = randInt(0, 25);
  const terms = [0, 1, 2, 3].map(
    (i) => `${numStart + i * numStep}${letterAt(letterStart + i * letterStep)}`
  );
  const answerNum = numStart + 4 * numStep;
  const answerLetter = letterAt(letterStart + 4 * letterStep);
  const answer = `${answerNum}${answerLetter}`;
  const distractors = [
    `${answerNum + numStep}${answerLetter}`,
    `${answerNum}${letterAt(letterStart + 4 * letterStep + letterStep)}`,
    `${answerNum - numStep}${letterAt(letterStart + 4 * letterStep - letterStep)}`,
  ];
  return { terms, answer, options: uniqueOptions(answer, distractors) };
}

// Hard: three-part alphanumeric code, e.g. Ab2, Cd6, Ef10, _
function generateHard(): Question {
  const upperStep = randInt(1, 2);
  const upperStart = randInt(0, 25);
  const lowerStep = randInt(2, 4);
  const lowerStart = randInt(0, 25);
  const numStep = randInt(1, 5);
  const numStart = randInt(1, 9);
  const terms = [0, 1, 2, 3].map(
    (i) =>
      `${upperAt(upperStart + i * upperStep)}${letterAt(lowerStart + i * lowerStep)}${
        numStart + i * numStep
      }`
  );
  const answer = `${upperAt(upperStart + 4 * upperStep)}${letterAt(lowerStart + 4 * lowerStep)}${
    numStart + 4 * numStep
  }`;
  const distractors = [
    `${upperAt(upperStart + 4 * upperStep)}${letterAt(lowerStart + 4 * lowerStep)}${numStart + 4 * numStep + numStep}`,
    `${upperAt(upperStart + 4 * upperStep + 1)}${letterAt(lowerStart + 4 * lowerStep)}${numStart + 4 * numStep}`,
    `${upperAt(upperStart + 4 * upperStep)}${letterAt(lowerStart + 4 * lowerStep + lowerStep)}${numStart + 4 * numStep}`,
  ];
  return { terms, answer, options: uniqueOptions(answer, distractors) };
}

function generateQuestion(difficulty: Difficulty): Question {
  if (difficulty === 'easy') return generateEasy();
  if (difficulty === 'medium') return generateMedium();
  return generateHard();
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// index.tsx passes a numeric `level` string for solo games
// (easy→'1', medium→'3', hard→'5') — map that back to a tier.
function difficultyFromLevel(level: string | undefined): Difficulty {
  const n = parseInt(level ?? '1', 10);
  if (n <= 1) return 'easy';
  if (n <= 3) return 'medium';
  return 'hard';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SequenceScreen() {
  const params = useLocalSearchParams<{ sessionId?: string; level?: string }>();
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

  const [question, setQuestion] = useState<Question>(() => generateQuestion(difficulty));
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [gameOver, setGameOver] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setGameOver(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleSelect = useCallback((option: string) => {
    if (checked || gameOver) return;
    setSelected(option);
  }, [checked, gameOver]);

  const handleCheck = useCallback(() => {
    if (selected === null || checked) return;
    setChecked(true);
    setAnsweredCount((c) => c + 1);
    if (selected === question.answer) {
      setCorrectCount((c) => c + 1);
    }
  }, [selected, checked, question]);

  const handleNext = useCallback(() => {
    setQuestion(generateQuestion(difficulty));
    setSelected(null);
    setChecked(false);
  }, [difficulty]);

  const finalScore = correctCount * POINTS_PER_CORRECT;

  const saveScore = useCallback(async () => {
    if (scoreSaved) return;
    setScoreSaved(true);
    const { data: { user } } = await supabase.auth.getUser();
    const playerId = user?.id;
    if (!playerId) return;
    await supabase.from('game_scores').insert({
      session_id: params.sessionId && params.sessionId !== 'undefined' ? params.sessionId : null,
      player_id: playerId,
      game: 'sequence',
      mode: 'solo',
      points: finalScore,
      difficulty,
    });
  }, [scoreSaved, finalScore, difficulty, params.sessionId]);

  useEffect(() => { if (gameOver) saveScore(); }, [gameOver, saveScore]);

  const handlePlayAgain = () => {
    setSecondsLeft(SESSION_SECONDS);
    setCorrectCount(0);
    setAnsweredCount(0);
    setGameOver(false);
    setScoreSaved(false);
    setQuestion(generateQuestion(difficulty));
    setSelected(null);
    setChecked(false);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setGameOver(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.push('/modules')} style={[styles.headerBack, { backgroundColor: colors.accent }]} hitSlop={10}>
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.accent }]}>SEQUENCE</Text>
        <View style={styles.headerRight}>
          <View style={[styles.levelPill, { backgroundColor: colors.section, borderColor: colors.border }]}>
            <Text style={[styles.levelText, { color: colors.muted }]}>{difficulty.toUpperCase()}</Text>
          </View>
          <Text style={[styles.timerText, { color: secondsLeft <= 20 ? colors.incorrect : colors.text }]}>
            {formatTime(secondsLeft)}
          </Text>
        </View>
      </View>

      {/* Score strip */}
      <View style={[styles.scoreStrip, { borderBottomColor: colors.border }]}>
        <Text style={[styles.scoreStripText, { color: colors.muted }]}>
          {correctCount} correct · {answeredCount} answered · {finalScore} pts
        </Text>
      </View>

      <View style={styles.content}>
        {/* Sequence display */}
        <View style={styles.sequenceRow}>
          {question.terms.map((t, i) => (
            <View key={i} style={[styles.termChip, { backgroundColor: colors.section, borderColor: colors.border }]}>
              <Text style={[styles.termText, { color: colors.text }]}>{t}</Text>
            </View>
          ))}
          <View style={[styles.termChip, styles.blankChip, { borderColor: colors.accent }]}>
            <Text style={[styles.termText, { color: colors.accent }]}>?</Text>
          </View>
        </View>

        <Text style={[styles.prompt, { color: colors.muted }]}>What comes next?</Text>

        {/* Options */}
        <View style={styles.optionsGrid}>
          {question.options.map((opt) => {
            const isSelected = selected === opt;
            const isCorrectOption = opt === question.answer;
            let bg = colors.section;
            let borderColor = colors.border;
            let textColor = colors.text;
            if (checked) {
              if (isCorrectOption) { bg = colors.correct; borderColor = colors.correct; textColor = '#FFFFFF'; }
              else if (isSelected) { bg = colors.incorrect; borderColor = colors.incorrect; textColor = '#FFFFFF'; }
            } else if (isSelected) {
              bg = colors.accent; borderColor = colors.accent; textColor = colors.onAccent;
            }
            return (
              <Pressable
                key={opt}
                onPress={() => handleSelect(opt)}
                disabled={checked}
                style={[styles.optionBtn, { backgroundColor: bg, borderColor }]}
              >
                <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        {!checked ? (
          <Pressable
            style={[styles.actionBtn, { backgroundColor: colors.accent }, selected === null && { opacity: 0.4 }]}
            onPress={handleCheck}
            disabled={selected === null}
          >
            <Text style={[styles.actionBtnText, { color: colors.onAccent }]}>Check Answer</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.actionBtn, { backgroundColor: colors.accent }]} onPress={handleNext}>
            <Text style={[styles.actionBtnText, { color: colors.onAccent }]}>Next</Text>
          </Pressable>
        )}
      </View>

      {/* Game Over Modal */}
      <Modal visible={gameOver} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.section, borderColor: colors.border }]}>
            <Text style={styles.modalEmoji}>⏱️</Text>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Time's Up!</Text>
            <Text style={[styles.modalSub, { color: colors.muted }]}>
              {correctCount} correct out of {answeredCount} · {difficulty.toUpperCase()}
            </Text>
            <Text style={[styles.modalScore, { color: colors.accent }]}>{finalScore} pts</Text>
            <View style={styles.modalBtns}>
              <Pressable style={[styles.btnPrimary, { backgroundColor: colors.accent }]} onPress={handlePlayAgain}>
                <Text style={[styles.btnPrimaryText, { color: colors.onAccent }]}>Play Again</Text>
              </Pressable>
              <Pressable style={[styles.btnSecondary, { borderColor: colors.border }]} onPress={() => router.back()}>
                <Text style={[styles.btnSecondaryText, { color: colors.text }]}>Exit</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 28, paddingVertical: 12, borderBottomWidth: 1 },
  headerBack: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 16, letterSpacing: 1.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelPill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  levelText: { fontFamily: 'Poppins-Medium', fontSize: 11 },
  timerText: { fontFamily: 'Poppins-Bold', fontSize: 15, fontVariant: ['tabular-nums'], minWidth: 46, textAlign: 'right' },
  scoreStrip: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  scoreStripText: { fontFamily: 'Poppins-Medium', fontSize: 12, textAlign: 'center' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 20 },
  sequenceRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  termChip: { minWidth: 56, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  blankChip: { borderWidth: 2, borderStyle: 'dashed' },
  termText: { fontFamily: 'Poppins-Bold', fontSize: 18 },
  prompt: { fontFamily: 'Poppins-Medium', fontSize: 13 },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, width: '100%' },
  optionBtn: { minWidth: 100, flexGrow: 1, maxWidth: 160, paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, alignItems: 'center' },
  optionText: { fontFamily: 'Poppins-Bold', fontSize: 16 },
  actionBtn: { borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48, alignItems: 'center', marginTop: 8 },
  actionBtnText: { fontFamily: 'Poppins-Bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1, width: '90%', gap: 8 },
  modalEmoji: { fontSize: 48 },
  modalTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 24 },
  modalSub: { fontFamily: 'Poppins-Medium', fontSize: 14, textAlign: 'center' },
  modalScore: { fontFamily: 'Poppins-ExtraBold', fontSize: 32, marginTop: 4 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  btnPrimary: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText: { fontFamily: 'Poppins-Bold', fontSize: 15 },
  btnSecondary: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  btnSecondaryText: { fontFamily: 'Poppins-SemiBold', fontSize: 15 },
});