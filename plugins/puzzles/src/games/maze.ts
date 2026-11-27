/**
 * The maze (#386): a rectangle or a circle at a difficulty, from `@ink-tools/puzzle-core`'s maze,
 * its page and its check of the drawn path. Its strings are its own.
 */
import {
  checkMaze,
  drawMazeAnswer,
  drawMazeCheck,
  drawMazePage,
  generateMaze,
  MAZE_BANDS,
  MAZE_SHAPES,
  mazeFromCode,
  mazeLayout,
  mazePageSize,
  puzzleCode,
  type Maze,
  type MazeShape,
} from '@ink-tools/puzzle-core';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const mazeCopy = {
  title: 'Maze',
  subtitle: 'Draw the way from the start to the end',
  shape: 'Shape',
  shapes: {rectangle: 'Rectangle', circle: 'Circle'} as Record<MazeShape, string>,
} as const;

type MazeBand = 'easy' | 'medium' | 'hard';

function board(maze: Maze, shape: PageShape): Puzzle {
  const layout = mazeLayout(maze, shape.orientation, shape.hand);
  const page = drawMazePage(maze, layout);
  return {
    code: puzzleCode(maze.id),
    page,
    check: async ink => {
      const found = checkMaze(maze, layout, ink);
      return {
        picture: drawMazeCheck(maze, layout, page, ink, found),
        wrong: found.wrong.length + found.crossings.length,
        unread: 0,
        solved: found.solved,
      };
    },
    answer: () => drawMazeAnswer(maze, layout, page),
  };
}

export const MAZE: PuzzleGame = {
    id: 'maze',
    title: mazeCopy.title,
    subtitle: mazeCopy.subtitle,
    options: [
      {
        id: 'shape',
        title: mazeCopy.shape,
        choices: MAZE_SHAPES.map(value => ({value, label: mazeCopy.shapes[value]})),
        initial: MAZE_SHAPES[0],
      },
      {
        id: 'band',
        title: playCopy.difficulty,
        choices: MAZE_BANDS.map(value => ({value, label: playCopy.bands[value]})),
        initial: MAZE_BANDS[0],
      },
    ],
    create: (choices, seed, shape) => {
      const band = choices.band as MazeBand;
      const size = mazePageSize(choices.shape as MazeShape, band, shape.orientation);
      return board(generateMaze(seed, size, band), shape);
    },
    open: (code, shape) => board(mazeFromCode(code), shape),
};
