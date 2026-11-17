/**
 * The settings on the device (#68): `<folder>/settings.json`, read once per runtime and
 * written after each change, in place through the plugin's own module (#62). Every problem with
 * the file is logged and the defaults are used; a failed write keeps the change for the session.
 * A failed read is kept as state (#99): the session runs on the defaults and never writes them
 * over the person's file, which the next runtime reads again.
 */
import { log, logged } from "../log/memory";
import { systemLanguage, ok } from "@ink-tools/sn-adapter/official";
import { settingsPath } from "./paths";
import type { TextStore } from "../cache";
import { deviceStorage, storageFailure } from "./text";

/** A plugin's own settings model: how its file is read and written (#142). */
export type SettingsCodec<S> = {
  /** The settings in `text`, the defaults for null, and each problem found, for the log. */
  parse: (
    text: string | null,
    system: string | null
  ) => { settings: S; problems: string[] };
  serialize: (settings: S) => string;
  /** The log line after the first read, such as the languages. */
  describe: (settings: S) => string;
};

/** The settings read, and why the file could not be read, or null. */
export type LoadedSettings<S> = { settings: S; readFailure: string | null };

/** True when `text` is a JSON object, the only shape a settings file may have (#94). */
export function isJsonObject(text: string): boolean {
  try {
    const raw: unknown = JSON.parse(text);
    return raw !== null && typeof raw === "object" && !Array.isArray(raw);
  } catch {
    return false;
  }
}

/** Reads the file; a missing one gives the defaults, a failed read gives them and says why. */
export async function loadSettings<S>(
  codec: SettingsCodec<S>,
  storage: TextStore,
  path: string,
  system: string | null
): Promise<LoadedSettings<S>> {
  let text: string | null = null;
  try {
    text = await storage.readText(path);
  } catch (error) {
    // The module's message already starts with its code, such as «IO: …».
    const readFailure = storageFailure(error).message;
    log(`settings: cannot read ${path}: ${readFailure}; the default is used`);
    return { settings: codec.parse(null, system).settings, readFailure };
  }
  const parsed = codec.parse(text, system);
  parsed.problems.forEach((problem) => log(problem));
  if (text !== null && !isJsonObject(text)) {
    return {
      settings: parsed.settings,
      readFailure: await keepAside(storage, path, text),
    };
  }
  return { settings: parsed.settings, readFailure: null };
}

/**
 * A file that is not a JSON object is kept beside itself before the defaults can replace it
 * (#94), as the library does (#104). Null once the copy is written; else why it could not be,
 * which also refuses every write over the file.
 */
async function keepAside(
  storage: TextStore,
  path: string,
  text: string
): Promise<string | null> {
  const aside = `${path.replace(/\.json$/, "")}.unreadable-${Date.now()}.json`;
  try {
    await storage.writeText(aside, text);
    log(`settings: ${path} is not a JSON object; it is kept as ${aside}`);
    return null;
  } catch (error) {
    const failure = `the file is not a JSON object and its copy could not be kept (${
      storageFailure(error).message
    })`;
    log(`settings: ${failure}`);
    return failure;
  }
}

/** The settings store of one plugin: read once per runtime, written after each change. */
export type SettingsStore<S> = {
  getSettings: () => Promise<S>;
  saveSettings: (next: S) => Promise<void>;
  resetSettingsForTests: () => void;
};

export function createSettingsStore<S>(
  codec: SettingsCodec<S>
): SettingsStore<S> {
  let current: S | null = null;
  /** Why this runtime could not read the file; while set, nothing is written over it. */
  let readFailure: string | null = null;

  /** The settings, read once per runtime. */
  async function getSettings(): Promise<S> {
    if (current === null) {
      const loaded = await loadSettings(
        codec,
        deviceStorage,
        settingsPath(),
        systemLanguage()
      );
      current = loaded.settings;
      readFailure = loaded.readFailure;
      log(`settings: ${codec.describe(current)}`);
    }
    return current;
  }

  /**
   * Keeps `next` for the session and writes it; a failed write is logged. After a failed read the
   * write is refused: `next` started from the defaults, so writing it would replace the person's
   * file (#99).
   */
  async function saveSettings(next: S): Promise<void> {
    current = next;
    if (readFailure !== null) {
      log(
        `settings: not saved, the file could not be read (${readFailure}); the change lasts for this session`
      );
      return;
    }
    await logged("saveSettings", () =>
      deviceStorage
        .writeText(settingsPath(), codec.serialize(next))
        .then(() => ok(true), storageFailure)
    );
  }

  function resetSettingsForTests(): void {
    current = null;
    readFailure = null;
  }

  return { getSettings, saveSettings, resetSettingsForTests };
}
