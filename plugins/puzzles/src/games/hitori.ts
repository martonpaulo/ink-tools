/**
 * Hitori (#394): a size, then a difficulty, from `@ink-tools/puzzle-core`'s generator, page and
 * check of the shaded cells. The player shades a cell and may circle, dot or cross one to keep it
 * white; «Check» frames a wrong cell with a square, as a circle is the player's own mark here,
 * and the answer shades the cells to shade in a light grey the numbers still read through. Its
 * strings are its own.
 */
import {
  checkHitori,
  drawCellFrameCheck,
  drawCellMarks,
  drawHitoriPage,
  HITORI_BANDS,
  HITORI_SIDES,
  hitoriFromCode,
  newHitori,
  puzzleCode,
  type CellMark,
  type Difficulty,
  type Hitori,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const hitoriCopy = {
  title: 'Hitori',
  subtitle: 'Shade cells so no number repeats in a line; shaded cells never touch; white cells stay joined',
} as const;

function board(puzzle: Hitori, shape: PageShape): Puzzle {
  const {layout, raster: page} = drawHitoriPage(puzzle, {orientation: shape.orientation, hand: shape.hand});
  const shaded = new Map<number, CellMark>(puzzle.solution.flatMap((black, cell) => (black ? [[cell, 'shade'] as const] : [])));
  return {
    code: puzzleCode(puzzle.id),
    page,
    check: async ink => {
      const found = checkHitori(puzzle, layout.grid, ink);
      // A white cell is done when it is left as it is: only a cell to shade left blank is left to do.
      const solved = found.wrong.length === 0 && found.empty.every(cell => !puzzle.solution[cell]);
      return {picture: drawCellFrameCheck(page, layout.grid, ink, found.wrong), wrong: found.wrong.length, unread: 0, solved};
    },
    answer: () => drawCellMarks(page, layout.grid, shaded),
  };
}

export const HITORI: PuzzleGame = {
  id: 'hitori',
  title: hitoriCopy.title,
  subtitle: hitoriCopy.subtitle,
  wrong: playCopy['verdict.wrongFramed'],
  options: [
    {
      id: 'size',
      title: playCopy.size,
      choices: HITORI_SIDES.map(side => ({value: String(side), label: playCopy.sizeLabel(side)})),
      initial: String(HITORI_SIDES[0]),
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: HITORI_BANDS.map(value => ({value, label: playCopy.bands[value]})),
      initial: HITORI_BANDS[0],
    },
  ],
  create: (choices, seed, shape) => board(newHitori(seed, Number(choices.size), choices.band as Difficulty), shape),
  open: (code, shape) => board(hitoriFromCode(code), shape),
};
