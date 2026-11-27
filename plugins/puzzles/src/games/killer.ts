/**
 * Killer sudoku (#387): a 9 x 9 at a difficulty, from `@ink-tools/puzzle-core`'s bank, page and
 * check of the written digits. Its strings are its own.
 */
import {
  checkKiller,
  cageLabelCells,
  drawCellAnswers,
  drawCellCheck,
  drawKillerPage,
  generateKiller,
  KILLER_BANDS,
  killerFromCode,
  puzzleCode,
  type Difficulty,
  type KillerSudoku,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const killerCopy = {
  title: 'Killer Sudoku',
  subtitle: 'Fill each row, column and box with 1 to 9 once; each cage adds up to its sum',
} as const;

const BANDS = Object.keys(KILLER_BANDS) as Difficulty[];

function board(puzzle: KillerSudoku, shape: PageShape): Puzzle {
  const {raster: page, layout} = drawKillerPage(puzzle, {orientation: shape.orientation, hand: shape.hand});
  // A cage's sum sits in its top-left cell: the marks and answers leave it clear (#388).
  const labelled = cageLabelCells(puzzle.cages);
  const open = puzzle.givens.flatMap((given, cell) => (given === 0 ? [[cell, String(puzzle.solution[cell])] as const] : []));
  return {
    code: puzzleCode(puzzle.id),
    page,
    check: async (ink, read) => {
      const found = await checkKiller(puzzle, layout.grid, ink, read);
      const unread = found.unread.map(cell => cell.index);
      const solved = found.wrong.length === 0 && found.empty.length === 0 && unread.length === 0;
      return {picture: drawCellCheck(page, layout.grid, ink, found.wrong, unread, labelled), wrong: found.wrong.length, unread: unread.length, solved};
    },
    answer: () => drawCellAnswers(page, layout.grid, new Map(open), labelled),
  };
}

export const KILLER: PuzzleGame = {
  id: 'killer-sudoku',
  title: killerCopy.title,
  subtitle: killerCopy.subtitle,
  options: [
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: BANDS.map(value => ({value, label: playCopy.bands[value]})),
      initial: BANDS[0],
    },
  ],
  create: (choices, seed, shape) => board(generateKiller(seed, choices.band as Difficulty), shape),
  open: (code, shape) => board(killerFromCode(code), shape),
};
