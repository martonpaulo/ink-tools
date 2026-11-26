import {
  FUTOSHIKI_SIZES,
  checkFutoshiki,
  countFutoshikiSolutions,
  drawFutoshikiPage,
  futoshikiSignsOf,
  generateFutoshiki,
  parsePuzzleCode,
  puzzleCode,
  rateFutoshiki,
  solveFutoshiki,
  type FutoshikiSign,
} from '../src';
import { fakeRecognizer, write } from '../testing/ink';

const OFFERED = Object.entries(FUTOSHIKI_SIZES).flatMap(([size, bands]) => bands.map(band => [Number(size), band] as const));
const SEEDS = ['P1', 'P2', 'P3'];

/** A Latin square whose clues are tested by hand: 4 x 4, row by row. */
const SQUARE = [1, 2, 3, 4, 2, 1, 4, 3, 3, 4, 1, 2, 4, 3, 2, 1];

describe('futoshiki generation', () => {
  test.each(OFFERED)('%i x %i %s: one solution, the band asked for, a full Latin square under the clues', (size, band) => {
    for (const seed of SEEDS) {
      const puzzle = generateFutoshiki(seed, size, band);
      expect(countFutoshikiSolutions(size, puzzle.givens, puzzle.signs)).toBe(1);
      expect(rateFutoshiki(size, puzzle.givens, puzzle.signs)).toBe(band);
      expect(solveFutoshiki(size, puzzle.givens, puzzle.signs)).toEqual(puzzle.solution);
      for (let i = 0; i < size; i++) {
        const row = puzzle.solution.slice(i * size, (i + 1) * size);
        const column = puzzle.solution.filter((_, cell) => cell % size === i);
        expect([new Set(row).size, new Set(column).size]).toEqual([size, size]);
      }
      puzzle.givens.forEach((v, cell) => v && expect(v).toBe(puzzle.solution[cell]));
      for (const { less, greater } of puzzle.signs) expect(puzzle.solution[less]).toBeLessThan(puzzle.solution[greater]);
      expect(puzzle.rating).toEqual({ difficulty: band, givens: puzzle.givens.filter(Boolean).length, signs: puzzle.signs.length });
    }
  });

  test('the same seed gives the same puzzle, and another seed another', () => {
    expect(generateFutoshiki('P1', 6, 'medium')).toEqual(generateFutoshiki('P1', 6, 'medium'));
    expect(generateFutoshiki('P1', 6, 'medium').solution).not.toEqual(generateFutoshiki('P2', 6, 'medium').solution);
  });

  test('refuses a size or band it does not offer', () => {
    expect(() => generateFutoshiki('P1', 8, 'easy')).toThrow('futoshiki size 8 is not offered: 4, 5, 6, 7');
    expect(() => generateFutoshiki('P1', 4, 'hard')).toThrow('a 4 x 4 futoshiki offers easy, not hard');
  });

  test('its code names it and parses back', () => {
    const puzzle = generateFutoshiki('7K2Q9X', 7, 'hard');
    expect(puzzleCode(puzzle.id)).toBe('FU-7-H-7K2Q9X');
    expect(parsePuzzleCode('fu-7-h-7k2q9x')).toEqual(puzzle.id);
  });
});

describe('the futoshiki solver', () => {
  const none = new Array<number>(16).fill(0);

  test('counts no solution, one, or stops at the limit', () => {
    expect(countFutoshikiSolutions(4, SQUARE, [])).toBe(1);
    expect(countFutoshikiSolutions(4, none, [])).toBe(2);
    expect(countFutoshikiSolutions(4, none, [], 10)).toBe(10);
    // 1 at the first cell, and a sign that wants the cell below it smaller: no digit is.
    const one = none.slice();
    one[0] = 1;
    expect(countFutoshikiSolutions(4, one, [{ less: 4, greater: 0 }])).toBe(0);
    expect(solveFutoshiki(4, none, [])).toBeNull();
  });

  test('every sign of a square proves it with no given, by bounds and singles alone', () => {
    const signs = futoshikiSignsOf(4, SQUARE);
    expect(signs).toHaveLength(2 * 4 * 3);
    expect(countFutoshikiSolutions(4, none, signs)).toBe(1);
    expect(rateFutoshiki(4, none, signs)).toBe('easy');
    expect(solveFutoshiki(4, none, signs)).toEqual(SQUARE);
  });

  test('refuses clues that do not fit the grid', () => {
    expect(() => countFutoshikiSolutions(4, [1, 2], [])).toThrow('needs 16 cells, not 2');
    expect(() => countFutoshikiSolutions(4, [5, ...none.slice(1)], [])).toThrow('cell 0 holds 5, not 0 to 4');
    const wrapped: FutoshikiSign[] = [{ less: 3, greater: 4 }];
    expect(() => countFutoshikiSolutions(4, none, wrapped)).toThrow('cells 3 and 4 are not neighbours');
  });
});

describe('the futoshiki page and its check', () => {
  test('the page fits each orientation at the largest preset, and its footer names the puzzle', () => {
    const puzzle = generateFutoshiki('P1', 7, 'hard');
    for (const orientation of ['portrait', 'landscape'] as const) {
      const { raster, layout } = drawFutoshikiPage(puzzle, { orientation, hand: 'right' });
      expect([raster.width, raster.height]).toEqual([layout.width, layout.height]);
      expect([layout.grid.columns, layout.grid.rows, layout.grid.cell]).toEqual([7, 7, 177]);
    }
  });

  test('«Check» marks exactly the one wrong entry of a page written in inkctl ink, one call per row', async () => {
    const puzzle = generateFutoshiki('P1', 7, 'hard');
    const { layout } = drawFutoshikiPage(puzzle, { orientation: 'portrait', hand: 'right' });
    const open = puzzle.givens.flatMap((v, i) => (v ? [] : [i]));
    const wrong = open[Math.floor(open.length / 2)];
    const strokes = open.flatMap(i => {
      const value = i === wrong ? (puzzle.solution[i] % 7) + 1 : puzzle.solution[i];
      return write(layout.grid, i % 7, Math.floor(i / 7), String(value));
    });
    const { recognize, calls } = fakeRecognizer();
    const result = await checkFutoshiki(puzzle, layout.grid, strokes, recognize);
    expect(result.wrong).toEqual([wrong]);
    expect(result.right).toHaveLength(open.length - 1);
    expect([result.empty, result.unread]).toEqual([[], []]);
    expect(calls).toHaveLength(7);
  });

  test('«Check» on a blank page names every open cell empty, and refuses another grid', async () => {
    const puzzle = generateFutoshiki('P1', 5, 'medium');
    const { layout } = drawFutoshikiPage(puzzle, { orientation: 'portrait', hand: 'left', cellMm: 10 });
    const { recognize, calls } = fakeRecognizer();
    const result = await checkFutoshiki(puzzle, layout.grid, [], recognize);
    expect(result.empty).toHaveLength(puzzle.givens.filter(v => v === 0).length);
    expect(calls).toEqual([]);
    await expect(checkFutoshiki(puzzle, { ...layout.grid, columns: 6 }, [], recognize)).rejects.toThrow('not a 6 x 5 one');
  });

});
