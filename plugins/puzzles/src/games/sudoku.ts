/**
 * Classic sudoku (#383): a size from 4 x 4 to 16 x 16, then a difficulty that size offers, from
 * `@ink-tools/puzzle-core`'s generator, page and check of the written numbers. Its strings are its own.
 */
import {
  checkSudoku,
  drawCellAnswers,
  drawCellCheck,
  drawSudokuPage,
  generateSudoku,
  puzzleCode,
  SUDOKU_SIZES,
  sudokuExpected,
  sudokuFromCode,
  type Difficulty,
  type Sudoku,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const sudokuCopy = {
  title: 'Sudoku',
  subtitle: 'Fill each row, column and box once',
  size: 'Size',
  sizeLabel: (size: number) => `${size} x ${size}`,
  /** The rule the page's footer prints. */
  rule: (size: number) => `Put 1 to ${size} once in each row, column and box.`,
} as const;

const SIZES = Object.keys(SUDOKU_SIZES).map(Number);
/** The size a new player sees first: the classic one. */
const CLASSIC = 9;

function board(puzzle: Sudoku, shape: PageShape): Puzzle {
  const text = {game: sudokuCopy.title, difficulty: playCopy.bands[puzzle.id.difficulty], rule: sudokuCopy.rule(puzzle.shape.size)};
  const {raster: page, layout} = drawSudokuPage(puzzle, {orientation: shape.orientation, hand: shape.hand, text});
  return {
    code: puzzleCode(puzzle.id),
    page,
    check: async (ink, read) => {
      const found = await checkSudoku(puzzle, layout, ink, read);
      const unread = found.unread.map(cell => cell.index);
      const solved = found.wrong.length === 0 && found.empty.length === 0 && unread.length === 0;
      return {picture: drawCellCheck(page, layout.grid, ink, found.wrong, unread), wrong: found.wrong.length, unread: unread.length, solved};
    },
    answer: () => drawCellAnswers(page, layout.grid, sudokuExpected(puzzle)),
  };
}

export const SUDOKU: PuzzleGame = {
  id: 'sudoku',
  title: sudokuCopy.title,
  subtitle: sudokuCopy.subtitle,
  options: [
    {
      id: 'size',
      title: sudokuCopy.size,
      choices: SIZES.map(size => ({value: String(size), label: sudokuCopy.sizeLabel(size)})),
      initial: String(CLASSIC),
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: earlier => SUDOKU_SIZES[Number(earlier.size)].bands.map(value => ({value, label: playCopy.bands[value]})),
      initial: 'easy',
    },
  ],
  create: (choices, seed, shape) => board(generateSudoku(seed, Number(choices.size), choices.band as Difficulty), shape),
  open: (code, shape) => board(sudokuFromCode(code), shape),
};
