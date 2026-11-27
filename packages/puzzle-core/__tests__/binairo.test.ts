import glyphData from './fixtures/inkctl-glyphs.json';
import {
  BINAIRO_BANDS,
  BINAIRO_OPEN,
  BINAIRO_SIDES,
  checkBinairo,
  countBinairoSolutions,
  drawBinairoPage,
  generateBinairo,
  layoutBinairoPage,
  rateBinairo,
  validLines,
  type Binairo,
} from '../src/binairo';
import { type InkPoint, type InkStroke } from '../src/check';
import { parsePuzzleCode, puzzleCode } from '../src/code';
import { assertNativeGreys, cellCenter, type Grid, type PageLayout } from '../src/page';
import { digest } from '../src/random';

const O = BINAIRO_OPEN;

/** Rows of `.`, `0` and `1` as the cells of a grid. */
const cellsOf = (rows: string[]): number[] => rows.join('').split('').map(ch => (ch === '.' ? O : Number(ch)));

describe('the rules', () => {
  test('the valid lines are the balanced ones with no three alike in a row', () => {
    expect([6, 8, 10, 12].map(n => validLines(n).length)).toEqual([14, 34, 84, 208]);
    for (const line of validLines(6)) {
      const bits = Array.from({ length: 6 }, (_, i) => (line >> i) & 1);
      expect(bits.filter(Boolean)).toHaveLength(3);
      expect(bits.join('')).not.toMatch(/000|111/);
    }
  });

  test('the local rules alone finish an easy grid, and line solving with no repeated row a medium one', () => {
    // Pairs and gaps finish this one; it needs no row or column comparison.
    const easy = generateBinairo('RULES', 6, 'easy');
    expect(rateBinairo(6, easy.givens)).toEqual({ difficulty: 'easy' });
    const medium = generateBinairo('RULES', 8, 'medium');
    expect(rateBinairo(8, medium.givens)).toEqual({ difficulty: 'medium' });
  });

  test('a grid with no givens has many solutions and no rating', () => {
    const empty = new Array(36).fill(O);
    expect(countBinairoSolutions(6, empty, 5)).toBe(5);
    expect(rateBinairo(6, empty)).toBeNull();
  });

  test('two equal rows are refused, though each row is valid', () => {
    const repeated = cellsOf(['011010', '011010', '100101', '100101', '011001', '100110']);
    expect(countBinairoSolutions(6, repeated)).toBe(0);
    expect(rateBinairo(6, repeated)).toBeNull();
  });

  test('a side or band not offered is refused', () => {
    expect(() => generateBinairo('S1', 7, 'easy')).toThrow('a binairo side is one of 6, 8, 10, 12');
    expect(() => generateBinairo('S1', 14, 'easy')).toThrow('not 14');
    expect(() => generateBinairo('S1', 8, 'expert')).toThrow('a binairo offers easy, medium, hard');
    expect(() => rateBinairo(6, [0, 1])).toThrow('has 36 cells, not 2');
  });
});

describe('generation', () => {
  const CASES = BINAIRO_SIDES.flatMap(size => BINAIRO_BANDS.flatMap(band => ['S1', 'S2', 'S3'].map(seed => [size, band, seed] as const)));

  test.each(CASES)('%i x %i %s from seed %s has one solution, rated its band', (size, band, seed) => {
    const puzzle = generateBinairo(seed, size, band);
    expect(countBinairoSolutions(size, puzzle.givens)).toBe(1);
    expect(rateBinairo(size, puzzle.givens)).toEqual({ difficulty: band });
    puzzle.givens.forEach((given, i) => given !== O && expect(given).toBe(puzzle.solution[i]));
    expect(countBinairoSolutions(size, puzzle.solution)).toBe(1);
  });

  test('the same seed gives the same puzzle; a pinned puzzle stays as it is', () => {
    expect(generateBinairo('P1', 10, 'hard')).toEqual(generateBinairo('P1', 10, 'hard'));
    expect(digest(generateBinairo('P1', 6, 'easy'))).toBe('98af5267');
    expect(digest(generateBinairo('P1', 12, 'medium'))).toBe('72cfdaf3');
    const puzzle = generateBinairo('P1', 6, 'hard');
    const show = (cells: number[]) => Array.from({ length: 6 }, (_, r) => cells.slice(r * 6, r * 6 + 6).map(v => (v === O ? '.' : v)).join(''));
    expect(show(puzzle.givens)).toEqual(['...1..', '.0..1.', '1....1', '...0..', '......', '.01.10']);
    expect(show(puzzle.solution)).toEqual(['010101', '100110', '101001', '011001', '010110', '101010']);
  });

  test('its code names the game and reads back', () => {
    const puzzle = generateBinairo('7K2Q9X', 8, 'medium');
    expect(puzzleCode(puzzle.id)).toBe('BI-8-M-7K2Q9X');
    expect(parsePuzzleCode('BI-8-M-7K2Q9X')).toEqual(puzzle.id);
  });
});

describe('the page', () => {
  test.each(BINAIRO_SIDES)('a %i x %i fits each orientation and hand, in the native greys', size => {
    const puzzle = generateBinairo('PAGE', size, 'medium');
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const hand of ['right', 'left'] as const) {
        const layout = layoutBinairoPage(puzzle, { orientation, hand });
        expect(layout.grid.columns).toBe(size);
        const raster = drawBinairoPage(puzzle, layout, { game: 'Binairo', difficulty: 'Medium', code: puzzleCode(puzzle.id) });
        assertNativeGreys(raster);
      }
    }
  });

  test('a given 1 is dark at its centre, a given 0 paper, an open cell paper', () => {
    const puzzle = generateBinairo('PAGE', 8, 'easy');
    const layout = layoutBinairoPage(puzzle, { orientation: 'portrait', hand: 'right', cellMm: 10 });
    const raster = drawBinairoPage(puzzle, layout, { game: 'Binairo', difficulty: 'Easy', code: puzzleCode(puzzle.id) });
    const centre = (i: number) => {
      const [x, y] = cellCenter(layout.grid, i % 8, Math.floor(i / 8));
      return raster.pixels[Math.round(y) * raster.width + Math.round(x)];
    };
    const kinds = new Set(puzzle.givens);
    expect(kinds).toEqual(new Set([O, 0, 1]));
    puzzle.givens.forEach((given, i) => expect([i, centre(i)]).toEqual([i, given === 1 ? 0x00 : 0xff]));
  });
});

describe('«Check» from the ink', () => {
  /** The glyphs `inkctl ink write` draws, for a written digit that is neither a shade nor a dot. */
  const GLYPHS = glyphData.glyphs as unknown as Record<string, number[][][]>;
  const line = (from: InkPoint, to: InkPoint, steps = 20): InkPoint[] =>
    Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }));
  const at = (grid: Grid, cell: number, u: number, v: number): InkPoint => ({
    x: grid.x + ((cell % grid.columns) + u) * grid.cell,
    y: grid.y + (Math.floor(cell / grid.columns) + v) * grid.cell,
  });
  /** A shade: a hatch over the cell, as a player fills it. */
  const shade = (grid: Grid, cell: number): InkStroke<null> => ({
    points: Array.from({ length: 7 }, (_, i) => line(at(grid, cell, 0.1, 0.1 + i * 0.13), at(grid, cell, 0.9, 0.15 + i * 0.13))).flat(),
    element: null,
  });
  const dot = (grid: Grid, cell: number): InkStroke<null> => ({ points: line(at(grid, cell, 0.45, 0.45), at(grid, cell, 0.55, 0.55)), element: null });
  const cross = (grid: Grid, cell: number): InkStroke<null>[] => [
    { points: line(at(grid, cell, 0.2, 0.2), at(grid, cell, 0.8, 0.8)), element: null },
    { points: line(at(grid, cell, 0.8, 0.2), at(grid, cell, 0.2, 0.8)), element: null },
  ];
  const written = (grid: Grid, cell: number, ch: string): InkStroke<null>[] => {
    const scale = (0.7 * grid.cell) / 90;
    const [cx, cy] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    return GLYPHS[ch].map(s => ({ points: s.map(([x, y]) => ({ x: cx - 20 * scale + x * scale, y: cy - 45 * scale + y * scale })), element: null }));
  };

  const solvedInk = (puzzle: Binairo, layout: PageLayout, value: (cell: number) => number): InkStroke<null>[] =>
    puzzle.givens.flatMap((given, cell) => (given !== O ? [] : value(cell) === 1 ? [shade(layout.grid, cell)] : [dot(layout.grid, cell)]));

  const PUZZLE = generateBinairo('CHECK', 8, 'medium');
  const LAYOUT = layoutBinairoPage(PUZZLE, { orientation: 'portrait', hand: 'right', cellMm: 10 });
  const OPEN_CELLS = PUZZLE.givens.flatMap((given, cell) => (given === O ? [cell] : []));

  test('a page solved right has every open cell right', () => {
    const result = checkBinairo(PUZZLE, LAYOUT, solvedInk(PUZZLE, LAYOUT, cell => PUZZLE.solution[cell]));
    expect(result).toEqual({ wrong: [], right: OPEN_CELLS, empty: [], unread: [] });
  });

  test('a page with one wrong entry gets exactly that entry marked, a shade or a dot', () => {
    for (const wrongCell of [OPEN_CELLS[0], OPEN_CELLS[OPEN_CELLS.length - 1]]) {
      const ink = solvedInk(PUZZLE, LAYOUT, cell => (cell === wrongCell ? 1 - PUZZLE.solution[cell] : PUZZLE.solution[cell]));
      const result = checkBinairo(PUZZLE, LAYOUT, ink);
      expect(result.wrong).toEqual([wrongCell]);
      expect(result.right).toHaveLength(OPEN_CELLS.length - 1);
    }
  });

  test('a cross reads as 0, a blank cell is empty, a written digit is unread, and ink on a given is ignored', () => {
    const [zeroCell] = OPEN_CELLS.filter(cell => PUZZLE.solution[cell] === 0);
    const [blank, digit] = OPEN_CELLS.filter(cell => cell !== zeroCell);
    const givenCell = PUZZLE.givens.findIndex(given => given !== O);
    const ink = [...cross(LAYOUT.grid, zeroCell), ...written(LAYOUT.grid, digit, '1'), shade(LAYOUT.grid, givenCell)];
    const result = checkBinairo(PUZZLE, LAYOUT, ink);
    expect(result.right).toEqual([zeroCell]);
    expect(result.unread).toEqual([{ index: digit, reason: 'neither a shade nor a dot' }]);
    expect(result.empty).toContain(blank);
    expect(result.empty).toHaveLength(OPEN_CELLS.length - 2);
    expect(result.wrong).toEqual([]);
  });
});
