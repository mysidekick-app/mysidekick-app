import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';
import { randomWordsForLevel, progressionFor, randInt, shuffle, difficultyLabelForLevel } from '@/components/games-utils';

// ─── Word Search Generator ─────────────────────────────────────────────────────

type Placement = { word: string; row: number; col: number; dr: number; dc: number; cells: number[] };

function generateGrid(words: string[], gridSize: number): { grid: string[]; placements: Placement[] } {
  const grid: string[] = Array(gridSize * gridSize).fill('');
  const placements: Placement[] = [];
  const directions = shuffle([[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]]);

  for (const word of words) {
    let placed = false;
    for (let attempt = 0; attempt < 100 && !placed; attempt++) {
      const [dr, dc] = directions[attempt % directions.length];
      const maxRow = dr > 0 ? gridSize - word.length : dr < 0 ? word.length - 1 : gridSize - 1;
      const minRow = dr < 0 ? word.length - 1 : 0;
      const maxCol = dc > 0 ? gridSize - word.length : dc < 0 ? word.length - 1 : gridSize - 1;
      const minCol = dc < 0 ? word.length - 1 : 0;
      const row = randInt(minRow, maxRow);
      const col = randInt(minCol, maxCol);

      let canPlace = true;
      const cells: number[] = [];
      for (let i = 0; i < word.length; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        const idx = r * gridSize + c;
        if (grid[idx] !== '' && grid[idx] !== word[i]) { canPlace = false; break; }
        cells.push(idx);
      }
      if (canPlace) {
        for (let i = 0; i < word.length; i++) {
          const r = row + dr * i;
          const c = col + dc * i;
          grid[r * gridSize + c] = word[i];
        }
        placements.push({ word, row, col, dr, dc, cells });
        placed = true;
      }
    }
  }

  // Fill empty cells with random letters
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === '') grid[i] = letters[Math.floor(Math.random() * letters.length)];
  }

  return { grid, placements };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WordSearchScreen() {
  const params = useLocalSearchParams<{ level?: string }>();
  const startLevel = Math.max(1, parseInt(String(params.level ?? '1'), 10) || 1);
  const { isDark, accentForeground, onAccent } = useApp();
  const { width } = useWindowDimensions();

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
  const gridSize = Math.min(8 + Math.floor(level / 2), 12);
  const wordCount = Math.min(4 + level, 10);
  const words = useRef(randomWordsForLevel(level, wordCount)).current;
  const [puzzle] = useState(() => generateGrid(words, gridSize));

  const [selectedCells, setSelectedCells] = useState<Set<number>>(new Set());
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [showWin, setShowWin] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const cellSize = Math.floor((width - 32) / gridSize);

  const handleCellPress = useCallback((index: number) => {
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const checkSelection = useCallback(() => {
    if (selectedCells.size < 2) return;
    const sorted = [...selectedCells].sort((a, b) => a - b);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const r1 = Math.floor(first / gridSize); const c1 = first % gridSize;
    const r2 = Math.floor(last / gridSize); const c2 = last % gridSize;
    const dr = Math.sign(r2 - r1); const dc = Math.sign(c2 - c1);
    const len = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1)) + 1;

    if (len < 2) { setSelectedCells(new Set()); return; }

    const cells: number[] = [];
    for (let i = 0; i < len; i++) {
      cells.push((r1 + dr * i) * gridSize + (c1 + dc * i));
    }

    const word = cells.map((i) => puzzle.grid[i]).join('');
    const reversed = word.split('').reverse().join('');

    for (const placement of puzzle.placements) {
      if (placement.word === word || placement.word === reversed) {
        const newFound = new Set(foundWords);
        newFound.add(placement.word);
        setFoundWords(newFound);
        if (newFound.size === puzzle.placements.length) {
          setShowWin(true);
        }
        break;
      }
    }
    setSelectedCells(new Set());
  }, [selectedCells, gridSize, puzzle, foundWords]);

  const saveScore = useCallback(async () => {
    if (scoreSaved) return;
    setScoreSaved(true);
    const bonus = Math.max(0, prog.points - Math.floor(elapsed / 10));
    const score = prog.points + bonus;
    const { data: { user } } = await supabase.auth.getUser();
    const playerId = user?.id;
    if (!playerId) return;
    await supabase.from('game_scores').insert({
      player_id: playerId,
      game: 'wordsearch',
      mode: 'solo',
      points: score,
      level,
    });
  }, [scoreSaved, prog.points, elapsed, level]);

  useEffect(() => { if (showWin) saveScore(); }, [showWin, saveScore]);

  const handlePlayAgain = () => {
    const nextLevel = level + 1;
    setLevel(nextLevel);
    setShowWin(false);
    setScoreSaved(false);
    setFoundWords(new Set());
    setSelectedCells(new Set());
    setElapsed(0);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.push('/modules')} style={[styles.headerBack, { backgroundColor: colors.accent }]} hitSlop={10}>
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.accent }]}>WORD SEARCH</Text>
        <View style={[styles.levelPill, { backgroundColor: colors.section, borderColor: colors.border }]}>
          <Text style={[styles.levelText, { color: colors.muted }]}>{difficultyLabelForLevel(level)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Words to find */}
        <View style={styles.wordsRow}>
          {words.map((w) => (
            <View key={w} style={[styles.wordChip, { backgroundColor: foundWords.has(w) ? colors.accent : colors.section, borderColor: foundWords.has(w) ? colors.accent : colors.border }]}>
              <Text style={[styles.wordChipText, { color: foundWords.has(w) ? colors.onAccent : colors.text }, foundWords.has(w) && { textDecorationLine: 'line-through' }]}>{w}</Text>
            </View>
          ))}
        </View>

        {/* Grid */}
        <View style={[styles.grid, { width: cellSize * gridSize }]}>
          {puzzle.grid.map((letter, index) => {
            const isSelected = selectedCells.has(index);
            return (
              <Pressable
                key={index}
                onPress={() => handleCellPress(index)}
                style={[styles.cell, { width: cellSize, height: cellSize, backgroundColor: isSelected ? colors.accent : colors.section, borderColor: colors.border }]}
              >
                <Text style={[styles.cellText, { color: isSelected ? colors.onAccent : colors.text }]}>{letter}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Check button */}
        <Pressable style={[styles.checkBtn, { backgroundColor: colors.accent }]} onPress={checkSelection}>
          <Text style={[styles.checkBtnText, { color: colors.onAccent }]}>Check Word</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showWin} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.section, borderColor: colors.border }]}>
            <Text style={styles.modalEmoji}>⭐</Text>
            <Text style={[styles.modalTitle, { color: colors.text }]}>All Words Found!</Text>
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
  wordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  wordChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  wordChipText: { fontFamily: 'Poppins-Medium', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  cell: { borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontFamily: 'Poppins-Bold', fontSize: 14 },
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