import {
  ACTION_BURST_MS,
  ACTION_BURST_POLL_MS,
  ACTION_CHUNK,
  ActionRefused,
  ACTION_MAX_AGE_MS,
  ACTION_POLL_MS,
  ACTION_RUN_LIMIT_MS,
  actionLines,
  nativeTimers,
  startActionChannel,
  timerWait,
  type Action,
} from '../src/official/actions';

const ID = 'a1b2c3d4';
const NOW = 1_800_000_000_000;

function setup(actions: Record<string, Action>, first: string | null) {
  let file: string | null = first;
  const lines: string[] = [];
  const timers = {setInterval: jest.fn(() => 7), clearInterval: jest.fn()};
  const channel = startActionChannel({
    plugin: 'account-sync',
    read: jest.fn(async () => file),
    actions,
    log: line => lines.push(line),
    now: () => NOW,
    timers,
  });
  const answers = () =>
    lines.map(line => {
      const found = /^INKTOOLS action account-sync (\S+) 1\/1 (.*)$/.exec(line);
      if (!found) {
        throw new Error(`not one answer line: ${line}`);
      }
      return {id: found[1], answer: JSON.parse(found[2])};
    });
  return {channel, lines, timers, answers, write: (text: string | null) => (file = text)};
}

const request = (body: object) => JSON.stringify({id: ID, at: NOW - 1000, args: {}, ...body});

test('reads the file every ACTION_POLL_MS and stops on stop', () => {
  const run = setup({}, null);
  expect(run.timers.setInterval).toHaveBeenCalledWith(expect.any(Function), ACTION_POLL_MS);
  run.channel.stop();
  expect(run.timers.clearInterval).toHaveBeenCalledWith(7);
});

test('after a request it reads fast until a run of requests ends, then only at the idle tick', async () => {
  // Device round 10 (#314): on a 504-stroke page the edit took 0.4 to 0.55 s, the whole call 3.1
  // to 4.1 s, about 1.2 s of it the idle read's wait.
  let clock = NOW;
  let file: string | null = null;
  const ticks = new Map<number, () => void>();
  let next = 1;
  const timers = {
    setInterval: jest.fn((fn: () => void) => {
      ticks.set(next, fn);
      return next++;
    }),
    clearInterval: jest.fn((handle: unknown) => ticks.delete(handle as number)),
  };
  const read = jest.fn(async () => file);
  const sync = jest.fn(async () => ({line: 'done'}));
  const channel = startActionChannel({plugin: 'account-sync', read, actions: {sync}, log: () => {}, now: () => clock, timers});
  expect(timers.setInterval).toHaveBeenCalledTimes(1);

  file = JSON.stringify({id: ID, at: clock, args: {}, action: 'sync'});
  await channel.check();
  expect(timers.setInterval).toHaveBeenLastCalledWith(expect.any(Function), ACTION_BURST_POLL_MS);
  const fast = timers.setInterval.mock.results[1].value as number;

  file = JSON.stringify({id: 'b2c3d4e5', at: clock, args: {}, action: 'sync'});
  ticks.get(fast)?.();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(sync).toHaveBeenCalledTimes(2);
  expect(timers.setInterval).toHaveBeenCalledTimes(2); // one fast read for the whole run

  clock += ACTION_BURST_MS + 1;
  ticks.get(fast)?.();
  expect(timers.clearInterval).toHaveBeenCalledWith(fast);
  expect([...ticks.keys()]).toEqual([1]); // only the idle tick is left
  channel.stop();
  expect(ticks.size).toBe(0);
});

test('runs a new request once and answers its own line and detail', async () => {
  const sync = jest.fn(async () => ({line: '[Bridge] sync todo: done', modules: ['todo']}));
  const run = setup({sync}, request({action: 'sync', args: {module: 'todo'}}));
  await run.channel.check();
  await run.channel.check();
  expect(sync).toHaveBeenCalledTimes(1);
  expect(sync).toHaveBeenCalledWith({module: 'todo'});
  expect(run.answers()).toEqual([
    {id: ID, answer: {ok: true, action: 'sync', ms: 0, line: '[Bridge] sync todo: done', modules: ['todo']}},
  ]);
});

test('refuses an unknown action with code 2, naming the ones it runs', async () => {
  const run = setup({sync: jest.fn(), 'run-probe': jest.fn()}, request({action: 'format'}));
  await run.channel.check();
  expect(run.answers()[0].answer).toEqual({ok: false, code: 2, message: 'unknown action: format; this plugin runs sync, run-probe'});
});

test.each([
  ['args that are not an object', {action: 'sync', args: [1]}, 'args must be an object'],
  ['no tablet time', {action: 'sync', at: 'now'}, 'at must be the tablet time'],
])('refuses %s with code 2 and runs nothing', async (_name, body, message) => {
  const sync = jest.fn();
  const run = setup({sync}, request(body));
  await run.channel.check();
  expect(run.answers()[0].answer).toMatchObject({ok: false, code: 2, message: expect.stringContaining(message)});
  expect(sync).not.toHaveBeenCalled();
});

test("a refusal's detail joins its answer, and cannot replace ok, code or message (#312)", async () => {
  const edit = jest.fn(async () => {
    throw new ActionRefused('no-element: page 2 has no element 9', 2, {refusal: 'no-element', openNote: null, ok: true});
  });
  const run = setup({edit}, request({action: 'edit'}));
  await run.channel.check();
  expect(run.answers()[0].answer).toEqual({
    ok: false,
    code: 2,
    message: 'no-element: page 2 has no element 9',
    refusal: 'no-element',
    openNote: null,
  });
});

test('answers a request older than ACTION_MAX_AGE_MS as stale, with code 7, and never runs it', async () => {
  const sync = jest.fn();
  const run = setup({sync}, request({action: 'sync', at: NOW - ACTION_MAX_AGE_MS - 1}));
  await run.channel.check();
  expect(run.answers()[0].answer).toMatchObject({ok: false, code: 7, message: expect.stringContaining('stale')});
  expect(sync).not.toHaveBeenCalled();
});

test('an action that throws is an answer with code 1, and the channel goes on', async () => {
  const sync = jest.fn().mockRejectedValueOnce(new Error('the settings did not load')).mockResolvedValue({line: 'ok'});
  const run = setup({sync}, request({action: 'sync'}));
  await run.channel.check();
  run.write(JSON.stringify({id: 'ffee0011', action: 'sync', args: {}, at: NOW}));
  await run.channel.check();
  expect(run.answers().map(a => a.answer.ok)).toEqual([false, true]);
  expect(run.answers()[0].answer).toEqual({ok: false, code: 1, message: 'the settings did not load'});
});

test('no file, a read that throws, or a half-written file with no id logs nothing', async () => {
  const run = setup({sync: jest.fn()}, null);
  await run.channel.check();
  run.write('{"id": "a1b2');
  await run.channel.check();
  expect(run.lines).toEqual([]);
  const throwing = startActionChannel({
    plugin: 'x',
    read: () => Promise.reject(new Error('no such file')),
    actions: {},
    log: line => run.lines.push(line),
    timers: {setInterval: () => 0, clearInterval: () => undefined},
  });
  await throwing.check();
  expect(run.lines).toEqual([]);
});

test('a check while one runs does nothing, so a slow action never runs twice', async () => {
  let release: (value: {line: string}) => void = () => undefined;
  const sync = jest.fn(() => new Promise<{line: string}>(resolve => (release = resolve)));
  const run = setup({sync}, request({action: 'sync'}));
  const first = run.channel.check();
  await run.channel.check();
  release({line: 'done'});
  await first;
  expect(sync).toHaveBeenCalledTimes(1);
  expect(run.lines).toHaveLength(1);
});

test('an action that never ends frees the channel after ACTION_RUN_LIMIT_MS, and its late end is not logged (#474)', async () => {
  // Manta, 2026-11-27: a call made while the Settings app was in front never returned, and the
  // channel answered nothing more until PluginHost restarted.
  let clock = NOW;
  let file: string | null = JSON.stringify({id: ID, at: clock, args: {}, action: 'hang'});
  const lines: string[] = [];
  let release: (value: {line: string}) => void = () => {};
  const hang = jest.fn(() => new Promise<{line: string}>(resolve => (release = resolve)));
  const sync = jest.fn(async () => ({line: 'done'}));
  const timers = {setInterval: jest.fn(() => 7), clearInterval: jest.fn()};
  const channel = startActionChannel({plugin: 'account-sync', read: async () => file, actions: {hang, sync}, log: line => lines.push(line), now: () => clock, timers});
  void channel.check();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(hang).toHaveBeenCalledTimes(1);

  file = JSON.stringify({id: 'b2c3d4e5', at: clock, args: {}, action: 'sync'});
  await channel.check();
  expect(sync).not.toHaveBeenCalled(); // still within the limit: the channel waits

  clock += ACTION_RUN_LIMIT_MS + 1;
  file = JSON.stringify({id: 'b2c3d4e5', at: clock, args: {}, action: 'sync'});
  await channel.check();
  expect(sync).toHaveBeenCalledTimes(1);
  expect(lines[0]).toContain(`INKTOOLS action account-sync ${ID} 1/1 {"ok":false,"code":1,"message":"no end in`);
  expect(lines[1]).toContain('INKTOOLS action account-sync b2c3d4e5 1/1 {"ok":true,"action":"sync"');

  release({line: 'late'});
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(lines).toHaveLength(2);
  file = JSON.stringify({id: 'c3d4e5f6', at: clock, args: {}, action: 'sync'});
  await channel.check();
  expect(sync).toHaveBeenCalledTimes(2);
});

test('a long answer is split in numbered chunks that join back to the JSON', () => {
  const answer = {ok: true, line: 'x'.repeat(ACTION_CHUNK * 2)};
  const lines = actionLines('ink-tools-probe', ID, answer);
  expect(lines).toHaveLength(3);
  expect(lines[0].startsWith(`INKTOOLS action ink-tools-probe ${ID} 1/3 `)).toBe(true);
  expect(JSON.parse(lines.map(line => line.replace(/^(\S+ ){4}\S+ /, '')).join(''))).toEqual(answer);
});

describe('nativeTimers (#283)', () => {
  function native() {
    const listeners: Record<string, (key: number) => void> = {};
    const module = {start: jest.fn(), stop: jest.fn()};
    const subscribe = jest.fn((event: string, listener: (key: number) => void) => {
      listeners[event] = listener;
      return () => {};
    });
    const lines: string[] = [];
    const timers = nativeTimers('BridgeTicks', line => lines.push(line), {BridgeTicks: module}, subscribe);
    return {module, timers, lines, tick: (key: number) => listeners.BridgeTicksTick(key)};
  }

  test('runs each interval on its own native tick, never a JS timer', () => {
    const run = native();
    const first = jest.fn();
    const second = jest.fn();
    const a = run.timers.setInterval(first, ACTION_POLL_MS);
    const b = run.timers.setInterval(second, 30 * 60_000);
    expect(run.module.start).toHaveBeenCalledWith(a, ACTION_POLL_MS);
    expect(run.module.start).toHaveBeenCalledWith(b, 30 * 60_000);
    run.tick(a as number);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    run.timers.clearInterval(a);
    expect(run.module.stop).toHaveBeenCalledWith(a);
    run.tick(a as number);
    expect(first).toHaveBeenCalledTimes(1);
    expect(run.lines).toEqual([]);
  });

  test('says so, and uses the JS timers, when the plugin has no such module', () => {
    const lines: string[] = [];
    const timers = nativeTimers('BridgeTicks', line => lines.push(line), {});
    expect(lines).toEqual(['INKTOOLS timers: no native BridgeTicks module: JS timers, which stop while no view of the plugin shows']);
    const handle = timers.setInterval(() => {}, 1000);
    timers.clearInterval(handle);
  });

  test('one instance per module on the device, so two callers never share a timer number (#289)', () => {
    expect(nativeTimers('DeviceLinkTicks', () => {})).toBe(nativeTimers('DeviceLinkTicks', () => {}));
  });

  test('timerWait resolves on the first native tick and stops its timer (#289)', async () => {
    const run = native();
    let done = false;
    const waited = timerWait(run.timers, 250).then(() => {
      done = true;
    });
    const key = run.module.start.mock.calls[0][0];
    expect(run.module.start).toHaveBeenCalledWith(key, 250);
    await Promise.resolve();
    expect(done).toBe(false);
    run.tick(key);
    await waited;
    expect(run.module.stop).toHaveBeenCalledWith(key);
  });

  test('drives the channel: a native tick reads the request file', async () => {
    const run = native();
    const read = jest.fn(async () => null);
    startActionChannel({plugin: 'account-sync', read, actions: {}, timers: run.timers});
    const key = run.module.start.mock.calls[0][0];
    run.tick(key);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
