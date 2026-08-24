// Shared helpers for solo games: progressive levels + safe random word lists.

export type SoloProgression = {
  level: number;
  label: string;
  points: number;
};

// Progressive difficulty: each level increases the challenge.
// Level 1 is the gentlest; higher levels add more complexity.
export function progressionFor(level: number): SoloProgression {
  const safeLevel = Math.max(1, level);
  return {
    level: safeLevel,
    label: `Level ${safeLevel}`,
    points: 50 * safeLevel,
  };
}

// Map a numeric level to a difficulty label (easy / medium / hard).
export function difficultyLabelForLevel(level: number): 'Easy' | 'Medium' | 'Hard' {
  const safeLevel = Math.max(1, level);
  if (safeLevel <= 2) return 'Easy';
  if (safeLevel <= 4) return 'Medium';
  return 'Hard';
}

// Curated, family-safe word bank. No insults, slurs, or inappropriate terms.
// Grouped by rough difficulty tiers so higher levels pull from harder pools.
export const WORD_BANK: Record<'easy' | 'medium' | 'hard', string[]> = {
  easy: [
    'apple', 'bread', 'chair', 'dance', 'eagle', 'flame', 'globe', 'honey',
    'island', 'jolly', 'knife', 'lemon', 'mango', 'noble', 'ocean', 'piano',
    'quiet', 'river', 'smile', 'tiger', 'umbra', 'vivid', 'water', 'youth',
    'zebra', 'beach', 'cloud', 'dream', 'fairy', 'garden', 'heart', 'light',
  ],
  medium: [
    'balcony', 'cabinet', 'dolphin', 'emerald', 'feather', 'gravity', 'harvest',
    'journey', 'kingdom', 'lantern', 'meadow', 'nectar', 'octopus', 'panther',
    'quartz', 'rainbow', 'sapphire', 'thunder', 'unicorn', 'violet', 'whisper',
    'cascade', 'horizon', 'jubilee', 'kindle', 'lullaby', 'mariner', 'novella',
  ],
  hard: [
    'adventure', 'butterfly', 'chandelier', 'discovery', 'elephantine',
    'firefly', 'gazebo', 'huckleberry', 'illuminate', 'kaleidoscope',
    'lighthouse', 'mountaineer', 'nightingale', 'orchestra', 'parliament',
    'quicksilver', 'reflection', 'silhouette', 'trembling', 'undercurrent',
    'volunteer', 'wanderlust', 'xylophonist', 'yesterday', 'zephyr',
  ],
};

// Pick `count` random unique words for a given level.
// Higher levels mix in harder words and pull more words.
export function randomWordsForLevel(level: number, count?: number): string[] {
  const safeLevel = Math.max(1, level);
  const easy = WORD_BANK.easy;
  const medium = WORD_BANK.medium;
  const hard = WORD_BANK.hard;

  let pool: string[];
  if (safeLevel <= 2) {
    pool = easy;
  } else if (safeLevel <= 5) {
    pool = [...easy, ...medium];
  } else {
    pool = [...easy, ...medium, ...hard];
  }

  const wordCount = count ?? Math.min(4 + safeLevel, 10);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(wordCount, shuffled.length)).map((w) => w.toUpperCase());
}

// Random integer in [min, max] inclusive.
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Shuffle an array (returns a new array).
export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─── Sudoku generator ──────────────────────────────────────────────────────────
// Generates a random solvable 9x9 Sudoku puzzle + solution.
// `clues` controls how many cells are pre-filled (fewer = harder).

function isValidPlacement(grid: number[][], row: number, col: number, num: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (grid[row][i] === num || grid[i][col] === num) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[r][c] === num) return false;
    }
  }
  return true;
}

function fillGrid(grid: number[][]): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const num of nums) {
          if (isValidPlacement(grid, row, col, num)) {
            grid[row][col] = num;
            if (fillGrid(grid)) return true;
            grid[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

export type SudokuPuzzle = { puzzle: number[]; solution: number[] };

export function generateSudoku(level: number): SudokuPuzzle {
  // Clues: level 1 = ~40, level 2 = ~34, level 3 = ~30, level 4+ = ~26
  const clues = Math.max(24, 44 - level * 4);

  const grid: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  fillGrid(grid);

  const solution: number[] = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) solution.push(grid[r][c]);

  // Remove cells to create the puzzle
  const puzzle = [...solution];
  const indices = shuffle(Array.from({ length: 81 }, (_, i) => i));
  const toRemove = 81 - clues;
  for (let i = 0; i < toRemove; i++) {
    puzzle[indices[i]] = 0;
  }

  return { puzzle, solution };
}
