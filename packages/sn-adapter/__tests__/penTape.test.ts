/**
 * Pen replay (#298): the tap hands a replayed stroke to the same listeners `onPenUp` registered,
 * the recorder keeps what the pen wrote in page pixels, and a bad tape inserts nothing.
 */
import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {
  onMotion,
  onPenUp,
  parsePenTape,
  PEN_TAPE_VERSION,
  REPLAY_MAX_GAP_MS,
  replayPenTape,
  resetPenTapForTests,
  startPenRecording,
  stopPenRecording,
  strokeTimes,
  type PenTape,
  type ReplayHost,
  type SavedStroke,
} from '../src/official';

const mocked = (fn: unknown) => fn as jest.Mock;

const STROKE = {points: [{x: 10, y: 20}, {x: 30, y: 40}], pressures: [2000, 2000], penType: 10, penColor: 0, thickness: 200};
const TAPE: PenTape = {
  version: PEN_TAPE_VERSION,
  events: [
    {at: 0, motion: {action: 0, x: 10, y: 20, toolType: 2}},
    {at: 40, motion: {action: 1, x: 30, y: 40, toolType: 2}},
    {at: 50, penUp: [{...STROKE, times: {startedAt: 0, endedAt: 40}}]},
  ],
};

function fakeHost(overrides: Partial<ReplayHost> = {}) {
  const inserted: Array<{stroke: SavedStroke; page: number}> = [];
  const waits: number[] = [];
  /** What the host did, in order: each insert and each save. */
  const calls: string[] = [];
  const host: ReplayHost = {
    page: async () => ({ok: true, value: 3}),
    insert: async (stroke, page) => {
      inserted.push({stroke, page});
      calls.push('insert');
      return {ok: true, value: {uuid: `replayed-${inserted.length}`}};
    },
    save: async () => {
      calls.push('save');
      return {ok: true, value: true};
    },
    sleep: async ms => {
      waits.push(ms);
    },
    now: () => 1_000_000,
    ...overrides,
  };
  return {host, inserted, waits, calls};
}

/** The host's pen-up and motion callbacks, as PluginManager received them. */
function deviceCallbacks() {
  const penUp = mocked(PluginManager.registerEventListener).mock.calls.slice(-1)[0]?.[2]?.onMsg;
  const motion = mocked(PluginManager.registerMotionListener).mock.calls.slice(-1)[0]?.[1]?.onMsg;
  return {penUp, motion};
}

beforeEach(() => {
  jest.resetAllMocks();
  mocked(PluginManager.registerEventListener).mockReturnValue({remove: jest.fn()});
  mocked(PluginManager.registerMotionListener).mockReturnValue({remove: jest.fn()});
  resetPenTapForTests();
});

test('a replay inserts each stroke on the open page and hands it to the pen-up listener', async () => {
  const penUps: object[][] = [];
  const motions: number[] = [];
  expect(onPenUp(elements => penUps.push(elements)).ok).toBe(true);
  expect(onMotion(motion => motions.push(motion.action)).ok).toBe(true);
  const {host, inserted, waits} = fakeHost();

  const result = await replayPenTape(TAPE, host);

  expect(result).toEqual({ok: true, value: {motions: 2, penUps: 1, strokes: 1, listenerErrors: 0}});
  expect(inserted).toEqual([{stroke: STROKE, page: 3}]);
  expect(motions).toEqual([0, 1]);
  expect(penUps).toEqual([[{uuid: 'replayed-1'}]]);
  expect(waits).toEqual([0, 40, 10]);
});

test('the note is saved after a pen-up is inserted and before its listeners run', async () => {
  // Device round 8 (#298): a replayed circle showed on the screen, but the reopened note held
  // nothing, as an inserted stroke stays out of the file until a save.
  const {host, calls} = fakeHost();
  onPenUp(() => {
    calls.push('listener');
  });
  const result = await replayPenTape(TAPE, host);
  expect(result.ok).toBe(true);
  expect(calls).toEqual(['insert', 'save', 'listener']);
});

test.each([
  ['answers false', {ok: true, value: false} as const, 'pen-up 1: the note did not save: answered false'],
  ['fails', {ok: false, code: 1501, message: 'no permission'} as const, 'pen-up 1: the note did not save: no permission'],
])('a save that %s stops the replay before the listeners', async (_name, answer, message) => {
  const penUps: object[][] = [];
  onPenUp(elements => penUps.push(elements));
  const {host} = fakeHost({save: async () => answer});
  const result = await replayPenTape(TAPE, host);
  expect(result.ok).toBe(false);
  expect(!result.ok && result.message).toBe(message);
  expect(penUps).toEqual([]);
});

test('a replayed stroke answers its recorded times, shifted to the replay', async () => {
  let element: object | null = null;
  onPenUp(([first]) => {
    element = first;
  });
  await replayPenTape(TAPE, fakeHost().host);
  expect(await strokeTimes(element as unknown as object)).toEqual({ok: true, value: {startedAt: 1_000_000, endedAt: 1_000_040}});
});

test('with no listener on, a replay inserts nothing and says why', async () => {
  const {host, inserted} = fakeHost();
  const result = await replayPenTape(TAPE, host);
  expect(result.ok).toBe(false);
  expect(inserted).toEqual([]);
});

test('a stopped listener gets no replayed stroke', async () => {
  const penUps: object[][] = [];
  const stop = onPenUp(elements => penUps.push(elements));
  onMotion(() => {});
  if (stop.ok) {
    stop.value();
  }
  await replayPenTape(TAPE, fakeHost().host);
  expect(penUps).toEqual([]);
});

test('a failed insert stops the replay with the stroke it failed on', async () => {
  const penUps: object[][] = [];
  onPenUp(elements => penUps.push(elements));
  const {host} = fakeHost({insert: async () => ({ok: false, code: 1501, message: 'no permission'})});
  const result = await replayPenTape(TAPE, host);
  expect(result).toEqual({ok: false, code: 1501, message: 'stroke 1: no permission'});
  expect(penUps).toEqual([]);
});

test('a listener that throws is counted and the replay goes on', async () => {
  onPenUp(() => {
    throw new Error('boom');
  });
  const result = await replayPenTape(TAPE, fakeHost().host);
  expect(result.ok && result.value.listenerErrors).toBe(1);
});

test('gaps longer than the cap are cut', async () => {
  onPenUp(() => {});
  const long: PenTape = {...TAPE, events: [TAPE.events[2], {...TAPE.events[2], at: 60_050}]};
  const {host, waits} = fakeHost();
  await replayPenTape(long, host);
  expect(waits).toEqual([50, REPLAY_MAX_GAP_MS]);
});

test.each([
  ['not JSON', '{'],
  ['another version', JSON.stringify({...TAPE, version: PEN_TAPE_VERSION + 1})],
  ['no events', JSON.stringify({version: PEN_TAPE_VERSION, events: []})],
  ['events out of order', JSON.stringify({...TAPE, events: [TAPE.events[1], TAPE.events[0]]})],
  ['a stroke with no points', JSON.stringify({...TAPE, events: [{at: 0, penUp: [{...STROKE, points: [], times: null}]}]})],
  ['an event with neither', JSON.stringify({...TAPE, events: [{at: 0}]})],
])('a tape with %s is refused', (_, text) => {
  expect(parsePenTape(text).ok).toBe(false);
});

test('a recorded tape parses back to itself', async () => {
  expect(parsePenTape(JSON.stringify(TAPE))).toEqual({ok: true, value: TAPE});
});

describe('recording', () => {
  const pointAccessor = (values: unknown[]) => ({
    size: jest.fn(async () => values.length),
    getRange: jest.fn(async (start: number, count: number) => values.slice(start, start + count)),
  });
  const element = (points: Array<{x: number; y: number}>) => ({
    stroke: {
      points: pointAccessor(points),
      pressures: pointAccessor(points.map(() => 1500)),
      recognPoints: pointAccessor([{timestamp: 5_000}, {timestamp: 5_120}]),
      penType: 10,
      penColor: 0,
    },
    thickness: 200,
  });

  beforeEach(() => {
    mocked(PluginCommAPI.getCurrentFilePath).mockResolvedValue({success: true, result: '/Note/Tests/a.note'});
    mocked(PluginCommAPI.getCurrentPageNum).mockResolvedValue({success: true, result: 0});
    mocked(PluginFileAPI.getPageSize).mockResolvedValue({success: true, result: {width: 1920, height: 2560}});
  });

  test('keeps each pen-up stroke in page pixels with its times, before the listener frees it', async () => {
    const order: string[] = [];
    onPenUp(() => order.push('listener'));
    onMotion(() => {});
    let clock = 1_000;
    startPenRecording(() => clock);
    const {penUp, motion} = deviceCallbacks();
    clock = 1_010;
    motion({action: 0, x: 10, y: 20, toolType: 2, eventTime: 1, downTime: 1});
    const stroke = element([{x: 10, y: 20}, {x: 30, y: 40}]);
    stroke.stroke.points.getRange.mockImplementation(async () => {
      order.push('read');
      return [{x: 10, y: 20}, {x: 30, y: 40}];
    });
    penUp([stroke]);
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    const stopped = stopPenRecording();
    expect(order).toEqual(['read', 'listener']);
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) {
      return;
    }
    const [first, second] = stopped.value.tape.events;
    expect(first).toEqual({at: 10, motion: {action: 0, x: 10, y: 20, toolType: 2}});
    expect(second).toMatchObject({penUp: [{points: [{x: 10, y: 20}, {x: 30, y: 40}], pressures: [1500, 1500], times: {startedAt: 0, endedAt: 120}}]});
    expect(stopped.value.dropped).toBe(0);
  });

  test('with no recording on, a pen-up goes straight to the listener', () => {
    const seen: object[][] = [];
    onPenUp(elements => seen.push(elements));
    deviceCallbacks().penUp([{}]);
    expect(seen).toEqual([[{}]]);
  });

  test('stopping with no recording on is a failure, never an empty tape', () => {
    expect(stopPenRecording().ok).toBe(false);
  });

  test('with no listener on, a recording does not start and says why (#449)', () => {
    const started = startPenRecording();
    expect(started).toMatchObject({ok: false, message: expect.stringContaining('no pen listener is on')});
    expect(stopPenRecording().ok).toBe(false);
  });

  test('a recording starts once one module listens, with no pen-up listener needed', () => {
    onMotion(() => {});
    expect(startPenRecording().ok).toBe(true);
    expect(stopPenRecording().ok).toBe(true);
  });
});
