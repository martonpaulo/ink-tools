/** Account Sync's actions by command (#283): `sync`, the same pass as «Sync now». */
import {ActionRefused, ok} from '@ink-tools/sn-adapter/official';
import {
  defaultSettings,
  parseSettings,
  serializeSettings,
  setDefaultCalendar,
  type BridgeSettings,
} from '@ink-tools/sync-core/settings';
import {ACTION_PATH, readActionFile, ROUND_FILE, settingsAction, syncAction} from '../src/actions';
import type {TextFiles} from '../src/files';
import {SECRET_DROP_FOLDER} from '../src/secretStore';
import type {SyncRunner, SyncSnapshot} from '../src/sync';

const NOW = 1_800_000_000_000;
const run = (module: 'calendar' | 'todo', at: number) => ({
  module,
  at,
  counts: {added: 1, changed: 0, removed: 0},
  errors: [],
  warnings: [],
});

function runner(snapshot: Partial<SyncSnapshot>): SyncRunner & {syncNow: jest.Mock} {
  return {
    syncNow: jest.fn(async () => ({running: false, runs: {}, probe: {}, ...snapshot})),
    snapshot: jest.fn(),
    subscribe: jest.fn(),
  } as unknown as SyncRunner & {syncNow: jest.Mock};
}

test('the request file is action.json in the sign-in drop folder', () => {
  expect(ACTION_PATH).toBe(`${SECRET_DROP_FOLDER}/action.json`);
});

test('sync runs one pass and answers the line the pass logs for each module that ran', async () => {
  const sync = runner({runs: {calendar: run('calendar', NOW - 5), todo: run('todo', NOW + 10)}});
  const answer = await syncAction(sync, () => NOW)({});
  expect(sync.syncNow).toHaveBeenCalledWith({only: undefined});
  expect(answer.modules).toEqual(['todo']);
  expect(answer.line).toMatch(/^\[Bridge\] sync todo: .*1 added/);
});

test('sync --module passes the one module to the pass', async () => {
  const sync = runner({runs: {calendar: run('calendar', NOW)}});
  await syncAction(sync, () => NOW)({module: 'calendar'});
  expect(sync.syncNow).toHaveBeenCalledWith({only: 'calendar'});
});

test('an unknown module is refused before any pass', async () => {
  const sync = runner({});
  await expect(syncAction(sync, () => NOW)({module: 'mail'})).rejects.toBeInstanceOf(ActionRefused);
  expect(sync.syncNow).not.toHaveBeenCalled();
});

test('a pass that did not start, or where no module ran, is a failure with why', async () => {
  await expect(syncAction(runner({problem: 'the settings did not load'}), () => NOW)({})).rejects.toThrow(
    'not run: the settings did not load',
  );
  await expect(syncAction(runner({probe: {todo: ['refused a test write']}}), () => NOW)({})).rejects.toThrow(
    'no module ran: todo: refused a test write',
  );
  await expect(syncAction(runner({}), () => NOW)({})).rejects.toThrow('no module ran: none is on');
});

test('the reader answers the text, null for no file, and throws a refused read', async () => {
  const files = (readText: jest.Mock) => ({readText, writeText: jest.fn()});
  expect(await readActionFile(files(jest.fn().mockResolvedValue('{"id":"a1b2c3d4"}')))).toBe('{"id":"a1b2c3d4"}');
  expect(await readActionFile(files(jest.fn().mockResolvedValue(null)))).toBeNull();
  await expect(readActionFile(files(jest.fn().mockRejectedValue(new Error('outside the roots'))))).rejects.toThrow('outside the roots');
});

test('the automatic sync and the action channel tick on the native timer, which runs with no view open (#283)', () => {
  const fs = require('fs');
  const path = require('path');
  const index: string = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const java: string = fs.readFileSync(
    path.join(__dirname, '..', 'native/com/bridge/files/BridgeFilesPackage.java'),
    'utf8',
  );
  const name = /TICKS_MODULE = "(\w+)"/.exec(java)?.[1];
  expect(name).toBe('BridgeTicks');
  expect(index).toContain(`nativeTimers('${name}')`);
  expect(index).toMatch(/startAutoSync\(bridgeSync, timers\)/);
  expect(index.slice(index.indexOf('startActionChannel({'))).toMatch(/^ {2}timers,\n\}\);/m);
});

/** The settings a device round sets and restores by command (#29). */
describe('settings', () => {
  const DIR = '/private/plugin';
  const folder = async () => ok(DIR);
  function memory(initial: Record<string, string> = {}): TextFiles & {files: Record<string, string>} {
    const files = {...initial};
    return {
      files,
      readText: async path => files[path] ?? null,
      writeText: async (path, text) => {
        files[path] = text;
        return null;
      },
      deleteFile: async path => {
        delete files[path];
        return true;
      },
    };
  }
  const stored = (files: Record<string, string>) => parseSettings(files[`${DIR}/settings.json`]);
  const start = (s: BridgeSettings) => memory({[`${DIR}/settings.json`]: serializeSettings(s)});

  test('set changes the named settings and keeps what they were for restore, answering no value', async () => {
    const files = start(setDefaultCalendar(defaultSettings(), 'own-calendar'));
    const answer = await settingsAction(folder, files)({set: {defaultCalendarId: 'test-calendar', 'sendTabletOnly.calendar': true}});
    expect(stored(files.files).defaultCalendarId).toBe('test-calendar');
    expect(stored(files.files).sendTabletOnly.calendar).toBe(true);
    expect(JSON.parse(files.files[`${DIR}/${ROUND_FILE}`])).toEqual({defaultCalendarId: 'own-calendar', 'sendTabletOnly.calendar': false});
    expect(answer.line).toBe('settings: set defaultCalendarId, sendTabletOnly.calendar; restore with inkctl plugin action account-sync settings --restore');
    expect(JSON.stringify(answer)).not.toMatch(/own-calendar|test-calendar/);
  });

  test('restore puts back the values from before the first set of the round and removes the file', async () => {
    const files = start(defaultSettings());
    const action = settingsAction(folder, files);
    await action({set: {defaultCalendarId: 'first'}});
    await action({set: {defaultCalendarId: 'second', 'sendTabletOnly.todo': true}});
    expect((await action({restore: true})).line).toBe('settings: restored defaultCalendarId, sendTabletOnly.todo');
    expect(stored(files.files)).toEqual(defaultSettings());
    expect(files.files[`${DIR}/${ROUND_FILE}`]).toBeUndefined();
  });

  test('refuses an unknown setting, a wrong type and a restore with nothing kept, changing nothing', async () => {
    const files = start(defaultSettings());
    const before = {...files.files};
    const action = settingsAction(folder, files);
    for (const args of [{set: {modules: true}}, {set: {'sendTabletOnly.calendar': 'yes'}}, {set: {defaultCalendarId: ' '}}, {set: {}}, {}, {restore: true}]) {
      await expect(action(args)).rejects.toBeInstanceOf(ActionRefused);
    }
    expect(files.files).toEqual(before);
  });

  test('settings that do not load are a failure, never a reset to the defaults', async () => {
    const files = memory({[`${DIR}/settings.json`]: '{"schema":2}'});
    await expect(settingsAction(folder, files)({set: {defaultCalendarId: 'x'}})).rejects.toThrow('the settings did not load');
    expect(files.files[`${DIR}/${ROUND_FILE}`]).toBeUndefined();
  });
});
