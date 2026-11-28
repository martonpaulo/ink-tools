/**
 * Star Battle (#392): a size, the stars in each line that size allows, then a difficulty that
 * size offers, from `@ink-tools/puzzle-core`'s generator, page and check of the starred cells. The
 * player draws a star in a cell and may rule one out with a dot; «Check» circles a wrong cell, and
 * the answer draws a star in each star cell. Its strings are its own.
 */
import {
  checkStarBattle,
  drawCellCheck,
  drawCellMarks,
  drawStarBattlePage,
  layoutStarBattle,
  newStarBattle,
  puzzleCode,
  STAR_BATTLE_MAX_SIDE,
  STAR_BATTLE_MIN_SIDE,
  STAR_BATTLE_TWO_STAR_MIN_SIDE,
  starBattleBands,
  starBattleFromCode,
  type CellMark,
  type Difficulty,
  type StarBattle,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import {drawn, type PageShape, type Puzzle, type PuzzleGame} from '../play/puzzle';

export const starBattleCopy = {
  title: 'Star Battle',
  subtitle: 'Draw 1 or 2 stars in each row, column and region; no two stars touch',
  stars: 'New page stars in each row, column and region',
  starsLabel: (stars: number) => (stars === 1 ? '1 star' : `${stars} stars`),
  /** Under the stars when the size allows one star only. */
  starsNote: (side: number) => `2 stars from ${side} x ${side}.`,
  /** Under the bands when the size and stars allow fewer of them. */
  bandsNote: 'Only Hard at this size with 2 stars.',
  rule: (stars: number) => `${stars === 1 ? 'One star' : 'Two stars'} in each row, column and region; no two touch, even at a corner; a dot marks no star.`,
} as const;

const SIDES = Array.from({length: STAR_BATTLE_MAX_SIDE - STAR_BATTLE_MIN_SIDE + 1}, (_, i) => STAR_BATTLE_MIN_SIDE + i);
const starsOf = (side: number): readonly (1 | 2)[] => (side >= STAR_BATTLE_TWO_STAR_MIN_SIDE ? [1, 2] : [1]);

function board(puzzle: StarBattle, shape: PageShape): Puzzle {
  const layout = layoutStarBattle(puzzle, {orientation: shape.orientation, hand: shape.hand});
  const code = puzzleCode(puzzle.id);
  const page = drawStarBattlePage(puzzle, layout, {game: starBattleCopy.title, difficulty: playCopy.bands[puzzle.id.difficulty], code, rule: starBattleCopy.rule(puzzle.stars)});
  const stars = new Map<number, CellMark>(puzzle.solution.flatMap((star, cell) => (star ? [[cell, 'star'] as const] : [])));
  return {
    code,
    size: playCopy.sizeLabel(puzzle.side),
    page,
    check: async ink => {
      const found = checkStarBattle(puzzle, layout.grid, ink);
      const solved = found.wrong.length === 0 && found.empty.length === 0;
      return {picture: drawCellCheck(page, layout.grid, ink, found.wrong, []), wrong: found.wrong.length, unread: 0, solved};
    },
    answer: () => drawCellMarks(page, layout.grid, stars),
  };
}

export const STAR_BATTLE: PuzzleGame = {
  id: 'star-battle',
  title: starBattleCopy.title,
  subtitle: starBattleCopy.subtitle,
  options: [
    {
      id: 'size',
      title: playCopy.size,
      choices: SIDES.map(side => ({value: String(side), label: playCopy.sizeLabel(side)})),
      initial: String(SIDES[0]),
    },
    {
      id: 'stars',
      title: starBattleCopy.stars,
      choices: earlier => starsOf(Number(earlier.size)).map(stars => ({value: String(stars), label: starBattleCopy.starsLabel(stars)})),
      initial: '1',
      note: earlier => (starsOf(Number(earlier.size)).length === 1 ? starBattleCopy.starsNote(STAR_BATTLE_TWO_STAR_MIN_SIDE) : undefined),
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: earlier =>
        starBattleBands({side: Number(earlier.size), stars: Number(earlier.stars) as 1 | 2}).map(value => ({value, label: playCopy.bands[value]})),
      initial: 'easy',
      note: earlier => (starBattleBands({side: Number(earlier.size), stars: Number(earlier.stars) as 1 | 2}).length === 1 ? starBattleCopy.bandsNote : undefined),
    },
  ],
  create: (choices, seed, shape) =>
    drawn(newStarBattle(seed, {side: Number(choices.size), stars: Number(choices.stars) as 1 | 2}, choices.band as Difficulty), made => board(made, shape)),
  open: (code, shape) => board(starBattleFromCode(code), shape),
};
