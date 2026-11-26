/**
 * Classic sudoku from 4 x 4 to 16 x 16 (#380): a full grid drawn from the seed, then clues removed
 * in a seeded order while the puzzle keeps exactly one solution (exact cover) and its rating stays
 * within the band asked for. The result is our own model; drawing it is the page renderer's job.
 */

import { type Difficulty, type PuzzleId } from './code';
import { searchExactCover, type ExactCoverProblem } from './exact-cover';
import { childSeed, createRandom } from './random';
import { bandRank, rateSudoku, type SudokuRating, type SudokuShape } from './sudoku-techniques';

/**
 * The sizes offered and their boxes (rows x columns), with the bands each one can reach: a band is
 * offered only where the attempts found it for every seed tried (a 6 x 6 rarely needs more than singles).
 */
export const SUDOKU_SIZES: Readonly<Record<number, SudokuShape & { bands: readonly Difficulty[] }>> = {
  4: { size: 4, boxRows: 2, boxCols: 2, bands: ['easy'] },
  6: { size: 6, boxRows: 2, boxCols: 3, bands: ['easy'] },
  8: { size: 8, boxRows: 2, boxCols: 4, bands: ['easy', 'medium'] },
  9: { size: 9, boxRows: 3, boxCols: 3, bands: ['easy', 'medium', 'hard', 'expert'] },
  10: { size: 10, boxRows: 2, boxCols: 5, bands: ['easy', 'medium', 'hard'] },
  12: { size: 12, boxRows: 3, boxCols: 4, bands: ['easy', 'medium', 'hard'] },
  16: { size: 16, boxRows: 4, boxCols: 4, bands: ['easy', 'medium', 'hard'] },
};

export interface Sudoku {
  id: PuzzleId;
  shape: SudokuShape;
  /** Row by row, 0 for an empty cell. */
  givens: number[];
  solution: number[];
  rating: SudokuRating;
}

/** How many seeded attempts a band gets before generation gives up with an error. */
const SUDOKU_ATTEMPTS = 230;

const problems = new Map<number, ExactCoverProblem>();

/** The four constraint kinds of a sudoku, each a block of n * n exact-cover columns, in this order. */
const CONSTRAINT = { cell: 0, rowValue: 1, columnValue: 2, boxValue: 3, kinds: 4 } as const;

/** Row r*n*n + c*n + (v-1) places v at (r, c); columns are cell, row-value, column-value, box-value. */
function problemFor(shape: SudokuShape): ExactCoverProblem {
  const known = problems.get(shape.size);
  if (known) return known;
  const n = shape.size;
  const area = n * n;
  const rows: number[][] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const box = Math.floor(r / shape.boxRows) * (n / shape.boxCols) + Math.floor(c / shape.boxCols);
      for (let v = 0; v < n; v++) {
        rows.push([
          CONSTRAINT.cell * area + r * n + c,
          CONSTRAINT.rowValue * area + r * n + v,
          CONSTRAINT.columnValue * area + c * n + v,
          CONSTRAINT.boxValue * area + box * n + v,
        ]);
      }
    }
  }
  const problem = { columns: CONSTRAINT.kinds * area, rows };
  problems.set(shape.size, problem);
  return problem;
}

const chosenRows = (n: number, values: readonly number[]): number[] => {
  const chosen: number[] = [];
  values.forEach((v, cell) => {
    if (v) chosen.push(cell * n + v - 1);
  });
  return chosen;
};

/** Solutions of a grid (0 for empty), counted up to `limit`: 0 none, 1 unique, 2 or more. */
export function countSudokuSolutions(shape: SudokuShape, values: readonly number[], limit = 2): number {
  return searchExactCover(problemFor(shape), limit, chosenRows(shape.size, values)).count;
}

/** The one solution of a grid, or null when it has none. */
export function solveSudoku(shape: SudokuShape, values: readonly number[]): number[] | null {
  const n = shape.size;
  const found = searchExactCover(problemFor(shape), 1, chosenRows(n, values)).first;
  if (!found) return null;
  const out = new Array<number>(n * n).fill(0);
  for (const row of found) out[Math.floor(row / n)] = (row % n) + 1;
  return out;
}

function fullGrid(shape: SudokuShape, seed: string): number[] {
  const random = createRandom(seed);
  const base = problemFor(shape);
  const order = random.shuffle(base.rows.map((_, i) => i));
  const found = searchExactCover({ columns: base.columns, rows: order.map(i => base.rows[i]) }, 1).first;
  if (!found) throw new Error(`no full ${shape.size} x ${shape.size} grid`); // cannot happen for a valid shape
  const n = shape.size;
  const out = new Array<number>(n * n).fill(0);
  for (const row of found) {
    const original = order[row];
    out[Math.floor(original / n)] = (original % n) + 1;
  }
  return out;
}

function attempt(shape: SudokuShape, seed: string, difficulty: Difficulty): { givens: number[]; solution: number[]; rating: SudokuRating } {
  const solution = fullGrid(shape, childSeed(seed, 'grid'));
  const givens = solution.slice();
  const random = createRandom(childSeed(seed, 'remove'));
  for (const cell of random.shuffle(givens.map((_, i) => i))) {
    const value = givens[cell];
    givens[cell] = 0;
    if (countSudokuSolutions(shape, givens) !== 1) {
      givens[cell] = value;
      continue;
    }
    const rating = rateSudoku(shape, givens, difficulty);
    if (rating.difficulty === null) givens[cell] = value;
  }
  return { givens, solution, rating: rateSudoku(shape, givens) };
}

/**
 * A sudoku of the given size and band from the seed: the same three arguments always give the same
 * puzzle. Throws on a size not offered, a band the size cannot reach, or when the attempts run out.
 */
export function generateSudoku(seed: string, size: number, difficulty: Difficulty): Sudoku {
  const offered = SUDOKU_SIZES[size];
  if (!offered) throw new RangeError(`sudoku size ${size} is not offered: ${Object.keys(SUDOKU_SIZES).join(', ')}`);
  if (!offered.bands.includes(difficulty)) {
    throw new RangeError(`a ${size} x ${size} sudoku offers ${offered.bands.join(', ')}, not ${difficulty}`);
  }
  const shape: SudokuShape = { size: offered.size, boxRows: offered.boxRows, boxCols: offered.boxCols };
  for (let i = 0; i < SUDOKU_ATTEMPTS; i++) {
    const made = attempt(shape, childSeed(seed, i), difficulty);
    if (made.rating.difficulty !== null && bandRank(made.rating.difficulty) === bandRank(difficulty)) {
      return { id: { game: 'sudoku', size: String(size), difficulty, seed }, shape, ...made };
    }
  }
  throw new Error(`no ${difficulty} ${size} x ${size} sudoku from seed «${seed}» in ${SUDOKU_ATTEMPTS} attempts`);
}
