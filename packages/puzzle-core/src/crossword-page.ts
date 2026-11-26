/**
 * The crossword's page (#400), composed from the shared renderer (#379): the square grid with its
 * blocks in the line grey, the slot numbers in the cells' corners, the givens, then the clues in
 * two columns below the grid, «Across» and «Down», and the footer. The answers are never drawn.
 */
import { type Crossword, type CrosswordDirection, type CrosswordSlot } from './crossword';
import { FONT_WEIGHTS, drawText, measureText, pageText } from './page/font';
import { drawCellText, drawSquareLattice, shadeCells, type Cell } from './page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type FooterText, type PageLayout } from './page/layout';
import { PAGE_MM, PAGE_SIZE, TEXT_SIZE, mmToPx, pxToMm, type Hand, type Orientation } from './page/look';
import { type Raster } from './page/raster';
import { puzzleCode } from './code';

/** The words the page prints, in the player's interface language; the plugin owns this copy. */
export interface CrosswordPageText extends Omit<FooterText, 'code'> {
  across: string;
  down: string;
}

export interface CrosswordPageOptions {
  orientation: Orientation;
  hand: Hand;
}

export interface CrosswordPage {
  raster: Raster;
  layout: PageLayout;
}

/** One printed line of the clue list: a heading, a clue's first line with its number, or a run-on line. */
interface ClueLine {
  text: string;
  number?: string;
  heading?: boolean;
}

const COLUMNS = 2;
/** A clue's text starts this many ems right of its number's column. */
const NUMBER_GAP_EM = 0.4;

function textSize(): number {
  return mmToPx(TEXT_SIZE.clueListMm);
}

/** Splits a clue into lines no wider than `width`, breaking between words. */
function wrap(text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measureText(next, size, FONT_WEIGHTS.regular) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface ClueColumn {
  lines: ClueLine[];
  /** Where the clue text starts, right of the widest number. */
  numberWidth: number;
}

/** One column: its heading, then each slot's number and wrapped clue. */
function clueColumn(slots: readonly CrosswordSlot[], heading: string, columnWidth: number): ClueColumn {
  const size = textSize();
  const numberWidth = Math.max(0, ...slots.map(slot => measureText(String(slot.number), size, FONT_WEIGHTS.bold))) + size * NUMBER_GAP_EM;
  const lines: ClueLine[] = [{ text: pageText(heading), heading: true }];
  for (const slot of slots) {
    wrap(pageText(slot.clue), size, columnWidth - numberWidth).forEach((text, i) => lines.push(i === 0 ? { text, number: String(slot.number) } : { text }));
  }
  return { lines, numberWidth };
}

function columnWidthOf(orientation: Orientation): number {
  const areaWidth = PAGE_SIZE[orientation].width - 2 * mmToPx(PAGE_MM.margin);
  return Math.floor((areaWidth - mmToPx(PAGE_MM.gap)) / COLUMNS);
}

/** The clue list's height in whole millimetres, the taller of the two columns. */
function listHeightMm(columns: readonly ClueColumn[]): number {
  const lines = Math.max(...columns.map(column => column.lines.length));
  return Math.ceil(pxToMm(lines * textSize() * TEXT_SIZE.clueLineStep));
}

function slotsOf(puzzle: Crossword, direction: CrosswordDirection): CrosswordSlot[] {
  return puzzle.slots.filter(slot => slot.direction === direction);
}

/**
 * Draws the puzzle's page at the largest cell preset that fits the grid and its clues. Throws
 * `PageFitError` when even 7 mm cells leave no room for the clues on this orientation.
 */
export function drawCrosswordPage(puzzle: Crossword, options: CrosswordPageOptions, text: CrosswordPageText): CrosswordPage {
  const columnWidth = columnWidthOf(options.orientation);
  const columns = [clueColumn(slotsOf(puzzle, 'across'), text.across, columnWidth), clueColumn(slotsOf(puzzle, 'down'), text.down, columnWidth)];
  const spec = { ...options, lattice: 'square' as const, columns: puzzle.size, rows: puzzle.size, belowPanelMm: listHeightMm(columns) };
  const layout = layoutPage({ ...spec, cellMm: fitCellMm(spec) });
  const raster = createPage(layout);
  const { grid } = layout;
  const blocks: Cell[] = puzzle.letters.flatMap((letter, cell) => (letter === null ? [[cell % puzzle.size, Math.floor(cell / puzzle.size)] as const] : []));
  shadeCells(raster, grid, blocks, 'line');
  drawSquareLattice(raster, grid);
  const numbers = new Map(puzzle.slots.map(slot => [slot.cells[0], slot.number]));
  for (const [cell, number] of numbers) drawCellText(raster, grid, cell % puzzle.size, Math.floor(cell / puzzle.size), String(number), 'clue');
  for (const cell of puzzle.givens) drawCellText(raster, grid, cell % puzzle.size, Math.floor(cell / puzzle.size), puzzle.letters[cell] as string, 'given');

  const panel = layout.belowPanel;
  if (!panel) throw new Error('the crossword layout has no clue panel');
  const size = textSize();
  const step = size * TEXT_SIZE.clueLineStep;
  columns.forEach(({ lines, numberWidth }, c) => {
    const x = panel.x + c * (columnWidth + mmToPx(PAGE_MM.gap));
    lines.forEach((line, i) => {
      const baseline = Math.round(panel.y + size + i * step);
      if (line.heading) {
        drawText(raster, line.text, x, baseline, { size, weight: FONT_WEIGHTS.bold, tone: 'ink' });
        return;
      }
      if (line.number) drawText(raster, line.number, x, baseline, { size, weight: FONT_WEIGHTS.bold, tone: 'ink' });
      drawText(raster, line.text, x + numberWidth, baseline, { size, weight: FONT_WEIGHTS.regular, tone: 'ink' });
    });
  });
  drawFooter(raster, layout, { game: text.game, difficulty: text.difficulty, rule: text.rule, code: puzzleCode(puzzle.id) });
  return { raster, layout };
}
