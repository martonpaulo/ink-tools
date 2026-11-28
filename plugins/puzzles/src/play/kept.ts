/**
 * Each game's last choices (#569): the size and difficulty of its last «Add Page», which its view
 * opens on again, also after a plugin restart. They live in one `choices.json` in the plugin's
 * hidden folder, beside `pages/`, keyed by game id: `{"binairo": {"size": "12", "band": "hard"}}`.
 * A game never used has no entry and opens on its defaults. A file that cannot be read, or holds
 * another shape, is logged and the defaults are used; a failed write is logged and never stops the
 * page, so the choices are a convenience, never a reason an Add Page fails.
 */
import {NativeModules} from 'react-native';
import {fail, ok, pluginDataFolder, THROWN_CODE, type Result} from '@ink-tools/sn-adapter/official';
import {PAGE_FILE_MODULE} from './pages';
import type {Choices} from './puzzle';

/** The file of every game's last choices. */
export const CHOICES_FILE = `${pluginDataFolder('inktools-puzzles')}/choices.json`;

export type KeptChoices = {
  /** The game's last choices, or null for a game never used. */
  recall: (game: string) => Promise<Result<Choices | null>>;
  /** Keeps `choices` as the game's last, beside every other game's. */
  keep: (game: string, choices: Choices) => Promise<Result<true>>;
};

type TextFiles = {
  /** The file's text, or null when it does not exist. */
  readText: (path: string) => Promise<string | null>;
  writeText: (path: string, text: string) => Promise<boolean>;
};

type Kept = Record<string, Record<string, string>>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Every game's kept choices in `text`; a game whose entry is not an object of strings is left out. */
export function parseKept(text: string | null): Result<Kept> {
  if (text === null) {return ok({});}
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return fail(THROWN_CODE, `${CHOICES_FILE} is not JSON: ${String(error)}`);
  }
  if (!isObject(raw)) {return fail(THROWN_CODE, `${CHOICES_FILE} is not a JSON object`);}
  const kept: Kept = {};
  for (const [game, entry] of Object.entries(raw)) {
    if (isObject(entry) && Object.values(entry).every(value => typeof value === 'string')) {
      kept[game] = entry as Record<string, string>;
    }
  }
  return ok(kept);
}

/** Calls the page file module's text methods, its absence or its throw a failure. */
async function textFiles<T>(modules: Record<string, unknown>, what: string, call: (files: TextFiles) => Promise<T>): Promise<Result<T>> {
  const files = modules[PAGE_FILE_MODULE] as Partial<TextFiles> | undefined;
  if (!files?.readText || !files.writeText) {
    return fail(THROWN_CODE, `${PAGE_FILE_MODULE} is not loaded; check reactPackages`);
  }
  try {
    return ok(await call(files as TextFiles));
  } catch (error) {
    return fail(THROWN_CODE, `${what}: ${String((error as Error)?.message ?? error)}`);
  }
}

/** The kept choices in `CHOICES_FILE`, through the plugin's page file module. */
export function deviceKept(modules: Record<string, unknown> = NativeModules): KeptChoices {
  const read = async (): Promise<Result<Kept>> => {
    const text = await textFiles(modules, `${CHOICES_FILE} was not read`, files => files.readText(CHOICES_FILE));
    return text.ok ? parseKept(text.value) : text;
  };
  return {
    recall: async game => {
      const kept = await read();
      return kept.ok ? ok(kept.value[game] ?? null) : kept;
    },
    keep: async (game, choices) => {
      // A file that cannot be read is never written over: its other games' choices would be lost.
      const kept = await read();
      if (!kept.ok) {return kept;}
      const text = `${JSON.stringify({...kept.value, [game]: choices}, null, 2)}\n`;
      const written = await textFiles(modules, `${CHOICES_FILE} was not written`, files => files.writeText(CHOICES_FILE, text));
      if (!written.ok) {return written;}
      return written.value ? ok(true) : fail(THROWN_CODE, `${CHOICES_FILE} was not written`);
    },
  };
}
