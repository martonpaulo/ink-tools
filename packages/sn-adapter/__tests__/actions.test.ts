import {
  ACTION_CHUNK,
  ACTION_MAX_AGE_MS,
  ACTION_POLL_MS,
  actionLines,
  nativeTimers,
  startActionChannel,
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

test('a long answer is split in numbered chunks that join back to the JSON', () => {
  const answer = {ok: true, line: 'x'.repeat(ACTION_CHUNK * 2)};
  const lines = actionLines('plugin-diagnostics', ID, answer);
  expect(lines).toHaveLength(3);
  expect(lines[0].startsWith(`INKTOOLS action plugin-diagnostics ${ID} 1/3 `)).toBe(true);
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

  test('drives the channel: a native tick reads the request file', async () => {
    const run = native();
    const read = jest.fn(async () => null);
    startActionChannel({plugin: 'account-sync', read, actions: {}, timers: run.timers});
    const key = run.module.start.mock.calls[0][0];
    run.tick(key);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
