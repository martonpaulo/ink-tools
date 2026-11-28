/**
 * Kakuro (#389): a size, then a difficulty that size offers, from `@ink-tools/puzzle-core`'s
 * generator, page and check of the written digits. Only the white cells are the player's: the
 * blocks hold the sums. Its strings are its own.
 */
import {
  checkKakuro,
  drawCellAnswers,
  drawCellCheck,
  drawKakuroPage,
  KAKURO_SIZES,
  kakuroAnswers,
  kakuroFromCode,
  newKakuro,
  puzzleCode,
  type Difficulty,
  type Kakuro,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import {drawn, unreadWhy, type PageShape, type Puzzle, type PuzzleGame} from '../play/puzzle';

export const kakuroCopy = {
  title: 'Kakuro',
  subtitle: 'Fill each run with 1 to 9 once; each run adds up to its sum',
} as const;

const SIZES = Object.keys(KAKURO_SIZES).map(Number);

function board(puzzle: Kakuro, shape: PageShape): Puzzle {
  const {raster: page, layout} = drawKakuroPage(puzzle, {orientation: shape.orientation, hand: shape.hand});
  return {
    code: puzzleCode(puzzle.id),
    page,
    check: async (ink, read) => {
      const found = await checkKakuro(layout.grid, puzzle, ink, read);
      const unread = found.unread.map(cell => cell.index);
      const solved = found.wrong.length === 0 && found.empty.length === 0 && unread.length === 0;
      return {picture: drawCellCheck(page, layout.grid, ink, found.wrong, unread), wrong: found.wrong.length, unread: unread.length, why: unreadWhy(found.unread, layout.grid.columns), solved};
    },
    answer: () => drawCellAnswers(page, layout.grid, kakuroAnswers(puzzle)),
  };
}

export const KAKURO: PuzzleGame = {
  id: 'kakuro',
  title: kakuroCopy.title,
  subtitle: kakuroCopy.subtitle,
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
      choices: earlier => KAKURO_SIZES[Number(earlier.size)].map(value => ({value, label: playCopy.bands[value]})),
      initial: 'easy',
    },
  ],
  create: (choices, seed, shape) => drawn(newKakuro(seed, Number(choices.size), choices.band as Difficulty), made => board(made, shape)),
  open: (code, shape) => board(kakuroFromCode(code), shape),
};
