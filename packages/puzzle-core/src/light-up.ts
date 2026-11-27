/**
 * Light Up (#395): a seeded grid of walls, some numbered, and the one set of bulbs that lights
 * every white cell. A bulb lights its row and column up to the next wall; no bulb lights another;
 * a numbered wall has exactly that many bulbs beside it.
 *
 * The method follows Simon Tatham's Light Up (MIT): place walls, light the grid with random bulbs,
 * number every wall, then take numbers away while the solver still finishes the grid at the band.
 * The code is our own.
 *
 * The band comes from the solve: `easy` when the direct rules finish it, `medium` when it also
 * needs probing (a cell whose one value breaks a rule once the direct rules run), `hard` when it
 * needs many probes. A grid that still needs a guess is never offered. Probing a probe (two deep)
 * was tried for `hard` and took seconds per grid on the Mac, too slow for the tablet.
 */

import { puzzleCode, type Difficulty, type PuzzleId } from './code';
import { classifyMark, marksByCell, type InkStroke } from './check/cells';
import { FONT_WEIGHTS, drawCentredText } from './page/font';
import { cellCenter, drawSquareLattice, shadeCells, type Cell } from './page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type PageLayout } from './page/layout';
import { TEXT_SIZE, type CellPreset, type Hand, type Orientation } from './page/look';
import type { Raster } from './page/raster';
import { childSeed, createRandom, type Random } from './random';

export interface LightUpSize {
  width: number;
  height: number;
}

/** The clues of a grid: which cells are walls, and each wall's number, or null for none. */
export interface LightUpGrid {
  width: number;
  height: number;
  /** Row by row, true for a wall. */
  walls: readonly boolean[];
  /** Row by row: a wall's number of bulbs beside it, else null. */
  clues: readonly (number | null)[];
}

export interface LightUp extends LightUpGrid {
  id: PuzzleId;
  walls: boolean[];
  clues: (number | null)[];
  /** Row by row, true for a bulb. */
  solution: boolean[];
}

export interface LightUpRating {
  difficulty: Difficulty;
  /** Cells set by probing. */
  probes: number;
}

export const LIGHT_UP_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const LIGHT_UP_MIN_SIDE = 5;
/** shortcut: a hard 14 x 14 failed 7 of 20 seeds and took 1.2 s each on the Mac; raise it after a tablet timing. */
export const LIGHT_UP_MAX_SIDE = 12;

const UNKNOWN = -1;
const EMPTY = 0;
const BULB = 1;
const NO_CLUE = -1;

/**
 * [inference] a grid that needs at least this many probes per 10 white cells, and at least
 * `HARD_MIN_PROBES`, is hard: about the top third of the probing grids at sides 7 to 14.
 */
const HARD_PROBES_PER_10 = 1;
const HARD_MIN_PROBES = 4;

/** The fixed facts of one grid, built once per solve: the cells each white cell sees, each wall's white neighbours. */
interface Board {
  cells: number;
  walls: Uint8Array;
  clue: Int8Array;
  /** Per white cell, the white cells in its row and column up to the next wall, itself left out. */
  sight: number[][];
  /** Per wall with a number, its white neighbours. */
  around: number[][];
  numbered: number[];
  whites: number[];
}

function boardOf(grid: LightUpGrid): Board {
  const { width, height } = grid;
  const cells = width * height;
  const walls = new Uint8Array(cells);
  const clue = new Int8Array(cells).fill(NO_CLUE);
  for (let i = 0; i < cells; i++) {
    walls[i] = grid.walls[i] ? 1 : 0;
    const n = grid.clues[i];
    if (walls[i] && n !== null && n !== undefined) clue[i] = n;
  }
  const sight: number[][] = [];
  const around: number[][] = [];
  const numbered: number[] = [];
  const whites: number[] = [];
  const steps: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0; i < cells; i++) {
    const r = Math.floor(i / width);
    const c = i % width;
    sight.push([]);
    around.push([]);
    if (walls[i]) {
      if (clue[i] === NO_CLUE) continue;
      numbered.push(i);
      for (const [dc, dr] of steps) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc >= 0 && rr >= 0 && cc < width && rr < height && !walls[rr * width + cc]) around[i].push(rr * width + cc);
      }
      continue;
    }
    whites.push(i);
    for (const [dc, dr] of steps) {
      for (let cc = c + dc, rr = r + dr; cc >= 0 && rr >= 0 && cc < width && rr < height; cc += dc, rr += dr) {
        if (walls[rr * width + cc]) break;
        sight[i].push(rr * width + cc);
      }
    }
  }
  return { cells, walls, clue, sight, around, numbered, whites };
}

/** A white cell's state: UNKNOWN, EMPTY or BULB; a wall stays EMPTY. */
type State = Int8Array;

function newState(board: Board): State {
  const state = new Int8Array(board.cells).fill(EMPTY);
  for (const i of board.whites) state[i] = UNKNOWN;
  return state;
}

/**
 * The direct rules to a fixed point; false on a contradiction. A bulb empties the cells it sees; a
 * number whose bulbs are all placed empties its other neighbours, and one that needs every open
 * neighbour fills them; an unlit cell with one place left for its bulb gets it there.
 */
function propagate(board: Board, state: State): boolean {
  const { sight, around, numbered, whites, clue } = board;
  for (let changed = true; changed; ) {
    changed = false;
    for (const i of whites) {
      if (state[i] !== BULB) continue;
      for (const j of sight[i]) {
        if (state[j] === BULB) return false;
        if (state[j] === UNKNOWN) {
          state[j] = EMPTY;
          changed = true;
        }
      }
    }
    for (const w of numbered) {
      let bulbs = 0;
      let open = 0;
      for (const j of around[w]) {
        if (state[j] === BULB) bulbs++;
        else if (state[j] === UNKNOWN) open++;
      }
      const need = clue[w];
      if (bulbs > need || bulbs + open < need) return false;
      if (open === 0) continue;
      if (bulbs === need || bulbs + open === need) {
        const value = bulbs === need ? EMPTY : BULB;
        for (const j of around[w]) if (state[j] === UNKNOWN) state[j] = value;
        changed = true;
      }
    }
    for (const i of whites) {
      if (state[i] === BULB) continue;
      let place = state[i] === UNKNOWN ? i : -1;
      let places = place >= 0 ? 1 : 0;
      let lit = false;
      for (const j of sight[i]) {
        if (state[j] === BULB) {
          lit = true;
          break;
        }
        if (state[j] === UNKNOWN) {
          places++;
          place = j;
        }
      }
      if (lit) continue;
      if (places === 0) return false;
      if (places === 1) {
        state[place] = BULB;
        changed = true;
      }
    }
  }
  return true;
}

/**
 * The direct rules, then, with `probing`, probes: a value of an open cell whose direct rules break
 * a rule fixes the other value. Returns the probes made, or -1 on a contradiction.
 */
function solve(board: Board, state: State, probing: boolean): number {
  if (!propagate(board, state)) return -1;
  if (!probing) return 0;
  let probes = 0;
  for (let probed = true; probed && state.includes(UNKNOWN); ) {
    probed = false;
    for (const i of board.whites) {
      if (state[i] !== UNKNOWN) continue;
      for (const value of [BULB, EMPTY] as const) {
        const trial = state.slice();
        trial[i] = value;
        if (propagate(board, trial)) continue;
        state[i] = value === BULB ? EMPTY : BULB;
        if (!propagate(board, state)) return -1;
        probes++;
        probed = true;
        break;
      }
    }
  }
  return probes;
}

/** The band of a solve that needed this many probes, over this many white cells. */
function bandOf(probes: number, whites: number): Difficulty {
  if (probes === 0) return 'easy';
  return probes >= Math.max(HARD_MIN_PROBES, Math.round((whites * HARD_PROBES_PER_10) / 10)) ? 'hard' : 'medium';
}

/** The rating of the clues, with or without probing, or null when that cannot finish them. */
function rateWith(grid: LightUpGrid, probing: boolean): LightUpRating | null {
  const board = boardOf(grid);
  const state = newState(board);
  const probes = solve(board, state, probing);
  if (probes < 0 || state.includes(UNKNOWN)) return null;
  return { difficulty: bandOf(probes, board.whites.length), probes };
}

/**
 * The rating of the clues, or null when probing cannot finish them (a guess would be needed) or
 * they break a rule. A rating proves the one solution: every step it takes is forced.
 */
export function rateLightUp(grid: LightUpGrid): LightUpRating | null {
  return rateWith(grid, true);
}

/** The bulbs the clues force, row by row, or null when the solver cannot finish them. */
export function solveLightUp(grid: LightUpGrid): boolean[] | null {
  const board = boardOf(grid);
  const state = newState(board);
  if (solve(board, state, true) < 0 || state.includes(UNKNOWN)) return null;
  return Array.from(state, v => v === BULB);
}

/** Solutions of the clues, counted up to `limit`, by the direct rules and branching on a cell. */
export function countLightUpSolutions(grid: LightUpGrid, limit = 2): number {
  const board = boardOf(grid);
  const search = (state: State): number => {
    if (!propagate(board, state)) return 0;
    const open = state.indexOf(UNKNOWN);
    if (open < 0) return 1;
    let count = 0;
    for (const value of [BULB, EMPTY] as const) {
      const next = state.slice();
      next[open] = value;
      count += search(next);
      if (count >= limit) return count;
    }
    return count;
  };
  return search(newState(board));
}

/** Wall chance in percent per band: fewer walls leave longer lines, which need deeper reasoning. */
const WALL_DENSITY: Record<string, number> = { easy: 24, medium: 20, hard: 18 };
const LIGHT_UP_ATTEMPTS = 320;

/** Walls with a half-turn symmetry, as printed Light Up grids have. */
function wallsOf(random: Random, width: number, height: number, density: number): boolean[] {
  const cells = width * height;
  const walls = new Array<boolean>(cells).fill(false);
  for (let i = 0; i <= cells - 1 - i; i++) {
    if (random.chance(density)) walls[i] = walls[cells - 1 - i] = true;
  }
  return walls;
}

/** Bulbs placed on random unlit cells until every white cell is lit: one solution of some numbering. */
function bulbsOf(random: Random, board: Board): boolean[] {
  const bulbs = new Array<boolean>(board.cells).fill(false);
  const lit = new Uint8Array(board.cells);
  for (const i of random.shuffle([...board.whites])) {
    if (lit[i]) continue;
    bulbs[i] = true;
    lit[i] = 1;
    for (const j of board.sight[i]) lit[j] = 1;
  }
  return bulbs;
}

/**
 * A Light Up grid of the given size and band from the seed. Throws on a side outside 5 to 12, a
 * band not offered, or when the attempts run out.
 */
export function generateLightUp(seed: string, size: LightUpSize, difficulty: Difficulty): LightUp {
  const { width, height } = size;
  for (const side of [width, height]) {
    if (!Number.isInteger(side) || side < LIGHT_UP_MIN_SIDE || side > LIGHT_UP_MAX_SIDE) {
      throw new RangeError(`a Light Up side is ${LIGHT_UP_MIN_SIDE} to ${LIGHT_UP_MAX_SIDE} cells, not ${side}`);
    }
  }
  if (!LIGHT_UP_BANDS.includes(difficulty)) throw new RangeError(`Light Up offers ${LIGHT_UP_BANDS.join(', ')}, not ${difficulty}`);
  const probing = difficulty !== 'easy';
  for (let attempt = 0; attempt < LIGHT_UP_ATTEMPTS; attempt++) {
    const random = createRandom(childSeed(seed, attempt));
    const walls = wallsOf(random, width, height, WALL_DENSITY[difficulty]);
    const full = boardOf({ width, height, walls, clues: walls.map(() => null) });
    if (full.whites.length === 0) continue;
    const solution = bulbsOf(random, full);
    const clues = walls.map((wall, i) => (wall ? bulbsBeside(width, height, solution, i) : null));
    const grid = { width, height, walls, clues };
    if (!rateWith(grid, probing)) continue;
    // Take numbers away, in a random order, while the band's rules still finish the grid.
    for (const i of random.shuffle(walls.flatMap((wall, i) => (wall ? [i] : [])))) {
      const kept = clues[i];
      clues[i] = null;
      if (!rateWith(grid, probing)) clues[i] = kept;
    }
    if (rateWith(grid, probing)?.difficulty !== difficulty) continue;
    return { id: { game: 'light-up', size: `${width}X${height}`, difficulty, seed }, width, height, walls, clues, solution };
  }
  throw new Error(`no ${difficulty} ${width} x ${height} Light Up from seed «${seed}» in ${LIGHT_UP_ATTEMPTS} attempts`);
}

/** The bulbs beside a cell. */
function bulbsBeside(width: number, height: number, bulbs: readonly boolean[], i: number): number {
  const r = Math.floor(i / width);
  const c = i % width;
  let n = 0;
  if (c > 0 && bulbs[i - 1]) n++;
  if (c + 1 < width && bulbs[i + 1]) n++;
  if (r > 0 && bulbs[i - width]) n++;
  if (r + 1 < height && bulbs[i + width]) n++;
  return n;
}

export const LIGHT_UP_RULE = 'Draw a circle for each bulb: light every white cell, no bulb lights another.';

export interface LightUpPageOptions {
  orientation: Orientation;
  hand: Hand;
  /** The cell preset; the largest that fits when absent. */
  cellMm?: CellPreset;
}

const BAND_NAMES: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

/** The game's page: the lattice, the walls in ink with their numbers in paper, and the footer. */
export function drawLightUpPage(puzzle: LightUp, options: LightUpPageOptions): { layout: PageLayout; raster: Raster } {
  const spec = { orientation: options.orientation, hand: options.hand, lattice: 'square', columns: puzzle.width, rows: puzzle.height } as const;
  const layout = layoutPage({ ...spec, cellMm: options.cellMm ?? fitCellMm(spec) });
  const raster = createPage(layout);
  const { grid } = layout;
  drawSquareLattice(raster, grid);
  const walls: Cell[] = [];
  puzzle.walls.forEach((wall, i) => wall && walls.push([i % puzzle.width, Math.floor(i / puzzle.width)]));
  shadeCells(raster, grid, walls, 'ink');
  const style = { size: Math.round(grid.cell * TEXT_SIZE.given), weight: FONT_WEIGHTS.bold, tone: 'paper' } as const;
  puzzle.clues.forEach((n, i) => {
    if (n === null) return;
    const [cx, cy] = cellCenter(grid, i % puzzle.width, Math.floor(i / puzzle.width));
    drawCentredText(raster, String(n), cx, cy, style);
  });
  drawFooter(raster, layout, { game: 'Light Up', difficulty: BAND_NAMES[puzzle.id.difficulty], code: puzzleCode(puzzle.id), rule: LIGHT_UP_RULE });
  return { layout, raster };
}

export interface LightUpCheck {
  /** Cells with a bulb that should have none, and cells marked with no bulb (a dot or a cross) that need one. */
  readonly wrong: number[];
  /** Bulbs in the right cells. */
  readonly right: number[];
  /** Bulbs of the solution with no mark yet: not wrong, the page is unfinished. */
  readonly missing: number[];
  readonly solved: boolean;
}

/**
 * «Check» from the ink, with no recognition: a circle or a filled cell is a bulb, a dot or a cross
 * marks a cell the player left without one. Ink on a wall is ignored.
 */
export function checkLightUp<E>(puzzle: LightUp, layout: Pick<PageLayout, 'grid'>, strokes: readonly InkStroke<E>[]): LightUpCheck {
  const byCell = marksByCell(layout.grid, strokes);
  const result = { wrong: [] as number[], right: [] as number[], missing: [] as number[], solved: false };
  for (let i = 0; i < puzzle.walls.length; i++) {
    if (puzzle.walls[i]) continue;
    const ink = byCell.get(i);
    const mark = ink ? classifyMark(layout.grid, i, ink) : 'empty';
    const bulb = mark === 'shade' || mark === 'other';
    if (bulb) (puzzle.solution[i] ? result.right : result.wrong).push(i);
    else if (puzzle.solution[i]) (mark === 'empty' ? result.missing : result.wrong).push(i);
  }
  result.solved = result.wrong.length === 0 && result.missing.length === 0;
  return result;
}
