/**
 * The human-style sudoku solver (#380): named techniques tried from the easiest, the hardest one a
 * puzzle needs sets its band, and the first one that applies is the next logical step of a hint.
 *
 * Candidates are bit masks (bit v-1 for value v), so grids up to 16 x 16 fit in one integer.
 */

import type { Difficulty } from './code';

export interface SudokuShape {
  /** Side length: the number of values and of cells per row. */
  size: number;
  boxRows: number;
  boxCols: number;
}

export type Technique =
  | 'naked single'
  | 'hidden single'
  | 'locked candidates'
  | 'naked pair'
  | 'hidden pair'
  | 'naked triple'
  | 'hidden triple'
  | 'x-wing'
  | 'xy-wing'
  | 'swordfish';

/** The band each technique belongs to; the order of this table is the order they are tried. */
export const TECHNIQUE_BANDS: readonly (readonly [Technique, Difficulty])[] = [
  ['naked single', 'easy'],
  ['hidden single', 'easy'],
  ['locked candidates', 'medium'],
  ['naked pair', 'hard'],
  ['hidden pair', 'hard'],
  ['naked triple', 'hard'],
  ['hidden triple', 'hard'],
  ['x-wing', 'expert'],
  ['xy-wing', 'expert'],
  ['swordfish', 'expert'],
];

const BAND_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

export const bandRank = (band: Difficulty): number => BAND_ORDER.indexOf(band);

export interface CellValue {
  cell: number;
  value: number;
}

/** One logical step: the technique, the values it places and the candidates it removes. */
export interface SudokuStep {
  technique: Technique;
  placements: CellValue[];
  eliminations: CellValue[];
}

export interface SudokuRating {
  /** The band of the hardest technique needed, or null when these techniques cannot finish it. */
  difficulty: Difficulty | null;
  hardest: Technique | null;
  /** How many steps the solve took. */
  steps: number;
}

/** Where a unit crosses another: the shared cells, and the other unit's cells outside this one. */
interface Crossing {
  cells: number[];
  outside: number[];
}

interface Geometry {
  shape: SudokuShape;
  units: number[][];
  /** For each cell, the indices of its row, column and box in `units`. */
  unitsOf: number[][];
  peers: number[][];
  /**
   * For each unit, its crossings grouped by the kind of the other unit: a row or a column has one
   * group (its boxes); a box has two (its rows, then its columns), the order `unitsOf` gives.
   */
  crossings: Crossing[][][];
}

const geometries = new Map<string, Geometry>();

export function geometry(shape: SudokuShape): Geometry {
  const key = `${shape.size}:${shape.boxRows}x${shape.boxCols}`;
  const known = geometries.get(key);
  if (known) return known;
  const n = shape.size;
  const units: number[][] = [];
  for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
  for (let br = 0; br < n; br += shape.boxRows) {
    for (let bc = 0; bc < n; bc += shape.boxCols) {
      const box: number[] = [];
      for (let r = br; r < br + shape.boxRows; r++) for (let c = bc; c < bc + shape.boxCols; c++) box.push(r * n + c);
      units.push(box);
    }
  }
  const unitsOf: number[][] = Array.from({ length: n * n }, () => []);
  units.forEach((unit, u) => unit.forEach(cell => unitsOf[cell].push(u)));
  const peers = unitsOf.map((us, cell) => {
    const set = new Set<number>();
    for (const u of us) for (const other of units[u]) if (other !== cell) set.add(other);
    return [...set].sort((a, b) => a - b);
  });
  const crossingsWith = (u: number, others: number[]): Crossing[] =>
    others.map(other => ({
      cells: units[u].filter(cell => unitsOf[cell].includes(other)),
      outside: units[other].filter(cell => !unitsOf[cell].includes(u)),
    }));
  const boxesOf = (unit: number[]): number[] => [...new Set(unit.map(cell => unitsOf[cell][2]))];
  const crossings = units.map((unit, u) =>
    u < 2 * n
      ? [crossingsWith(u, boxesOf(unit))]
      : [crossingsWith(u, [...new Set(unit.map(cell => unitsOf[cell][0]))]), crossingsWith(u, [...new Set(unit.map(cell => unitsOf[cell][1]))])],
  );
  const made = { shape, units, unitsOf, peers, crossings };
  geometries.set(key, made);
  return made;
}

const bit = (value: number): number => 1 << (value - 1);
const popcount = (mask: number): number => {
  let m = mask;
  let count = 0;
  while (m) {
    m &= m - 1;
    count++;
  }
  return count;
};
const TOP_BIT = 31;
const lowestValue = (mask: number): number => TOP_BIT - Math.clz32(mask & -mask) + 1;
const valuesOf = (mask: number): number[] => {
  const out: number[] = [];
  for (let m = mask; m; m &= m - 1) out.push(lowestValue(m));
  return out;
};

/** The solver's working state: values (0 empty) and each empty cell's candidates. */
class Board {
  readonly values: number[];
  readonly candidates: number[];

  constructor(readonly geo: Geometry, values: readonly number[]) {
    const n = geo.shape.size; // at most 16, so every mask fits in one integer
    const all = (1 << n) - 1;
    this.values = values.slice();
    const candidates = new Array<number>(values.length);
    for (let cell = 0; cell < values.length; cell++) candidates[cell] = values[cell] ? 0 : all;
    for (let cell = 0; cell < values.length; cell++) {
      if (!values[cell]) continue;
      const clear = ~bit(values[cell]);
      const around = geo.peers[cell];
      for (let i = 0; i < around.length; i++) candidates[around[i]] &= clear;
    }
    this.candidates = candidates;
  }

  place(cell: number, value: number): void {
    const { candidates } = this;
    this.values[cell] = value;
    candidates[cell] = 0;
    const clear = ~bit(value);
    const around = this.geo.peers[cell];
    for (let i = 0; i < around.length; i++) candidates[around[i]] &= clear;
  }

  apply(step: SudokuStep): void {
    const { eliminations, placements } = step;
    for (let i = 0; i < eliminations.length; i++) this.candidates[eliminations[i].cell] &= ~bit(eliminations[i].value);
    for (let i = 0; i < placements.length; i++) this.place(placements[i].cell, placements[i].value);
  }

  // Plain index loops in the solver's hot paths: the tablet's engine has no JIT, so a callback or
  // an iterator per cell costs several times a loop (#380, measured with `node --jitless`).
  solved(): boolean {
    const { values } = this;
    for (let cell = 0; cell < values.length; cell++) if (values[cell] === 0) return false;
    return true;
  }

  /** True when an empty cell has no candidate left: the givens contradict each other. */
  broken(): boolean {
    const { values, candidates } = this;
    for (let cell = 0; cell < values.length; cell++) if (values[cell] === 0 && candidates[cell] === 0) return true;
    return false;
  }
}

type Finder = (board: Board) => SudokuStep | null;

const nakedSingle: Finder = board => {
  const { values, candidates } = board;
  for (let cell = 0; cell < values.length; cell++) {
    const mask = candidates[cell];
    if (values[cell] === 0 && mask !== 0 && (mask & (mask - 1)) === 0) {
      return { technique: 'naked single', placements: [{ cell, value: lowestValue(mask) }], eliminations: [] };
    }
  }
  return null;
};

const hiddenSingle: Finder = board => {
  const { candidates } = board;
  const { units } = board.geo;
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    // The values seen once and more than once in the unit; the lowest seen exactly once is the
    // single, as a scan of the values in order would find it.
    let once = 0;
    let twice = 0;
    for (let i = 0; i < unit.length; i++) {
      const mask = candidates[unit[i]];
      twice |= once & mask;
      once |= mask;
    }
    const single = once & ~twice;
    if (single === 0) continue;
    const value = lowestValue(single);
    const b = bit(value);
    for (let i = 0; i < unit.length; i++) {
      if (candidates[unit[i]] & b) {
        return { technique: 'hidden single', placements: [{ cell: unit[i], value }], eliminations: [] };
      }
    }
  }
  return null;
};

/**
 * Pointing and claiming: a value confined to one unit's overlap with another leaves the rest of the
 * other. Units are tried in order, values from the lowest, and a box's rows before its columns.
 */
const lockedCandidates: Finder = board => {
  const { candidates } = board;
  const { units, crossings } = board.geo;
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    // The values with two or more candidate cells in the unit.
    let once = 0;
    let many = 0;
    for (let i = 0; i < unit.length; i++) {
      const mask = candidates[unit[i]];
      many |= once & mask;
      once |= mask;
    }
    if (many === 0) continue;
    // Per group, the values that lie in one crossing only.
    const groups = crossings[u];
    const confined: number[] = [];
    let anyConfined = 0;
    for (let g = 0; g < groups.length; g++) {
      let seen = 0;
      let again = 0;
      const group = groups[g];
      for (let k = 0; k < group.length; k++) {
        const crossing = group[k];
        let union = 0;
        for (let i = 0; i < crossing.cells.length; i++) union |= candidates[crossing.cells[i]];
        again |= seen & union;
        seen |= union;
      }
      confined.push(many & seen & ~again);
      anyConfined |= confined[g];
    }
    for (let left = anyConfined; left; left &= left - 1) {
      const b = left & -left;
      for (let g = 0; g < groups.length; g++) {
        if (!(confined[g] & b)) continue;
        const group = groups[g];
        for (let k = 0; k < group.length; k++) {
          const crossing = group[k];
          let inside = false;
          for (let i = 0; i < crossing.cells.length; i++) if (candidates[crossing.cells[i]] & b) inside = true;
          if (!inside) continue;
          const eliminations: CellValue[] = [];
          const { outside } = crossing;
          for (let i = 0; i < outside.length; i++) {
            if (candidates[outside[i]] & b) eliminations.push({ cell: outside[i], value: lowestValue(b) });
          }
          if (eliminations.length) return { technique: 'locked candidates', placements: [], eliminations };
        }
      }
    }
  }
  return null;
};

function combinations(items: readonly number[], k: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, chosen: number[]): void => {
    if (chosen.length === k) {
      out.push(chosen.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      chosen.push(items[i]);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return out;
}

const nakedSubset = (k: number, technique: Technique): Finder => board => {
  for (const unit of board.geo.units) {
    const open = unit.filter(cell => board.values[cell] === 0);
    if (open.length <= k) continue;
    const small = open.filter(cell => popcount(board.candidates[cell]) <= k);
    for (const group of combinations(small, k)) {
      const union = group.reduce((mask, cell) => mask | board.candidates[cell], 0);
      if (popcount(union) !== k) continue;
      const eliminations: CellValue[] = [];
      for (const cell of open) {
        if (group.includes(cell)) continue;
        for (const value of valuesOf(board.candidates[cell] & union)) eliminations.push({ cell, value });
      }
      if (eliminations.length) return { technique, placements: [], eliminations };
    }
  }
  return null;
};

const hiddenSubset = (k: number, technique: Technique): Finder => board => {
  const n = board.geo.shape.size;
  for (const unit of board.geo.units) {
    const open = unit.filter(cell => board.values[cell] === 0);
    if (open.length <= k) continue;
    const where = new Map<number, number[]>();
    for (let v = 1; v <= n; v++) {
      const cells = open.filter(cell => board.candidates[cell] & bit(v));
      if (cells.length >= 1 && cells.length <= k) where.set(v, cells);
    }
    for (const group of combinations([...where.keys()], k)) {
      const cells = new Set<number>();
      for (const v of group) for (const cell of where.get(v) as number[]) cells.add(cell);
      if (cells.size !== k) continue;
      const keep = group.reduce((mask, v) => mask | bit(v), 0);
      const eliminations: CellValue[] = [];
      for (const cell of [...cells].sort((a, b) => a - b)) {
        for (const value of valuesOf(board.candidates[cell] & ~keep)) eliminations.push({ cell, value });
      }
      if (eliminations.length) return { technique, placements: [], eliminations };
    }
  }
  return null;
};

/** A fish of k lines: value v sits in k lines only within k cross lines, so the rest of those crosses lose v. */
const fish = (k: number, technique: Technique): Finder => board => {
  const n = board.geo.shape.size;
  for (const byRow of [true, false]) {
    const cellAt = (line: number, cross: number): number => (byRow ? line * n + cross : cross * n + line);
    for (let v = 1; v <= n; v++) {
      const masks: number[] = [];
      const lines: number[] = [];
      for (let line = 0; line < n; line++) {
        let mask = 0;
        for (let cross = 0; cross < n; cross++) if (board.candidates[cellAt(line, cross)] & bit(v)) mask |= 1 << cross;
        masks.push(mask);
        if (popcount(mask) >= 2 && popcount(mask) <= k) lines.push(line);
      }
      for (const group of combinations(lines, k)) {
        const union = group.reduce((m, line) => m | masks[line], 0);
        if (popcount(union) !== k) continue;
        const eliminations: CellValue[] = [];
        for (let line = 0; line < n; line++) {
          if (group.includes(line)) continue;
          for (let cross = 0; cross < n; cross++) {
            if (union & (1 << cross) && board.candidates[cellAt(line, cross)] & bit(v)) eliminations.push({ cell: cellAt(line, cross), value: v });
          }
        }
        if (eliminations.length) return { technique, placements: [], eliminations };
      }
    }
  }
  return null;
};

/** A pivot {x, y} sees pincers {x, z} and {y, z}: whichever holds, z is in a pincer, so cells seeing both lose z. */
const xyWing: Finder = board => {
  const { peers } = board.geo;
  const pairs = board.candidates.map((mask, cell) => (popcount(mask) === 2 ? cell : -1)).filter(cell => cell >= 0);
  for (const pivot of pairs) {
    const pm = board.candidates[pivot];
    const near = peers[pivot].filter(cell => popcount(board.candidates[cell]) === 2 && popcount(board.candidates[cell] & pm) === 1);
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        const a = board.candidates[near[i]];
        const b = board.candidates[near[j]];
        const z = a & b & ~pm;
        if (popcount(z) !== 1 || (a & pm) === (b & pm)) continue;
        const value = lowestValue(z);
        const eliminations = peers[near[i]]
          .filter(cell => cell !== pivot && cell !== near[j] && peers[near[j]].includes(cell) && board.candidates[cell] & z)
          .map(cell => ({ cell, value }));
        if (eliminations.length) return { technique: 'xy-wing', placements: [], eliminations };
      }
    }
  }
  return null;
};

const FINDERS: Record<Technique, Finder> = {
  'naked single': nakedSingle,
  'hidden single': hiddenSingle,
  'locked candidates': lockedCandidates,
  'naked pair': nakedSubset(2, 'naked pair'),
  'hidden pair': hiddenSubset(2, 'hidden pair'),
  'naked triple': nakedSubset(3, 'naked triple'),
  'hidden triple': hiddenSubset(3, 'hidden triple'),
  'x-wing': fish(2, 'x-wing'),
  'xy-wing': xyWing,
  swordfish: fish(3, 'swordfish'),
};

/** TECHNIQUE_BANDS as parallel arrays, read by index in the solver's loop. */
const ORDERED_FINDERS: readonly Finder[] = TECHNIQUE_BANDS.map(([technique]) => FINDERS[technique]);
const ORDERED_RANKS: readonly number[] = TECHNIQUE_BANDS.map(([, band]) => bandRank(band));
/** How many techniques at the head of TECHNIQUE_BANDS are singles. */
const SINGLES = 2;
const RANK_OF = new Map<Technique, number>(TECHNIQUE_BANDS.map(([technique, band]) => [technique, bandRank(band)]));

function findStep(board: Board, ceiling: Difficulty): SudokuStep | null {
  const top = bandRank(ceiling);
  for (let i = 0; i < ORDERED_FINDERS.length; i++) {
    if (ORDERED_RANKS[i] > top) break;
    const step = ORDERED_FINDERS[i](board);
    if (step) return step;
  }
  return null;
}

/**
 * Rates a puzzle by solving it with the techniques up to `ceiling` (all by default). A puzzle the
 * techniques cannot finish rates null: the generator never offers one.
 */
export function rateSudoku(shape: SudokuShape, values: readonly number[], ceiling: Difficulty = 'expert'): SudokuRating {
  const board = new Board(geometry(shape), values);
  let hardest: Technique | null = null;
  let hardestRank = -1;
  let steps = 0;
  while (!board.solved()) {
    if (board.broken()) return { difficulty: null, hardest, steps };
    const step = findStep(board, ceiling);
    if (!step) return { difficulty: null, hardest, steps };
    const rank = RANK_OF.get(step.technique) as number;
    if (rank > hardestRank) {
      hardestRank = rank;
      hardest = step.technique;
    }
    board.apply(step);
    steps++;
  }
  return { difficulty: hardestRank < 0 ? 'easy' : BAND_ORDER[hardestRank], hardest, steps };
}

/** Places every naked and hidden single the board shows, pass after pass, until none is left. */
function placeSingles(board: Board): void {
  const { values, candidates } = board;
  const { units } = board.geo;
  for (let progress = true; progress; ) {
    progress = false;
    for (let cell = 0; cell < values.length; cell++) {
      const mask = candidates[cell];
      if (values[cell] === 0 && mask !== 0 && (mask & (mask - 1)) === 0) {
        board.place(cell, lowestValue(mask));
        progress = true;
      }
    }
    for (let u = 0; u < units.length; u++) {
      const unit = units[u];
      let once = 0;
      let twice = 0;
      for (let i = 0; i < unit.length; i++) {
        const mask = candidates[unit[i]];
        twice |= once & mask;
        once |= mask;
      }
      for (let single = once & ~twice; single; single &= single - 1) {
        const b = single & -single;
        for (let i = 0; i < unit.length; i++) {
          // A cell an earlier single of this pass filled has no candidates left; the next check
          // of `broken` then finds the clash.
          if (candidates[unit[i]] & b) {
            board.place(unit[i], lowestValue(b));
            progress = true;
            break;
          }
        }
      }
    }
  }
}

/**
 * The grid the techniques up to `ceiling` finish, or null when they cannot: finished exactly when
 * `rateSudoku(...).difficulty !== null`, found faster. Singles reach the same end in any order, so
 * they are placed in batches; a harder technique is still applied one step at a time, after the
 * singles run out, as `rateSudoku` applies it (#380, tablet speed).
 */
export function finishSudoku(shape: SudokuShape, values: readonly number[], ceiling: Difficulty = 'expert'): number[] | null {
  const board = new Board(geometry(shape), values);
  const top = bandRank(ceiling);
  for (;;) {
    placeSingles(board);
    if (board.broken()) return null;
    if (board.solved()) return board.values;
    let step: SudokuStep | null = null;
    // Singles are spent, so the search starts at the first harder technique.
    for (let i = SINGLES; i < ORDERED_FINDERS.length && !step; i++) {
      if (ORDERED_RANKS[i] > top) break;
      step = ORDERED_FINDERS[i](board);
    }
    if (!step) return null;
    board.apply(step);
  }
}

/** Whether the techniques up to `ceiling` finish the puzzle. */
export const solvesWithin = (shape: SudokuShape, values: readonly number[], ceiling: Difficulty): boolean =>
  finishSudoku(shape, values, ceiling) !== null;

/**
 * True when the empty `cell` of `values` must hold `value` by a naked or hidden single read
 * straight from the filled cells: its peers hold every other value, or every other empty cell of
 * one of its units sees `value`. The generator uses it to keep a removal without a full rating:
 * these techniques reach the same end in any order, so a grid the techniques finish stays finished
 * after one such cell is emptied (#380).
 */
export function isSingleAt(shape: SudokuShape, values: readonly number[], cell: number, value: number): boolean {
  const geo = geometry(shape);
  const { peers, units, unitsOf } = geo;
  const b = bit(value);
  const seen = (target: number): number => {
    let mask = 0;
    const around = peers[target];
    for (let i = 0; i < around.length; i++) if (values[around[i]]) mask |= bit(values[around[i]]);
    return mask;
  };
  const all = (1 << shape.size) - 1;
  if ((seen(cell) | b) === all && !(seen(cell) & b)) return true;
  for (const u of unitsOf[cell]) {
    let alone = true;
    for (const other of units[u]) {
      if (other === cell || values[other]) continue;
      if (!(seen(other) & b)) {
        alone = false;
        break;
      }
    }
    if (alone) return true;
  }
  return false;
}

/**
 * The next logical step from a grid in play (0 for an empty cell), for a stepped hint, or null when
 * no technique applies. Entries are taken as written; a wrong one can make the hint wrong too, so a
 * caller checks entries against the solution first.
 */
export function nextSudokuStep(shape: SudokuShape, values: readonly number[]): SudokuStep | null {
  const board = new Board(geometry(shape), values);
  if (board.solved() || board.broken()) return null;
  return findStep(board, 'expert');
}
