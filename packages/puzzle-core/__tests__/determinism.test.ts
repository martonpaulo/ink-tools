import { digest, generateMaze, generateNonogram, generateSudoku, generateWordSearch } from '../src';

/**
 * Pinned digests of one puzzle per game (#380). They change only when generation changes on
 * purpose; the device round runs the same calls on the tablet and compares these values, which
 * proves the Mac and the tablet give the same puzzle for the same seed.
 */
const PINNED: readonly [string, () => unknown, string][] = [
  ['sudoku 4 x 4 easy', () => generateSudoku('P1', 4, 'easy'), 'b86ecea8'],
  ['sudoku 9 x 9 hard', () => generateSudoku('P1', 9, 'hard'), 'd7876ead'],
  ['sudoku 16 x 16 medium', () => generateSudoku('P1', 16, 'medium'), '7ef5edc5'],
  ['nonogram 15 x 10 medium', () => generateNonogram('P1', { width: 15, height: 10 }, 'medium'), '4b839cba'],
  ['maze 20 x 27 hard', () => generateMaze('P1', { shape: 'rectangle', width: 20, height: 27 }, 'hard'), '05d4c8e9'],
  ['maze 12 rings medium', () => generateMaze('P1', { shape: 'circle', rings: 12 }, 'medium'), 'a8c651b9'],
  ['word search 12 hard', () => generateWordSearch('P1', 12, 'hard', ['GATO', 'CACHORRO', 'LEAO', 'URSO', 'SAPO', 'PATO', 'CABRA', 'PEIXE']), 'fd1f2606'],
];

describe('the same seed gives the same puzzle everywhere', () => {
  test.each(PINNED)('%s', (_name, make, expected) => {
    expect(digest(make())).toBe(expected);
  });
});
