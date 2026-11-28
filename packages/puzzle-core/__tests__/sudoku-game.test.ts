import { crc32 } from 'zlib';
import {
  SUDOKU_SIZES,
  checkSudoku,
  countSudokuSolutions,
  digest,
  drawSudokuPage,
  encodeSudoku,
  generateSudoku,
  sudokuAlphabet,
  sudokuExpected,
  sudokuPagePng,
  type Sudoku,
  type SudokuPageOptions,
} from '../src';
import { fakeRecognizer, write, writeNumber } from '../testing/ink';
import { expectOnlyWrong } from '../testing/check';

/** Classic sudoku as a Puzzles game (#383): fixed seeds, its page and its «Check». */
const OPTIONS: SudokuPageOptions = {
  orientation: 'portrait',
  hand: 'right',
  text: { game: 'Sudoku', difficulty: 'Easy', rule: 'Put each value once in each row, each column and each box.' },
};

const offered = Object.values(SUDOKU_SIZES).flatMap(shape => shape.bands.map(band => [shape.size, band] as const));

/**
 * Pinned per size and band for seed G1: the solution count, and the digest of the puzzle. They
 * change only when generation changes on purpose.
 */
const PINNED: Readonly<Record<string, string>> = {
  '4:easy': 'a39caaba',
  '6:easy': '158b38f0',
  '8:easy': '77a632fc',
  '8:medium': 'c2b7a6b3',
  '9:easy': '7ab919e6',
  '9:medium': 'eb50e4d1',
  '9:hard': '28bb4c8e',
  '9:expert': '2b64449f',
  '10:easy': '06c703db',
  '10:medium': '10dd7085',
  '10:hard': '8ae1572c',
  '12:easy': '8ada3477',
  '12:medium': '753ac1d7',
  '12:hard': 'd80334b1',
  '16:easy': 'c77a1de3',
  '16:medium': '1131f7df',
  '16:hard': 'a980f5fd',
};

describe('generation for fixed seeds', () => {
  test.each(offered)('size %i, %s, has one solution and a pinned output', (size, band) => {
    const puzzle = generateSudoku('G1', size, band);
    expect(countSudokuSolutions(puzzle.shape, puzzle.givens)).toBe(1);
    expect(digest(puzzle)).toBe(PINNED[`${size}:${band}`]);
  });

  test('a 4 x 4 is pinned cell by cell', () => {
    const puzzle = generateSudoku('G1', 4, 'easy');
    expect(encodeSudoku(puzzle.givens)).toBe('3000140000020040');
    expect(encodeSudoku(puzzle.solution)).toBe('3214142341322341');
  });
});

describe('the sudoku page', () => {
  test('the same seed gives the same page bytes, pinned', () => {
    const bytes = sudokuPagePng(generateSudoku('G1', 9, 'easy'), OPTIONS);
    expect(Buffer.from(bytes).equals(Buffer.from(sudokuPagePng(generateSudoku('G1', 9, 'easy'), OPTIONS)))).toBe(true);
    expect(crc32(bytes)).toBe(438227768);
  });

  test('the solution is never drawn: a page with the solution blanked has the same pixels', () => {
    const puzzle = generateSudoku('G1', 9, 'medium');
    const blanked: Sudoku = { ...puzzle, solution: puzzle.solution.map(() => 0) };
    const pixels = (p: Sudoku) => Buffer.from(drawSudokuPage(p, OPTIONS).raster.pixels);
    expect(pixels(blanked).equals(pixels(puzzle))).toBe(true);
  });

  test.each(Object.keys(SUDOKU_SIZES).map(Number))('size %i fits a portrait and a landscape page', size => {
    const puzzle = generateSudoku('G1', size, 'easy');
    for (const orientation of ['portrait', 'landscape'] as const) {
      const { layout } = drawSudokuPage(puzzle, { ...OPTIONS, orientation });
      expect(layout.grid.columns).toBe(size);
      expect(layout.grid.rows).toBe(size);
    }
  });
});

/** Writes the solution in every cell the player fills, with `wrong` cells holding another value. */
function solve(puzzle: Sudoku, layout: ReturnType<typeof drawSudokuPage>['layout'], wrong: ReadonlySet<number>) {
  const side = puzzle.shape.size;
  return [...sudokuExpected(puzzle)].flatMap(([i, value]) => {
    const text = wrong.has(i) ? String((Number(value) % side) + 1) : value;
    return text.length > 1
      ? writeNumber(layout.grid, i % side, Math.floor(i / side), text)
      : write(layout.grid, i % side, Math.floor(i / side), text);
  });
}

describe('«Check» on a page solved in inkctl ink', () => {
  test.each([
    [9, 'hard'],
    [16, 'easy'],
  ] as const)('size %i, %s, with one wrong entry marks exactly that entry', async (size, band) => {
    const puzzle = generateSudoku('G1', size, band);
    const { layout } = drawSudokuPage(puzzle, OPTIONS);
    const open = [...sudokuExpected(puzzle).keys()];
    const wrongCell = open[Math.floor(open.length / 2)];
    const { recognize } = fakeRecognizer();
    const result = await checkSudoku(puzzle, layout, solve(puzzle, layout, new Set([wrongCell])), recognize);
    expectOnlyWrong(result, wrongCell, open.length);
  });

  test('a blank page reads every open cell empty, and a given is never checked', async () => {
    const puzzle = generateSudoku('G1', 6, 'easy');
    const { layout } = drawSudokuPage(puzzle, OPTIONS);
    const { recognize, calls } = fakeRecognizer();
    const result = await checkSudoku(puzzle, layout, [], recognize);
    expect(result.empty).toEqual([...sudokuExpected(puzzle).keys()]);
    expect(calls).toEqual([]);
    puzzle.givens.forEach((value, i) => value && expect(sudokuExpected(puzzle).has(i)).toBe(false));
  });

  test('a cell holds a digit up to 9 x 9 and a number beyond', () => {
    expect(sudokuAlphabet(generateSudoku('G1', 9, 'easy'))).toBe('digit');
    expect(sudokuAlphabet(generateSudoku('G1', 12, 'easy'))).toBe('number');
  });
});
