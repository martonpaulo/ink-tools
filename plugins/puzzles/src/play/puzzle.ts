/**
 * What a Puzzles game gives the shared game view (#386): its choices, a new page from them, and for
 * a puzzle the one a code names again, with its «Check» and its answer. A pass-and-play board
 * (#402) gives only the new page: no `open`, so the view never looks for it on a page. Each game's
 * file in `src/games/` fills this from `@ink-tools/puzzle-core`, which holds the logic, the page and
 * the check (`docs/architecture.md` › Layer rules); the view only shows what these return.
 */
import type {Choice} from '@ink-tools/ui-kit';
import type {Hand, InkStroke, Orientation, Raster, Recognize} from '@ink-tools/puzzle-core';

export type Choices = Readonly<Record<string, string>>;

/** One choice of the game before a new page, such as the shape or the difficulty. */
export type PuzzleOption = {
  id: string;
  title: string;
  /** Its choices, or those the earlier choices allow, such as the bands of the chosen size (#390). */
  choices: readonly Choice<string>[] | ((earlier: Choices) => readonly Choice<string>[]);
  /** The value picked when the view opens. */
  initial: string;
  /**
   * What the earlier choices hold back from this one, under its last value, such as «2 stars from
   * 8 x 8.» (#392): a choice the earlier ones narrow says so, never only changes.
   */
  note?: (earlier: Choices) => string | undefined;
};

/** The choices `option` offers after `earlier`. */
export const offered = (option: PuzzleOption, earlier: Choices): readonly Choice<string>[] =>
  typeof option.choices === 'function' ? option.choices(earlier) : option.choices;

/**
 * `choices` with each option, in order, on a value it offers after the earlier ones: a value it no
 * longer offers, such as a band the new size lacks, falls to its first (#390).
 */
export function settle(options: readonly PuzzleOption[], choices: Choices): Choices {
  const out: Record<string, string> = {};
  for (const option of options) {
    const list = offered(option, out);
    const value = choices[option.id];
    out[option.id] = list.some(choice => choice.value === value) ? value : list[0].value;
  }
  return out;
}

/** The page a puzzle is drawn for. */
export type PageShape = {orientation: Orientation; hand: Hand};

/** What «Check» found: the page with the marks, for the view only, the wrong and the unread entries it marked. */
export type Verdict = {picture: Raster; wrong: number; unread: number; solved: boolean};

/** A new page: the name of its background and the picture drawn as it. */
export type GamePage = {
  /** A puzzle's code, `MZ-10X13-E-7K2Q9X`, or a board's name and seed, `gomoku-7K2Q9X`. */
  code: string;
  page: Raster;
};

/** One puzzle on its page: its check and its answer. */
export type Puzzle = GamePage & {
  check: (ink: readonly InkStroke<object>[], read: Recognize<object>) => Promise<Verdict>;
  /** The page with the answer on it, which the view shows and the note never gets. */
  answer: () => Raster;
};

export type PuzzleGame = {
  /** `@ink-tools/puzzle-core`'s game id, which its codes name: `maze`; a board's own: `gomoku`. */
  id: string;
  title: string;
  subtitle: string;
  options: readonly PuzzleOption[];
  /** The note for entries «Check» could not read, when the shared one, «Write it again», does not fit the game. */
  unread?: (count: number) => string;
  /** The note for wrong entries, when the shared one, «circled», does not fit the game's mark (#393). */
  wrong?: (count: number) => string;
  /** A new page from the choices and a fresh seed: a puzzle, or an empty board. */
  create: (choices: Choices, seed: string, shape: PageShape) => GamePage;
  /**
   * The puzzle `code` names, the same as when it was made; throws on a code of another game. A
   * board has none: its page holds nothing to check or solve.
   */
  open?: (code: string, shape: PageShape) => Puzzle;
};
