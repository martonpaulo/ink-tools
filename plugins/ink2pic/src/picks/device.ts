/**
 * The person's picks on the device (#34): `MyStyle/Ink2Pic/picks.json`, read once per session
 * and written only when a pick changed it. An unreadable file is logged and never written over
 * that session, so a hand-edited or damaged file is kept. No call here rejects: a failed read
 * or write only loses the re-ranking, never a search or an insert.
 */
import {log, logged, picksPath, deviceStorage} from '../profile';
import {fail, ok, THROWN_CODE} from '@supernote-tools/sn-adapter/official';
import type {TextStore} from '@supernote-tools/picture-search';
import {
  addPick,
  emptyPicks,
  pickedIds,
  Picks,
  parsePicks,
  serializePicks,
} from './picks';

let current: Picks | null = null;
/** False while picks.json could not be read: nothing is written over it this session. */
let writable = false;
let storage: TextStore = deviceStorage;

async function load(): Promise<Picks> {
  if (current) {
    return current;
  }
  const read = await logged('read picks.json', () =>
    storage.readText(picksPath()).then(
      text => ok(text),
      error => fail(THROWN_CODE, String(error)),
    ),
  );
  if (!read.ok) {
    current = emptyPicks();
    return current;
  }
  if (read.value === null) {
    writable = true;
    current = emptyPicks();
    return current;
  }
  const parsed = parsePicks(read.value);
  if (parsed.ok) {
    writable = true;
    current = parsed.picks;
  } else {
    log(`picks: ${parsed.message}; not saved this session, the file is kept`);
    current = emptyPicks();
  }
  return current;
}

/** The result ids the person picked for `word`, newest first; empty when none or unreadable. */
export async function pickedFor(word: string): Promise<readonly string[]> {
  try {
    return pickedIds(await load(), word);
  } catch (error) {
    log(`picks: ${String(error)}`);
    return [];
  }
}

/** Remembers that the person picked `id` in the grid for `word`; logged, never rejects. */
export async function recordPick(word: string, id: string): Promise<void> {
  try {
    const before = await load();
    const next = addPick(before, word, id);
    if (next === before) {
      return;
    }
    current = next;
    if (!writable) {
      return;
    }
    await logged('save picks.json', () =>
      storage.writeText(picksPath(), serializePicks(next)).then(
        () => ok(true),
        error => fail(THROWN_CODE, String(error)),
      ),
    );
  } catch (error) {
    log(`picks: ${String(error)}`);
  }
}

export function resetPicksForTests(store: TextStore = deviceStorage): void {
  current = null;
  writable = false;
  storage = store;
}
