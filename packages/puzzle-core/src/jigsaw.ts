/**
 * Jigsaw sudoku, 9 x 9 (#397): the boxes are nine connected regions of nine cells each, drawn from
 * the seed. Each row, column and region holds 1 to 9 once. The same exact-cover core as the classic
 * sudoku proves the solution count, so a puzzle has exactly one solution.
 *
 * shortcut: a band is the number of clues left, not the techniques it takes, because the technique
 * solver knows square boxes only; upgrade when `geometry` takes regions.
 */

import { parsePuzzleCode, type Difficulty, type PuzzleId } from './code';
import { searchExactCover, type ExactCoverProblem } from './exact-cover';
import { childSeed, createRandom, type Random } from './random';

export const JIGSAW_SIZE = 9;
const CELLS = JIGSAW_SIZE * JIGSAW_SIZE;
/** The four constraint kinds, each a block of CELLS exact-cover columns, in this order. */
const KIND = { cell: 0, rowValue: 1, columnValue: 2, regionValue: 3, count: 4 } as const;
export const JIGSAW_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** The clues a band leaves: digging stops at this count, so a harder band has fewer. */
export const JIGSAW_CLUES: Readonly<Record<string, number>> = { easy: 38, medium: 32, hard: 28 };

/** Seeded attempts (regions, full grid, digging) before generation gives up with an error. */
const ATTEMPTS = 60;
/**
 * The rows a full grid may try before its regions are dropped: 25 per placement of a digit in a
 * cell. Measured on the Mac (#397): without it one layout of seed 2DB3 took 7 s; with it 80 seeds
 * over two bands each took at most 78 ms.
 */
const GRID_BUDGET = 25 * CELLS * JIGSAW_SIZE;
/** Swaps tried from the boxes, four per cell: over 80 seeds, a puzzle kept at most two square regions (#397). */
const REGION_SWAPS = 4 * CELLS;

export interface JigsawSudoku {
  id: PuzzleId;
  /** The region number 0..8 of each cell, row by row. */
  regions: number[];
  /** Row by row, 0 for an empty cell. */
  givens: number[];
  solution: number[];
}

const neighbours = (cell: number): number[] => {
  const [r, c] = [Math.floor(cell / JIGSAW_SIZE), cell % JIGSAW_SIZE];
  const out: number[] = [];
  if (r > 0) out.push(cell - JIGSAW_SIZE);
  if (r < JIGSAW_SIZE - 1) out.push(cell + JIGSAW_SIZE);
  if (c > 0) out.push(cell - 1);
  if (c < JIGSAW_SIZE - 1) out.push(cell + 1);
  return out;
};

/** One region is one connected piece: every cell of `region` reached from its first. */
function connected(regions: readonly number[], region: number): boolean {
  const first = regions.indexOf(region);
  const seen = new Set<number>([first]);
  const queue = [first];
  while (queue.length) {
    for (const next of neighbours(queue.pop() as number)) {
      if (regions[next] !== region || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size === JIGSAW_SIZE;
}

/**
 * Nine connected regions of nine cells from the seed: the regular 3 x 3 boxes, then seeded swaps
 * of two border cells between neighbouring regions, each kept only when both regions stay in one
 * piece. Every step keeps the regions valid, so it never gets stuck, which growing regions from
 * nine seed cells did for most seeds (#397).
 */
function swapRegions(random: Random): number[] {
  const box = Math.sqrt(JIGSAW_SIZE);
  const regions = Array.from({ length: CELLS }, (_, cell) => {
    const [r, c] = [Math.floor(cell / JIGSAW_SIZE), cell % JIGSAW_SIZE];
    return Math.floor(r / box) * box + Math.floor(c / box);
  });
  for (let i = 0; i < REGION_SWAPS; i++) {
    const a = random.int(CELLS);
    const others = neighbours(a).filter(cell => regions[cell] !== regions[a]);
    if (others.length === 0) continue;
    const [from, to] = [regions[a], regions[random.pick(others)]];
    // A cell of `to` beside `from`, but not beside `a` alone, goes the other way.
    const back = regions.flatMap((owner, cell) =>
      owner === to && neighbours(cell).some(next => next !== a && regions[next] === from) ? [cell] : [],
    );
    if (back.length === 0) continue;
    const b = random.pick(back);
    regions[a] = to;
    regions[b] = from;
    if (!connected(regions, from) || !connected(regions, to)) {
      regions[a] = from;
      regions[b] = to;
    }
  }
  return regions;
}

/** Row r*81 + c*9 + (v-1) places v at (r, c); columns: cell, row-value, column-value, region-value. */
function problemFor(regions: readonly number[]): ExactCoverProblem {
  const n = JIGSAW_SIZE;
  const rows: number[][] = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const [r, c] = [Math.floor(cell / n), cell % n];
    for (let v = 0; v < n; v++) rows.push([
        KIND.cell * CELLS + cell,
        KIND.rowValue * CELLS + r * n + v,
        KIND.columnValue * CELLS + c * n + v,
        KIND.regionValue * CELLS + regions[cell] * n + v,
      ]);
  }
  return { columns: KIND.count * CELLS, rows };
}

const chosenRows = (values: readonly number[]): number[] => {
  const chosen: number[] = [];
  values.forEach((v, cell) => {
    if (v) chosen.push(cell * JIGSAW_SIZE + v - 1);
  });
  return chosen;
};

/** Solutions of a grid (0 for empty) on these regions, counted up to `limit`: 0 none, 1 unique. */
export function countJigsawSolutions(regions: readonly number[], values: readonly number[], limit = 2): number {
  return searchExactCover(problemFor(regions), limit, chosenRows(values)).count;
}

/** The solution of a grid on these regions, or null when it has none. */
export function solveJigsaw(regions: readonly number[], values: readonly number[]): number[] | null {
  const found = searchExactCover(problemFor(regions), 1, chosenRows(values)).first;
  if (!found) return null;
  const out = new Array<number>(CELLS).fill(0);
  for (const row of found) out[Math.floor(row / JIGSAW_SIZE)] = (row % JIGSAW_SIZE) + 1;
  return out;
}

/**
 * A full valid grid on these regions drawn from the seed, or null when the regions admit none or
 * the search passed `GRID_BUDGET` rows: a rare layout takes seconds to fill, so the next attempt's
 * regions are tried instead (#397).
 */
function fullGrid(regions: readonly number[], seed: string): number[] | null {
  const base = problemFor(regions);
  const order = createRandom(seed).shuffle(base.rows.map((_, i) => i));
  const found = searchExactCover({ columns: base.columns, rows: order.map(i => base.rows[i]) }, 1, [], GRID_BUDGET).first;
  if (!found) return null;
  const out = new Array<number>(CELLS).fill(0);
  for (const row of found) {
    const original = order[row];
    out[Math.floor(original / JIGSAW_SIZE)] = (original % JIGSAW_SIZE) + 1;
  }
  return out;
}

/** True when every region is one connected piece of nine cells. */
export function validRegions(regions: readonly number[]): boolean {
  if (regions.length !== CELLS) return false;
  for (let region = 0; region < JIGSAW_SIZE; region++) {
    if (regions.filter(owner => owner === region).length !== JIGSAW_SIZE || !connected(regions, region)) return false;
  }
  return true;
}

function attempt(seed: string, clues: number): Omit<JigsawSudoku, 'id'> | null {
  const regions = swapRegions(createRandom(childSeed(seed, 'regions')));
  const solution = fullGrid(regions, childSeed(seed, 'grid'));
  if (!solution) return null;
  const givens = solution.slice();
  let left = CELLS;
  for (const cell of createRandom(childSeed(seed, 'remove')).shuffle(givens.map((_, i) => i))) {
    if (left <= clues) break;
    const value = givens[cell];
    givens[cell] = 0;
    if (countJigsawSolutions(regions, givens) === 1) left--;
    else givens[cell] = value;
  }
  return left <= clues ? { regions, givens, solution } : null;
}

/**
 * A jigsaw sudoku from the seed and band: the same arguments always give the same puzzle, with
 * exactly one solution. Throws on a band not offered.
 */
export function generateJigsawSudoku(seed: string, difficulty: Difficulty): JigsawSudoku {
  const clues = JIGSAW_CLUES[difficulty];
  if (!JIGSAW_BANDS.includes(difficulty)) throw new RangeError(`a jigsaw sudoku offers ${JIGSAW_BANDS.join(', ')}, not ${difficulty}`);
  for (let i = 0; i < ATTEMPTS; i++) {
    const made = attempt(childSeed(seed, i), clues);
    if (made) return { id: { game: 'jigsaw-sudoku', size: String(JIGSAW_SIZE), difficulty, seed }, ...made };
  }
  throw new Error(`no ${difficulty} jigsaw sudoku from seed «${seed}» in ${ATTEMPTS} attempts`);
}

/** The jigsaw sudoku a puzzle code names (`JS-9-E-7K2Q9X`), the same one every time (#397). */
export function jigsawFromCode(code: string): JigsawSudoku {
  const id = parsePuzzleCode(code);
  if (id.game !== 'jigsaw-sudoku' || id.size !== String(JIGSAW_SIZE)) throw new RangeError(`«${code}» is not a jigsaw sudoku code`);
  return generateJigsawSudoku(id.seed, id.difficulty);
}
