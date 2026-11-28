/** «Receive in the background» (#289): the receiver with no tap, its hand-off and the no-note wait. */
import {fail, ok} from '@ink-tools/sn-adapter/official';
import {copy} from '../src/copy';
import {Arrival} from '../src/native';
import {onBackgroundSwitch, placePendingOnPenUp, setBackground, startBackgroundIfOn} from '../src/receive/background';
import {pendingPath, resetPendingForTests} from '../src/receive/pending';
import {BACKGROUND_WAIT_MS, resetPlacedForTests} from '../src/receive/receive';
import {receiveState, receivingInBackground, runReceive} from '../src/receive/session';
import {settingsPath} from '../src/settings/device';
import {fakeNote, FAKE_PAGE} from '../test-support/fakeNote';
import {fakeRelay} from '../test-support/fakeRelay';

const PAGE = FAKE_PAGE;

beforeEach(() => {
  resetPlacedForTests();
  resetPendingForTests();
});

const note = fakeNote;

const text = (preview: string): Arrival => ({
  kind: 'offer',
  body: JSON.stringify({info: {alias: 'iPhone'}, files: {t: {fileType: 'text/plain', preview}}}),
  sessionId: 'sess',
  token: 'tok',
});

/**
 * A scripted receiver over files kept in memory: `nextReceived` answers each scripted arrival,
 * then waits until `stopReceive`, as the native receiver does with no window end.
 */
function receiver(arrivals: (Arrival | null)[], files: Record<string, string> = {}) {
  let stop: (() => void) | null = null;
  let stopped = false;
  const fake = fakeRelay({
    readText: jest.fn(async (path: string) => files[path] ?? null),
    writeText: jest.fn(async (path: string, body: string) => {
      files[path] = body;
      return null;
    }),
    nextReceived: jest.fn(async () => {
      if (arrivals.length > 0) {
        return arrivals.shift() ?? null;
      }
      if (stopped) {
        return {kind: 'stopped' as const};
      }
      return new Promise<Arrival>(resolve => {
        stop = () => resolve({kind: 'stopped'});
      });
    }),
    stopReceive: jest.fn(async () => {
      stopped = true;
      stop?.();
      return true;
    }),
  });
  // A new start listens again, as the native receiver does after a stop.
  const started = fake.native.startReceive;
  fake.native.startReceive = jest.fn(async (...args: Parameters<typeof started>) => {
    stopped = false;
    return started(...args);
  });
  return {...fake, files};
}

const settingsOn = () => ({[settingsPath('/plugin')]: JSON.stringify({fingerprint: 'f', pins: {}, background: true})});

/** Lets every pending promise settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

async function untilIdle() {
  for (let i = 0; i < 50 && receiveState() !== 'idle'; i++) {
    await settle();
  }
}

test('the switch on starts the receiver at plugin start, with no window end, and each item lands in the open note', async () => {
  const {api, native, calls} = receiver([text('one'), null, text('two')], settingsOn());
  const host = note({pluginDir: jest.fn(async () => ok('/plugin'))});
  const lines: string[] = [];
  const deps = {native: api, host, alias: 'Supernote', onItem: (line: string) => lines.push(line)};
  await expect(startBackgroundIfOn(deps)).resolves.toBe(true);
  await settle();
  expect(calls.started).toHaveLength(1);
  // A wait that ends with nothing keeps listening: no window end in the background (#289).
  expect(lines).toEqual([copy.receivedText, copy.receivedText]);
  expect(native.nextReceived).toHaveBeenCalledWith(BACKGROUND_WAIT_MS);
  expect(host.insertText).toHaveBeenCalledTimes(2);
  expect(receivingInBackground()).toBe(true);
  await setBackground(deps, false);
  await untilIdle();
  expect(native.stopReceive).toHaveBeenCalled();
  expect(receiveState()).toBe('idle');
});

test('the switch off starts nothing at plugin start', async () => {
  const {api, calls} = receiver([]);
  const deps = {native: api, host: note(), alias: 'Supernote', onItem: jest.fn()};
  await expect(startBackgroundIfOn(deps)).resolves.toBe(false);
  expect(calls.started).toHaveLength(0);
});

test('a tap on «Receive» while the background receive runs shows it, and starts no second receiver', async () => {
  const {api, calls} = receiver([], settingsOn());
  const deps = {native: api, host: note(), alias: 'Supernote', onItem: jest.fn()};
  await startBackgroundIfOn(deps);
  await settle();
  const showView = jest.fn();
  await expect(runReceive(api, note(), 'Supernote', showView)).resolves.toBeNull();
  expect(showView).toHaveBeenCalledTimes(1);
  expect(calls.started).toHaveLength(1);
  await setBackground(deps, false);
  await untilIdle();
});

test('with no note open the item waits, and the next pen-up with a note open places it once', async () => {
  let noteOpen = false;
  const host = note({pageSize: jest.fn(async () => (noteOpen ? ok(PAGE) : fail(-1, 'no note')))});
  const {api, files} = receiver([text('later')], settingsOn());
  const lines: string[] = [];
  const deps = {native: api, host, alias: 'Supernote', onItem: (line: string) => lines.push(line)};
  await startBackgroundIfOn(deps);
  await settle();
  expect(lines).toEqual([copy.keptForNote]);
  expect(host.insertText).not.toHaveBeenCalled();
  expect(JSON.parse(files[pendingPath('/plugin')])).toEqual([{kind: 'text', text: 'later'}]);

  noteOpen = true;
  await expect(placePendingOnPenUp(deps)).resolves.toBe(1);
  expect(host.insertText).toHaveBeenCalledWith(expect.objectContaining({text: 'later'}));
  expect(JSON.parse(files[pendingPath('/plugin')])).toEqual([]);
  // The next pen-up reads nothing: the list is known to be empty.
  await expect(placePendingOnPenUp(deps)).resolves.toBe(0);
  expect(host.insertText).toHaveBeenCalledTimes(1);
  await setBackground(deps, false);
  await untilIdle();
});

test('a kept picture waits at its path and is inserted on the next «Receive» tap', async () => {
  const files = {[pendingPath('/plugin')]: JSON.stringify([{kind: 'image', path: '/plugin/tmp/received-s.png'}, {kind: 'oops'}])};
  const {api} = receiver([null], files);
  const host = note();
  const lines: string[] = [];
  await runReceive(api, host, 'Supernote', jest.fn(), line => lines.push(line));
  expect(host.insertImage).toHaveBeenCalledWith('/plugin/tmp/received-s.png');
  expect(lines).toEqual([copy.receivedImage]);
});

test('a background receiver that cannot start turns the switch off', async () => {
  const {api, files} = receiver([], settingsOn());
  const failing = {...api, startReceive: jest.fn(async () => fail(-1, 'port in use'))};
  const host = note();
  const onItem = jest.fn();
  await startBackgroundIfOn({native: failing, host, alias: 'Supernote', onItem});
  await untilIdle();
  await settle();
  expect(JSON.parse(files[settingsPath('/plugin')]).background).toBe(false);
  // Not «Stop»: a toast says why the switch now reads off.
  expect(onItem).toHaveBeenCalledWith(copy.backgroundStopped(copy.receiveFailed));
  expect(host.log).toHaveBeenCalledWith(expect.stringContaining('the background receive ended'));
});

test('«Stop» on the background receive turns the saved switch off and tells an open Settings view', async () => {
  const {api, files} = receiver([], settingsOn());
  const heard: boolean[] = [];
  const stopListening = onBackgroundSwitch(on => heard.push(on));
  await startBackgroundIfOn({native: api, host: note(), alias: 'Supernote', onItem: jest.fn()});
  await settle();
  await api.stopReceive();
  await untilIdle();
  await settle();
  expect(JSON.parse(files[settingsPath('/plugin')]).background).toBe(false);
  expect(heard).toEqual([false]);
  stopListening();
});

test('turned on while a tap\'s window runs, the background receiver starts when that window ends', async () => {
  const {api, calls, files} = receiver([], settingsOn());
  const tap = runReceive(api, note(), 'Supernote', jest.fn());
  await settle();
  const deps = {native: api, host: note(), alias: 'Supernote', onItem: jest.fn()};
  await expect(startBackgroundIfOn(deps)).resolves.toBe(true);
  expect(calls.started).toHaveLength(1);
  await api.stopReceive();
  await tap;
  for (let i = 0; i < 50 && !receivingInBackground(); i++) {
    await settle();
  }
  expect(receivingInBackground()).toBe(true);
  expect(calls.started).toHaveLength(2);
  expect(JSON.parse(files[settingsPath('/plugin')]).background).toBe(true);
  await setBackground(deps, false);
  await untilIdle();
});

test('the switch turned off and on again keeps it on, with a new receiver', async () => {
  const {api, calls, files} = receiver([], settingsOn());
  const deps = {native: api, host: note(), alias: 'Supernote', onItem: jest.fn()};
  await startBackgroundIfOn(deps);
  await settle();
  const off = setBackground(deps, false);
  const on = setBackground(deps, true);
  await Promise.all([off, on]);
  for (let i = 0; i < 50 && !receivingInBackground(); i++) {
    await settle();
  }
  await settle();
  expect(receivingInBackground()).toBe(true);
  expect(calls.started).toHaveLength(2);
  expect(JSON.parse(files[settingsPath('/plugin')]).background).toBe(true);
  await setBackground(deps, false);
  await untilIdle();
});

test('the switch turned off while the receiver still starts stops it once it is ready', async () => {
  const {api, native, files} = receiver([], settingsOn());
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  const start = native.startReceive;
  native.startReceive = jest.fn(async (...args: Parameters<typeof start>) => {
    await held;
    return start(...args);
  });
  const deps = {native: api, host: note(), alias: 'Supernote', onItem: jest.fn()};
  await startBackgroundIfOn(deps);
  await settle();
  expect(receivingInBackground()).toBe(true);
  // The stop reaches the native receiver before its start, which clears it.
  await setBackground(deps, false);
  release();
  await untilIdle();
  await settle();
  expect(receiveState()).toBe('idle');
  expect(JSON.parse(files[settingsPath('/plugin')]).background).toBe(false);
});

test('a failed save of the switch off keeps a later end of the run turning it off', async () => {
  const {api, native, files} = receiver([], settingsOn());
  const deps = {native: api, host: note(), alias: 'Supernote', onItem: jest.fn()};
  const heard: boolean[] = [];
  const stopListening = onBackgroundSwitch(on => heard.push(on));
  await startBackgroundIfOn(deps);
  await settle();
  const write = native.writeText;
  native.writeText = jest.fn(async () => {
    throw Object.assign(new Error('EACCES'), {code: 'IO'});
  });
  await expect(setBackground(deps, false)).resolves.toBe(false);
  expect(receivingInBackground()).toBe(true);
  native.writeText = write;
  await api.stopReceive();
  await untilIdle();
  await settle();
  expect(heard).toEqual([false]);
  expect(JSON.parse(files[settingsPath('/plugin')]).background).toBe(false);
  stopListening();
});
