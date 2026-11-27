/**
 * Slitherlink (#391): a size, then a difficulty, from `@ink-tools/puzzle-core`'s generator, page and
 * check of the drawn loop. «Check» rings each edge drawn off the loop; the answer draws the loop. A
 * cross marked on an edge to rule it out draws no edge.
 * Its strings are its own.
 */
import {
  checkSlitherlink,
  drawEdgeAnswers,
  drawLineCheck,
  drawSlitherlinkPage,
  edgeEnds,
  newSlitherlink,
  puzzleCode,
  SLITHERLINK_BANDS,
  SLITHERLINK_SIDES,
  slitherlinkFromCode,
  slitherlinkLoop,
  type Difficulty,
  type Slitherlink,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const slitherlinkCopy = {
  title: 'Slitherlink',
  subtitle: "Draw one loop along the dots, never crossing; each number counts its cell's sides on the loop",
  rule: "Draw one loop along the dots, never crossing; each number counts its cell's sides on the loop.",
} as const;

function board(puzzle: Slitherlink, shape: PageShape): Puzzle {
  const text = {game: slitherlinkCopy.title, difficulty: playCopy.bands[puzzle.id.difficulty], rule: slitherlinkCopy.rule};
  const {raster: page, layout} = drawSlitherlinkPage(puzzle, {orientation: shape.orientation, hand: shape.hand, text});
  const {grid} = layout;
  return {
    code: puzzleCode(puzzle.id),
    page,
    check: async ink => {
      const found = checkSlitherlink(puzzle, grid, ink);
      return {picture: drawLineCheck(page, grid, ink, found.wrong.map(key => edgeEnds(grid, key))), wrong: found.wrong.length, unread: 0, solved: found.solved};
    },
    answer: () => drawEdgeAnswers(page, grid, slitherlinkLoop(puzzle)),
  };
}

export const SLITHERLINK: PuzzleGame = {
  id: 'slitherlink',
  title: slitherlinkCopy.title,
  subtitle: slitherlinkCopy.subtitle,
  options: [
    {
      id: 'size',
      title: playCopy.size,
      choices: SLITHERLINK_SIDES.map(side => ({value: String(side), label: playCopy.sizeLabel(side)})),
      initial: String(SLITHERLINK_SIDES[0]),
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: SLITHERLINK_BANDS.map(value => ({value, label: playCopy.bands[value]})),
      initial: SLITHERLINK_BANDS[0],
    },
  ],
  create: (choices, seed, shape) => {
    const side = Number(choices.size);
    return board(newSlitherlink(seed, {width: side, height: side}, choices.band as Difficulty), shape);
  },
  open: (code, shape) => board(slitherlinkFromCode(code), shape),
};
