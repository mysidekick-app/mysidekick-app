import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';
import { randomWordsForLevel, progressionFor, difficultyLabelForLevel } from '@/components/games-utils';

// ─── Simple Crossword Generator ────────────────────────────────────────────────
// Places words in a compact grid, intersecting where possible.

type Clue = { word: string; clue: string; row: number; col: number; direction: 'across' | 'down'; number: number; cells: { row: number; col: number }[] };

const CLUE_HINTS: Record<string, string> = {
  APPLE: 'A common red or green fruit', BREAD: 'Baked food made from flour', CHAIR: 'You sit on this', DANCE: 'Move to music',
  EAGLE: 'A large bird of prey', FLAME: 'The visible part of a fire', GLOBE: 'A spherical model of Earth', HONEY: 'Sweet substance made by bees',
  ISLAND: 'Land surrounded by water', JOLLY: 'Merry and cheerful', KNIFE: 'A cutting tool', LEMON: 'A sour yellow citrus fruit',
  MANGO: 'A tropical orange fruit', NOBLE: 'Having high moral qualities', OCEAN: 'A vast body of salt water', PIANO: 'A keyboard instrument',
  QUIET: 'Making little or no noise', RIVER: 'A flowing body of water', SMILE: 'A pleased facial expression', TIGER: 'A large striped wild cat',
  WATER: 'H2O', YOUTH: 'The period of being young', ZEBRA: 'An African animal with black and white stripes',
  BEACH: 'Sandy shore by the sea', CLOUD: 'White fluffy shape in the sky', DREAM: 'Visions during sleep', FAIRY: 'A small magical being',
  GARDEN: 'A place for growing plants', HEART: 'The organ that pumps blood', LIGHT: 'Opposite of darkness',
  BALCONY: 'An outdoor platform on a building', CABINET: 'A piece of storage furniture', DOLPHIN: 'An intelligent marine mammal',
  EMERALD: 'A green precious stone', FEATHER: 'A light growth on a bird', GRAVITY: 'The force that pulls things down', HARVEST: 'Gathering crops',
  JOURNEY: 'A long trip', KINGDOM: 'A realm ruled by a monarch', LANTERN: 'A portable light', MEADOW: 'A grassy field',
  NECTAR: 'Sweet liquid in flowers', OCTOPUS: 'A sea creature with eight arms', PANTHER: 'A large black wild cat',
  RAINBOW: 'A colorful arc in the sky', SAPPHIRE: 'A blue precious stone', THUNDER: 'A loud sound after lightning', UNICORN: 'A mythical horned horse',
  VIOLET: 'A purple-blue flower', WHISPER: 'To speak very softly',
  ADVENTURE: 'An exciting experience', BUTTERFLY: 'An insect with colorful wings', CHANDELIER: 'A hanging decorative light',
  DISCOVERY: 'Finding something new', FIREFLY: 'A glowing insect', ILLUMINATE: 'To light up', LIGHTHOUSE: 'A tower guiding ships',
  ORCHESTRA: 'A large group of musicians', REFLECTION: 'An image seen in a mirror', YESTERDAY: 'The day before today',
};

function getClue(word: string): string {
  return CLUE_HINTS[word] ?? `A ${word.length}-letter word`;
}

function generateCrossword(words: string[]): { grid: (string | null)[][]; clues: Clue[]; size: number } {
  const size = 15;
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const placed: { word: string; row: number; col: number; direction: 'across' | 'down' }[] = [];
  const sorted = [...words].sort((a, b) => b.length - a.length);

  // Place first word in the center, horizontally
  const first = sorted[0];
  const startCol = Math.floor((size - first.length) / 2);
  const startRow = Math.floor(size / 2);
  for (let i = 0; i < first.length; i++) {
    grid[startRow][startCol + i] = first[i];
  }
  placed.push({ word: first, row: startRow, col: startCol, direction: 'across' });

  // Try to place remaining words by intersecting
  for (let w = 1; w < sorted.length; w++) {
    const word = sorted[w];
    let bestPlacement: { row: number; col: number; direction: 'across' | 'down' } | null = null;

    for (const existing of placed) {
      for (let i = 0; i < word.length; i++) {
        for (let j = 0; j < existing.word.length; j++) {
          if (word[i] !== existing.word[j]) continue;

          const newDirection: 'across' | 'down' = existing.direction === 'across' ? 'down' : 'across';
          let newRow: number, newCol: number;
          if (newDirection === 'across') {
            newRow = existing.row - i;
            newCol = existing.col + j;
          } else {
            newRow = existing.row + j;
            newCol = existing.col - i;
          }

          // Check bounds
          if (newRow < 0 || newCol < 0) continue;
          if (newDirection === 'across' && newCol + word.length > size) continue;
          if (newDirection === 'down' && newRow + word.length > size) continue;

          // Check for conflicts
          let canPlace = true;
          for (let k = 0; k < word.length; k++) {
            const r = newDirection === 'across' ? newRow : newRow + k;
            const c = newDirection === 'across' ? newCol + k : newCol;
            if (grid[r][c] !== null && grid[r][c] !== word[k]) { canPlace = false; break; }
            // Check adjacent cells don't conflict (no parallel words touching)
            if (k !== i) {
              if (newDirection === 'across') {
                if (r > 0 && grid[r - 1][c] !== null) { canPlace = false; break; }
                if (r < size - 1 && grid[r + 1][c] !== null) { canPlace = false; break; }
              } else {
                if (c > 0 && grid[r][c - 1] !== null) { canPlace = false; break; }
                if (c < size - 1 && grid[r][c + 1] !== null) { canPlace = false; break; }
              }
            }
          }
          if (canPlace) {
            bestPlacement = { row: newRow, col: newCol, direction: newDirection };
            break;
          }
        }
        if (bestPlacement) break;
      }
      if (bestPlacement) break;
    }

    if (bestPlacement) {
      for (let k = 0; k < word.length; k++) {
        const r = bestPlacement.direction === 'across' ? bestPlacement.row : bestPlacement.row + k;
        const c = bestPlacement.direction === 'across' ? bestPlacement.col + k : bestPlacement.col;
        grid[r][c] = word[k];
      }
      placed.push({ word, ...bestPlacement });
    }
  }

  // Build clues with numbering
  const clues: Clue[] = [];
  let number = 1;
  const usedCells = new Set<string>();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === null) continue;
      const key = `${r},${c}`;
      if (usedCells.has(key)) continue;

      // Check if this is the start of an across or down word
      const startsAcross = (c === 0 || grid[r][c - 1] === null) && c < size - 1 && grid[r][c + 1] !== null;
      const startsDown = (r === 0 || grid[r - 1][c] === null) && r < size - 1 && grid[r + 1][c] !== null;

      if (startsAcross || startsDown) {
        if (startsAcross) {
          const cells: { row: number; col: number }[] = [];
          let word = '';
          for (let cc = c; cc < size && grid[r][cc] !== null; cc++) {
            word += grid[r][cc]!;
            cells.push({ row: r, col: cc });
            usedCells.add(`${r},${cc}`);
          }
          clues.push({ word, clue: getClue(word), row: r, col: c, direction: 'across', number, cells });
        }
        if (startsDown) {
          const cells: { row: number; col: number }[] = [];
          let word = '';
          for (let rr = r; rr < size && grid[rr][c] !== null; rr++) {
            word += grid[rr][c]!;
            cells.push({ row: rr, col: c });
            usedCells.add(`${rr},${c}`);
          }
          if (!startsAcross) {
            clues.push({ word, clue: getClue(word), row: r, col: c, direction: 'down', number, cells });
          } else {
            clues.push({ word, clue: getClue(word), row: r, col: c, direction: 'down', number, cells });
          }
        }
        number++;
      }
    }
  }

  return { grid, clues, size };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CrosswordScreen() {
  const params = useLocalSearchParams<{ level?: string }>();
  const startLevel = Math.max(1, parseInt(String(params.level ?? '1'), 10) || 1);
  const { isDark, accentForeground, onAccent } = useApp();

  const colors = {
    background: isDark ? '#090909' : '#FBFAF8',
    section: isDark ? '#151515' : '#FFFFFF',
    text: isDark ? '#F4F2EE' : '#27241F',
    muted: isDark ? '#AAA59D' : '#8F8A82',
    border: isDark ? '#2A2A2A' : '#ECE9E4',
    accent: accentForeground,
    onAccent,
  };

  const [level, setLevel] = useState(startLevel);
  const prog = progressionFor(level);
  const wordCount = Math.min(3 + level, 8);
  const words = useRef(randomWordsForLevel(level, wordCount)).current;
  const [puzzle] = useState(() => generateCrossword(words));

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showWin, setShowWin] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const cellSize = 26;

  const checkAnswers = useCallback(() => {
    let allCorrect = true;
    for (const clue of puzzle.clues) {
      const key = `${clue.number}-${clue.direction}`;
      const userAnswer = (answers[key] ?? '').toUpperCase();
      if (userAnswer !== clue.word) { allCorrect = false; break; }
    }
    if (allCorrect && puzzle.clues.length > 0) {
      setShowWin(true);
    }
  }, [answers, puzzle.clues]);

  const saveScore = useCallback(async () => {
    if (scoreSaved) return;
    setScoreSaved(true);
    const bonus = Math.max(0, prog.points - Math.floor(elapsed / 10));
    const score = prog.points + bonus;
    await supabase.from('game_scores').insert({
      game: 'crossword',
      player_name: 'Player',
      score,
      mode: 'solo',
      level,
    });
  }, [scoreSaved, prog.points, elapsed, level]);

  useEffect(() => { if (showWin) saveScore(); }, [showWin, saveScore]);

  const handlePlayAgain = () => {
    const nextLevel = level + 1;
    setLevel(nextLevel);
    setShowWin(false);
    setScoreSaved(false);
    setAnswers({});
    setElapsed(0);
  };

  const acrossClues = puzzle.clues.filter((c) => c.direction === 'across');
  const downClues = puzzle.clues.filter((c) => c.direction === 'down');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.push('/modules')} style={[styles.headerBack, { backgroundColor: colors.accent }]} hitSlop={10}>
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.accent }]}>CROSSWORD</Text>
        <View style={[styles.levelPill, { backgroundColor: colors.section, borderColor: colors.border }]}>
          <Text style={[styles.levelText, { color: colors.muted }]}>{difficultyLabelForLevel(level)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Grid */}
        <View style={[styles.gridContainer, { borderColor: colors.border }]}>
          {puzzle.grid.map((row, r) => (
            <View key={r} style={styles.gridRow}>
              {row.map((cell, c) => {
                if (cell === null) return <View key={c} style={[styles.emptyCell, { width: cellSize, height: cellSize }]} />;
                const clue = puzzle.clues.find((cl) => cl.row === r && cl.col === c);
                const number = clue?.number;
                // Find which clue this cell belongs to
                const acrossClue = puzzle.clues.find((cl) => cl.direction === 'across' && cl.cells.some((cc) => cc.row === r && cc.col === c));
                const downClue = puzzle.clues.find((cl) => cl.direction === 'down' && cl.cells.some((cc) => cc.row === r && cc.col === c));
                const acrossKey = acrossClue ? `${acrossClue.number}-across` : '';
                const downKey = downClue ? `${downClue.number}-down` : '';
                const userLetter = (answers[acrossKey] ?? answers[downKey] ?? '')[(acrossClue ? c - acrossClue.col : (downClue ? r - downClue.row : 0))] ?? '';
                return (
                  <View key={c} style={[styles.cell, { width: cellSize, height: cellSize, borderColor: colors.border, backgroundColor: colors.section }]}>
                    {number && <Text style={[styles.cellNumber, { color: colors.muted }]}>{number}</Text>}
                    <Text style={[styles.cellLetter, { color: colors.text }]}>{userLetter}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {/* Clues */}
        <View style={styles.cluesSection}>
          <Text style={[styles.clueSectionTitle, { color: colors.accent }]}>ACROSS</Text>
          {acrossClues.map((clue) => (
            <View key={`${clue.number}-across`} style={styles.clueRow}>
              <Text style={[styles.clueNumber, { color: colors.muted }]}>{clue.number}.</Text>
              <TextInput
                style={[styles.clueInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
                value={answers[`${clue.number}-across`] ?? ''}
                onChangeText={(text) => setAnswers((prev) => ({ ...prev, [`${clue.number}-across`]: text }))}
                placeholder={clue.clue}
                placeholderTextColor={colors.muted}
                maxLength={clue.word.length}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          ))}

          <Text style={[styles.clueSectionTitle, { color: colors.accent, marginTop: 16 }]}>DOWN</Text>
          {downClues.map((clue) => (
            <View key={`${clue.number}-down`} style={styles.clueRow}>
              <Text style={[styles.clueNumber, { color: colors.muted }]}>{clue.number}.</Text>
              <TextInput
                style={[styles.clueInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
                value={answers[`${clue.number}-down`] ?? ''}
                onChangeText={(text) => setAnswers((prev) => ({ ...prev, [`${clue.number}-down`]: text }))}
                placeholder={clue.clue}
                placeholderTextColor={colors.muted}
                maxLength={clue.word.length}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          ))}
        </View>

        <Pressable style={[styles.checkBtn, { backgroundColor: colors.accent }]} onPress={checkAnswers}>
          <Text style={[styles.checkBtnText, { color: colors.onAccent }]}>Check Answers</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showWin} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.section, borderColor: colors.border }]}>
            <Text style={styles.modalEmoji}>⭐</Text>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Crossword Solved!</Text>
            <Text style={[styles.modalSub, { color: colors.muted }]}>{difficultyLabelForLevel(level)} · {elapsed}s</Text>
            <Text style={[styles.modalHint, { color: colors.muted }]}>Next: {difficultyLabelForLevel(level + 1)}</Text>
            <View style={styles.modalBtns}>
              <Pressable style={[styles.btnPrimary, { backgroundColor: colors.accent }]} onPress={handlePlayAgain}>
                <Text style={[styles.btnPrimaryText, { color: colors.onAccent }]}>Next</Text>
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
  levelPill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  levelText: { fontFamily: 'Poppins-Medium', fontSize: 11 },
  scroll: { padding: 16, gap: 16 },
  gridContainer: { borderWidth: 1, alignSelf: 'center', borderRadius: 4, overflow: 'hidden' },
  gridRow: { flexDirection: 'row' },
  emptyCell: { backgroundColor: 'transparent' },
  cell: { borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cellNumber: { position: 'absolute', top: 1, left: 2, fontSize: 7, fontFamily: 'Poppins-Regular' },
  cellLetter: { fontFamily: 'Poppins-Bold', fontSize: 13 },
  cluesSection: { gap: 8 },
  clueSectionTitle: { fontFamily: 'Poppins-SemiBold', fontSize: 12, letterSpacing: 1.5 },
  clueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clueNumber: { fontFamily: 'Poppins-Bold', fontSize: 12, minWidth: 24 },
  clueInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontFamily: 'Poppins-Medium', fontSize: 13 },
  checkBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  checkBtnText: { fontFamily: 'Poppins-Bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1, width: '90%', gap: 8 },
  modalEmoji: { fontSize: 48 },
  modalTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 24 },
  modalSub: { fontFamily: 'Poppins-Medium', fontSize: 15 },
  modalHint: { fontFamily: 'Poppins-Regular', fontSize: 13 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  btnPrimary: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText: { fontFamily: 'Poppins-Bold', fontSize: 15 },
  btnSecondary: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  btnSecondaryText: { fontFamily: 'Poppins-SemiBold', fontSize: 15 },
});
