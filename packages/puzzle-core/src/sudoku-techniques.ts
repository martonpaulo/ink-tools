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

interface Geometry {
  shape: SudokuShape;
  units: number[][];
  /** For each cell, the indices of its row, column and box in `units`. */
  unitsOf: number[][];
  peers: number[][];
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
  const made = { shape, units, unitsOf, peers };
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
    this.candidates = values.map(v => (v ? 0 : all));
    values.forEach((v, cell) => {
      if (v) for (const p of geo.peers[cell]) this.candidates[p] &= ~bit(v);
    });
  }

  place(cell: number, value: number): void {
    this.values[cell] = value;
    this.candidates[cell] = 0;
    for (const p of this.geo.peers[cell]) this.candidates[p] &= ~bit(value);
  }

  apply(step: SudokuStep): void {
    for (const e of step.eliminations) this.candidates[e.cell] &= ~bit(e.value);
    for (const p of step.placements) this.place(p.cell, p.value);
  }

  solved(): boolean {
    return this.values.every(v => v !== 0);
  }

  /** True when an empty cell has no candidate left: the givens contradict each other. */
  broken(): boolean {
    return this.values.some((v, cell) => v === 0 && this.candidates[cell] === 0);
  }
}

type Finder = (board: Board) => SudokuStep | null;

const nakedSingle: Finder = board => {
  for (let cell = 0; cell < board.values.length; cell++) {
    const mask = board.candidates[cell];
    if (board.values[cell] === 0 && popcount(mask) === 1) {
      return { technique: 'naked single', placements: [{ cell, value: lowestValue(mask) }], eliminations: [] };
    }
  }
  return null;
};

const hiddenSingle: Finder = board => {
  const n = board.geo.shape.size;
  for (const unit of board.geo.units) {
    for (let v = 1; v <= n; v++) {
      let where = -1;
      let count = 0;
      for (const cell of unit) {
        if (board.candidates[cell] & bit(v)) {
          where = cell;
          count++;
        }
      }
      if (count === 1) return { technique: 'hidden single', placements: [{ cell: where, value: v }], eliminations: [] };
    }
  }
  return null;
};

/** Pointing and claiming: a value confined to one unit's overlap with another leaves the rest of the other. */
const lockedCandidates: Finder = board => {
  const n = board.geo.shape.size;
  const { units, unitsOf } = board.geo;
  for (let u = 0; u < units.length; u++) {
    for (let v = 1; v <= n; v++) {
      const cells = units[u].filter(cell => board.candidates[cell] & bit(v));
      if (cells.length < 2) continue;
      // Every other unit that holds all of these cells.
      for (const other of unitsOf[cells[0]]) {
        if (other === u || !cells.every(cell => unitsOf[cell].includes(other))) continue;
        const eliminations = units[other]
          .filter(cell => !cells.includes(cell) && board.candidates[cell] & bit(v))
          .map(cell => ({ cell, value: v }));
        if (eliminations.length) return { technique: 'locked candidates', placements: [], eliminations };
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

function findStep(board: Board, ceiling: Difficulty): SudokuStep | null {
  for (const [technique, band] of TECHNIQUE_BANDS) {
    if (bandRank(band) > bandRank(ceiling)) break;
    const step = FINDERS[technique](board);
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
    const rank = bandRank(TECHNIQUE_BANDS.find(([t]) => t === step.technique)![1]);
    if (rank > hardestRank) {
      hardestRank = rank;
      hardest = step.technique;
    }
    board.apply(step);
    steps++;
  }
  return { difficulty: hardestRank < 0 ? 'easy' : BAND_ORDER[hardestRank], hardest, steps };
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
