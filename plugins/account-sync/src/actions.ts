/**
 * Account Sync's actions inkctl runs by command, with no screen (#283): `sync`, the same pass as the
 * Settings view's «Sync now», for every module that is on or, with `args.module`, one of them; and
 * `settings`, which sets and restores the settings a device round needs (#29). The
 * request file sits in the sign-in drop folder, which inkctl already writes and BridgeFiles reads
 * (registry storage.sign-in-drop-folder); sn-adapter's channel owns the request and answer format.
 */
import {ACTION_FILE, ActionRefused, type Action, type ActionResult, type Result} from '@ink-tools/sn-adapter/official';
import type {ModuleId} from '@ink-tools/sync-core';
import {
  setDefaultCalendar,
  setSendTabletOnly,
  type BridgeSettings,
  type TwoWayModule,
} from '@ink-tools/sync-core/settings';
import {callFiles, FILES_MODULE, TextFiles} from './files';
import {loadSettings, saveSettings, type Folder} from './settingsStore';
import {SECRET_DROP_FOLDER} from './secretStore';
import {runLogLines} from './statusText';
import type {SyncRunner} from './sync';

/** The modules a `sync --module` names; the digest has no sync of its own yet. */
const SYNC_MODULES: ModuleId[] = ['calendar', 'todo'];

export const ACTION_PATH = `${SECRET_DROP_FOLDER}/${ACTION_FILE}`;

/** The request file's text, null when there is none; a refused read throws its reason. */
export async function readActionFile(files?: TextFiles): Promise<string | null> {
  const read = await callFiles(f => f.readText(ACTION_PATH), files);
  if (!read.ok) {
    throw new Error(read.message);
  }
  return read.value;
}

/**
 * The `sync` action: one pass, joined when one already runs. Its line is the `[Bridge] sync <module>:`
 * line the pass logs for each module that ran in it; a pass where none ran is a failure with why.
 */
export function syncAction(runner: SyncRunner, now: () => number = Date.now): Action {
  return async (args): Promise<ActionResult> => {
    const only = args.module;
    if (only !== undefined && !SYNC_MODULES.includes(only as ModuleId)) {
      throw new ActionRefused(`module must be one of ${SYNC_MODULES.join(', ')}`);
    }
    const started = now();
    const snapshot = await runner.syncNow({only: only as ModuleId | undefined});
    if (snapshot.problem) {
      throw new Error(`not run: ${snapshot.problem}`);
    }
    const ran = Object.values(snapshot.runs).filter(run => run && run.at >= started);
    if (!ran.length) {
      const why = Object.entries(snapshot.probe)
        .filter(([, problems]) => problems?.length)
        .map(([id, problems]) => `${id}: ${problems!.join(', ')}`);
      throw new Error(`no module ran${why.length ? `: ${why.join('; ')}` : ': none is on'}`);
    }
    const lines = ran.map(run => runLogLines(run!)[0]);
    return {line: lines.join('\n'), modules: ran.map(run => run!.module)};
  };
}

/**
 * The settings a device round sets by command (#29), as the Settings view would: the calendar that
 * receives an event made on the tablet, and each module's «Send tablet-only items». `set` keeps the
 * values it replaces in `ROUND_FILE`, beside `settings.json` in the private folder, and `restore`
 * puts them back and removes the file. No value is logged or answered: a calendar id names a
 * person's calendar.
 */
export const ROUND_SETTINGS = ['defaultCalendarId', 'sendTabletOnly.calendar', 'sendTabletOnly.todo'] as const;
export type RoundSetting = (typeof ROUND_SETTINGS)[number];
type RoundValue = string | boolean | null;
type RoundValues = Partial<Record<RoundSetting, RoundValue>>;

/** The values a round's `set` replaced; gone once `restore` ran. */
export const ROUND_FILE = 'settings-round.json';

const isRoundSetting = (key: string): key is RoundSetting => (ROUND_SETTINGS as readonly string[]).includes(key);

const moduleOf = (key: RoundSetting): TwoWayModule => (key === 'sendTabletOnly.calendar' ? 'calendar' : 'todo');

function valueOf(settings: BridgeSettings, key: RoundSetting): RoundValue {
  return key === 'defaultCalendarId' ? (settings.defaultCalendarId ?? null) : settings.sendTabletOnly[moduleOf(key)];
}

/** The settings with `key` set; a value of the wrong type is refused, never stored. */
function withValue(settings: BridgeSettings, key: RoundSetting, value: unknown): BridgeSettings {
  if (key === 'defaultCalendarId') {
    if (value !== null && (typeof value !== 'string' || !value.trim())) {
      throw new ActionRefused('defaultCalendarId must be a calendar id or null');
    }
    return setDefaultCalendar(settings, value === null ? undefined : value.trim());
  }
  if (typeof value !== 'boolean') {
    throw new ActionRefused(`${key} must be true or false`);
  }
  return setSendTabletOnly(settings, moduleOf(key), value);
}

function unwrap<T>(result: Result<T>, what: string): T {
  if (!result.ok) {
    throw new Error(`${what}: ${result.message}`);
  }
  return result.value;
}

export function settingsAction(folder: Folder, files?: TextFiles): Action {
  const roundPath = async () => `${unwrap(await folder(), 'the private folder did not read').replace(/\/+$/, '')}/${ROUND_FILE}`;
  const load = async () => unwrap(await loadSettings(folder, files), 'the settings did not load');
  const save = async (settings: BridgeSettings) => unwrap(await saveSettings(folder, settings, files), 'the settings were not saved');
  const readRound = async (path: string): Promise<RoundValues | null> => {
    const text = unwrap(await callFiles(f => f.readText(path), files), `${ROUND_FILE} did not read`);
    return text === null ? null : (JSON.parse(text) as RoundValues);
  };
  return async (args): Promise<ActionResult> => {
    const path = await roundPath();
    if (args.restore === true && args.set === undefined) {
      const before = await readRound(path);
      if (!before) {
        throw new ActionRefused('no round settings to restore');
      }
      let settings = await load();
      const keys = Object.keys(before).filter(isRoundSetting);
      for (const key of keys) {
        settings = withValue(settings, key, before[key]);
      }
      await save(settings);
      unwrap(await callFiles(async f => {
        if (!f.deleteFile) {
          throw new Error(`the ${FILES_MODULE} module cannot delete`);
        }
        return f.deleteFile(path);
      }, files), `${ROUND_FILE} was not removed`);
      return {line: `settings: restored ${keys.join(', ')}`, keys};
    }
    const set = args.set;
    if (args.restore !== undefined || typeof set !== 'object' || set === null || Array.isArray(set) || !Object.keys(set).length) {
      throw new ActionRefused(`settings takes set: {${ROUND_SETTINGS.join(', ')}} or restore: true`);
    }
    const asked = set as Record<string, unknown>;
    const unknown = Object.keys(asked).filter(key => !isRoundSetting(key));
    if (unknown.length) {
      throw new ActionRefused(`settings sets only ${ROUND_SETTINGS.join(', ')}, not ${unknown.join(', ')}`);
    }
    const keys = Object.keys(asked) as RoundSetting[];
    const current = await load();
    let next = current;
    for (const key of keys) {
      next = withValue(next, key, asked[key]);
    }
    // A second set in one round keeps the values from before the first, so restore goes back to them.
    const before: RoundValues = {...(await readRound(path))};
    for (const key of keys) {
      if (!(key in before)) {
        before[key] = valueOf(current, key);
      }
    }
    unwrap(await callFiles(f => f.writeText(path, JSON.stringify(before)), files), `${ROUND_FILE} was not written`);
    await save(next);
    return {line: `settings: set ${keys.join(', ')}; restore with inkctl plugin action account-sync settings --restore`, keys};
  };
}
