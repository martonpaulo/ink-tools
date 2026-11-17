/**
 * «Choose picture» (#156, owner D19 A, D41 A): the fourth lasso button. Its press reads the lassoed
 * word while the note is open, keeps the word and its place (lasso context does not survive the
 * view) and opens Lookup's view on the Choose screen. The screen lists one mode at a time,
 * «Illustrations» or «Photos», each with that mode's own search and measured split, so a photo
 * list never shows a drawing. A tap on a tile inserts that picture at the kept place and closes
 * the view.
 *
 * Search, measured order, thumbnails and insert are picture-search's, bound to the mode by
 * `modeDeps` (src/pictures.ts), the same flow the insert buttons run; only the list is Lookup's.
 */
import {checkLookup, type LassoPlace} from '@supernote-tools/ink-core';
import {searchState, type SearchResult} from '@supernote-tools/picture-search';
import {
  closePluginView,
  Result,
  showPluginView,
} from '@supernote-tools/sn-adapter/official';
import {BUTTONS, missingFor} from './buttons';
import {copy, pictureCopy} from './copy';
import {CHOOSE_BUTTON_ID, type Mode} from './modes';
import {modeDeps} from './pictures';
import {
  failureText,
  isContourUri,
  LassoQuery,
  log,
  logged,
  pluginFolder,
  QuickInsert,
  QuickInsertDeps,
  readLassoQuery,
  stateText,
  thumbUri,
} from './profile';
import {showToast} from './textBox';

/** The lassoed word the Choose screen is for, and where its picture goes. */
export type Choice = {word: string; place: LassoPlace | null};

/** One tile: the result, the URI it shows, and whether that is the contour drawing inserted. */
export type Tile = {result: SearchResult; uri: string; contour: boolean};

/** The mode's tiles in the measured order, and the sentence to show when there are none. */
export type ChooseList = {tiles: Tile[]; text: string | null};

export type ChooseDeps = {
  /** The permissions Choose needs and the host has not granted. */
  missing: () => Promise<readonly unknown[]>;
  folder: () => Promise<Result<string>>;
  read: () => Promise<Result<LassoQuery>>;
  show: () => Promise<Result<boolean>>;
  close: () => Promise<Result<boolean>>;
  /** The mode's search, measure and insert. */
  flow: (mode: Mode) => QuickInsertDeps;
  thumb: (result: SearchResult, dir: string) => Promise<string>;
  /** The device toast when absent. */
  toast?: (text: string) => void;
};

const DEVICE: ChooseDeps = {
  missing: () =>
    missingFor(BUTTONS.filter(button => button.id === CHOOSE_BUTTON_ID)),
  folder: pluginFolder,
  read: () => readLassoQuery(),
  show: showPluginView,
  close: closePluginView,
  flow: mode => modeDeps(mode),
  thumb: thumbUri,
};

let choice: Choice | null = null;
const listeners = new Set<(next: Choice | null) => void>();

function setChoice(next: Choice | null): void {
  choice = next;
  listeners.forEach(listener => listener(next));
}

/** The word the Choose screen is for; null shows Settings. */
export function currentChoice(): Choice | null {
  return choice;
}

/** Calls `listener` with each new choice; returns the stop function. */
export function onChoice(listener: (next: Choice | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drops the waiting word, so the next opening shows Settings (the Settings entry calls it). */
export function clearChoice(): void {
  setChoice(null);
}

/**
 * The press of «Choose picture». It reads the lasso before the view opens; a failed read opens no
 * view and is logged. A missing permission opens the view on Settings, which asks for it. Never
 * rejects; true when the view opened on the Choose screen.
 */
export async function openChoose(deps: ChooseDeps = DEVICE): Promise<boolean> {
  try {
    await deps.folder();
    if ((await deps.missing()).length > 0) {
      log('choose: a permission is missing, opening Settings');
      setChoice(null);
      await logged('showPluginView', deps.show);
      return false;
    }
    const query = await deps.read();
    if (!query.ok) {
      log(`choose: no word, ${query.code} ${query.message}`);
      return false;
    }
    // As the picture buttons: no word or no place on the page opens no view (#165, #166).
    const checked = checkLookup(query.value);
    if (!checked.ok) {
      log(`choose: ${checked.why}, ${checked.message}`);
      (deps.toast ?? showToast)(
        copy[checked.why === 'unplaced' ? 'error.unplaced' : 'error.unreadable'],
      );
      return false;
    }
    log(`choose: "${checked.value.query}"`);
    setChoice({word: checked.value.query, place: checked.value.place});
    await logged('showPluginView', deps.show);
    return true;
  } catch (error) {
    log(`choose failed: ${String(error)}`);
    return false;
  }
}

/** The number of the latest list asked for: an older one that ends later is dropped. */
let latest = 0;

/** A mode's last list, kept with the word and the search answer it was measured from. */
type Kept = {word: string; answer: string; list: ChooseList};

/**
 * The last list per mode, so a reopen on the same answer shows at once, with no new pixel
 * measure (#205). It lives as long as the answer: another answer, such as a new search after the
 * cached one expired or a plugin update (#210), has other ids and is measured again.
 * shortcut: in memory for the runtime, not in the cache file; persist it beside the search answer
 * if a reopen after a plugin restart must be instant too.
 */
const kept = new Map<Mode['kind'], Kept>();

/** The search answer's pictures, in order: the same answer measures the same. */
function answerKey(results: readonly SearchResult[]): string {
  return results.map(result => result.id).join('\n');
}

/**
 * The mode's tiles for the word; null when a newer list was asked for meanwhile, such as after a
 * switch to the other mode, so an old answer never shows in the new tab.
 */
export async function chooseResults(
  mode: Mode,
  word: string,
  deps: ChooseDeps = DEVICE,
): Promise<ChooseList | null> {
  const run = ++latest;
  const flow = deps.flow(mode);
  const searched = await flow.search(word, undefined, undefined, {});
  const outcome = searched.outcome;
  if (run !== latest || !outcome) {
    return null;
  }
  const answer = answerKey(outcome.results);
  const last = kept.get(mode.kind);
  if (last && last.word === word && last.answer === answer) {
    log(`choose: ${mode.kind} tiles kept from the last open`);
    return last.list;
  }
  const pages = await flow.measure(
    outcome.results,
    searched.thumbDir,
    word,
    undefined,
    () => {},
    false,
  );
  const dir = searched.thumbDir;
  const tiles = await Promise.all(
    pages.results.map(async result => {
      const prepared = pages.contourThumbs.get(result.id);
      const uri =
        prepared ?? (dir ? await deps.thumb(result, dir) : result.thumbUrl);
      return {result, uri, contour: isContourUri(prepared ?? '')};
    }),
  );
  if (run !== latest) {
    return null;
  }
  const modeCopy = pictureCopy[mode.kind];
  const text =
    tiles.length > 0
      ? null
      : stateText(searchState(outcome), modeCopy) ?? modeCopy['search.empty'];
  const list = {tiles, text};
  if (tiles.length > 0) {
    // An empty list says why, which the next open may say otherwise: it is searched again.
    kept.set(mode.kind, {word, answer, list});
  }
  return list;
}

let inserting = false;

/**
 * A tap on a tile: the picture goes in at the kept place and the view closes. Null when no word
 * waits or another insert runs, so a second tap is ignored; a failure keeps the view open with its
 * sentence.
 */
export async function insertChosen(
  mode: Mode,
  tile: Tile,
  deps: ChooseDeps = DEVICE,
): Promise<QuickInsert | null> {
  const chosen = choice;
  if (!chosen || inserting) {
    return null;
  }
  inserting = true;
  try {
    const flow = deps.flow(mode);
    const options = await flow.options();
    const done = await flow.insert(
      tile.result,
      chosen.word,
      chosen.place,
      tile.contour,
      options,
      null,
      () => null,
    );
    if (!done.ok) {
      log(`choose: insert failed at ${done.step}: ${done.code} ${done.message}`);
      return {ok: false, text: failureText(done, pictureCopy[mode.kind])};
    }
    log(`choose: inserted ${tile.result.id}`);
    setChoice(null);
    await logged('closePluginView', deps.close);
    return done;
  } catch (error) {
    log(`choose: insert failed: ${String(error)}`);
    return {ok: false, text: pictureCopy[mode.kind]['error.unexpected']};
  } finally {
    inserting = false;
  }
}

/** «Close»: nothing is inserted, the word is dropped and the view closes. */
export async function closeChoose(deps: ChooseDeps = DEVICE): Promise<void> {
  setChoice(null);
  await logged('closePluginView', deps.close);
}

export function resetChooseForTests(): void {
  choice = null;
  latest = 0;
  inserting = false;
  kept.clear();
  listeners.clear();
}
