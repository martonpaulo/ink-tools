/**
 * Hitori (#394): a seeded grid of numbers, the cells to shade, a solver that proves that one
 * answer, its page and its «Check» from the ink.
 *
 * The rules: shade cells so no number repeats among the white cells of a row or a column; two
 * shaded cells never share a side; the white cells stay connected side by side. As printed hitori
 * puzzles do, a cell whose number appears once in its row and once in its column is never shaded,
 * so a solution shades only repeats and one answer exists under that reading.
 *
 * The method is the one of Simon Tatham's Singles (MIT), not its code: a Latin square, seeded
 * shaded cells that keep the rules, each shaded cell given a number of a white cell in its row or
 * column, then the solver keeps only grids it finishes without a guess. The band comes from the
 * solve: `easy` when the basic rules finish it, `medium` when it also needs the pair rules, `hard`
 * when it also needs probing (a cell whose one value breaks a rule).
 */

import { classifyMark, marksByCell, type InkStroke } from './check/cells';
import { puzzleCode, type Difficulty, type PuzzleId } from './code';
import { drawCellText, drawSquareLattice, type Grid } from './page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type PageLayout } from './page/layout';
import { type CellPreset, type Hand, type Orientation } from './page/look';
import { type Raster } from './page/raster';
import { childSeed, createRandom, type Random } from './random';

export interface Hitori {
  id: PuzzleId;
  /** Cells per side; the grid is square. */
  size: number;
  /** Row by row, the number in each cell, 1 to `size`. */
  numbers: number[];
  /** Row by row, true for a shaded cell. */
  solution: boolean[];
}

export const HITORI_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const HITORI_MIN_SIDE = 5;
export const HITORI_MAX_SIDE = 12; // a 12 x 12 fits a portrait page at 10 mm; a number of two digits stays readable

const UNKNOWN = -1;
const WHITE = 0;
const BLACK = 1;
type Cells = Int8Array;

/** The cells of the puzzle's lines, built once per solve. */
interface Board {
  size: number;
  numbers: readonly number[];
  /** Per cell, the other cells of its row and column with the same number. */
  peers: number[][];
  /** Per cell, its side neighbours. */
  neighbours: number[][];
  /** Per line (rows, then columns), its cells in order. */
  lines: number[][];
}

function boardOf(size: number, numbers: readonly number[]): Board {
  const count = size * size;
  if (numbers.length !== count) throw new RangeError(`a ${size} x ${size} hitori has ${count} numbers, not ${numbers.length}`);
  const lines: number[][] = [];
  for (let r = 0; r < size; r++) lines.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) lines.push(Array.from({ length: size }, (_, r) => r * size + c));
  const peers: number[][] = Array.from({ length: count }, () => []);
  const neighbours: number[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / size);
    const c = i % size;
    for (let k = 0; k < size; k++) {
      const inRow = r * size + k;
      const inColumn = k * size + c;
      if (inRow !== i && numbers[inRow] === numbers[i]) peers[i].push(inRow);
      if (inColumn !== i && numbers[inColumn] === numbers[i]) peers[i].push(inColumn);
    }
    if (r > 0) neighbours[i].push(i - size);
    if (c > 0) neighbours[i].push(i - 1);
    if (c < size - 1) neighbours[i].push(i + 1);
    if (r < size - 1) neighbours[i].push(i + size);
  }
  return { size, numbers, peers, neighbours, lines };
}

/** The cells a puzzle starts with known: a number with no repeat in its row or column is white. */
function startCells(board: Board): Cells {
  const cells = new Int8Array(board.numbers.length).fill(UNKNOWN);
  board.peers.forEach((list, i) => {
    if (list.length === 0) cells[i] = WHITE;
  });
  return cells;
}

/** True when every white cell reaches every other through cells that are not shaded. */
function whitesConnected(board: Board, cells: Cells): boolean {
  const count = cells.length;
  let start = -1;
  let whites = 0;
  for (let i = 0; i < count; i++) {
    if (cells[i] === WHITE) {
      whites++;
      if (start < 0) start = i;
    }
  }
  if (whites <= 1) return true;
  const seen = new Uint8Array(count);
  const queue = [start];
  seen[start] = 1;
  let reached = 0;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (cells[cell] === WHITE) reached++;
    for (const next of board.neighbours[cell]) {
      if (seen[next] || cells[next] === BLACK) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return reached === whites;
}

/**
 * The open cells whose shading would cut the white cells apart: the cut vertices of the cells not
 * shaded (Tarjan's low links) with a white cell on both sides. One pass over the grid, not one
 * search per cell, since the tablet's engine has no JIT.
 */
function cutCells(board: Board, cells: Cells): number[] {
  const count = cells.length;
  const order = new Int32Array(count).fill(-1);
  const low = new Int32Array(count);
  const whitesBelow = new Int32Array(count);
  let total = 0;
  let root = -1;
  for (let i = 0; i < count; i++) {
    if (cells[i] !== WHITE) continue;
    total++;
    if (root < 0) root = i;
  }
  const out: number[] = [];
  if (total < 2) return out;
  let clock = 0;
  const visit = (v: number, parent: number): void => {
    order[v] = low[v] = clock++;
    whitesBelow[v] = cells[v] === WHITE ? 1 : 0;
    let cuts = false;
    for (const u of board.neighbours[v]) {
      if (cells[u] === BLACK || u === parent) continue;
      if (order[u] >= 0) {
        low[v] = Math.min(low[v], order[u]);
        continue;
      }
      visit(u, v);
      low[v] = Math.min(low[v], low[u]);
      whitesBelow[v] += whitesBelow[u];
      // u's subtree hangs on v alone: shading v cuts it off from the rest.
      if (low[u] >= order[v] && whitesBelow[u] > 0 && total - whitesBelow[u] - (cells[v] === WHITE ? 1 : 0) > 0) cuts = true;
    }
    if (cuts && cells[v] === UNKNOWN) out.push(v);
  };
  visit(root, -1);
  return out;
}

/**
 * Applies the pending cells and every cell the rules then force, to a fixed point. Returns false on a
 * contradiction. The local rules: a shaded cell's neighbours are white; a white cell's repeats are
 * shaded; of two neighbours with one number, one is shaded, so that number's other cells in the
 * line are; a cell between two cells of one number is white, since one of them is shaded. Only when
 * those set nothing, the connectivity rule, which a person finds harder: a cell whose shading would
 * cut the white cells apart is white. `stats.cuts` counts the cells it set.
 */
function propagate(board: Board, cells: Cells, pending: [number, number][], stats?: { cuts: number }): boolean {
  const set = (cell: number, value: number): boolean => {
    if (cells[cell] === value) return true;
    if (cells[cell] !== UNKNOWN) return false;
    cells[cell] = value;
    pending.push([cell, value]);
    return true;
  };
  for (;;) {
    while (pending.length > 0) {
      const [cell, value] = pending.pop() as [number, number];
      if (value === BLACK) {
        for (const next of board.neighbours[cell]) if (!set(next, WHITE)) return false;
      } else {
        for (const peer of board.peers[cell]) if (!set(peer, BLACK)) return false;
      }
    }
    if (!whitesConnected(board, cells)) return false;
    let changed = false;
    for (const line of board.lines) {
      for (let k = 0; k + 1 < line.length; k++) {
        const a = line[k];
        const b = line[k + 1];
        const value = board.numbers[a];
        if (board.numbers[b] === value) {
          // One of the pair is white, so every other cell of the line with its number is shaded.
          for (const other of line) {
            if (other !== a && other !== b && board.numbers[other] === value && cells[other] === UNKNOWN) {
              if (!set(other, BLACK)) return false;
              changed = true;
            }
          }
        }
        if (k + 2 < line.length && board.numbers[line[k + 2]] === value && cells[b] === UNKNOWN) {
          if (!set(b, WHITE)) return false;
          changed = true;
        }
      }
    }
    if (!changed) {
      // Connectivity: a cell whose shading would cut the white cells apart must stay white.
      for (const cell of cutCells(board, cells)) {
        if (!set(cell, WHITE)) return false;
        changed = true;
        if (stats) stats.cuts++;
      }
    }
    if (!changed && pending.length === 0) return true;
  }
}

function settle(board: Board, cells: Cells, stats?: { cuts: number }): boolean {
  const pending: [number, number][] = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] !== UNKNOWN) pending.push([i, cells[i]]);
  return propagate(board, cells, pending, stats);
}

/** True when the shading keeps every rule: no white repeat, no shaded neighbours, whites connected. */
export function isHitoriSolution(size: number, numbers: readonly number[], shaded: readonly boolean[]): boolean {
  const board = boardOf(size, numbers);
  const cells = Int8Array.from(shaded, s => (s ? BLACK : WHITE));
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === BLACK) {
      if (board.peers[i].length === 0) return false;
      if (board.neighbours[i].some(n => cells[n] === BLACK)) return false;
    } else if (board.peers[i].some(p => cells[p] === WHITE)) return false;
  }
  return whitesConnected(board, cells);
}

/** Solutions of the numbers, counted up to `limit`, by every rule and branching on a cell. */
export function countHitoriSolutions(size: number, numbers: readonly number[], limit = 2): number {
  const board = boardOf(size, numbers);
  const search = (cells: Cells): number => {
    if (!settle(board, cells)) return 0;
    const open = cells.indexOf(UNKNOWN);
    if (open < 0) return 1;
    let count = 0;
    for (const value of [BLACK, WHITE]) {
      const next = cells.slice();
      next[open] = value;
      count += search(next);
      if (count >= limit) return count;
    }
    return count;
  };
  return search(startCells(board));
}

export interface HitoriRating {
  difficulty: Difficulty;
  /** Cells the connectivity rule set before any probe. */
  cuts: number;
  /** Cells set by probing. */
  probes: number;
  /** The shading the rating found, row by row. */
  solution: boolean[];
}

/** Up to one cell set by the connectivity rule per this many cells of the side, a hitori with no probe is easy. */
const SIDE_PER_EASY_CUT = 4;

/**
 * The rating of the numbers, or null when the rules and probing cannot finish them (a guess would
 * be needed). With no probe, few cells set by the connectivity rule are `easy`, more `medium`; any
 * probing is `hard`. Every deduction is forced, so a rating also proves the answer is the only one.
 */
export function rateHitori(size: number, numbers: readonly number[]): HitoriRating | null {
  const board = boardOf(size, numbers);
  const stats = { cuts: 0 };
  const cells = startCells(board);
  if (!settle(board, cells, stats)) return null;
  let probes = 0;
  for (let probed = true; probed && cells.includes(UNKNOWN); ) {
    probed = false;
    for (let i = 0; i < cells.length && !probed; i++) {
      if (cells[i] !== UNKNOWN) continue;
      for (const value of [BLACK, WHITE]) {
        const trial = cells.slice();
        trial[i] = value;
        if (settle(board, trial)) continue;
        cells[i] = value === BLACK ? WHITE : BLACK;
        if (!settle(board, cells)) return null;
        probes++;
        probed = true;
        break;
      }
    }
  }
  if (cells.includes(UNKNOWN)) return null;
  const easyCuts = Math.floor(size / SIDE_PER_EASY_CUT);
  const difficulty: Difficulty = probes > 0 ? 'hard' : stats.cuts <= easyCuts ? 'easy' : 'medium';
  return { difficulty, cuts: stats.cuts, probes, solution: Array.from(cells, v => v === BLACK) };
}

/** A seeded Latin square: the cyclic one with its rows, columns and numbers shuffled. */
function latinSquare(random: Random, size: number): number[] {
  const rows = random.shuffle(Array.from({ length: size }, (_, i) => i));
  const columns = random.shuffle(Array.from({ length: size }, (_, i) => i));
  const symbols = random.shuffle(Array.from({ length: size }, (_, i) => i + 1));
  const out: number[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) out.push(symbols[(rows[r] + columns[c]) % size]);
  return out;
}

/** Seeded shaded cells that keep the rules: none side by side, the white cells connected. */
function shading(random: Random, board: Board, chance: number): boolean[] {
  const count = board.size * board.size;
  const cells = new Int8Array(count).fill(WHITE);
  for (const i of random.shuffle(Array.from({ length: count }, (_, k) => k))) {
    if (!random.chance(chance)) continue;
    if (board.neighbours[i].some(n => cells[n] === BLACK)) continue;
    cells[i] = BLACK;
    if (!whitesConnected(board, cells)) cells[i] = WHITE;
  }
  return Array.from(cells, v => v === BLACK);
}

const HITORI_ATTEMPTS = 320;
/**
 * The chance in percent that a cell is tried for shading. Near every cell, so the shading is dense:
 * a sparse one leaves white cells no rule decides, and most such grids need a guess (#394).
 */
const SHADE_CHANCE = 95;

/**
 * A hitori of the given size and band from the seed. Throws on a side outside 5 to 12, a band not
 * offered, or when the attempts run out.
 */
export function generateHitori(seed: string, size: number, difficulty: Difficulty): Hitori {
  if (!Number.isInteger(size) || size < HITORI_MIN_SIDE || size > HITORI_MAX_SIDE) {
    throw new RangeError(`a hitori side is ${HITORI_MIN_SIDE} to ${HITORI_MAX_SIDE} cells, not ${size}`);
  }
  if (!HITORI_BANDS.includes(difficulty)) throw new RangeError(`a hitori offers ${HITORI_BANDS.join(', ')}, not ${difficulty}`);
  for (let i = 0; i < HITORI_ATTEMPTS; i++) {
    const random = createRandom(childSeed(seed, i));
    const numbers = latinSquare(random, size);
    const shaded = shading(random, boardOf(size, numbers), SHADE_CHANCE);
    // Each shaded cell takes the number of a white cell of its row or column, so it repeats.
    shaded.forEach((black, cell) => {
      if (!black) return;
      const r = Math.floor(cell / size);
      const c = cell % size;
      const choices: number[] = [];
      for (let k = 0; k < size; k++) {
        if (k !== c && !shaded[r * size + k]) choices.push(numbers[r * size + k]);
        if (k !== r && !shaded[k * size + c]) choices.push(numbers[k * size + c]);
      }
      numbers[cell] = random.pick(choices);
    });
    const rating = rateHitori(size, numbers);
    if (rating?.difficulty !== difficulty) continue;
    return { id: { game: 'hitori', size: String(size), difficulty, seed }, size, numbers, solution: rating.solution };
  }
  throw new Error(`no ${difficulty} ${size} x ${size} hitori from seed «${seed}» in ${HITORI_ATTEMPTS} attempts`);
}

/** How the page is laid out: the orientation, the writing hand and, when given, the cell size. */
export interface HitoriView {
  orientation: Orientation;
  hand: Hand;
  /** The largest preset that fits when absent. */
  cellMm?: CellPreset;
}

const BAND_NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
export const HITORI_RULE = 'Shade cells so no number repeats in a line; shaded cells never touch; white cells stay joined.';

/** Where the puzzle's grid goes on its page; «Check» reads the ink against this same layout. */
export function hitoriLayout(puzzle: Hitori, view: HitoriView): PageLayout {
  const spec = { orientation: view.orientation, hand: view.hand, lattice: 'square' as const, columns: puzzle.size, rows: puzzle.size };
  return layoutPage({ ...spec, cellMm: view.cellMm ?? fitCellMm(spec) });
}

/** The puzzle's page: the grid with every number printed, and the footer. No answer is drawn. */
export function drawHitoriPage(puzzle: Hitori, view: HitoriView): { layout: PageLayout; raster: Raster } {
  const layout = hitoriLayout(puzzle, view);
  const raster = createPage(layout);
  drawSquareLattice(raster, layout.grid);
  puzzle.numbers.forEach((n, i) => drawCellText(raster, layout.grid, i % puzzle.size, Math.floor(i / puzzle.size), String(n), 'given'));
  drawFooter(raster, layout, { game: 'Hitori', difficulty: BAND_NAMES[puzzle.id.difficulty], code: puzzleCode(puzzle.id), rule: HITORI_RULE });
  return { layout, raster };
}

export interface HitoriCheck {
  /** Shaded where the answer is white, or marked white (a circle, a dot or a cross) where it is shaded. */
  readonly wrong: number[];
  readonly right: number[];
  /** No ink: neither right nor wrong yet. */
  readonly empty: number[];
}

/**
 * «Check» from the ink, with no recognition: a shaded cell is a shade, any other mark (the circle
 * players draw round a white cell, a dot, a cross) says white, and a cell with no ink is left out.
 */
export function checkHitori(puzzle: Hitori, grid: Grid, strokes: readonly InkStroke[]): HitoriCheck {
  if (grid.columns !== puzzle.size || grid.rows !== puzzle.size) {
    throw new RangeError(`the grid is ${grid.columns} x ${grid.rows}, the hitori ${puzzle.size} x ${puzzle.size}`);
  }
  const byCell = marksByCell(grid, strokes);
  const result: HitoriCheck = { wrong: [], right: [], empty: [] };
  puzzle.solution.forEach((shaded, index) => {
    const mark = classifyMark(grid, index, byCell.get(index) ?? []);
    if (mark === 'empty') result.empty.push(index);
    else ((mark === 'shade') === shaded ? result.right : result.wrong).push(index);
  });
  return result;
}
