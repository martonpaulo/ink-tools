/**
 * What a Puzzles game gives the shared game view (#386): its choices, a new puzzle from them, the
 * puzzle a code names again, and on a board its «Check» and its answer. Each game's file in
 * `src/games/` fills this from `@ink-tools/puzzle-core`, which holds the logic, the page and the
 * check (`docs/architecture.md` › Layer rules); the view only shows what these return.
 */
import type {Choice} from '@ink-tools/ui-kit';
import type {Hand, InkStroke, Orientation, Raster, Recognize} from '@ink-tools/puzzle-core';

/** One choice of the game before a new page, such as the shape or the difficulty. */
export type PuzzleOption = {
  id: string;
  title: string;
  choices: readonly Choice<string>[];
  /** The value picked when the view opens. */
  initial: string;
};

export type Choices = Readonly<Record<string, string>>;

/** The page a puzzle is drawn for. */
export type PageShape = {orientation: Orientation; hand: Hand};

/** What «Check» found: the page with the marks, for the view only, and how many it marked. */
export type Verdict = {picture: Raster; wrong: number; solved: boolean};

/** One puzzle: its code, the page drawn as the note's background, its check and its answer. */
export type Board = {
  /** The code that names this puzzle: `MZ-10X13-E-7K2Q9X`. */
  code: string;
  page: Raster;
  check: (ink: readonly InkStroke<object>[], read: Recognize<object>) => Promise<Verdict>;
  /** The page with the answer on it, which the view shows and the note never gets. */
  answer: () => Raster;
};

export type PuzzleGame = {
  /** `@ink-tools/puzzle-core`'s game id, which its codes name: `maze`. */
  id: string;
  title: string;
  subtitle: string;
  options: readonly PuzzleOption[];
  /** A new puzzle from the choices and a fresh seed. */
  create: (choices: Choices, seed: string, shape: PageShape) => Board;
  /** The puzzle `code` names, the same as when it was made; throws on a code of another game. */
  open: (code: string, shape: PageShape) => Board;
};
