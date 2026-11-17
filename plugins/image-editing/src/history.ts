/**
 * Where Retouch keeps each picture's states for Undo and Restore original (#136). The page keeps
 * only the newest picture, so the original and each earlier state stay as PNG files in Retouch's
 * folder, listed in one JSON file. A picture is found again by its note, page and rect, which
 * Retouch itself wrote, so the next lasso of the same picture finds its states.
 *
 * Pure: no file or SDK call; `edit.ts` reads and writes the JSON and removes the dropped files.
 */
import type {Rect} from '@ink-tools/ink-core';

/** States per picture, the original included; the oldest edit after the original goes first. */
export const MAX_STATES = 10;
/** Pictures with states; the one edited longest ago goes first, with its files. */
export const MAX_PICTURES = 30;
/** Page pixels a rect may move and still be the same picture: the host may round [inference]. */
export const RECT_TOLERANCE = 2;

/**
 * One picture as it was: its file, its size, and, since Trim moves the top left (#132), the page
 * point of its top left. A history written before #132 has no `left` and `top`; such a state goes
 * back at the picture's current top left.
 */
export type State = {
  path: string;
  width: number;
  height: number;
  left?: number;
  top?: number;
};

/** Where `state` goes back on the page in place of the picture at `rect`. */
export function stateRect(rect: Rect, state: State): Rect {
  return state.left === undefined || state.top === undefined
    ? rect
    : {...rect, left: state.left, top: state.top};
}

export type Entry = {
  note: string;
  page: number;
  rect: Rect;
  /** Oldest first: `states[0]` is the original, the last one is on the page. */
  states: State[];
  /** When it was last edited, in ms, for {@link MAX_PICTURES}. */
  used: number;
};

export type History = {version: 1; entries: Entry[]};

export const EMPTY: History = {version: 1, entries: []};

/**
 * The history in `text`; a missing file is empty, and a file that is not a history is null, so the
 * caller stops instead of writing over the originals it lists.
 */
export function parseHistory(text: string | null): History | null {
  if (text === null) {
    return EMPTY;
  }
  try {
    const value = JSON.parse(text) as Partial<History>;
    if (value?.version === 1 && Array.isArray(value.entries)) {
      return {version: 1, entries: value.entries};
    }
  } catch {
    // Not JSON: refused below.
  }
  return null;
}

const near = (a: number, b: number) => Math.abs(a - b) <= RECT_TOLERANCE;

export function sameRect(a: Rect, b: Rect): boolean {
  return (
    near(a.left, b.left) &&
    near(a.top, b.top) &&
    near(a.right, b.right) &&
    near(a.bottom, b.bottom)
  );
}

export type Place = {note: string; page: number; rect: Rect};

function indexOf(history: History, place: Place): number {
  return history.entries.findIndex(
    e =>
      e.note === place.note &&
      e.page === place.page &&
      sameRect(e.rect, place.rect),
  );
}

export function findEntry(history: History, place: Place): Entry | null {
  const index = indexOf(history, place);
  return index < 0 ? null : history.entries[index];
}

/**
 * Where a picture of `size` goes when it replaces the one at `rect`: the same top-left corner,
 * moved left only as far as it must to stay inside a page `pageWidth` wide.
 */
export function placeAt(
  rect: Rect,
  size: {width: number; height: number},
  pageWidth: number,
): Rect {
  const left = Math.max(0, Math.min(rect.left, pageWidth - size.width));
  return {
    left,
    top: rect.top,
    right: left + size.width,
    bottom: rect.top + size.height,
  };
}

export type Change = {history: History; drop: string[]};

/**
 * The history after an edit put `result` on the page at `rect`. A picture seen for the first time
 * also records `original`, the state before the edit.
 */
export function recordEdit(
  history: History,
  place: Place,
  rect: Rect,
  result: State,
  original: State | null,
  now: number,
): Change {
  const drop: string[] = [];
  const index = indexOf(history, place);
  const entries = [...history.entries];
  let states: State[];
  if (index < 0) {
    if (original === null) {
      throw Error('a picture seen for the first time needs its original');
    }
    states = [original, result];
  } else {
    states = [...entries[index].states, result];
    entries.splice(index, 1);
  }
  while (states.length > MAX_STATES) {
    drop.push(states[1].path);
    states.splice(1, 1);
  }
  entries.push({note: place.note, page: place.page, rect, states, used: now});
  entries.sort((a, b) => a.used - b.used);
  while (entries.length > MAX_PICTURES) {
    const oldest = entries.shift() as Entry;
    drop.push(...oldest.states.map(s => s.path));
  }
  return {history: {version: 1, entries}, drop};
}

export type Step = {
  /** The state to put on the page. */
  show: State;
  /** The history once that state is on the page at `rect`. */
  after: (rect: Rect, now: number) => Change;
};

/**
 * Undo: the state before the one on the page. Back at the original, the picture's states are
 * dropped, as Restore original does. Null when the picture has nothing to undo.
 */
export function undoStep(history: History, place: Place): Step | null {
  const entry = findEntry(history, place);
  if (!entry || entry.states.length < 2) {
    return null;
  }
  const show = entry.states[entry.states.length - 2];
  if (entry.states.length === 2) {
    return restoreStep(history, place);
  }
  return {
    show,
    after: (rect, now) => {
      const entries = history.entries.filter(e => e !== entry);
      entries.push({
        ...entry,
        rect,
        states: entry.states.slice(0, -1),
        used: now,
      });
      return {
        history: {version: 1, entries},
        drop: [entry.states[entry.states.length - 1].path],
      };
    },
  };
}

/** Restore original: the first state, and every file of the picture dropped once it is shown. */
export function restoreStep(history: History, place: Place): Step | null {
  const entry = findEntry(history, place);
  if (!entry || entry.states.length < 2) {
    return null;
  }
  return {
    show: entry.states[0],
    // The host copies the PNG it shows (docs/supernote.md, #130), so every file can go.
    after: () => ({
      history: {
        version: 1,
        entries: history.entries.filter(e => e !== entry),
      },
      drop: entry.states.map(s => s.path),
    }),
  };
}
