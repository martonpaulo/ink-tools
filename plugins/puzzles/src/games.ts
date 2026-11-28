/**
 * The games of the Puzzles view (#453): one entry per game, in the order the view lists them. A
 * game issue adds its entry here, with its view; the game's logic stays in
 * `@ink-tools/puzzle-core` (`docs/architecture.md` › Layer rules). A puzzle game is one
 * `PuzzleGame` of `src/games/`, shown by the shared game view (`src/play/GameView.tsx`, #386).
 */
import type React from 'react';
import type {Requirement} from './requirements';
import {BINAIRO} from './games/binairo';
import {BOARDS} from './games/boards';
import {BRIDGES} from './games/bridges';
import {CALCUDOKU} from './games/calcudoku';
import {FUTOSHIKI} from './games/futoshiki';
import {HITORI} from './games/hitori';
import {JIGSAW} from './games/jigsaw';
import {KAKURO} from './games/kakuro';
import {KILLER} from './games/killer';
import {MAZE} from './games/maze';
import {NONOGRAM} from './games/nonogram';
import {SLITHERLINK} from './games/slitherlink';
import {STAR_BATTLE} from './games/starBattle';
import {SUDOKU} from './games/sudoku';
import {puzzleEntry} from './play/GameView';

export type GameViewProps = {
  /** Back to the game list. */
  onBack: () => void;
  /** Closes the Puzzles view; the game's title bar shows ui-kit's Close. */
  onClose: () => void;
};

export type Game = {
  /** Stable, in our words: `sudoku`, `word-search`. */
  id: string;
  /** The game's name in the list. */
  title: string;
  /** One line under the name: what the player does. */
  subtitle?: string;
  /** What this game needs beyond the plugin's own requirements, checked before its view opens. */
  requires?: readonly Requirement[];
  View: React.ComponentType<GameViewProps>;
};

export const GAMES: readonly Game[] = [MAZE, JIGSAW, SUDOKU, KILLER, CALCUDOKU, FUTOSHIKI, KAKURO, SLITHERLINK, BRIDGES, NONOGRAM, STAR_BATTLE, BINAIRO, HITORI, ...BOARDS].map(game => puzzleEntry(game));
