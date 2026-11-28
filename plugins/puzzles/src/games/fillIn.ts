/**
 * Fill-in, or criss-cross (#398): a language, then a difficulty, from `@ink-tools/puzzle-core`'s
 * generator, page and check of the written letters. The player writes each word of the printed list
 * into its place; letters are read best effort, and a letter not read is never marked wrong. Its
 * strings are its own.
 */
import {
  checkFillIn,
  drawCellAnswers,
  drawCellCheck,
  drawFillInPage,
  FILL_IN_BANDS,
  fillInExpected,
  fillInFromCode,
  generateFillIn,
  layoutFillInPage,
  puzzleCode,
  type Difficulty,
  type FillIn,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import {languageOption, LISTS, listOf} from '../play/languages';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const fillInCopy = {
  title: 'Fill-in',
  subtitle: 'Write each word of the list in the grid, across or down',
  rule: 'Write each word of the list in the grid, across or down.',
  heading: (length: number) => `${length} letters`,
} as const;

const BANDS = Object.keys(FILL_IN_BANDS) as Difficulty[];

function board(puzzle: FillIn, shape: PageShape): Puzzle {
  const options = {orientation: shape.orientation, hand: shape.hand};
  const code = puzzleCode(puzzle.id);
  const {grid} = layoutFillInPage(puzzle, options, fillInCopy.heading).page;
  const text = {game: fillInCopy.title, difficulty: playCopy.bands[puzzle.id.difficulty], rule: fillInCopy.rule, heading: fillInCopy.heading};
  const page = drawFillInPage(puzzle, options, text, code);
  return {
    code,
    page,
    check: async (ink, read) => {
      const found = await checkFillIn(puzzle, grid, ink, read);
      const unread = found.unread.map(cell => cell.index);
      const solved = found.wrong.length === 0 && found.empty.length === 0 && unread.length === 0;
      return {picture: drawCellCheck(page, grid, ink, found.wrong, unread), wrong: found.wrong.length, unread: unread.length, solved};
    },
    answer: () => drawCellAnswers(page, grid, fillInExpected(puzzle)),
  };
}

export const FILL_IN: PuzzleGame = {
  id: 'fill-in',
  title: fillInCopy.title,
  subtitle: fillInCopy.subtitle,
  options: [
    languageOption(),
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: BANDS.map(value => ({value, label: playCopy.bands[value]})),
      initial: BANDS[0],
    },
  ],
  create: (choices, seed, shape) => board(generateFillIn(seed, choices.band as Difficulty, listOf(choices.language)), shape),
  open: (code, shape) => board(fillInFromCode(code, LISTS), shape),
};
