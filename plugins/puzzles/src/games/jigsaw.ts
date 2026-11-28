/**
 * The jigsaw sudoku (#397): nine bold regions in place of the boxes, at a difficulty, from
 * `@ink-tools/puzzle-core`'s generator, page and check of the written digits. Its strings are its own.
 */
import {
  checkJigsaw,
  drawCellAnswers,
  drawCellCheck,
  drawJigsawPage,
  generateJigsawSudoku,
  JIGSAW_BANDS,
  jigsawExpected,
  jigsawFromCode,
  jigsawLayout,
  puzzleCode,
  type Difficulty,
  type JigsawSudoku,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import {drawn, type PageShape, type Puzzle, type PuzzleGame} from '../play/puzzle';

export const jigsawCopy = {
  title: 'Jigsaw Sudoku',
  subtitle: 'Fill each row, column and bold region with 1 to 9 once',
} as const;

function board(puzzle: JigsawSudoku, shape: PageShape): Puzzle {
  const options = {orientation: shape.orientation, hand: shape.hand};
  const {grid} = jigsawLayout(options);
  const page = drawJigsawPage(puzzle, options);
  return {
    code: puzzleCode(puzzle.id),
    page,
    check: async (ink, read) => {
      const found = await checkJigsaw(puzzle, ink, read, options);
      const unread = found.unread.map(cell => cell.index);
      const solved = found.wrong.length === 0 && found.empty.length === 0 && unread.length === 0;
      return {picture: drawCellCheck(page, grid, ink, found.wrong, unread), wrong: found.wrong.length, unread: unread.length, solved};
    },
    answer: () => drawCellAnswers(page, grid, jigsawExpected(puzzle)),
  };
}

export const JIGSAW: PuzzleGame = {
  id: 'jigsaw-sudoku',
  title: jigsawCopy.title,
  subtitle: jigsawCopy.subtitle,
  options: [
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: JIGSAW_BANDS.map(value => ({value, label: playCopy.bands[value]})),
      initial: JIGSAW_BANDS[0],
    },
  ],
  create: (choices, seed, shape) => drawn(generateJigsawSudoku(seed, choices.band as Difficulty), made => board(made, shape)),
  open: (code, shape) => board(jigsawFromCode(code), shape),
};
