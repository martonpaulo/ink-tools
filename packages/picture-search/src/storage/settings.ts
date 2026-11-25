/**
 * The settings on the device (#68): `settings.json` in the private plugin folder (#22), read once
 * per runtime and written after each change, in place through the plugin's own module (#62).
 * Every problem with the file is logged and the defaults are used; a failed write keeps the change
 * for the session. A failed read is kept as state (#99): the session runs on the defaults and
 * never writes them over the person's file, which the next runtime reads again.
 *
 * Builds before #22 kept the file in `MyStyle/<plugin>/`, which Supernote Cloud syncs: each write
 * there is a changed child, which turns a cloud-side delete and recreate of the folder into a
 * `<folder>_CONFLICT_<17 digits>` copy. So the first runtime with no private file copies the
 * shared one, or else the newest conflict copy's, into the private folder once, and never writes
 * in `MyStyle/` again; the shared file is left as it is. Without a private folder the shared path
 * is used, as before.
 */
import { log, logged } from "../log/memory";
import { systemLanguage, ok, Result } from "@ink-tools/sn-adapter/official";
import { listDir as deviceListDir } from "./files";
import { pluginPath, SHARED_ROOT, settingsPath } from "./paths";
import type { TextStore } from "../cache";
import { deviceStorage, storageFailure } from "./text";
import { pluginFolder } from "./session";

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

/** Where a settings store reads and writes, so a test runs it without a device (#22). */
export type SettingsPlace = {
  storage: TextStore;
  privateDir: () => Promise<Result<string>>;
  /** The names in a folder, null when it does not exist. */
  listDir: (path: string) => Promise<Result<string[] | null>>;
  sharedRoot: string;
};

/** The file name, the one a conflict copy keeps inside its renamed folder too. */
const SETTINGS_FILE = "settings.json";

/** A folder Supernote's sync renamed: `<name>_CONFLICT_<yyyyMMddHHmmssSSS>` (#22). */
export function conflictCopies(folder: string, names: readonly string[]): string[] {
  const pattern = new RegExp(
    `^${folder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_CONFLICT_(\\d{17})$`
  );
  // Newest first: the 17 digits are a time, so they sort as text.
  return names.filter((name) => pattern.test(name)).sort().reverse();
}

/**
 * The text of the settings an earlier build left in shared storage, and its path: the plugin's
 * own `settings.json`, else the newest conflict copy's that holds one, else null (#22).
 */
async function legacySettings(
  place: SettingsPlace
): Promise<{ path: string; text: string } | null> {
  const shared = settingsPath(place.sharedRoot);
  const candidates = [shared];
  const folder = pluginPath("", place.sharedRoot).replace(/\/+$/, "");
  const parent = folder.slice(0, folder.lastIndexOf("/"));
  const name = folder.slice(folder.lastIndexOf("/") + 1);
  const listed = await place.listDir(parent);
  if (listed.ok && listed.value) {
    for (const copy of conflictCopies(name, listed.value)) {
      candidates.push(`${parent}/${copy}/${SETTINGS_FILE}`);
    }
  }
  for (const path of candidates) {
    try {
      const text = await place.storage.readText(path);
      if (text !== null) {
        return { path, text };
      }
    } catch (error) {
      log(`settings: cannot read ${path}: ${storageFailure(error).message}`);
    }
  }
  return null;
}

/**
 * The path this runtime reads and writes: the private `settings.json`, filled once from the
 * shared one or a conflict copy when it is missing; the shared path when there is no private
 * folder or the copy could not be written (#22).
 */
export async function settingsFile(place: SettingsPlace): Promise<string> {
  const dir = await place.privateDir();
  if (!dir.ok) {
    log(`settings: no private folder (${dir.message}); using the shared file`);
    return settingsPath(place.sharedRoot);
  }
  const own = `${dir.value.replace(/\/+$/, "")}/${SETTINGS_FILE}`;
  try {
    if ((await place.storage.readText(own)) !== null) {
      return own;
    }
  } catch {
    // loadSettings reads it again and keeps the failure (#99).
    return own;
  }
  const legacy = await legacySettings(place);
  if (legacy === null) {
    return own;
  }
  try {
    await place.storage.writeText(own, legacy.text);
    log(`settings: moved from ${legacy.path} to the private folder (#22)`);
    return own;
  } catch (error) {
    log(
      `settings: cannot copy ${legacy.path} to the private folder (${
        storageFailure(error).message
      }); using it in place`
    );
    return legacy.path;
  }
}

export const DEVICE_SETTINGS_PLACE: SettingsPlace = {
  storage: deviceStorage,
  privateDir: pluginFolder,
  listDir: deviceListDir,
  sharedRoot: SHARED_ROOT,
};

/** The settings store of one plugin: read once per runtime, written after each change. */
export type SettingsStore<S> = {
  getSettings: () => Promise<S>;
  saveSettings: (next: S) => Promise<void>;
  resetSettingsForTests: () => void;
};

export function createSettingsStore<S>(
  codec: SettingsCodec<S>,
  place: SettingsPlace = DEVICE_SETTINGS_PLACE
): SettingsStore<S> {
  let current: S | null = null;
  /** The file this runtime reads and writes, found at the first read (#22). */
  let path: string | null = null;
  /** Why this runtime could not read the file; while set, nothing is written over it. */
  let readFailure: string | null = null;

  /** The settings, read once per runtime. */
  async function getSettings(): Promise<S> {
    if (current === null) {
      path = await settingsFile(place);
      const loaded = await loadSettings(
        codec,
        place.storage,
        path,
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
    const target = path ?? (await settingsFile(place));
    path = target;
    if (readFailure !== null) {
      log(
        `settings: not saved, the file could not be read (${readFailure}); the change lasts for this session`
      );
      return;
    }
    await logged("saveSettings", () =>
      place.storage
        .writeText(target, codec.serialize(next))
        .then(() => ok(true), storageFailure)
    );
  }

  function resetSettingsForTests(): void {
    current = null;
    path = null;
    readFailure = null;
  }

  return { getSettings, saveSettings, resetSettingsForTests };
}
