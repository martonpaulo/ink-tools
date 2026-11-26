/**
 * The sample pages of the renderer (#379): one per cell preset, orientation and hand, drawn with
 * the generators as a game will. The golden-image test compares each with its PNG in
 * `__tests__/golden/`, and `scripts/profile-page.cjs` times them under `node --jitless`, the
 * nearest Node gets to the tablet's engine.
 */
import {
  createPage,
  drawCellText,
  drawFooter,
  drawHexLattice,
  drawIcon,
  drawOutsideClues,
  drawRegions,
  drawSquareLattice,
  drawText,
  drawTriangleLattice,
  FONT_WEIGHTS,
  generateNonogram,
  generateSudoku,
  generateWordSearch,
  layoutPage,
  puzzleCode,
  type PageLayout,
  type Raster,
} from '../src';

const PANEL_TEXT = { size: 48, first: 60, step: 64 } as const;

function drawWordPanel(r: Raster, layout: PageLayout, words: readonly string[]): void {
  const panel = layout.sidePanel;
  if (!panel) throw new Error('this layout has no side panel');
  words.forEach((word, i) =>
    drawText(r, word, panel.x, panel.y + PANEL_TEXT.first + i * PANEL_TEXT.step, { size: PANEL_TEXT.size, weight: FONT_WEIGHTS.regular, tone: 'ink' }),
  );
}

export const SAMPLE_PAGES: readonly (readonly [name: string, draw: () => Raster])[] = [
  ['page-7mm-portrait-right', () => {
    const puzzle = generateNonogram('P1', { width: 15, height: 10 }, 'medium');
    const deepest = (lists: number[][]) => Math.max(...lists.map((l) => l.length));
    const layout = layoutPage({
      orientation: 'portrait', hand: 'right', cellMm: 7, lattice: 'square', columns: 15, rows: 10,
      clues: { top: deepest(puzzle.columns), left: deepest(puzzle.rows) },
    });
    const r = createPage(layout);
    drawSquareLattice(r, layout.grid);
    drawOutsideClues(r, layout.grid, 'top', puzzle.columns.map((l) => l.map(String)), layout.clueGap);
    drawOutsideClues(r, layout.grid, 'left', puzzle.rows.map((l) => l.map(String)), layout.clueGap);
    drawFooter(r, layout, { game: 'Nonogram', difficulty: 'Medium', code: puzzleCode(puzzle.id), rule: 'Fill the cells so each row and column shows its runs, in order.' });
    return r;
  }],
  ['page-10mm-portrait-left', () => {
    const words = ['GATO', 'CACHORRO', 'LEAO', 'URSO', 'SAPO', 'PATO', 'CABRA', 'PEIXE'];
    const side = 10;
    const puzzle = generateWordSearch('P1', side, 'hard', words);
    const layout = layoutPage({ orientation: 'portrait', hand: 'left', cellMm: 10, lattice: 'square', columns: side, rows: side, sidePanelMm: 30 });
    const r = createPage(layout);
    drawSquareLattice(r, layout.grid);
    puzzle.letters.forEach((letter, i) => drawCellText(r, layout.grid, i % side, Math.floor(i / side), letter, 'given'));
    drawWordPanel(r, layout, words);
    drawFooter(r, layout, { game: 'Word search', difficulty: 'Hard', code: puzzleCode(puzzle.id), rule: 'Find each word of the list: across, down, diagonal or backwards.' });
    return r;
  }],
  ['page-15mm-portrait-right', () => {
    const puzzle = generateSudoku('P1', 9, 'hard');
    const side = puzzle.shape.size;
    const layout = layoutPage({ orientation: 'portrait', hand: 'right', cellMm: 15, lattice: 'square', columns: side, rows: side });
    const r = createPage(layout);
    drawSquareLattice(r, layout.grid);
    drawRegions(r, layout.grid, (c, row) => Math.floor(c / puzzle.shape.boxCols) + puzzle.shape.boxRows * Math.floor(row / puzzle.shape.boxRows));
    puzzle.givens.forEach((v, i) => v > 0 && drawCellText(r, layout.grid, i % side, Math.floor(i / side), String(v), 'given'));
    drawFooter(r, layout, { game: 'Sudoku', difficulty: 'Hard', code: puzzleCode(puzzle.id), rule: 'Put 1 to 9 once in each row, each column and each box.' });
    return r;
  }],
  ['page-10mm-landscape-right', () => {
    const layout = layoutPage({ orientation: 'landscape', hand: 'right', cellMm: 10, lattice: 'hex', columns: 12, rows: 10, sidePanelMm: 40 });
    const r = createPage(layout);
    drawHexLattice(r, layout.grid);
    drawCellText(r, layout.grid, 3, 2, '4', 'given');
    drawIcon(r, layout.grid, 6, 5, 'pearl-black');
    drawWordPanel(r, layout, ['Panel', 'left']);
    drawFooter(r, layout, { game: 'Hex lattice', difficulty: 'Easy', code: 'TEST-0001', rule: 'A landscape page with the panel away from the right hand.' });
    return r;
  }],
  ['page-10mm-landscape-left', () => {
    const layout = layoutPage({ orientation: 'landscape', hand: 'left', cellMm: 10, lattice: 'triangle', columns: 25, rows: 10, sidePanelMm: 40 });
    const r = createPage(layout);
    drawTriangleLattice(r, layout.grid);
    drawCellText(r, layout.grid, 4, 1, '2', 'given');
    drawWordPanel(r, layout, ['Panel', 'right']);
    drawFooter(r, layout, { game: 'Triangle lattice', difficulty: 'Easy', code: 'TEST-0002', rule: 'A landscape page with the panel away from the left hand.' });
    return r;
  }],
];
