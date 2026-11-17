/**
 * Bridge's Settings, kept in its private plugin folder so the switches survive a restart (#40).
 * The folder needs no plugin permission (Supernote's Plugin Permissions page, Default Accessible
 * Scope) and is not one Supernote Cloud syncs (#23). sync-core owns the JSON's shape and parse.
 * A first start, with no file, is the default settings; an unreadable file is a failure the screen
 * shows, never a silent reset.
 */
import {
  BridgeSettings,
  defaultSettings,
  parseSettings,
  serializeSettings,
} from '@supernote-tools/sync-core/settings';
import {
  fail,
  MODULE_CODE,
  ok,
  Result,
} from '@supernote-tools/sn-adapter/official';
import {callFiles, TextFiles} from './files';

export const SETTINGS_FILE = 'settings.json';

export type Folder = () => Promise<Result<string>>;

const path = (dir: string) => `${dir.replace(/\/+$/, '')}/${SETTINGS_FILE}`;

export async function loadSettings(
  folder: Folder,
  files?: TextFiles,
): Promise<Result<BridgeSettings>> {
  const dir = await folder();
  if (!dir.ok) {
    return dir;
  }
  const read = await callFiles(f => f.readText(path(dir.value)), files);
  if (!read.ok) {
    return read;
  }
  if (read.value === null) {
    return ok(defaultSettings());
  }
  try {
    return ok(parseSettings(read.value));
  } catch (error) {
    return fail(
      MODULE_CODE,
      `the saved settings are unreadable (${(error as Error).message})`,
    );
  }
}

export async function saveSettings(
  folder: Folder,
  settings: BridgeSettings,
  files?: TextFiles,
): Promise<Result<null>> {
  const dir = await folder();
  if (!dir.ok) {
    return dir;
  }
  return callFiles(
    f => f.writeText(path(dir.value), serializeSettings(settings)),
    files,
  );
}
