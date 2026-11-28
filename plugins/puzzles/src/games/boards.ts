/**
 * The pass-and-play boards (#402): dots and boxes, gomoku and ultimate tic-tac-toe, each an empty
 * board with a score area from `@ink-tools/puzzle-core`'s `renderBoardPage`, listed with the rule its
 * page prints, so a player who does not know a board learns it before adding one. A board has no
 * `open`: two people play it with the pen, and Puzzles checks nothing (owner, 2026-11-26). Its
 * strings are its own.
 */
import {BOARD_GAMES, boardRule, renderBoardPage, type BoardGame} from '@ink-tools/puzzle-core';
import {drawn, type PuzzleGame} from '../play/puzzle';

export const boardsCopy = {
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
  // The page's rule is a sentence; the game list's subtitles carry no full stop, as the puzzles' do.
  subtitle: boardRule(game).replace(/\.$/, ''),
  options: [],
  create: (_choices, seed, shape) => drawn(game, made => ({code: `${game}-${seed}`, page: renderBoardPage(made, shape)})),
});

export const BOARDS: readonly PuzzleGame[] = BOARD_GAMES.map(boardGame);
