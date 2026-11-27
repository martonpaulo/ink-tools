/**
 * Futoshiki (#390): a size, then a difficulty that size offers, from `@ink-tools/puzzle-core`'s
 * generator, page and check of the written digits. Its strings are its own.
 */
import {
  checkFutoshiki,
  drawCellAnswers,
  drawCellCheck,
  drawFutoshikiPage,
  FUTOSHIKI_SIZES,
  futoshikiFromCode,
  generateFutoshiki,
  puzzleCode,
  type Difficulty,
  type Futoshiki,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const futoshikiCopy = {
  title: 'Futoshiki',
  subtitle: 'Fill each row and column once; each sign points to the smaller digit',
} as const;

const SIZES = Object.keys(FUTOSHIKI_SIZES).map(Number);

function board(puzzle: Futoshiki, shape: PageShape): Puzzle {
  const {raster: page, layout} = drawFutoshikiPage(puzzle, {orientation: shape.orientation, hand: shape.hand});
  const open = puzzle.givens.flatMap((given, cell) => (given === 0 ? [[cell, String(puzzle.solution[cell])] as const] : []));
  return {
    code: puzzleCode(puzzle.id),
    page,
    check: async (ink, read) => {
      const found = await checkFutoshiki(puzzle, layout.grid, ink, read);
      const unread = found.unread.map(cell => cell.index);
      const solved = found.wrong.length === 0 && found.empty.length === 0 && unread.length === 0;
      return {picture: drawCellCheck(page, layout.grid, ink, found.wrong, unread), wrong: found.wrong.length, unread: unread.length, solved};
    },
    answer: () => drawCellAnswers(page, layout.grid, new Map(open)),
  };
}

export const FUTOSHIKI: PuzzleGame = {
  id: 'futoshiki',
  title: futoshikiCopy.title,
  subtitle: futoshikiCopy.subtitle,
  options: [
    {
      id: 'size',
      title: playCopy.size,
      choices: SIZES.map(size => ({value: String(size), label: playCopy.sizeLabel(size)})),
      initial: String(SIZES[0]),
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: earlier => FUTOSHIKI_SIZES[Number(earlier.size)].map(value => ({value, label: playCopy.bands[value]})),
      initial: 'easy',
    },
  ],
  create: (choices, seed, shape) => board(generateFutoshiki(seed, Number(choices.size), choices.band as Difficulty), shape),
  open: (code, shape) => board(futoshikiFromCode(code), shape),
};
