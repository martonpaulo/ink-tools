/**
 * The nonogram (#384): a size, then a difficulty, from `@ink-tools/puzzle-core`'s generator, page
 * and check of the shaded cells. The player shades a filled cell and may mark an empty one with a
 * dot or a cross; «Check» circles a wrong cell, and the answer shades the picture. Its strings are its own.
 */
import {
  checkNonogram,
  drawCellCheck,
  drawCellMarks,
  drawNonogramPage,
  generateNonogram,
  layoutNonogramPage,
  NONOGRAM_BANDS,
  NONOGRAM_SIDES,
  nonogramFromCode,
  puzzleCode,
  type CellMark,
  type Difficulty,
  type Nonogram,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import {drawn, type PageShape, type Puzzle, type PuzzleGame} from '../play/puzzle';

export const nonogramCopy = {
  title: 'Nonogram',
  subtitle: 'Shade runs of cells; each number is one run\'s length, in order',
  rule: 'Each number is a run of shaded cells, in order, with gaps between runs; a dot marks a blank cell.',
} as const;

function board(puzzle: Nonogram, shape: PageShape): Puzzle {
  const layout = layoutNonogramPage(puzzle, {orientation: shape.orientation, hand: shape.hand});
  const page = drawNonogramPage(puzzle, layout, {game: nonogramCopy.title, difficulty: playCopy.bands[puzzle.id.difficulty], rule: nonogramCopy.rule});
  const shaded = new Map<number, CellMark>(puzzle.solution.flatMap((filled, cell) => (filled ? [[cell, 'shade'] as const] : [])));
  return {
    code: puzzleCode(puzzle.id),
    size: playCopy.gridLabel(puzzle.width, puzzle.height),
    page,
    check: async ink => {
      const found = checkNonogram(puzzle, layout, ink);
      const unread = found.unread.map(cell => cell.index);
      // An empty cell is done when the picture leaves it empty: only an unshaded filled cell is left to do.
      const solved = found.wrong.length === 0 && unread.length === 0 && found.empty.every(cell => !puzzle.solution[cell]);
      return {picture: drawCellCheck(page, layout.grid, ink, found.wrong, unread), wrong: found.wrong.length, unread: unread.length, solved};
    },
    answer: () => drawCellMarks(page, layout.grid, shaded),
  };
}

export const NONOGRAM: PuzzleGame = {
  id: 'nonogram',
  title: nonogramCopy.title,
  subtitle: nonogramCopy.subtitle,
  unread: playCopy['verdict.unreadMark'],
  options: [
    {
      id: 'size',
      title: playCopy.size,
      choices: NONOGRAM_SIDES.map(side => ({value: String(side), label: playCopy.sizeLabel(side)})),
      initial: String(NONOGRAM_SIDES[0]),
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: NONOGRAM_BANDS.map(value => ({value, label: playCopy.bands[value]})),
      initial: NONOGRAM_BANDS[0],
    },
  ],
  create: (choices, seed, shape) => {
    const side = Number(choices.size);
    return drawn(generateNonogram(seed, {width: side, height: side}, choices.band as Difficulty), made => board(made, shape));
  },
  open: (code, shape) => board(nonogramFromCode(code), shape),
};
