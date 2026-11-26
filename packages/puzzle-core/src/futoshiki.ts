/**
 * Futoshiki (#390): a Latin square of 4 x 4 to 7 x 7, with some digits given and some inequality
 * signs between neighbouring cells. The method follows the one Simon Tatham's Unequal describes
 * (a full Latin square drawn from the seed, then clues removed in a seeded order while a graded
 * solver still finishes it, which proves one solution); the code is our own, written from the
 * rules. A cell is named by its index, `row * size + column`, as the page and the check name it.
 */

import { type Difficulty, type PuzzleId } from './code';
import { searchExactCover, type ExactCoverProblem } from './exact-cover';
import { childSeed, createRandom } from './random';

/**
 * The sizes offered, with the bands each can reach: a band is offered only where the attempts
 * found it for every seed tried (a 4 x 4 is finished by bounds and singles alone, and a 6 x 6
 * rarely needs subsets of three).
 */
export const FUTOSHIKI_SIZES: Readonly<Record<number, readonly Difficulty[]>> = {
  4: ['easy'],
  5: ['easy', 'medium'],
  6: ['easy', 'medium'],
  7: ['easy', 'medium', 'hard'],
};

/** One inequality between two neighbouring cells: the value at `less` is smaller than at `greater`. */
export interface FutoshikiSign {
  readonly less: number;
  readonly greater: number;
}

export interface FutoshikiRating {
  difficulty: Difficulty;
  givens: number;
  signs: number;
}

export interface Futoshiki {
  id: PuzzleId;
  size: number;
  /** Row by row, 0 for an empty cell. */
  givens: number[];
  /** In the order the page draws them: by the first cell, the right neighbour before the lower one. */
  signs: FutoshikiSign[];
  solution: number[];
  rating: FutoshikiRating;
}

/** How many seeded attempts a band gets before generation gives up with an error. */
const FUTOSHIKI_ATTEMPTS = 60;

/**
 * The solver's technique levels, cheapest first; a puzzle's band is the highest level it needs.
 * Bounds and singles: a placed digit leaves its row and column, a digit with one place in a row or
 * column goes there, and a sign keeps each side below or above the other's range. Pairs: two
 * cells of a row or column that hold the same two digits, or two digits that fit only two cells.
 * Subsets: the same for three or more.
 */
const LEVELS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
const PAIR = 2;
const FIRST_SUBSET = 3;

const bit = (value: number): number => 1 << (value - 1);

function popcount(mask: number): number {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count++;
  return count;
}

const WORD_BITS = 32;
/** The highest digit in a mask, or 0 for an empty one: digit v is bit v - 1. */
const highest = (mask: number): number => WORD_BITS - Math.clz32(mask);
/** The lowest digit in a mask, or 0 for an empty one. */
const lowest = (mask: number): number => highest(mask & -mask);

const unitCache = new Map<number, number[][]>();

/** The rows, then the columns, each as its cell indices. */
function unitsOf(size: number): number[][] {
  const known = unitCache.get(size);
  if (known) return known;
  const units: number[][] = [];
  for (let r = 0; r < size; r++) units.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) units.push(Array.from({ length: size }, (_, r) => r * size + c));
  unitCache.set(size, units);
  return units;
}

/** Every sign between neighbours a solution allows, in page order. */
export function futoshikiSignsOf(size: number, solution: readonly number[]): FutoshikiSign[] {
  const signs: FutoshikiSign[] = [];
  const add = (a: number, b: number) => signs.push(solution[a] < solution[b] ? { less: a, greater: b } : { less: b, greater: a });
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = r * size + c;
      if (c + 1 < size) add(cell, cell + 1);
      if (r + 1 < size) add(cell, cell + size);
    }
  }
  return signs;
}

function checkClues(size: number, givens: readonly number[], signs: readonly FutoshikiSign[]): void {
  if (givens.length !== size * size) throw new RangeError(`a ${size} x ${size} futoshiki needs ${size * size} cells, not ${givens.length}`);
  givens.forEach((v, cell) => {
    if (!Number.isInteger(v) || v < 0 || v > size) throw new RangeError(`cell ${cell} holds ${v}, not 0 to ${size}`);
  });
  for (const { less, greater } of signs) {
    const [a, b] = [Math.min(less, greater), Math.max(less, greater)];
    const neighbours = (b - a === 1 && a % size !== size - 1) || b - a === size;
    if (!neighbours || a < 0 || b >= size * size) throw new RangeError(`cells ${less} and ${greater} are not neighbours`);
  }
}

function startCandidates(size: number, givens: readonly number[]): number[] {
  const all = (1 << size) - 1;
  return givens.map(v => (v ? bit(v) : all));
}

type Step = 'progress' | 'stuck' | 'contradiction';

/** One pass of bounds and singles over the candidates, in place. */
function boundsAndSingles(size: number, cand: number[], signs: readonly FutoshikiSign[]): Step {
  let changed = false;
  const remove = (cell: number, mask: number): boolean => {
    if (!(cand[cell] & mask)) return true;
    cand[cell] &= ~mask;
    changed = true;
    return cand[cell] !== 0;
  };
  for (const unit of unitsOf(size)) {
    for (const cell of unit) {
      if (popcount(cand[cell]) !== 1) continue;
      for (const peer of unit) if (peer !== cell && !remove(peer, cand[cell])) return 'contradiction';
    }
    for (let v = 1; v <= size; v++) {
      let place = -1;
      let places = 0;
      for (const cell of unit) {
        if (cand[cell] & bit(v)) {
          place = cell;
          places++;
        }
      }
      if (places === 0) return 'contradiction';
      if (places === 1 && cand[place] !== bit(v)) {
        cand[place] = bit(v);
        changed = true;
      }
    }
  }
  for (const { less, greater } of signs) {
    // Every digit of `less` from the top of `greater` up, and of `greater` from the bottom of `less` down.
    const top = highest(cand[greater]);
    const bottom = lowest(cand[less]);
    if (!remove(less, ~(bit(top) - 1))) return 'contradiction';
    if (!remove(greater, (bit(bottom) << 1) - 1)) return 'contradiction';
  }
  return changed ? 'progress' : 'stuck';
}

/** The k-cell combinations of a list, in order. */
function combinations(items: readonly number[], k: number, from = 0, chosen: number[] = [], out: number[][] = []): number[][] {
  if (chosen.length === k) {
    out.push(chosen.slice());
    return out;
  }
  for (let i = from; i <= items.length - (k - chosen.length); i++) {
    chosen.push(items[i]);
    combinations(items, k, i + 1, chosen, out);
    chosen.pop();
  }
  return out;
}

/**
 * Naked and hidden subsets of k in each row and column: k open cells that hold only k digits
 * between them keep those digits; k digits that fit only k cells keep those cells.
 */
function subsets(size: number, cand: number[], k: number): boolean {
  let changed = false;
  for (const unit of unitsOf(size)) {
    const open = unit.filter(cell => popcount(cand[cell]) > 1);
    if (open.length <= k) continue;
    for (const group of combinations(open, k)) {
      let union = 0;
      for (const cell of group) union |= cand[cell];
      if (popcount(union) !== k) continue;
      for (const cell of open) {
        if (!group.includes(cell) && cand[cell] & union) {
          cand[cell] &= ~union;
          changed = true;
        }
      }
    }
    const digits: number[] = [];
    let placed = 0;
    for (const cell of unit) if (popcount(cand[cell]) === 1) placed |= cand[cell];
    for (let v = 1; v <= size; v++) if (!(placed & bit(v))) digits.push(v);
    for (const group of combinations(digits, k)) {
      let mask = 0;
      for (const v of group) mask |= bit(v);
      const cells = open.filter(cell => cand[cell] & mask);
      if (cells.length !== k) continue;
      for (const cell of cells) {
        if (cand[cell] & ~mask) {
          cand[cell] &= mask;
          changed = true;
        }
      }
    }
  }
  return changed;
}

interface Deduction {
  /** True when the techniques up to the level placed every digit. */
  solved: boolean;
  /** The highest level the deduction needed. */
  level: number;
  cand: number[];
}

/** Runs the techniques up to `maxLevel`, the cheapest first after each step, until none progresses. */
function deduce(size: number, givens: readonly number[], signs: readonly FutoshikiSign[], maxLevel: number): Deduction {
  const cand = startCandidates(size, givens);
  let level = 0;
  for (;;) {
    const step = boundsAndSingles(size, cand, signs);
    if (step === 'contradiction') return { solved: false, level, cand };
    if (step === 'progress') continue;
    if (cand.every(mask => popcount(mask) === 1)) return { solved: true, level, cand };
    let progressed = false;
    if (maxLevel >= 1 && subsets(size, cand, PAIR)) {
      level = Math.max(level, 1);
      progressed = true;
    }
    for (let k = FIRST_SUBSET; !progressed && maxLevel >= 2 && k < size - 1; k++) {
      if (subsets(size, cand, k)) {
        level = Math.max(level, 2);
        progressed = true;
      }
    }
    if (!progressed) return { solved: false, level, cand };
  }
}

/** The band of a puzzle: the lowest level whose techniques finish it, or null when none does. */
export function rateFutoshiki(size: number, givens: readonly number[], signs: readonly FutoshikiSign[]): Difficulty | null {
  checkClues(size, givens, signs);
  for (let level = 0; level < LEVELS.length; level++) if (deduce(size, givens, signs, level).solved) return LEVELS[level];
  return null;
}

/** Solutions of a puzzle counted up to `limit` by search: 0 none, 1 unique, 2 or more. */
export function countFutoshikiSolutions(size: number, givens: readonly number[], signs: readonly FutoshikiSign[], limit = 2): number {
  checkClues(size, givens, signs);
  let count = 0;
  const search = (cand: number[]): void => {
    for (;;) {
      const step = boundsAndSingles(size, cand, signs);
      if (step === 'contradiction') return;
      if (step === 'stuck') break;
    }
    let pick = -1;
    for (let cell = 0; cell < cand.length; cell++) {
      const n = popcount(cand[cell]);
      if (n > 1 && (pick < 0 || n < popcount(cand[pick]))) pick = cell;
    }
    if (pick < 0) {
      count++;
      return;
    }
    for (let v = 1; v <= size && count < limit; v++) {
      if (!(cand[pick] & bit(v))) continue;
      const next = cand.slice();
      next[pick] = bit(v);
      search(next);
    }
  };
  search(startCandidates(size, givens));
  return count;
}

/** The one solution of a puzzle, or null when it has none or more than one. */
export function solveFutoshiki(size: number, givens: readonly number[], signs: readonly FutoshikiSign[]): number[] | null {
  if (countFutoshikiSolutions(size, givens, signs) !== 1) return null;
  // Graded techniques may stall, so the search finds the digits; it is fast at these sizes.
  const solution = givens.slice();
  for (let cell = 0; cell < solution.length; cell++) {
    if (solution[cell]) continue;
    for (let v = 1; v <= size; v++) {
      solution[cell] = v;
      if (countFutoshikiSolutions(size, solution, signs, 1) === 1) break;
    }
  }
  return solution;
}

const problems = new Map<number, ExactCoverProblem>();

/** The three constraint kinds of a Latin square, each a block of n * n exact-cover columns, in this order. */
const LATIN = { cell: 0, rowValue: 1, columnValue: 2, kinds: 3 } as const;

/** Row r*n*n + c*n + (v-1) places v at (r, c); columns are cell, row-value and column-value. */
function latinProblem(size: number): ExactCoverProblem {
  const known = problems.get(size);
  if (known) return known;
  const area = size * size;
  const rows: number[][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (let v = 0; v < size; v++) rows.push([LATIN.cell * area + r * size + c, LATIN.rowValue * area + r * size + v, LATIN.columnValue * area + c * size + v]);
    }
  }
  const problem = { columns: LATIN.kinds * area, rows };
  problems.set(size, problem);
  return problem;
}

function latinSquare(size: number, seed: string): number[] {
  const base = latinProblem(size);
  const order = createRandom(seed).shuffle(base.rows.map((_, i) => i));
  const found = searchExactCover({ columns: base.columns, rows: order.map(i => base.rows[i]) }, 1).first;
  if (!found) throw new Error(`no ${size} x ${size} Latin square`); // cannot happen: one exists for every size
  const out = new Array<number>(size * size).fill(0);
  for (const row of found) {
    const original = order[row];
    out[Math.floor(original / size)] = (original % size) + 1;
  }
  return out;
}

type Clue = { kind: 'given'; cell: number } | { kind: 'sign'; index: number };

function attempt(size: number, seed: string, level: number): { givens: number[]; signs: FutoshikiSign[]; solution: number[]; level: number } {
  const solution = latinSquare(size, childSeed(seed, 'square'));
  const allSigns = futoshikiSignsOf(size, solution);
  const givens = solution.slice();
  const kept = allSigns.map(() => true);
  const clues: Clue[] = [
    ...givens.map((_, cell) => ({ kind: 'given', cell }) as const),
    ...allSigns.map((_, index) => ({ kind: 'sign', index }) as const),
  ];
  const signsNow = () => allSigns.filter((_, i) => kept[i]);
  const random = createRandom(childSeed(seed, 'remove'));
  // The givens go first, so the signs carry the puzzle, as printed futoshikis do.
  const order = [...random.shuffle(clues.filter(c => c.kind === 'given')), ...random.shuffle(clues.filter(c => c.kind === 'sign'))];
  for (const clue of order) {
    // A puzzle the techniques finish has exactly one solution: each step is forced, and the clues
    // come from a full square. A clue is removed only while the band's techniques still finish it.
    if (clue.kind === 'given') {
      const value = givens[clue.cell];
      givens[clue.cell] = 0;
      if (!deduce(size, givens, signsNow(), level).solved) givens[clue.cell] = value;
    } else {
      kept[clue.index] = false;
      if (!deduce(size, givens, signsNow(), level).solved) kept[clue.index] = true;
    }
  }
  const signs = signsNow();
  let needed = 0;
  while (!deduce(size, givens, signs, needed).solved) needed++;
  return { givens, signs, solution, level: needed };
}

function offered(size: number, difficulty: Difficulty): number {
  const bands = FUTOSHIKI_SIZES[size];
  if (!bands) throw new RangeError(`futoshiki size ${size} is not offered: ${Object.keys(FUTOSHIKI_SIZES).join(', ')}`);
  if (!bands.includes(difficulty)) throw new RangeError(`a ${size} x ${size} futoshiki offers ${bands.join(', ')}, not ${difficulty}`);
  return LEVELS.indexOf(difficulty);
}

/**
 * A futoshiki of the given size and band from the seed: the same three arguments always give the
 * same puzzle. Attempt after attempt digs a Latin square until the band is exact. Throws on a
 * size not offered or a band the size cannot reach.
 *
 * shortcut: it digs on the tablet, about 1.1 s CPU on average and 3.2 s at worst for a 7 x 7 hard
 * over 20 seeds under `node --jitless` (2026-11-26); move it to a bank, as sudoku's, if the device
 * round finds it slow.
 */
export function generateFutoshiki(seed: string, size: number, difficulty: Difficulty): Futoshiki {
  const level = offered(size, difficulty);
  for (let i = 0; i < FUTOSHIKI_ATTEMPTS; i++) {
    const made = attempt(size, childSeed(seed, i), level);
    if (made.level !== level) continue;
    const rating = { difficulty, givens: made.givens.filter(v => v > 0).length, signs: made.signs.length };
    return { id: { game: 'futoshiki', size: String(size), difficulty, seed }, size, givens: made.givens, signs: made.signs, solution: made.solution, rating };
  }
  throw new Error(`no ${difficulty} ${size} x ${size} futoshiki from seed «${seed}» in ${FUTOSHIKI_ATTEMPTS} attempts`);
}
