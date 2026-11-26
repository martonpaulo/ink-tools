/**
 * «Remember my pick» (#34, #292): a picture chosen in «Choose Image» leads the next search for the
 * same word. The picks file is `picks.json` in Lookup's private plugin folder, never in a synced
 * `MyStyle` folder (#22). It is read once per runtime and written only when a pick changed it. An
 * unreadable file is logged and never written over that session, so a damaged file is kept. No
 * call here rejects: a failed read or write only loses the re-ranking, never a search or an insert.
 */
import {fail, ok, THROWN_CODE, type Result} from '@ink-tools/sn-adapter/official';
import {
  addPick,
  emptyPicks,
  parsePicks,
  pickedIds,
  serializePicks,
  type Picks,
  type TextStore,
} from '@ink-tools/picture-search';
import {deviceStorage, log, logged, pluginFolder} from './profile';

export type PicksPlace = {
  storage: TextStore;
  folder: () => Promise<Result<string>>;
};

const DEVICE: PicksPlace = {storage: deviceStorage, folder: pluginFolder};

let place: PicksPlace = DEVICE;
let current: Picks | null = null;
/** The file this runtime reads and writes; null while it is not known or has no private folder. */
let path: string | null = null;
/** False while picks.json could not be read: nothing is written over it this session. */
let writable = false;

async function load(): Promise<Picks> {
  if (current) {
    return current;
  }
  const dir = await place.folder();
  if (!dir.ok) {
    log(`picks: no private folder (${dir.message}); picks are not kept`);
    current = emptyPicks();
    return current;
  }
  path = `${dir.value.replace(/\/+$/, '')}/picks.json`;
  const file = path;
  const read = await logged('read picks.json', () =>
    place.storage.readText(file).then(
      text => ok(text),
      error => fail(THROWN_CODE, String(error)),
    ),
  );
  if (!read.ok) {
    current = emptyPicks();
  } else if (read.value === null) {
    writable = true;
    current = emptyPicks();
  } else {
    const parsed = parsePicks(read.value);
    if (parsed.ok) {
      writable = true;
      current = parsed.picks;
    } else {
      log(`picks: ${parsed.message}; not saved this session, the file is kept`);
      current = emptyPicks();
    }
  }
  return current;
}

/** The result ids picked for `word`, newest first; empty when none or unreadable. */
export async function pickedFor(word: string): Promise<readonly string[]> {
  try {
    return pickedIds(await load(), word);
  } catch (error) {
    log(`picks: ${String(error)}`);
    return [];
  }
}

/** Remembers that the person chose `id` for `word`; logged, never rejects. */
export async function recordPick(word: string, id: string): Promise<void> {
  try {
    const before = await load();
    const next = addPick(before, word, id);
    if (next === before) {
      return;
    }
    current = next;
    const file = path;
    if (!writable || !file) {
      return;
    }
    await logged('save picks.json', () =>
      place.storage.writeText(file, serializePicks(next)).then(
        () => ok(true),
        error => fail(THROWN_CODE, String(error)),
      ),
    );
  } catch (error) {
    log(`picks: ${String(error)}`);
  }
}

export function resetPicksForTests(next: PicksPlace = DEVICE): void {
  place = next;
  current = null;
  path = null;
  writable = false;
}
