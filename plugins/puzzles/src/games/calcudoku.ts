/**
 * Calcudoku (#388): a size, then a difficulty that size offers, from `@ink-tools/puzzle-core`'s
 * generator, page and check of the written digits. Every cell is the player's to fill: a one-cell
 * cage's label is a clue, not a given. Its strings are its own.
 */
import {
  CALCUDOKU_SIZES,
  cageLabelCells,
  calcudokuFromCode,
  checkCalcudoku,
  drawCalcudokuPage,
  drawCellAnswers,
  drawCellCheck,
  generateCalcudoku,
  puzzleCode,
  type Calcudoku,
  type Difficulty,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const calcudokuCopy = {
  title: 'Calcudoku',
  subtitle: 'Fill each row and column once; each cage makes its number with its sign',
  size: 'Size',
  sizeLabel: (size: number) => `${size} x ${size}`,
} as const;

const SIZES = Object.keys(CALCUDOKU_SIZES).map(Number);

function board(puzzle: Calcudoku, shape: PageShape): Puzzle {
  const {raster: page, layout} = drawCalcudokuPage(puzzle, {orientation: shape.orientation, hand: shape.hand});
  // A cage's label sits in its top-left cell: the marks and answers leave it clear.
  const labelled = cageLabelCells(puzzle.cages);
  const all = puzzle.solution.map((value, cell) => [cell, String(value)] as const);
  return {
    code: puzzleCode(puzzle.id),
    page,
    check: async (ink, read) => {
      const found = await checkCalcudoku(puzzle, layout, ink, read);
      const unread = found.unread.map(cell => cell.index);
      const solved = found.wrong.length === 0 && found.empty.length === 0 && unread.length === 0;
      return {picture: drawCellCheck(page, layout.grid, ink, found.wrong, unread, labelled), wrong: found.wrong.length, unread: unread.length, solved};
    },
    answer: () => drawCellAnswers(page, layout.grid, new Map(all), labelled),
  };
}

export const CALCUDOKU: PuzzleGame = {
  id: 'calcudoku',
  title: calcudokuCopy.title,
  subtitle: calcudokuCopy.subtitle,
  options: [
    {
      id: 'size',
      title: calcudokuCopy.size,
      choices: SIZES.map(size => ({value: String(size), label: calcudokuCopy.sizeLabel(size)})),
      initial: String(SIZES[0]),
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: earlier => CALCUDOKU_SIZES[Number(earlier.size)].map(value => ({value, label: playCopy.bands[value]})),
      initial: 'easy',
    },
  ],
  create: (choices, seed, shape) => board(generateCalcudoku(seed, Number(choices.size), choices.band as Difficulty), shape),
  open: (code, shape) => board(calcudokuFromCode(code), shape),
};
