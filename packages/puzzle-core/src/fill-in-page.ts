/**
 * The fill-in page and its «Check» (#398), composed from the shared renderer (#379) and the
 * shared ink check (#382). The page shows the empty word cells, the printed letters and the word
 * list grouped by length; the solution is never on it. «Check» reads the letters the player wrote
 * and compares them with the solution, letters being best effort.
 */

import { type CheckResult, type Recognize, checkCells, readCells, type InkStroke } from './check';
import { type FillIn } from './fill-in';
import { FONT_WEIGHTS, drawText, measureText } from './page/font';
import { drawCellText, type Grid } from './page/grid';
import { PageFitError, createPage, drawFooter, layoutPage, type FooterText, type PageLayout } from './page/layout';
import { CELL_PRESETS_MM, LINE_PX, PAGE_MM, mmToPx, type CellPreset, type Hand, type Orientation, type Tone } from './page/look';
import { fillRect, type Raster } from './page/raster';

/** The word list's text, in pixels: its em, the step between lines and the gap between columns. */
export const FILL_IN_LIST = { size: 44, step: 58, columnGapMm: 4 } as const;
/** The most columns the word list may take beside the grid. */
const MAX_LIST_COLUMNS = 4;

export interface FillInPageText extends Omit<FooterText, 'code'> {
  /** The heading over the words of one length, such as «4 letters». */
  heading: (length: number) => string;
}

export interface FillInPageOptions {
  orientation: Orientation;
  hand: Hand;
}

interface ListLine {
  text: string;
  heading: boolean;
}

export interface FillInLayout {
  page: PageLayout;
  cellMm: CellPreset;
  /** The word list's columns, each a list of lines from the top, and where each column starts. */
  columns: { x: number; lines: ListLine[] }[];
  /** The baseline of each column's first line. */
  listTop: number;
}

function listLines(puzzle: FillIn, heading: (length: number) => string): ListLine[][] {
  const groups = new Map<number, string[]>();
  for (const word of puzzle.words) {
    const length = [...word].length;
    groups.set(length, [...(groups.get(length) ?? []), word]);
  }
  // A group is never split across columns, so its heading stays over its words.
  return [...groups.entries()].map(([length, words]) => [{ text: heading(length), heading: true }, ...words.map(text => ({ text, heading: false }))]);
}

function lineWidth(line: ListLine): number {
  return measureText(line.text, FILL_IN_LIST.size, line.heading ? FONT_WEIGHTS.bold : FONT_WEIGHTS.regular);
}

/** The groups flowed into at most `count` columns of `perColumn` lines, or null when they do not fit. */
function flow(groups: readonly ListLine[][], count: number, perColumn: number): ListLine[][] | null {
  const columns: ListLine[][] = [[]];
  for (const group of groups) {
    if (group.length > perColumn) return null;
    let column = columns[columns.length - 1];
    if (column.length > 0 && column.length + 1 + group.length > perColumn) {
      if (columns.length === count) return null;
      column = [];
      columns.push(column);
    }
    // One empty line between two groups in a column.
    if (column.length > 0) column.push({ text: '', heading: false });
    column.push(...group);
  }
  return columns;
}

/** The fewest whole millimetres whose pixels hold `px`. */
function mmFor(px: number): number {
  let mm = 1;
  while (mmToPx(mm) < px) mm++;
  return mm;
}

/**
 * Where the grid and the word list go: the largest cell preset and then the fewest list columns
 * that fit, the list beside the grid and away from the writing hand. Throws `PageFitError` when
 * nothing fits.
 */
export function layoutFillInPage(puzzle: FillIn, options: FillInPageOptions, heading: (length: number) => string): FillInLayout {
  const groups = listLines(puzzle, heading);
  const columnWidth = Math.max(...groups.flat().map(lineWidth)) + mmToPx(FILL_IN_LIST.columnGapMm);
  const margin = mmToPx(PAGE_MM.margin);
  let error: unknown;
  for (const cellMm of [...CELL_PRESETS_MM].reverse()) {
    for (let count = 1; count <= MAX_LIST_COLUMNS; count++) {
      const spec = { ...options, cellMm, lattice: 'square' as const, columns: puzzle.width, rows: puzzle.height, sidePanelMm: mmFor(count * columnWidth) };
      let page: PageLayout;
      try {
        page = layoutPage(spec);
      } catch (e) {
        if (!(e instanceof PageFitError)) throw e;
        error = e;
        continue;
      }
      const panel = page.sidePanel as NonNullable<PageLayout['sidePanel']>;
      // The list may run above and below the grid, from the top margin to the footer.
      const available = page.footer.y - mmToPx(PAGE_MM.gap) - margin;
      const flowed = flow(groups, count, Math.floor(available / FILL_IN_LIST.step));
      if (!flowed) continue;
      const height = Math.max(...flowed.map(column => column.length)) * FILL_IN_LIST.step;
      const centre = panel.y + panel.height / 2;
      const top = Math.max(margin, Math.min(Math.round(centre - height / 2), page.footer.y - mmToPx(PAGE_MM.gap) - height));
      return {
        page,
        cellMm,
        columns: flowed.map((lines, i) => ({ x: panel.x + i * columnWidth, lines })),
        listTop: top + FILL_IN_LIST.size,
      };
    }
  }
  throw error ?? new Error(`the fill-in's ${puzzle.words.length} words do not fit beside its ${puzzle.width} x ${puzzle.height} grid`);
}

/** A cell edge of even width centred on a whole-pixel line. */
function edge(raster: Raster, x: number, y: number, length: number, across: boolean, width: number, tone: Tone): void {
  if (across) fillRect(raster, x - width / 2, y - width / 2, length + width, width, tone);
  else fillRect(raster, x - width / 2, y - width / 2, width, length + width, tone);
}

/** The word cells: thin line-grey edges between two word cells, a frame-wide ink edge everywhere else. */
function drawWordCells(raster: Raster, grid: Grid, solution: readonly string[]): void {
  const { x, y, cell, columns, rows } = grid;
  const isWord = (column: number, row: number): boolean =>
    column >= 0 && row >= 0 && column < columns && row < rows && solution[row * columns + column] !== '';
  const outer: (() => void)[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (!isWord(column, row)) continue;
      const left = x + column * cell;
      const top = y + row * cell;
      const sides = [
        { shared: isWord(column, row - 1), at: [left, top], across: true },
        { shared: isWord(column, row + 1), at: [left, top + cell], across: true },
        { shared: isWord(column - 1, row), at: [left, top], across: false },
        { shared: isWord(column + 1, row), at: [left + cell, top], across: false },
      ] as const;
      for (const side of sides) {
        const draw = () => edge(raster, side.at[0], side.at[1], cell, side.across, side.shared ? LINE_PX.grid : LINE_PX.frame, side.shared ? 'line' : 'ink');
        // The ink edges go last, so a thin shared edge never paints over a corner of the frame.
        if (side.shared) draw();
        else outer.push(draw);
      }
    }
  }
  for (const draw of outer) draw();
}

/** The fill-in page as a raster: the word cells, the printed letters, the word list and the footer. */
export function drawFillInPage(puzzle: FillIn, options: FillInPageOptions, text: FillInPageText, code: string): Raster {
  const layout = layoutFillInPage(puzzle, options, text.heading);
  const { grid } = layout.page;
  const raster = createPage(layout.page);
  drawWordCells(raster, grid, puzzle.solution);
  for (const cell of puzzle.givens) drawCellText(raster, grid, cell % puzzle.width, Math.floor(cell / puzzle.width), puzzle.solution[cell], 'given');
  for (const column of layout.columns) {
    column.lines.forEach((line, i) => {
      if (line.text === '') return;
      const weight = line.heading ? FONT_WEIGHTS.bold : FONT_WEIGHTS.regular;
      drawText(raster, line.text, column.x, layout.listTop + i * FILL_IN_LIST.step, { size: FILL_IN_LIST.size, weight, tone: 'ink' });
    });
  }
  drawFooter(raster, layout.page, { game: text.game, difficulty: text.difficulty, rule: text.rule, code });
  return raster;
}

/** The cells the player writes: every word cell that is not printed, with its solution letter. */
export function fillInExpected(puzzle: FillIn): Map<number, string> {
  const printed = new Set(puzzle.givens);
  const expected = new Map<number, string>();
  puzzle.solution.forEach((letter, cell) => {
    if (letter !== '' && !printed.has(cell)) expected.set(cell, letter);
  });
  return expected;
}

/**
 * «Check» for a fill-in page: reads the letters written in the word cells of the page's grid and
 * marks the wrong ones. An unread cell is never wrong, so a misread letter raises no false alarm.
 */
export async function checkFillIn<E>(puzzle: FillIn, grid: Grid, strokes: readonly InkStroke<E>[], recognize: Recognize<E>): Promise<CheckResult> {
  if (grid.columns !== puzzle.width || grid.rows !== puzzle.height) {
    throw new Error(`the page's grid is ${grid.columns} x ${grid.rows}, not the fill-in's ${puzzle.width} x ${puzzle.height}`);
  }
  const expected = fillInExpected(puzzle);
  const reads = await readCells(grid, strokes, [...expected.keys()], recognize, 'letter');
  return checkCells(expected, reads, 'letter');
}
