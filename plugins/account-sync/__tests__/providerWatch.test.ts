/** A tablet edit starts a sync beside the timer (#296). */
import {BUNDLED_DESCRIPTOR, contentUri} from '@ink-tools/sn-adapter';
import {
  CHANGE_DEBOUNCE_MS,
  CHANGED_EVENT,
  Subscribe,
  watchProviders,
  watchedUris,
} from '../src/providerWatch';
import type {SyncRunner} from '../src/sync';

function fakeRunner(): SyncRunner & {syncNow: jest.Mock} {
  return {
    syncNow: jest.fn(async () => ({running: false, runs: {}, probe: {}})),
    snapshot: () => ({running: false, runs: {}, probe: {}}),
    tabletOnlyTasks: async () => null,
    subscribe: () => () => {},
  };
}

function fakeEvents() {
  const listeners = new Map<string, () => void>();
  const subscribe: Subscribe = (event, listener) => {
    listeners.set(event, listener);
    return () => listeners.delete(event);
  };
  return {subscribe, emit: (event: string) => listeners.get(event)?.(), listeners};
}

test('watches the Calendar events and the To-Do tasks from the descriptor', () => {
  expect(watchedUris()).toEqual([
    contentUri(BUNDLED_DESCRIPTOR.calendar, 'events'),
    contentUri(BUNDLED_DESCRIPTOR.todo, 'tasks'),
  ]);
});

test('each change event starts one extra pass; the timer is untouched', async () => {
  const runner = fakeRunner();
  const events = fakeEvents();
  const watch = jest.fn(async () => 2);
  const log = jest.fn();
  await watchProviders(runner, log, {watch}, events.subscribe);
  expect(watch).toHaveBeenCalledWith(watchedUris(), CHANGE_DEBOUNCE_MS);
  expect(runner.syncNow).not.toHaveBeenCalled();
  events.emit(CHANGED_EVENT);
  expect(runner.syncNow).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith('[Bridge] watch: 2 providers watched');
});

test('the stop function removes the listener', async () => {
  const runner = fakeRunner();
  const events = fakeEvents();
  const stop = await watchProviders(runner, () => {}, {watch: async () => 2}, events.subscribe);
  stop();
  events.emit(CHANGED_EVENT);
  expect(runner.syncNow).not.toHaveBeenCalled();
});

test('a refused watch leaves the timer alone, and says so', async () => {
  const runner = fakeRunner();
  const events = fakeEvents();
  const log = jest.fn();
  await watchProviders(runner, log, {watch: async () => Promise.reject(new Error('no provider'))}, events.subscribe);
  expect(events.listeners.size).toBe(0);
  expect(log).toHaveBeenCalledWith('[Bridge] watch: not started: no provider: the timer syncs alone');
});

test('a module that cannot watch is said once, with no listener', async () => {
  const runner = fakeRunner();
  const events = fakeEvents();
  const log = jest.fn();
  await watchProviders(runner, log, undefined, events.subscribe);
  expect(events.listeners.size).toBe(0);
  expect(log).toHaveBeenCalledWith('[Bridge] watch: the BridgeProviders module cannot watch yet: the timer syncs alone');
});
