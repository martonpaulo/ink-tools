/** The «Loading…» strip of a no-view action (#103): shown at the press, cleared on every ending. */
import React from 'react';
import {StyleSheet, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {metrics} from '../src/metrics';
import {createWorking, Working, WORKING_TEXT} from '../src/working';
import {useWorking, WorkingStrip} from '../src/WorkingStrip';

function setup() {
  const calls: string[] = [];
  const working = createWorking({
    show: async () => calls.push('show'),
    close: async () => calls.push('close'),
    toast: text => calls.push(`toast ${text}`),
    log: () => undefined,
    copy: {failed: 'Failed.', timeout: 'Still working.'},
  });
  return {calls, working};
}

/** A task the test ends by hand. */
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('createWorking (#103)', () => {
  it('shows the strip at the press, with no timer, and closes it on success', async () => {
    const {calls, working} = setup();
    const task = pending<string>();
    const run = working.run(() => task.promise);
    expect(working.isWorking()).toBe(true);
    expect(calls).toEqual(['show']);
    task.resolve('done');
    await expect(run).resolves.toBe('done');
    expect(working.isWorking()).toBe(false);
    expect(calls).toEqual(['show', 'close']);
  });

  it('clears the strip, then shows the failure toast, on a failure', async () => {
    const {calls, working} = setup();
    const run = working.run(() => Promise.reject(new Error('1503')));
    await expect(run).rejects.toThrow('1503');
    expect(working.isWorking()).toBe(false);
    expect(calls).toEqual(['show', 'close', 'toast Failed.']);
  });

  it('clears the strip with the timeout toast while the action still runs', async () => {
    const {calls, working} = setup();
    const task = pending<void>();
    const run = working.run(() => task.promise, {timeoutMs: 1000});
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(working.isWorking()).toBe(false);
    expect(calls).toEqual(['show', 'close', 'toast Still working.']);
    task.resolve();
    await run;
    expect(calls).toEqual(['show', 'close', 'toast Still working.']);
  });

  it('shows a delayed strip only for an action that passes the delay', async () => {
    const {calls, working} = setup();
    await working.run(() => Promise.resolve(), {showAfterMs: 2000});
    jest.advanceTimersByTime(5000);
    expect(calls).toEqual([]);
    const slow = pending<void>();
    const run = working.run(() => slow.promise, {showAfterMs: 2000});
    jest.advanceTimersByTime(2000);
    expect(calls).toEqual(['show']);
    slow.resolve();
    await run;
    expect(calls).toEqual(['show', 'close']);
  });

  it('leaves the view open when the action hands it over to its own screen', async () => {
    const {calls, working} = setup();
    await working.run(async () => working.handOver());
    expect(working.isWorking()).toBe(false);
    expect(calls).toEqual(['show']);
  });

  it('closes the view once, when the last of two runs ends', async () => {
    const {calls, working} = setup();
    const first = pending<void>();
    const second = pending<void>();
    const a = working.run(() => first.promise);
    const b = working.run(() => second.promise);
    first.resolve();
    await a;
    expect(working.isWorking()).toBe(true);
    second.resolve();
    await b;
    expect(calls).toEqual(['show', 'close']);
  });
});

function Root({working}: {working: Working}) {
  return useWorking(working) ? <WorkingStrip /> : <Text>Settings</Text>;
}

describe('WorkingStrip (#103)', () => {
  it('is a dark strip that reads Loading… while the action works', async () => {
    const {working} = setup();
    const task = pending<void>();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Root working={working} />);
    });
    let run!: Promise<void>;
    act(() => {
      run = working.run(() => task.promise);
    });
    const strip = tree.root.findByProps({testID: 'working-strip'});
    expect(StyleSheet.flatten(strip.props.style).backgroundColor).toBe(
      metrics.ink,
    );
    expect(tree.root.findByType(Text).props.children).toBe(WORKING_TEXT);
    await act(async () => {
      task.resolve();
      await run;
    });
    expect(tree.root.findByType(Text).props.children).toBe('Settings');
  });
});
