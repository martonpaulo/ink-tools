/**
 * Binairo (#393): a size, then a difficulty, from `@ink-tools/puzzle-core`'s generator, page and
 * check of the marked cells. The player shades a cell for black and puts a dot or a cross in it for
 * white; «Check» frames a wrong cell, as a ring would read as a printed white disc, and the answer shades or dots each open cell. Its strings are its own.
 */
import {
  BINAIRO_BANDS,
  BINAIRO_OPEN,
  BINAIRO_SIDES,
  binairoFromCode,
  checkBinairo,
  drawBinairoPage,
  drawCellFrameCheck,
  drawCellMarks,
  layoutBinairoPage,
  newBinairo,
  puzzleCode,
  type Binairo,
  type CellMark,
  type Difficulty,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const binairoCopy = {
  title: 'Binairo',
  subtitle: 'Shade for black, dot for white; no three alike in a line, half each, no two lines alike',
} as const;

function board(puzzle: Binairo, shape: PageShape): Puzzle {
  const layout = layoutBinairoPage(puzzle, {orientation: shape.orientation, hand: shape.hand});
  const page = drawBinairoPage(puzzle, layout, {game: binairoCopy.title, difficulty: playCopy.bands[puzzle.id.difficulty], code: puzzleCode(puzzle.id)});
  const marks = new Map<number, CellMark>(
    puzzle.givens.flatMap((given, cell) => (given === BINAIRO_OPEN ? [[cell, puzzle.solution[cell] === 1 ? 'shade' : 'dot'] as const] : [])),
  );
  return {
    code: puzzleCode(puzzle.id),
    size: playCopy.sizeLabel(puzzle.size),
    page,
    check: async ink => {
      const found = checkBinairo(puzzle, layout, ink);
      const unread = found.unread.map(cell => cell.index);
      const solved = found.wrong.length === 0 && found.empty.length === 0 && unread.length === 0;
      return {picture: drawCellFrameCheck(page, layout.grid, ink, found.wrong, unread), wrong: found.wrong.length, unread: unread.length, solved};
    },
    answer: () => drawCellMarks(page, layout.grid, marks),
  };
}

export const BINAIRO: PuzzleGame = {
  id: 'binairo',
  title: binairoCopy.title,
  subtitle: binairoCopy.subtitle,
  unread: playCopy['verdict.unreadFramed'],
  wrong: playCopy['verdict.wrongFramed'],
  options: [
    {
      id: 'size',
      title: playCopy.size,
      choices: BINAIRO_SIDES.map(side => ({value: String(side), label: playCopy.sizeLabel(side)})),
      initial: String(BINAIRO_SIDES[0]),
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: BINAIRO_BANDS.map(value => ({value, label: playCopy.bands[value]})),
      initial: BINAIRO_BANDS[0],
    },
  ],
  create: (choices, seed, shape) => board(newBinairo(seed, Number(choices.size), choices.band as Difficulty), shape),
  open: (code, shape) => board(binairoFromCode(code), shape),
};
