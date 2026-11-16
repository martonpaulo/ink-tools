/**
 * «Remember my pick» (#34, `docs/plugin-scope.md` › lookup): a picture the person chose in the
 * grid for a word leads the next search for the same word. Remembered choices only, no model:
 * the one cheap feature is the word's key, so «Maçã», «maçã» and «maca» share their picks. Pure;
 * the device store is Ink2Pic's `src/picks/device.ts`; moved here for the measured order (#142).
 */
import type {SearchResult} from './types';

export const PICKS_VERSION = 1;
/** The picks kept per word, newest first. DEFAULT. */
export const PICKS_PER_WORD = 3;
/** The words kept, the most recently picked first; the oldest is dropped. DEFAULT. */
export const PICK_WORD_LIMIT = 200;
/** A library tile's id is `library:<result id>` (`libraryResults`). */
const LIBRARY_PREFIX = 'library:';

export type WordPicks = {key: string; ids: string[]};
/** Newest word first. */
export type Picks = {words: WordPicks[]};

export type ParsedPicks = {ok: true; picks: Picks} | {ok: false; message: string};

export function emptyPicks(): Picks {
  return {words: []};
}

/** The word's key: lowercase, accents removed, spaces collapsed; empty for a blank word. */
export function pickKey(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The result id a pick is kept under: a library tile counts as its source picture. */
export function pickId(id: string): string {
  return id.startsWith(LIBRARY_PREFIX) ? id.slice(LIBRARY_PREFIX.length) : id;
}

/** The picks with `id` first for `word`; the same object when nothing changes. */
export function addPick(picks: Picks, word: string, id: string): Picks {
  const key = pickKey(word);
  const kept = pickId(id);
  if (!key || !kept) {
    return picks;
  }
  const current = picks.words.find(entry => entry.key === key);
  if (picks.words[0] === current && current?.ids[0] === kept) {
    return picks;
  }
  const ids = [kept, ...(current?.ids ?? []).filter(other => other !== kept)];
  return {
    words: [
      {key, ids: ids.slice(0, PICKS_PER_WORD)},
      ...picks.words.filter(entry => entry.key !== key),
    ].slice(0, PICK_WORD_LIMIT),
  };
}

/** The ids picked for `word`, newest first; empty when none. */
export function pickedIds(picks: Picks, word: string): readonly string[] {
  const key = pickKey(word);
  return picks.words.find(entry => entry.key === key)?.ids ?? [];
}

/**
 * The results with the picked ones first, newest pick first; every other result keeps its order.
 * The same array when no pick is among them.
 */
export function picksFirst(
  results: SearchResult[],
  ids: readonly string[],
): SearchResult[] {
  const rank = (result: SearchResult) => ids.indexOf(pickId(result.id));
  const picked = results
    .filter(result => rank(result) >= 0)
    .sort((a, b) => rank(a) - rank(b));
  if (picked.length === 0 || picked.every((result, i) => results[i] === result)) {
    return results;
  }
  return [...picked, ...results.filter(result => rank(result) < 0)];
}

export function serializePicks(picks: Picks): string {
  return JSON.stringify({version: PICKS_VERSION, ...picks});
}

function isWordPicks(value: unknown): value is WordPicks {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.key === 'string' &&
    Array.isArray(entry.ids) &&
    entry.ids.every(id => typeof id === 'string')
  );
}

/** A stored picks file; anything unreadable is a failure, never empty picks. */
export function parsePicks(text: string): ParsedPicks {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {ok: false, message: 'the picks file is not JSON'};
  }
  const root = data as {version?: unknown; words?: unknown} | null;
  if (root?.version !== PICKS_VERSION) {
    return {ok: false, message: `unknown picks version ${String(root?.version)}`};
  }
  if (!Array.isArray(root.words) || !root.words.every(isWordPicks)) {
    return {ok: false, message: 'a picks entry is malformed'};
  }
  return {ok: true, picks: {words: root.words}};
}
