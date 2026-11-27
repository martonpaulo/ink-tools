/**
 * Binairo (#393): a square grid of 0s and 1s where no line holds three alike in a row, each line
 * holds as many 0s as 1s, and no two rows and no two columns are the same. Written from the rules,
 * after the approach of Tatham's Unruly (MIT): fill a valid grid, then remove givens while the
 * solver still finishes it at the band's level.
 *
 * The band comes from the solve: `easy` when the local rules finish it (a pair or a gap forces its
 * neighbour, a line with half its cells of one value takes the other value in the rest), `medium`
 * when it also needs line solving (every valid line that fits a row or column at once, with no
 * line equal to a full one), `hard` when it also needs probing (a cell whose one value breaks a
 * line). A puzzle that still needs a guess is never offered.
 *
 * On the page a given 1 is a black disc and a given 0 a white one; the player shades a 1 and dots
 * or crosses a 0, so «Check» reads the ink without recognition.
 *
 * A new page of a slow size and band comes from `binairo-bank.ts` (#552): a 12 x 12 hard took
 * 9.5 s on the tablet.
 */

import { BINAIRO_BANK } from './binairo-bank';
import { parsePuzzleCode, type Difficulty, type PuzzleId } from './code';
import { childSeed, createRandom, type Random } from './random';
import { bankPair, findInBank, pickFromBank, type SeedBankEntry } from './seed-bank';
import { classifyMark, marksByCell, type InkStroke } from './check/cells';
import { type CheckResult } from './check/read';
import { drawFooter, drawIcon, drawSquareLattice, createPage, fitCellMm, layoutPage, type Hand, type Orientation, type FooterText, type PageLayout, type Raster, type CellPreset } from './page';

export const BINAIRO_SIDES: readonly number[] = [6, 8, 10, 12]; // a hard 14 x 14 took 2.6 s under node --jitless (#393)
export const BINAIRO_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** A cell no value is known for; a known cell holds 0 or 1. */
export const BINAIRO_OPEN = -1;

export interface Binairo {
  id: PuzzleId;
  size: number;
  /** Row by row: 0, 1, or `BINAIRO_OPEN` for a cell the player fills. */
  givens: number[];
  /** Row by row, 0 or 1. */
  solution: number[];
}

/** The largest run of one value a line may hold. */
const MAX_RUN = 2;
/** The bits of a run one cell too long: the window the local rules look through. */
const WINDOW = (1 << (MAX_RUN + 1)) - 1;

/**
 * Every valid line of n cells as a bit mask (bit i set for a 1 at cell i): half 1s, no three alike
 * in a row. Kept per length: 12 cells give 208 lines, so filtering them is the line solver.
 */
const validLineCache = new Map<number, Int32Array>();

export function validLines(n: number): Int32Array {
  const cached = validLineCache.get(n);
  if (cached) return cached;
  const out: number[] = [];
  const build = (at: number, bits: number, ones: number, last: number, run: number): void => {
    if (ones > n / 2 || at - ones > n / 2) return;
    if (at === n) {
      out.push(bits);
      return;
    }
    for (const value of [0, 1]) {
      const nextRun = value === last ? run + 1 : 1;
      if (nextRun > MAX_RUN) continue;
      build(at + 1, value ? bits | (1 << at) : bits, ones + value, value, nextRun);
    }
  };
  build(0, 0, 0, -1, 0);
  const lines = Int32Array.from(out);
  validLineCache.set(n, lines);
  return lines;
}

/** The cells of line `l`: rows 0 to n-1, then columns. */
function lineCells(n: number): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  return lines;
}

/** One line's known cells as masks: `known` has a bit per known cell, `ones` per known 1. */
function masksOf(cells: ArrayLike<number>, at: readonly number[]): { known: number; ones: number } {
  let known = 0;
  let ones = 0;
  for (let i = 0; i < at.length; i++) {
    const v = cells[at[i]];
    if (v === BINAIRO_OPEN) continue;
    known |= 1 << i;
    if (v === 1) ones |= 1 << i;
  }
  return { known, ones };
}

type Cells = Int8Array;

/** The solver's view of one grid: its side, its lines and the valid lines of that length. */
interface Board {
  n: number;
  lines: number[][];
  valid: Int32Array;
  full: number;
}

function boardOf(n: number): Board {
  return { n, lines: lineCells(n), valid: validLines(n), full: (1 << n) - 1 };
}

const bitCount = (bits: number): number => {
  let count = 0;
  for (let b = bits; b; b &= b - 1) count++;
  return count;
};

/** A line's new masks after a step, or null on a contradiction. */
type LineMasks = { known: number; ones: number } | null;

/**
 * The local rules on one line, to its fixed point: a pair forces both ends, a gap between two
 * alike forces the middle, and a line with half its cells of one value takes the other value in
 * the rest.
 */
function basicLine(n: number, full: number, known: number, ones: number): LineMasks {
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i + MAX_RUN < n; i++) {
      const k = (known >> i) & WINDOW;
      const o = (ones >> i) & WINDOW;
      if (k === WINDOW) {
        if (o === 0 || o === WINDOW) return null;
        continue;
      }
      // Two known cells of the window alike force the third, `open`, to the other value.
      const open = WINDOW & ~k;
      if (bitCount(open) !== 1) continue;
      const pair = o & k;
      if (pair !== 0 && pair !== k) continue;
      known |= open << i;
      if (pair === 0) ones |= open << i;
      changed = true;
    }
    const oneCount = bitCount(ones);
    const zeroCount = bitCount(known & ~ones);
    if (oneCount > n / 2 || zeroCount > n / 2) return null;
    if (known !== full && (oneCount === n / 2 || zeroCount === n / 2)) {
      if (zeroCount === n / 2) ones |= full & ~known;
      known = full;
      changed = true;
    }
  }
  return { known, ones };
}

/**
 * Line solving of one line: the cells every fitting valid line agrees on, leaving out a line
 * equal to a full line of the same direction (`taken`).
 */
function fitLine(board: Board, known: number, ones: number, taken: readonly number[]): LineMasks {
  const { valid, full } = board;
  let agreeOnes = full;
  let agreeZeros = full;
  let fits = 0;
  for (let k = 0; k < valid.length; k++) {
    const line = valid[k];
    if ((line & known) !== ones || taken.includes(line)) continue;
    fits++;
    agreeOnes &= line;
    agreeZeros &= ~line;
  }
  if (fits === 0) return null;
  return { known: known | agreeOnes | agreeZeros, ones: ones | agreeOnes };
}

type Level = 'basic' | 'line';

/**
 * The lines' masks to a fixed point at the level, revisiting only the lines a new cell touches,
 * and writes the cells found; false on a contradiction. `dirty` names the lines to start from
 * (every line when absent), for cells that were at the fixed point but for those lines.
 */
function propagate(board: Board, cells: Cells, level: Level, dirty?: readonly number[]): boolean {
  const { n, full } = board;
  const known = new Int32Array(2 * n);
  const ones = new Int32Array(2 * n);
  for (let cell = 0; cell < cells.length; cell++) {
    const v = cells[cell];
    if (v === BINAIRO_OPEN) continue;
    const r = Math.floor(cell / n);
    const c = cell % n;
    known[r] |= 1 << c;
    known[n + c] |= 1 << r;
    if (v === 1) {
      ones[r] |= 1 << c;
      ones[n + c] |= 1 << r;
    }
  }
  const queued = new Uint8Array(2 * n);
  const queue: number[] = [];
  const push = (l: number): void => {
    if (queued[l]) return;
    queued[l] = 1;
    queue.push(l);
  };
  if (dirty) dirty.forEach(push);
  else for (let l = 0; l < 2 * n; l++) push(l);
  const taken: number[] = [];
  for (let head = 0; head < queue.length; head++) {
    const l = queue[head];
    queued[l] = 0;
    const first = l < n ? 0 : n;
    taken.length = 0;
    for (let o = first; o < first + n; o++) if (o !== l && known[o] === full) taken.push(ones[o]);
    if (known[l] === full) {
      // A full line is unlike every other full line of its direction.
      if (taken.includes(ones[l])) return false;
      continue;
    }
    const next = level === 'basic' ? basicLine(n, full, known[l], ones[l]) : fitLine(board, known[l], ones[l], taken);
    if (next === null) return false;
    const found = next.known & ~known[l];
    if (found === 0) continue;
    known[l] = next.known;
    ones[l] = next.ones;
    const at = l < n ? l : l - n;
    for (let i = 0; i < n; i++) {
      if (!(found & (1 << i))) continue;
      const v = (next.ones >> i) & 1;
      const cross = l < n ? n + i : i;
      cells[l < n ? l * n + i : i * n + at] = v;
      known[cross] |= 1 << at;
      if (v) ones[cross] |= 1 << at;
      push(cross);
    }
    if (next.known === full) {
      // A newly full line may rule out a candidate of its direction, or repeat a full one.
      for (let o = first; o < first + n; o++) if (o === l || level === 'line' || known[o] === full) push(o);
    }
  }
  return true;
}

/** The row and the column line of a cell. */
const crossOf = (n: number, cell: number): number[] => [Math.floor(cell / n), n + (cell % n)];

/**
 * Probing: a value of an open cell that breaks a line fixes the other value. False on a
 * contradiction. A trial that ends with no contradiction proves every cell it set would end the
 * same way, so those values are not tried again until a probe changes the grid (as the nonogram's
 * probing, #434).
 */
function probe(board: Board, cells: Cells): boolean {
  const { n } = board;
  const tried = new Uint8Array(cells.length * 2);
  for (let probed = true; probed && cells.includes(BINAIRO_OPEN); ) {
    probed = false;
    tried.fill(0);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== BINAIRO_OPEN) continue;
      for (const value of [1, 0]) {
        if (tried[2 * i + value]) continue;
        const trial = cells.slice();
        trial[i] = value;
        if (propagate(board, trial, 'line', crossOf(n, i))) {
          for (let j = 0; j < trial.length; j++) if (cells[j] === BINAIRO_OPEN && trial[j] !== BINAIRO_OPEN) tried[2 * j + trial[j]] = 1;
          continue;
        }
        cells[i] = 1 - value;
        if (!propagate(board, cells, 'line', crossOf(n, i))) return false;
        probed = true;
        tried.fill(0);
        break;
      }
    }
  }
  return true;
}

export interface BinairoRating {
  difficulty: Difficulty;
}

function checkSide(n: number, cells: number): void {
  if (!BINAIRO_SIDES.includes(n)) throw new RangeError(`a binairo side is one of ${BINAIRO_SIDES.join(', ')} cells, not ${n}`);
  if (cells !== n * n) throw new RangeError(`a ${n} x ${n} binairo has ${n * n} cells, not ${cells}`);
}

/** The lowest level that finishes the grid, or null when none does (a guess would be needed, or no solution). */
function rateCells(board: Board, givens: ArrayLike<number>, ceiling: Difficulty): Difficulty | null {
  const cells = Int8Array.from(givens);
  if (!propagate(board, cells, 'basic')) return null;
  if (!cells.includes(BINAIRO_OPEN)) return validGrid(board, cells) ? 'easy' : null;
  if (ceiling === 'easy') return null;
  if (!propagate(board, cells, 'line')) return null;
  if (!cells.includes(BINAIRO_OPEN)) return validGrid(board, cells) ? 'medium' : null;
  if (ceiling === 'medium') return null;
  if (!probe(board, cells) || cells.includes(BINAIRO_OPEN)) return null;
  return validGrid(board, cells) ? 'hard' : null;
}

/** A full grid follows every rule: valid lines, no two rows or columns alike. */
function validGrid(board: Board, cells: Cells): boolean {
  const { n, lines, valid } = board;
  const allowed = new Set(valid);
  const seen = new Set<string>();
  for (let l = 0; l < lines.length; l++) {
    const { ones } = masksOf(cells, lines[l]);
    if (!allowed.has(ones)) return false;
    const key = `${l < n ? 'r' : 'c'}${ones}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * The rating of the givens (row by row, 0, 1 or `BINAIRO_OPEN`), or null when the solver cannot
 * finish them. A rating proves one solution: every step it takes is forced.
 */
export function rateBinairo(size: number, givens: readonly number[]): BinairoRating | null {
  checkSide(size, givens.length);
  const difficulty = rateCells(boardOf(size), givens, 'hard');
  return difficulty === null ? null : { difficulty };
}

/** Solutions of the givens, counted up to `limit`, by line solving and branching on a cell. */
export function countBinairoSolutions(size: number, givens: readonly number[], limit = 2): number {
  checkSide(size, givens.length);
  const board = boardOf(size);
  const search = (cells: Cells, left: number): number => {
    if (!propagate(board, cells, 'line')) return 0;
    const open = cells.indexOf(BINAIRO_OPEN);
    if (open < 0) return validGrid(board, cells) ? 1 : 0;
    let count = 0;
    for (const value of [1, 0]) {
      const next = cells.slice();
      next[open] = value;
      count += search(next, left - count);
      if (count >= left) return count;
    }
    return count;
  };
  return search(Int8Array.from(givens), limit);
}

/** How many branches a full grid may take before the generator tries the next child seed. */
const GRID_FILL_BRANCHES = 1600;

/**
 * A full valid grid from the random source: each open cell in turn gets a random value, line
 * solving follows it, and a contradiction tries the other value. Null when the steps run out.
 */
function fillGrid(random: Random, board: Board): number[] | null {
  let steps = 0;
  const search = (cells: Cells): Cells | null => {
    if (!propagate(board, cells, 'line')) return null;
    const open = cells.indexOf(BINAIRO_OPEN);
    if (open < 0) return validGrid(board, cells) ? cells : null;
    const first = random.int(2);
    for (const value of [first, 1 - first]) {
      if (++steps > GRID_FILL_BRANCHES) return null;
      const next = cells.slice();
      next[open] = value;
      const found = search(next);
      if (found) return found;
    }
    return null;
  };
  const found = search(new Int8Array(board.n * board.n).fill(BINAIRO_OPEN));
  return found ? Array.from(found) : null;
}

const BINAIRO_ATTEMPTS = 60;

/**
 * Removes givens in a random order while the solver still finishes the grid at the band, so the
 * puzzle keeps only the givens that band needs.
 */
function dig(random: Random, board: Board, solution: readonly number[], band: Difficulty): number[] {
  const givens = solution.slice();
  const order = random.shuffle(Array.from({ length: givens.length }, (_, i) => i));
  for (const cell of order) {
    const value = givens[cell];
    givens[cell] = BINAIRO_OPEN;
    if (rateCells(board, givens, band) === null) givens[cell] = value;
  }
  return givens;
}

/**
 * A binairo of the given side and band from the seed. Throws on a side not offered, a band not
 * offered, or when the attempts run out.
 */
export function generateBinairo(seed: string, size: number, difficulty: Difficulty): Binairo {
  checkSide(size, size * size);
  if (!BINAIRO_BANDS.includes(difficulty)) throw new RangeError(`a binairo offers ${BINAIRO_BANDS.join(', ')}, not ${difficulty}`);
  const board = boardOf(size);
  for (let i = 0; i < BINAIRO_ATTEMPTS; i++) {
    const random = createRandom(childSeed(seed, i));
    const solution = fillGrid(random, board);
    if (!solution) continue;
    const givens = dig(random, board, solution, difficulty);
    if (rateCells(board, givens, 'hard') !== difficulty) continue;
    return { id: { game: 'binairo', size: String(size), difficulty, seed }, size, givens, solution };
  }
  throw new Error(`no ${difficulty} ${size} x ${size} binairo from seed «${seed}» in ${BINAIRO_ATTEMPTS} attempts`);
}

/** A seed bank entry's mark for an open cell. */
const OPEN_MARK = '.';

/** A seed bank entry's text (#552): the givens row by row, `.` for an open cell, then the solution, joined by «/». */
export function encodeBinairo(puzzle: Pick<Binairo, 'givens' | 'solution'>): string {
  return [puzzle.givens.map(v => (v === BINAIRO_OPEN ? OPEN_MARK : String(v))).join(''), puzzle.solution.join('')].join('/');
}

function binairoOfEntry(entry: SeedBankEntry, size: number, difficulty: Difficulty): Binairo {
  const [givenText, solutionText] = entry.text.split('/');
  if (givenText?.length !== size * size || solutionText?.length !== size * size) throw new RangeError(`a ${size} x ${size} binairo entry has ${size * size} givens and cells`);
  const givens = [...givenText].map(ch => (ch === OPEN_MARK ? BINAIRO_OPEN : Number(ch)));
  return { id: { game: 'binairo', size: String(size), difficulty, seed: entry.seed }, size, givens, solution: [...solutionText].map(Number) };
}

/**
 * The binairo a new page shows: at a size and band in the bank, the entry the seed picks, ready at
 * once and named by its own seed (#552); elsewhere `generateBinairo`'s, made live.
 */
export function newBinairo(seed: string, size: number, difficulty: Difficulty): Binairo {
  const entry = pickFromBank(BINAIRO_BANK, bankPair(size, difficulty), seed);
  return entry ? binairoOfEntry(entry, size, difficulty) : generateBinairo(seed, size, difficulty);
}

/** The binairo a puzzle code names (`BI-8-M-7K2Q9X`), the same one every time (#393), banked or not. */
export function binairoFromCode(code: string): Binairo {
  const id = parsePuzzleCode(code);
  if (id.game !== 'binairo' || !/^\d+$/.test(id.size)) throw new RangeError(`«${code}» is not a binairo code`);
  const size = Number(id.size);
  const entry = findInBank(BINAIRO_BANK, bankPair(size, id.difficulty), id.seed);
  return entry ? binairoOfEntry(entry, size, id.difficulty) : generateBinairo(id.seed, size, id.difficulty);
}

/** How the page is set: its orientation, the writing hand, and the cell preset (the largest that fits when absent). */
export interface BinairoLook {
  orientation: Orientation;
  hand: Hand;
  cellMm?: CellPreset;
}

export const BINAIRO_RULE = 'Shade for black, dot for white: no three alike in a line, half each, no two lines alike.';

/** Where the puzzle's grid and footer go on the page; «Check» reads the ink against this grid. */
export function layoutBinairoPage(puzzle: Binairo, look: BinairoLook): PageLayout {
  const spec = { orientation: look.orientation, hand: look.hand, lattice: 'square' as const, columns: puzzle.size, rows: puzzle.size };
  return layoutPage({ ...spec, cellMm: look.cellMm ?? fitCellMm(spec) });
}

/**
 * The page background: a given 1 is a black disc, a given 0 a white one, as Unruly draws them, so
 * the player's own shading and dots never look like a given.
 */
export function drawBinairoPage(puzzle: Binairo, layout: PageLayout, footer: Omit<FooterText, 'rule'>): Raster {
  const raster = createPage(layout);
  drawSquareLattice(raster, layout.grid);
  puzzle.givens.forEach((value, i) => {
    if (value === BINAIRO_OPEN) return;
    drawIcon(raster, layout.grid, i % puzzle.size, Math.floor(i / puzzle.size), value === 1 ? 'pearl-black' : 'pearl-white');
  });
  drawFooter(raster, layout, { ...footer, rule: BINAIRO_RULE });
  return raster;
}

/**
 * «Check» from the ink: each cell the player fills reads as a 1 when shaded and a 0 when dotted
 * or crossed. A cell with other ink is unread, never wrong; a given is never checked.
 */
export function checkBinairo<E>(puzzle: Binairo, layout: PageLayout, strokes: readonly InkStroke<E>[]): CheckResult {
  const byCell = marksByCell(layout.grid, strokes);
  const result: CheckResult = { wrong: [], right: [], empty: [], unread: [] };
  puzzle.givens.forEach((given, index) => {
    if (given !== BINAIRO_OPEN) return;
    const mark = classifyMark(layout.grid, index, byCell.get(index) ?? []);
    if (mark === 'empty') result.empty.push(index);
    else if (mark === 'other') result.unread.push({ index, reason: 'neither a shade nor a dot' });
    else ((mark === 'shade' ? 1 : 0) === puzzle.solution[index] ? result.right : result.wrong).push(index);
  });
  return result;
}
