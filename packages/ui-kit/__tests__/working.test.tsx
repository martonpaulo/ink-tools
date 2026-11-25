/** The «Loading…» strip of a no-view action (#103): shown at the press, cleared on every ending. */
import React from 'react';
import {StyleSheet, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {metrics} from '../src/metrics';
import {CLOSE_TEXT} from '../src/problem';
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

  it('clears the strip and keeps the view open on the failure, until Close (#255)', async () => {
    const {calls, working} = setup();
    const run = working.run(() => Promise.reject(new Error('1503')));
    await expect(run).rejects.toThrow('1503');
    expect(working.isWorking()).toBe(false);
    expect(working.problem()).toEqual({what: 'Failed.', reason: '1503'});
    expect(calls).toEqual(['show']);
    await working.dismiss();
    await working.dismiss();
    expect(working.problem()).toBeNull();
    expect(calls).toEqual(['show', 'close']);
  });

  it('holds a failure with no message as what failed, with no reason (#255)', async () => {
    const {working} = setup();
    await expect(working.run(() => Promise.reject(new Error('')))).rejects.toThrow();
    expect(working.problem()).toEqual({what: 'Failed.', reason: undefined});
  });

  it('keeps the strip while a second run works, then shows the failure (#255)', async () => {
    const {calls, working} = setup();
    const second = pending<void>();
    const b = working.run(() => second.promise);
    await expect(working.run(() => Promise.reject(new Error('1503')))).rejects.toThrow();
    expect(working.isWorking()).toBe(true);
    second.resolve();
    await b;
    expect(working.isWorking()).toBe(false);
    expect(working.problem()?.reason).toBe('1503');
    expect(calls).toEqual(['show']);
  });

  it('starts a run after a held failure clean, and closes the view on its success (#255)', async () => {
    const {calls, working} = setup();
    await expect(working.run(() => Promise.reject(new Error('1503')))).rejects.toThrow();
    await working.run(() => Promise.resolve());
    expect(working.problem()).toBeNull();
    expect(calls).toEqual(['show', 'show', 'close']);
  });

  it('opens the view for a failure that came before its delayed strip (#255)', async () => {
    const {calls, working} = setup();
    const run = working.run(() => Promise.reject(new Error('1503')), {showAfterMs: 2000});
    await expect(run).rejects.toThrow();
    jest.advanceTimersByTime(5000);
    expect(working.problem()?.reason).toBe('1503');
    expect(calls).toEqual(['show']);
  });

  it('toasts a failure that comes after the timeout closed the view', async () => {
    const {calls, working} = setup();
    const task = pending<void>();
    const run = working.run(() => task.promise, {timeoutMs: 1000});
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    task.reject(new Error('1503'));
    await expect(run).rejects.toThrow();
    expect(working.problem()).toBeNull();
    expect(calls).toEqual(['show', 'close', 'toast Still working.', 'toast Failed.']);
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
  return useWorking(working) ? (
    <WorkingStrip working={working} />
  ) : (
    <Text>Settings</Text>
  );
}

describe('WorkingStrip (#103)', () => {
  it('is the native loading box, paper with an ink border, that reads Loading… while the action works (#287)', async () => {
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
    expect(StyleSheet.flatten(strip.props.style)).toMatchObject({
      backgroundColor: metrics.paper,
      borderColor: metrics.ink,
      borderWidth: metrics.border,
      width: metrics.loadingWidth,
    });
    expect(tree.root.findByType(Text).props.children).toBe(WORKING_TEXT);
    await act(async () => {
      task.resolve();
      await run;
    });
    expect(tree.root.findByType(Text).props.children).toBe('Settings');
  });

  it('shows the failure with its reason and Close in place of the strip (#255)', async () => {
    const {calls, working} = setup();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Root working={working} />);
    });
    await act(async () => {
      await working.run(() => Promise.reject(new Error('1503'))).catch(() => undefined);
    });
    const shown = tree.root.findAllByType(Text).map(node => node.props.children);
    expect(shown).toEqual(['Failed.', '1503']);
    const [close] = tree.root.findAll(
      node => node.props.accessibilityLabel === CLOSE_TEXT && typeof node.props.onPress === 'function',
    );
    await act(async () => {
      close.props.onPress();
    });
    expect(tree.root.findByType(Text).props.children).toBe('Settings');
    expect(calls).toEqual(['show', 'close']);
  });
});
