import {
  CALCUDOKU_SIZES,
  cageHolds,
  cageLabel,
  countCalcudokuSolutions,
  deduceCalcudoku,
  calcudokuFromCode,
  generateCalcudoku,
  solveCalcudoku,
  type Calcudoku,
  type CalcudokuCage,
} from '../src/calcudoku';
import { checkCalcudoku, drawCalcudokuPage } from '../src/calcudoku-page';
import { digest } from '../src/random';
import { assertNativeGreys } from '../src/page/raster';
import { parsePuzzleCode, puzzleCode } from '../src/code';
import { fakeRecognizer, write } from '../testing/ink';

/** True when every row and column holds 1 to size once and every cage holds. */
function solves(puzzle: Calcudoku, values: readonly number[]): boolean {
  const n = puzzle.size;
  for (let i = 0; i < n; i++) {
    const row = new Set(Array.from({ length: n }, (_, c) => values[i * n + c]));
    const column = new Set(Array.from({ length: n }, (_, r) => values[r * n + i]));
    if (row.size !== n || column.size !== n) return false;
  }
  return values.every(v => v >= 1 && v <= n) && puzzle.cages.every(cage => cageHolds(cage.operation, cage.target, cage.cells.map(cell => values[cell])));
}

const SEEDS = ['P1', 'P2', 'P3'];
const OFFERED = Object.entries(CALCUDOKU_SIZES).flatMap(([size, bands]) => bands.map(band => [Number(size), band] as const));

describe('the cage rule', () => {
  test.each([
    ['+', 6, [1, 2, 3], true],
    ['+', 6, [1, 2, 4], false],
    ['×', 24, [2, 3, 4], true],
    ['-', 2, [1, 3], true],
    ['-', 2, [3, 1], true],
    ['/', 3, [6, 2], true],
    ['/', 3, [2, 5], false],
    ['-', 1, [1, 2, 3], false],
    ['=', 4, [4], true],
  ] as const)('%s %d over %j is %s', (operation, target, values, holds) => {
    expect(cageHolds(operation, target, values)).toBe(holds);
  });

  test('the label is the target and its sign, or the digit alone', () => {
    expect(cageLabel({ cells: [0, 1], operation: '×', target: 12 })).toBe('12×');
    expect(cageLabel({ cells: [0, 1], operation: '-', target: 3 })).toBe('3–');
    expect(cageLabel({ cells: [0], operation: '=', target: 3 })).toBe('3');
  });
});

describe('the solver', () => {
  const { cages, solution } = generateCalcudoku('P1', 4, 'easy');

  test('counts one solution and finds it', () => {
    expect(countCalcudokuSolutions(4, cages)).toBe(1);
    expect(solveCalcudoku(4, cages)).toEqual(solution);
  });

  test('a cage changed to a target no digits make leaves none', () => {
    const broken = cages.map((cage, k) => (k === 0 ? { ...cage, target: 9 } : cage));
    expect(countCalcudokuSolutions(4, broken)).toBe(0);
    expect(solveCalcudoku(4, broken)).toBeNull();
  });

  test('swappable cages leave more than one, counted only to the limit', () => {
    // Plus cages over pairs of two-cell columns: any Latin square with those column sums fits.
    // 1234 / 3412 / 2143 / 4321 has another square with the same sums: its first two rows swapped.
    const square = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
    const loose: CalcudokuCage[] = [0, 1, 2, 3].flatMap(c => [
      { cells: [c, c + 4], operation: '+' as const, target: square[c] + square[c + 4] },
      { cells: [c + 8, c + 12], operation: '+' as const, target: square[c + 8] + square[c + 12] },
    ]);
    expect(countCalcudokuSolutions(4, loose)).toBe(2);
    expect(deduceCalcudoku(4, loose)).toBeNull();
  });
});

describe('generation', () => {
  test.each(OFFERED)('a %d x %d %s puzzle has exactly one solution and meets its band', (size, band) => {
    for (const seed of SEEDS) {
      const puzzle = generateCalcudoku(seed, size, band);
      expect(solves(puzzle, puzzle.solution)).toBe(true);
      expect(countCalcudokuSolutions(size, puzzle.cages)).toBe(1);
      const covered = puzzle.cages.flatMap(cage => cage.cells).sort((a, b) => a - b);
      expect(covered).toEqual(puzzle.solution.map((_, i) => i));
      const deduced = deduceCalcudoku(size, puzzle.cages);
      if (band === 'expert') expect(deduced).toBeNull();
      else expect(deduced).toEqual(puzzle.solution);
      if (band === 'easy') expect(puzzle.cages.every(cage => ['+', '-', '='].includes(cage.operation))).toBe(true);
      if (band === 'hard' || band === 'expert') expect(puzzle.cages.every(cage => cage.cells.length > 1)).toBe(true);
    }
  });

  test('the same seed gives the same puzzle, and its code names it', () => {
    const first = generateCalcudoku('P1', 6, 'medium');
    expect(generateCalcudoku('P1', 6, 'medium')).toEqual(first);
    expect(generateCalcudoku('P2', 6, 'medium')).not.toEqual(first);
    expect(puzzleCode(first.id)).toBe('CD-6-M-P1');
    expect(parsePuzzleCode('CD-6-M-P1')).toEqual(first.id);
  });

  // Pinned outputs per fixed seed: they change only when generation changes on purpose.
  test.each([
    ['P1', 4, 'easy', 'ba9e482e'],
    ['P1', 6, 'medium', 'c7ecd04a'],
    ['P1', 7, 'hard', '3c777dee'],
    ['P1', 6, 'expert', 'a0bb0e3b'],
  ] as const)('seed %s, side %d, %s, gives digest %s', (seed, size, band, expected) => {
    expect(digest(generateCalcudoku(seed, size, band))).toBe(expected);
  });

  test('a side or band not offered is refused', () => {
    expect(() => generateCalcudoku('P1', 3, 'easy')).toThrow(/4 to 9/);
    expect(() => generateCalcudoku('P1', 10, 'easy')).toThrow(/4 to 9/);
    expect(() => generateCalcudoku('P1', 9, 'expert')).toThrow(/offers/);
  });
});

describe('the page and «Check»', () => {
  const puzzle = generateCalcudoku('P1', 6, 'medium');

  test('the page is drawn in native greys at the largest cell that fits', () => {
    const { layout, raster } = drawCalcudokuPage(puzzle, { orientation: 'portrait', hand: 'right' });
    expect(() => assertNativeGreys(raster)).not.toThrow();
    expect(layout.grid.columns).toBe(6);
    expect(layout.grid.cell).toBe(177);
  });

  test('a page solved with inkctl ink and one wrong entry gets exactly that entry marked', async () => {
    const { layout } = drawCalcudokuPage(puzzle, { orientation: 'portrait', hand: 'right', cellMm: 10 });
    const n = puzzle.size;
    const wrongCell = 14;
    const strokes = puzzle.solution.flatMap((value, i) => {
      const written = i === wrongCell ? (value % n) + 1 : value;
      return write(layout.grid, i % n, Math.floor(i / n), String(written));
    });
    const { recognize, calls } = fakeRecognizer();
    const result = await checkCalcudoku(puzzle, layout, strokes, recognize);
    expect(result.wrong).toEqual([wrongCell]);
    expect(result.right).toHaveLength(n * n - 1);
    expect(result.unread).toEqual([]);
    expect(calls).toHaveLength(n);
  });

  test('an untouched page has every cell empty and no wrong cell', async () => {
    const { layout } = drawCalcudokuPage(puzzle, { orientation: 'landscape', hand: 'left' });
    const { recognize } = fakeRecognizer();
    const result = await checkCalcudoku(puzzle, layout, [], recognize);
    expect(result.empty).toHaveLength(puzzle.solution.length);
    expect(result.wrong).toEqual([]);
  });
});

describe('the calcudoku code (#388)', () => {
  test('names the same puzzle again, and another game\'s code is refused', () => {
    const puzzle = generateCalcudoku('7K2Q9X', 6, 'medium');
    expect(digest(calcudokuFromCode(puzzleCode(puzzle.id)))).toBe(digest(puzzle));
    expect(() => calcudokuFromCode('FU-6-M-7K2Q9X')).toThrow('not a calcudoku code');
  });
});
