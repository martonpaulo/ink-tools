/**
 * The drawing primitives of a Puzzles page (#379): lattices, regions, cages, clues and icons. Each
 * game composes these; none knows a game. Axis-aligned lines sit on whole pixels; slanted lines
 * (hex and triangle lattices, icons) blend their edges into native greys.
 */
import { FONT_WEIGHTS, capHeight, drawCentredText, drawText, measureText } from './font';
import { LINE_PX, TEXT_SIZE, type Tone } from './look';
import { fillDisc, fillPolygon, fillRect, strokeLine, type Raster } from './raster';

export type Lattice = 'square' | 'hex' | 'triangle';

/**
 * Where a grid sits on the page, in whole pixels. `cell` is a square's side, a hexagon's width
 * flat to flat, or a triangle's side.
 */
export interface Grid {
  readonly lattice: Lattice;
  readonly x: number;
  readonly y: number;
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
}

export type Side = 'top' | 'left' | 'bottom' | 'right';
export type Icon = 'tree' | 'pearl-white' | 'pearl-black' | 'cross' | 'arrow-up' | 'arrow-right' | 'arrow-down' | 'arrow-left';
export type Cell = readonly [column: number, row: number];

const SQRT3 = Math.sqrt(3);
/** Hexagon rows step down by one and a half radii. */
const HEX_ROW_STEP = 1.5;
/** A triangle's centroid sits a third of its height from its flat side. */
const THIRDS = 3;
/** A cage label's paper box: the label plus this many paddings across and down. */
const LABEL_BOX_PADS = 3;
/** An edge sign's chevron: how far its point and its arms reach from the edge, as shares of the cell. */
const SIGN_SHAPE = { depth: 0.1, spread: 0.13, pad: 0.03 } as const;
/** The icon shapes, as shares of the icon's half width. */
const ICON_SHAPE = { crossArm: 0.7, trunkWidth: 0.25, canopyHalfWidth: 0.8, canopyBase: 1 / THIRDS } as const;

/** A hexagon's half height (its circumradius) for a flat-to-flat width. */
function hexRadius(cell: number): number {
  return cell / SQRT3;
}

/** A triangle row's height, rounded so every row line sits on a whole pixel. */
function triangleRowHeight(cell: number): number {
  return Math.round((cell * SQRT3) / 2);
}

/** The lattice's cell for a preset size: hexagons and triangles need an even width, so halves are whole. */
export function latticeCell(lattice: Lattice, px: number): number {
  return lattice === 'square' ? px : 2 * Math.round(px / 2);
}

/** The grid's outer size in pixels. */
export function gridSize(lattice: Lattice, cell: number, columns: number, rows: number): { width: number; height: number } {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
    throw new Error(`a grid needs at least one column and one row, not ${columns} x ${rows}`);
  }
  if (lattice === 'square') return { width: columns * cell, height: rows * cell };
  if (lattice === 'hex') {
    const r = hexRadius(cell);
    return { width: columns * cell + (rows > 1 ? cell / 2 : 0), height: Math.ceil(2 * r + (rows - 1) * HEX_ROW_STEP * r) };
  }
  return { width: ((columns + 1) * cell) / 2, height: rows * triangleRowHeight(cell) };
}

/** The cell's outline as a flat point list, clockwise on the page. */
export function cellPolygon(grid: Grid, column: number, row: number): number[] {
  const { x, y, cell } = grid;
  if (grid.lattice === 'square') {
    const left = x + column * cell;
    const top = y + row * cell;
    return [left, top, left + cell, top, left + cell, top + cell, left, top + cell];
  }
  if (grid.lattice === 'hex') {
    const [cx, cy] = cellCenter(grid, column, row);
    const r = hexRadius(cell);
    const half = cell / 2;
    return [cx, cy - r, cx + half, cy - r / 2, cx + half, cy + r / 2, cx, cy + r, cx - half, cy + r / 2, cx - half, cy - r / 2];
  }
  const h = triangleRowHeight(cell);
  const left = x + (column * cell) / 2;
  const top = y + row * h;
  return (column + row) % 2 === 0
    ? [left + cell / 2, top, left + cell, top + h, left, top + h]
    : [left, top, left + cell, top, left + cell / 2, top + h];
}

/** The point a cell's text or icon centres on. */
export function cellCenter(grid: Grid, column: number, row: number): [number, number] {
  const { x, y, cell } = grid;
  if (grid.lattice === 'square') return [x + column * cell + cell / 2, y + row * cell + cell / 2];
  if (grid.lattice === 'hex') {
    const r = hexRadius(cell);
    return [x + cell / 2 + column * cell + (row % 2 === 1 ? cell / 2 : 0), y + r + row * HEX_ROW_STEP * r];
  }
  const h = triangleRowHeight(cell);
  const up = (column + row) % 2 === 0;
  return [x + (column * cell) / 2 + cell / 2, y + row * h + (up ? (2 * h) / THIRDS : h / THIRDS)];
}

function requireSquare(grid: Grid, what: string): void {
  if (grid.lattice !== 'square') throw new Error(`${what} is drawn on a square grid, not a ${grid.lattice} one`);
}

/** A line of even width `w` centred on a whole-pixel edge. */
function hLine(raster: Raster, x0: number, x1: number, y: number, w: number, tone: Tone): void {
  fillRect(raster, x0 - w / 2, y - w / 2, x1 - x0 + w, w, tone);
}
function vLine(raster: Raster, x: number, y0: number, y1: number, w: number, tone: Tone): void {
  fillRect(raster, x - w / 2, y0 - w / 2, w, y1 - y0 + w, tone);
}

/** Grid lines in the line grey and the outer frame in ink. */
export function drawSquareLattice(raster: Raster, grid: Grid): void {
  requireSquare(grid, 'a square lattice');
  const { x, y, cell, columns, rows } = grid;
  const right = x + columns * cell;
  const bottom = y + rows * cell;
  for (let c = 1; c < columns; c++) vLine(raster, x + c * cell, y, bottom, LINE_PX.grid, 'line');
  for (let r = 1; r < rows; r++) hLine(raster, x, right, y + r * cell, LINE_PX.grid, 'line');
  drawFrame(raster, grid);
}

/** The outer frame of a square grid. */
export function drawFrame(raster: Raster, grid: Grid): void {
  requireSquare(grid, 'a frame');
  const { x, y, cell, columns, rows } = grid;
  const right = x + columns * cell;
  const bottom = y + rows * cell;
  hLine(raster, x, right, y, LINE_PX.frame, 'ink');
  hLine(raster, x, right, bottom, LINE_PX.frame, 'ink');
  vLine(raster, x, y, bottom, LINE_PX.frame, 'ink');
  vLine(raster, right, y, bottom, LINE_PX.frame, 'ink');
}

/** A dot on every lattice point of a square grid, for games drawn between the dots. */
export function drawDotLattice(raster: Raster, grid: Grid): void {
  requireSquare(grid, 'a dot lattice');
  for (let r = 0; r <= grid.rows; r++) {
    for (let c = 0; c <= grid.columns; c++) {
      fillDisc(raster, grid.x + c * grid.cell, grid.y + r * grid.cell, LINE_PX.dot, 'ink');
    }
  }
}

/** Strokes each cell edge once, so a shared edge is not blended twice. */
function strokeCellEdges(raster: Raster, grid: Grid, tone: Tone): void {
  const seen = new Set<string>();
  const key = (v: number) => v.toFixed(2);
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.columns; c++) {
      const p = cellPolygon(grid, c, r);
      const n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = `${key(p[2 * i])},${key(p[2 * i + 1])}`;
        const b = `${key(p[2 * j])},${key(p[2 * j + 1])}`;
        const edge = a < b ? `${a} ${b}` : `${b} ${a}`;
        if (seen.has(edge)) continue;
        seen.add(edge);
        strokeLine(raster, p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1], LINE_PX.grid, tone);
      }
    }
  }
}

/** A lattice of pointy-top hexagons, odd rows shifted right by half a cell. */
export function drawHexLattice(raster: Raster, grid: Grid): void {
  if (grid.lattice !== 'hex') throw new Error(`a hex lattice needs a hex grid, not a ${grid.lattice} one`);
  strokeCellEdges(raster, grid, 'ink');
}

/** A lattice of triangles, up and down in turn. */
export function drawTriangleLattice(raster: Raster, grid: Grid): void {
  if (grid.lattice !== 'triangle') throw new Error(`a triangle lattice needs a triangle grid, not a ${grid.lattice} one`);
  strokeCellEdges(raster, grid, 'ink');
}

/**
 * Fills cells with a tone (the shade grey by default), drawn before the lattice. A square cell on
 * whole pixels is the same pixels as its polygon, filled as a rectangle: the polygon's coverage
 * took 0.3 s of a 12 x 12 kakuro page under `node --jitless`, about 3 s on the tablet (#552).
 */
export function shadeCells(raster: Raster, grid: Grid, cells: readonly Cell[], tone: Tone = 'shade'): void {
  const { x, y, cell } = grid;
  const whole = grid.lattice === 'square' && [x, y, cell].every(Number.isInteger);
  for (const [c, r] of cells) {
    if (whole) fillRect(raster, x + c * cell, y + r * cell, cell, cell, tone);
    else fillPolygon(raster, [cellPolygon(grid, c, r)], tone);
  }
}

/** Thick ink borders between cells of different regions (sudoku boxes, jigsaw regions), and the frame. */
export function drawRegions(raster: Raster, grid: Grid, regionOf: (column: number, row: number) => number): void {
  requireSquare(grid, 'a region border');
  const { x, y, cell, columns, rows } = grid;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (c + 1 < columns && regionOf(c, r) !== regionOf(c + 1, r)) {
        vLine(raster, x + (c + 1) * cell, y + r * cell, y + (r + 1) * cell, LINE_PX.region, 'ink');
      }
      if (r + 1 < rows && regionOf(c, r) !== regionOf(c, r + 1)) {
        hLine(raster, x + c * cell, x + (c + 1) * cell, y + (r + 1) * cell, LINE_PX.region, 'ink');
      }
    }
  }
  drawFrame(raster, grid);
}

/** A dashed segment along one axis, on whole pixels. */
function dash(raster: Raster, from: number, to: number, at: number, vertical: boolean): void {
  const w = LINE_PX.cage;
  for (let p = from; p < to; p += 2 * LINE_PX.cageDash) {
    const end = Math.min(to, p + LINE_PX.cageDash);
    if (vertical) fillRect(raster, at - w / 2, p, w, end - p, 'ink');
    else fillRect(raster, p, at - w / 2, end - p, w, 'ink');
  }
}

/**
 * A cage (killer sudoku, calcudoku): a dashed ink line just inside the outline of a set of cells,
 * and its label, if any, in the top-left cell's corner.
 */
export function drawCage(raster: Raster, grid: Grid, cells: readonly Cell[], label?: string): void {
  requireSquare(grid, 'a cage');
  if (cells.length === 0) throw new Error('a cage needs at least one cell');
  const { x, y, cell } = grid;
  const inside = new Set(cells.map(([c, r]) => `${c},${r}`));
  const has = (c: number, r: number) => inside.has(`${c},${r}`);
  const inset = Math.round(cell / 10);
  for (const [c, r] of cells) {
    const left = x + c * cell;
    const top = y + r * cell;
    const right = left + cell;
    const bottom = top + cell;
    // Each side runs to the cell's edge where the cage goes on, and past it where it turns inward.
    const end = (along: boolean, diagonal: boolean) => (!along ? inset : diagonal ? -inset : 0);
    if (!has(c, r - 1)) {
      dash(raster, left + end(has(c - 1, r), has(c - 1, r - 1)), right - end(has(c + 1, r), has(c + 1, r - 1)), top + inset, false);
    }
    if (!has(c, r + 1)) {
      dash(raster, left + end(has(c - 1, r), has(c - 1, r + 1)), right - end(has(c + 1, r), has(c + 1, r + 1)), bottom - inset, false);
    }
    if (!has(c - 1, r)) {
      dash(raster, top + end(has(c, r - 1), has(c - 1, r - 1)), bottom - end(has(c, r + 1), has(c - 1, r + 1)), left + inset, true);
    }
    if (!has(c + 1, r)) {
      dash(raster, top + end(has(c, r - 1), has(c + 1, r - 1)), bottom - end(has(c, r + 1), has(c + 1, r + 1)), right - inset, true);
    }
  }
  if (label === undefined) return;
  const [c, r] = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
  const size = Math.round(cell * TEXT_SIZE.clue);
  const width = Math.ceil(measureText(label, size, FONT_WEIGHTS.regular));
  const height = Math.ceil(capHeight(size));
  const pad = Math.round(inset / 2);
  const box = LABEL_BOX_PADS * pad;
  const left = x + c * cell + inset;
  const top = y + r * cell + inset;
  // A paper box behind the label breaks the dashes, as printed killer sudokus do.
  fillRect(raster, left - pad, top - pad, width + box, height + box, 'paper');
  drawText(raster, label, left + pad, top + pad + height, { size, weight: FONT_WEIGHTS.regular, tone: 'ink' });
}

/** How deep one outside clue sits across the grid's edge, in pixels. */
export function outsideSlot(cell: number): number {
  return Math.round(cell * TEXT_SIZE.outsideSlot);
}

/**
 * Clues outside a square grid, one list per column (top, bottom) or row (left, right): nonogram
 * runs or skyscraper counts. A list reads toward the grid on the top and left, away from it on the
 * bottom and right, so its last item, or its first, touches the grid. An empty list draws nothing.
 */
export function drawOutsideClues(raster: Raster, grid: Grid, side: Side, lists: readonly (readonly string[])[], gap: number): void {
  requireSquare(grid, 'an outside clue');
  const along = side === 'top' || side === 'bottom' ? grid.columns : grid.rows;
  if (lists.length !== along) throw new Error(`the ${side} side needs ${along} clue lists, not ${lists.length}`);
  const { x, y, cell } = grid;
  const slot = outsideSlot(cell);
  const size = Math.round(cell * TEXT_SIZE.outsideClue);
  const style = { size, weight: FONT_WEIGHTS.regular, tone: 'ink' } as const;
  lists.forEach((list, i) => {
    const middle = (side === 'top' || side === 'bottom' ? x : y) + i * cell + cell / 2;
    list.forEach((text, k) => {
      const depth = side === 'top' || side === 'left' ? list.length - 1 - k : k;
      const offset = gap + depth * slot + slot / 2;
      if (side === 'top') drawCentredText(raster, text, middle, y - offset, style);
      else if (side === 'left') drawCentredText(raster, text, x - offset, middle, style);
      else if (side === 'bottom') drawCentredText(raster, text, middle, y + grid.rows * cell + offset, style);
      else drawCentredText(raster, text, x + grid.columns * cell + offset, middle, style);
    });
  });
}

/** A given (large, bold, centred) or a small clue (in the top-left corner) inside a cell. */
export function drawCellText(raster: Raster, grid: Grid, column: number, row: number, text: string, kind: 'given' | 'clue'): void {
  const { cell } = grid;
  if (kind === 'given') {
    const [cx, cy] = cellCenter(grid, column, row);
    drawCentredText(raster, text, cx, cy, { size: Math.round(cell * TEXT_SIZE.given), weight: FONT_WEIGHTS.bold, tone: 'ink' });
    return;
  }
  requireSquare(grid, 'a corner clue');
  const size = Math.round(cell * TEXT_SIZE.clue);
  const inset = Math.round(cell / 10);
  drawText(raster, text, grid.x + column * cell + inset, grid.y + row * cell + inset + capHeight(size), { size, weight: FONT_WEIGHTS.regular, tone: 'ink' });
}

/** Where a split clue's sums centre, as shares of the cell from its top-left corner. */
const SPLIT_CLUE = { across: [0.69, 0.3], down: [0.31, 0.7] } as const;

/**
 * A split clue cell (kakuro): a diagonal from the top-left to the bottom-right corner, the sum of
 * the run to the right in the upper half and the sum of the run below in the lower half. Shade
 * the cell first; a missing sum leaves its half empty.
 */
export function drawSplitClue(raster: Raster, grid: Grid, column: number, row: number, across?: string, down?: string): void {
  requireSquare(grid, 'a split clue');
  const { cell } = grid;
  const left = grid.x + column * cell;
  const top = grid.y + row * cell;
  strokeLine(raster, left, top, left + cell, top + cell, LINE_PX.grid, 'ink');
  const style = { size: Math.round(cell * TEXT_SIZE.splitClue), weight: FONT_WEIGHTS.bold, tone: 'ink' } as const;
  if (across !== undefined) drawCentredText(raster, across, left + cell * SPLIT_CLUE.across[0], top + cell * SPLIT_CLUE.across[1], style);
  if (down !== undefined) drawCentredText(raster, down, left + cell * SPLIT_CLUE.down[0], top + cell * SPLIT_CLUE.down[1], style);
}

/** An arrow pointing right around the origin, as a share of its half length. */
const ARROW = [-1, -0.12, 0.35, -0.12, 0.35, -0.45, 1, 0, 0.35, 0.45, 0.35, 0.12, -1, 0.12];
/** Quarter turns: maps (u, v) of the right-pointing arrow to page directions. */
const TURNS: Record<string, (u: number, v: number) => [number, number]> = {
  right: (u, v) => [u, v],
  down: (u, v) => [-v, u],
  left: (u, v) => [-u, -v],
  up: (u, v) => [v, -u],
};

/** A simple icon centred in a cell: a tree, a white or black pearl, a cross or an arrow. */
export function drawIcon(raster: Raster, grid: Grid, column: number, row: number, icon: Icon): void {
  const [cx, cy] = cellCenter(grid, column, row);
  const half = Math.round((grid.cell * TEXT_SIZE.icon) / 2);
  if (icon === 'pearl-black') {
    fillDisc(raster, cx, cy, half, 'ink');
  } else if (icon === 'pearl-white') {
    fillDisc(raster, cx, cy, half, 'ink');
    fillDisc(raster, cx, cy, half - LINE_PX.icon, 'paper');
  } else if (icon === 'cross') {
    const d = half * ICON_SHAPE.crossArm;
    strokeLine(raster, cx - d, cy - d, cx + d, cy + d, LINE_PX.icon, 'ink');
    strokeLine(raster, cx - d, cy + d, cx + d, cy - d, LINE_PX.icon, 'ink');
  } else if (icon === 'tree') {
    const trunk = Math.round(half * ICON_SHAPE.trunkWidth);
    const base = cy + half * ICON_SHAPE.canopyBase;
    const spread = half * ICON_SHAPE.canopyHalfWidth;
    fillRect(raster, Math.round(cx - trunk / 2), Math.round(base), trunk, Math.round(cy + half - base), 'line');
    fillPolygon(raster, [[cx, cy - half, cx + spread, base, cx - spread, base]], 'line');
  } else {
    const turn = TURNS[icon.slice('arrow-'.length)];
    const points: number[] = [];
    for (let i = 0; i < ARROW.length; i += 2) {
      const [u, v] = turn(ARROW[i] * half, ARROW[i + 1] * half);
      points.push(cx + u, cy + v);
    }
    fillPolygon(raster, [points], 'ink');
  }
}

/**
 * An inequality sign on the edge between a square cell and its right or lower neighbour, its point
 * at the smaller one (futoshiki): a chevron in ink on a paper box that breaks the grid line.
 */
export function drawEdgeSign(raster: Raster, grid: Grid, column: number, row: number, toward: 'right' | 'down', smaller: 'first' | 'second'): void {
  requireSquare(grid, 'an edge sign');
  const across = toward === 'right' ? column + 1 < grid.columns : row + 1 < grid.rows;
  if (!across) throw new Error(`cell ${column},${row} has no neighbour ${toward === 'right' ? 'to the right' : 'below'}`);
  const { x, y, cell } = grid;
  const depth = Math.round(cell * SIGN_SHAPE.depth);
  const spread = Math.round(cell * SIGN_SHAPE.spread);
  const pad = Math.round(cell * SIGN_SHAPE.pad);
  // (u, v): u runs from the first cell to the second, across the edge; v runs along the edge.
  const [ex, ey] = toward === 'right' ? [x + (column + 1) * cell, y + row * cell + cell / 2] : [x + column * cell + cell / 2, y + (row + 1) * cell];
  const at = (u: number, v: number): [number, number] => (toward === 'right' ? [ex + u, ey + v] : [ex + v, ey + u]);
  const point = smaller === 'first' ? -depth : depth;
  const [px, py] = at(point, 0);
  const [ax, ay] = at(-point, -spread);
  const [bx, by] = at(-point, spread);
  const half = toward === 'right' ? [depth + pad, spread + pad] : [spread + pad, depth + pad];
  fillRect(raster, Math.round(ex - half[0]), Math.round(ey - half[1]), 2 * half[0], 2 * half[1], 'paper');
  strokeLine(raster, ax, ay, px, py, LINE_PX.icon, 'ink');
  strokeLine(raster, px, py, bx, by, LINE_PX.icon, 'ink');
}
