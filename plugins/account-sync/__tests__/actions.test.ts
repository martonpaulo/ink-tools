/** Account Sync's actions by command (#283): `sync`, the same pass as «Sync now». */
import {ActionRefused} from '@ink-tools/sn-adapter/official';
import {ACTION_PATH, readActionFile, syncAction} from '../src/actions';
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
    tabletOnlyTasks: jest.fn(),
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
