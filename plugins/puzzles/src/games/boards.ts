/**
 * The pass-and-play boards (#402): dots and boxes, gomoku and ultimate tic-tac-toe, each an empty
 * board with a score area from `@ink-tools/puzzle-core`'s `renderBoardPage`. A board has no
 * `open`: two people play it with the pen, and Puzzles checks nothing (owner, 2026-11-26). Its
 * strings are its own.
 */
import {BOARD_GAMES, renderBoardPage, type BoardGame} from '@ink-tools/puzzle-core';
import type {PuzzleGame} from '../play/puzzle';

export const boardsCopy = {
  subtitle: 'A board for two players, who take turns with the pen',
  titles: {
    'dots-and-boxes': 'Dots and Boxes',
    gomoku: 'Gomoku',
    'ultimate-tic-tac-toe': 'Ultimate Tic-Tac-Toe',
  } as Record<BoardGame, string>,
} as const;

/** The game list's board for `game`: no choices, a new page named by the board and the seed. */
const boardGame = (game: BoardGame): PuzzleGame => ({
  id: game,
  title: boardsCopy.titles[game],
  subtitle: boardsCopy.subtitle,
  options: [],
  create: (_choices, seed, shape) => ({code: `${game}-${seed}`, page: renderBoardPage(game, shape)}),
});

export const BOARDS: readonly PuzzleGame[] = BOARD_GAMES.map(boardGame);
