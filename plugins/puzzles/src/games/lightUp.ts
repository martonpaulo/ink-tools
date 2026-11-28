/**
 * Light Up (#395): a size, then a difficulty, from `@ink-tools/puzzle-core`'s generator, page and
 * check of the bulbs. The player draws a circle for a bulb and may put a dot or a cross in a cell
 * with none; «Check» frames a wrong cell with a square, as a circle is the player's own mark here,
 * and the answer draws a bulb in each bulb cell. Its strings are its own.
 */
import {
  checkLightUp,
  drawCellFrameCheck,
  drawCellMarks,
  drawLightUpPage,
  LIGHT_UP_BANDS,
  LIGHT_UP_SIDES,
  lightUpFromCode,
  newLightUp,
  puzzleCode,
  type CellMark,
  type Difficulty,
  type LightUp,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const lightUpCopy = {
  title: 'Light Up',
  subtitle: 'Place bulbs to light every white cell; numbers count the bulbs beside them',
} as const;

function board(puzzle: LightUp, shape: PageShape): Puzzle {
  const {layout, raster: page} = drawLightUpPage(puzzle, {orientation: shape.orientation, hand: shape.hand});
  const bulbs = new Map<number, CellMark>(puzzle.solution.flatMap((bulb, cell) => (bulb ? [[cell, 'bulb'] as const] : [])));
  return {
    code: puzzleCode(puzzle.id),
    page,
    check: async ink => {
      // A bulb not drawn yet is left to do, not wrong.
      const found = checkLightUp(puzzle, layout, ink);
      return {picture: drawCellFrameCheck(page, layout.grid, ink, found.wrong), wrong: found.wrong.length, unread: 0, solved: found.solved};
    },
    answer: () => drawCellMarks(page, layout.grid, bulbs),
  };
}

export const LIGHT_UP: PuzzleGame = {
  id: 'light-up',
  title: lightUpCopy.title,
  subtitle: lightUpCopy.subtitle,
  wrong: playCopy['verdict.wrongFramed'],
  options: [
    {
      id: 'size',
      title: playCopy.size,
      choices: LIGHT_UP_SIDES.map(side => ({value: String(side), label: playCopy.sizeLabel(side)})),
      initial: String(LIGHT_UP_SIDES[0]),
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: LIGHT_UP_BANDS.map(value => ({value, label: playCopy.bands[value]})),
      initial: LIGHT_UP_BANDS[0],
    },
  ],
  create: (choices, seed, shape) => {
    const side = Number(choices.size);
    return board(newLightUp(seed, {width: side, height: side}, choices.band as Difficulty), shape);
  },
  open: (code, shape) => board(lightUpFromCode(code), shape),
};
