/**
 * An arrowword's page and its «Check» (#401), composed from the shared renderer (`page/`) and the
 * shared ink check (`check/`). The clue cells are soft grey with their clues in small text and an
 * arrow at the edge the answer starts from; a clue cell with no clue is shaded. The answers are
 * never drawn: «Show solution» is the plugin view's, from `arrowwordAnswers`.
 */
import { arrowwordAnswers, emptyClueCells, type Arrowword, type ArrowwordSlot } from './arrowword';
import { checkCells, readCells, type CheckResult, type InkStroke, type Recognize } from './check';
import { capHeight, drawText, FONT_WEIGHTS, measureText, pageText } from './page/font';
import { drawSquareLattice, shadeCells, type Cell, type Grid } from './page/grid';
import { mmToPx, TEXT_SIZE } from './page/look';
import { fillPolygon, type Raster } from './page/raster';

/** The arrow's half size and the clue text's inset, as shares of the cell. */
const ARROW_SHARE = 0.07;
const INSET_SHARE = 1 / 16;

/** The clue's words in lines no wider than `width`; throws when one word alone is wider. */
export function wrapClue(clue: string, width: number, size: number): string[] {
  const lines: string[] = [];
  for (const word of clue.trim().split(/\s+/)) {
    if (measureText(word, size, FONT_WEIGHTS.regular) > width) throw new Error(`the clue word «${word}» is wider than its clue cell`);
    const last = lines.length - 1;
    const joined = last >= 0 ? `${lines[last]} ${word}` : word;
    if (last >= 0 && measureText(joined, size, FONT_WEIGHTS.regular) <= width) lines[last] = joined;
    else lines.push(word);
  }
  return lines;
}

function cellOf(grid: Grid, index: number): Cell {
  return [index % grid.columns, Math.floor(index / grid.columns)];
}

/** One clue's text, centred in its share of the clue cell, and its arrow at that share's edge. */
/**
 * The clue's lines as the page font draws them (accents the font lacks are folded, as in the
 * crossword) in a share `height` of a clue cell of side `cell` pixels; throws when they do not fit.
 */
export function fitClue(clue: string, cell: number, height: number): string[] {
  const inset = Math.round(cell * INSET_SHARE);
  const size = mmToPx(TEXT_SIZE.arrowClueMm);
  const lines = wrapClue(pageText(clue), cell - 2 * inset, size);
  if (clueBlock(lines.length) > height - inset) throw new Error(`the clue «${clue}» takes ${lines.length} lines, more than its clue cell holds`);
  return lines;
}

/** The height of `lines` lines of clue text, from the first cap top to the last baseline. */
function clueBlock(lines: number): number {
  const size = mmToPx(TEXT_SIZE.arrowClueMm);
  return capHeight(size) + (lines - 1) * Math.round(size * TEXT_SIZE.lineStep);
}

function drawClue(raster: Raster, grid: Grid, slot: ArrowwordSlot, top: number, height: number): void {
  const [column] = cellOf(grid, slot.clueCell);
  const { cell } = grid;
  const left = grid.x + column * cell;
  const size = mmToPx(TEXT_SIZE.arrowClueMm);
  const step = Math.round(size * TEXT_SIZE.lineStep);
  const lines = fitClue(slot.clue, cell, height);
  const block = clueBlock(lines.length);
  const first = top + (height - block) / 2 + capHeight(size);
  lines.forEach((line, i) => drawText(raster, line, left + cell / 2, first + i * step, { size, weight: FONT_WEIGHTS.regular, tone: 'ink', align: 'center' }));

  const a = Math.round(cell * ARROW_SHARE);
  if (slot.direction === 'across') {
    const tip = left + cell;
    const middle = top + height / 2;
    fillPolygon(raster, [[tip - a, middle - a, tip, middle, tip - a, middle + a]], 'ink');
  } else {
    const tip = top + height;
    const middle = left + cell / 2;
    fillPolygon(raster, [[middle - a, tip - a, middle, tip, middle + a, tip - a]], 'ink');
  }
}

/** The arrowword on a square grid of its columns and rows: lattice, clue cells, clues and arrows. */
export function drawArrowword(raster: Raster, grid: Grid, puzzle: Arrowword): void {
  if (grid.lattice !== 'square' || grid.columns !== puzzle.columns || grid.rows !== puzzle.rows) {
    throw new Error(`an arrowword needs a ${puzzle.columns} x ${puzzle.rows} square grid`);
  }
  const clueCells = puzzle.solution.flatMap((letter, index) => (letter === '' ? [cellOf(grid, index)] : []));
  shadeCells(raster, grid, clueCells, 'soft');
  shadeCells(raster, grid, emptyClueCells(puzzle).map(index => cellOf(grid, index)), 'shade');
  drawSquareLattice(raster, grid);
  const byCell = new Map<number, ArrowwordSlot[]>();
  for (const slot of puzzle.slots) byCell.set(slot.clueCell, [...(byCell.get(slot.clueCell) ?? []), slot]);
  for (const [index, slots] of byCell) {
    const top = grid.y + Math.floor(index / grid.columns) * grid.cell;
    // Two clues share the cell: the across one above, the down one below.
    const ordered = [...slots.filter(slot => slot.direction === 'across'), ...slots.filter(slot => slot.direction === 'down')];
    const height = grid.cell / ordered.length;
    ordered.forEach((slot, i) => drawClue(raster, grid, slot, top + i * height, height));
  }
}

/**
 * «Check»: reads the letter cells from the page's ink with the host's recogniser and names the
 * wrong ones; letters are best effort, so a cell the recogniser cannot read is unread, never wrong.
 */
export async function checkArrowword<E>(puzzle: Arrowword, grid: Grid, strokes: readonly InkStroke<E>[], recognize: Recognize<E>): Promise<CheckResult> {
  const answers = arrowwordAnswers(puzzle);
  const reads = await readCells(grid, strokes, [...answers.keys()], recognize, 'letter');
  return checkCells(answers, reads, 'letter');
}
