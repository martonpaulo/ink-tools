import { digest, generateBinairo, generateCalcudoku, generateCodeword, generateFillIn, generateFutoshiki, generateHitori, generateLightUp, generateMaze, generateNonogram, generateSlitherlink, generateSudoku, generateWordSearch } from '../src';
import { WORD_LISTS } from '../src/words-data';

/**
 * Pinned digests of one puzzle per game (#380). They change only when generation changes on
 * purpose; the device round runs the same calls on the tablet and compares these values, which
 * proves the Mac and the tablet give the same puzzle for the same seed. The sudoku and nonogram
 * values changed on purpose with the tablet-speed work of #380: a sudoku now comes from the bank,
 * and a nonogram picture from the new fill chance.
 */
const PINNED: readonly [string, () => unknown, string][] = [
  ['sudoku 4 x 4 easy', () => generateSudoku('P1', 4, 'easy'), 'd653eef1'],
  ['sudoku 9 x 9 hard', () => generateSudoku('P1', 9, 'hard'), '7d6b66a0'],
  ['sudoku 16 x 16 medium', () => generateSudoku('P1', 16, 'medium'), 'dfbecd6a'],
  ['nonogram 15 x 10 medium', () => generateNonogram('P1', { width: 15, height: 10 }, 'medium'), '3fabf2b7'],
  ['maze 20 x 27 hard', () => generateMaze('P1', { shape: 'rectangle', width: 20, height: 27 }, 'hard'), '05d4c8e9'],
  ['maze 12 rings medium', () => generateMaze('P1', { shape: 'circle', rings: 12 }, 'medium'), 'a8c651b9'],
  ['word search 12 hard', () => generateWordSearch('P1', 12, 'hard', ['GATO', 'CACHORRO', 'LEAO', 'URSO', 'SAPO', 'PATO', 'CABRA', 'PEIXE']), 'fd1f2606'],
  ['slitherlink 7 x 7 easy', () => generateSlitherlink('P1', { width: 7, height: 7 }, 'easy'), '43040ddb'],
  ['slitherlink 10 x 10 hard', () => generateSlitherlink('P1', { width: 10, height: 10 }, 'hard'), '827fb590'],
  ['futoshiki 5 x 5 medium', () => generateFutoshiki('P1', 5, 'medium'), 'c23829d8'],
  ['futoshiki 7 x 7 hard', () => generateFutoshiki('P1', 7, 'hard'), '4cc1d288'],
  ['codeword 13 EN medium', () => generateCodeword('P1', 13, 'medium', WORD_LISTS.en), '60b2f276'],
  ['calcudoku 6 x 6 medium', () => generateCalcudoku('P1', 6, 'medium'), 'c7ecd04a'],
  ['fill-in pt medium', () => generateFillIn('P1', 'medium', WORD_LISTS.pt), '5f277c78'],
  ['light up 10 x 10 hard', () => generateLightUp('P1', { width: 10, height: 10 }, 'hard'), 'fe009ec1'],
  ['hitori 8 x 8 medium', () => generateHitori('P1', 8, 'medium'), 'ce19aabd'],
  ['binairo 10 x 10 hard', () => generateBinairo('P1', 10, 'hard'), 'bbcf3637'],
];

describe('the same seed gives the same puzzle everywhere', () => {
  test.each(PINNED)('%s', (_name, make, expected) => {
    expect(digest(make())).toBe(expected);
  });
});
