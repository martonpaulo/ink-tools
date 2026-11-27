/**
 * Bridges (#396): a size, then a difficulty, from `@ink-tools/puzzle-core`'s
 * generator, page and check of the drawn bridges. «Check» marks each link drawn with more bridges
 * than it takes; one with fewer is left to do. The answer draws every bridge. Its strings are its own.
 */
import {
  BRIDGES_BANDS,
  BRIDGES_SIDES,
  bridgesAnswers,
  bridgesFromCode,
  checkBridges,
  drawBridgesPage,
  drawLinkAnswers,
  drawLineCheck,
  generateBridges,
  linkLine,
  puzzleCode,
  type Bridges,
  type Difficulty,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const bridgesCopy = {
  title: 'Bridges',
  subtitle: 'Join all islands in one group by straight bridges; each number counts its bridges',
} as const;

function board(puzzle: Bridges, shape: PageShape): Puzzle {
  const {raster: page, layout} = drawBridgesPage(puzzle, shape.orientation, shape.hand);
  const {grid} = layout;
  const links = bridgesAnswers(puzzle);
  return {
    code: puzzleCode(puzzle.id),
    page,
    check: async ink => {
      const found = checkBridges(grid, puzzle, ink);
      const wrong = found.wrong.map(e => linkLine(grid, links[e].from, links[e].to));
      const solved = found.wrong.length === 0 && found.empty.length === 0;
      return {picture: drawLineCheck(page, grid, ink, wrong), wrong: wrong.length, unread: 0, solved};
    },
    answer: () => drawLinkAnswers(page, grid, links),
  };
}

export const BRIDGES: PuzzleGame = {
  id: 'bridges',
  title: bridgesCopy.title,
  subtitle: bridgesCopy.subtitle,
  options: [
    {
      id: 'size',
      title: playCopy.size,
      choices: BRIDGES_SIDES.map(side => ({value: String(side), label: playCopy.sizeLabel(side)})),
      initial: String(BRIDGES_SIDES[0]),
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      // Every offered side reaches every band, a hard one too (`BRIDGES_LIMITS.hardMinSide`).
      choices: BRIDGES_BANDS.map(value => ({value, label: playCopy.bands[value]})),
      initial: BRIDGES_BANDS[0],
    },
  ],
  create: (choices, seed, shape) => {
    const side = Number(choices.size);
    return board(generateBridges(seed, {width: side, height: side}, choices.band as Difficulty), shape);
  },
  open: (code, shape) => board(bridgesFromCode(code), shape),
};
