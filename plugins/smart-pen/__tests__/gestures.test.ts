/** Smart Pen's Gestures (#270): finger taps from the motion listener, the palm guard, the requirement and the request file. */
import {createDetector, FINGER, TIMING, type Touch} from '../src/modules/gestures/detect';
import {
  checkGestures,
  describeCheck,
  gestureRequirements,
  READY_FILE,
} from '../src/modules/gestures/requirement';
import {createGestures, type GesturesHost} from '../src/modules/gestures/run';
import {
  DEFAULT_SETTINGS,
  setSettings,
  type Gesture,
} from '../src/modules/gestures/settings';

const PEN = 2;
const DOWN = 0;
const UP = 1;
const MOVE = 2;
const POINTER_DOWN = 5;

/** A fake clock: timers run when `advance` passes their time. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const due = new Map<number, {at: number; run: () => void}>();
  return {
    timers: {
      set: (run: () => void, ms: number) => {
        const id = next++;
        due.set(id, {at: now + ms, run});
        return id;
      },
      clear: (timer: unknown) => {
        due.delete(timer as number);
      },
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...due]) {
        if (timer.at <= now) {
          due.delete(id);
          timer.run();
        }
      }
    },
  };
}

function harness() {
  const clock = fakeTimers();
  const seen: Gesture[] = [];
  const detector = createDetector(gesture => seen.push(gesture), clock.timers);
  let t = 10_000;
  const send = (action: number, toolType = FINGER, x = 500, y = 500, extra: Partial<Touch> = {}) =>
    detector.motion({action, x, y, toolType, eventTime: t, ...extra});
  /** One finger tap at (x, y), then `pause` ms of nothing. */
  const tap = (pause = 100, x = 500, y = 500) => {
    send(DOWN, FINGER, x, y);
    t += 60;
    clock.advance(60);
    send(UP, FINGER, x, y);
    t += pause;
    clock.advance(pause);
  };
  const wait = (ms: number) => {
    t += ms;
    clock.advance(ms);
  };
  return {seen, send, tap, wait, advanceTime: (ms: number) => (t += ms)};
}

test('a double tap acts once the gap passed with no third tap', () => {
  const h = harness();
  h.tap();
  h.tap();
  expect(h.seen).toEqual([]);
  h.wait(TIMING.gapMs);
  expect(h.seen).toEqual(['doubleTap']);
});

test('a triple tap acts at its third lift and is never also a double tap', () => {
  const h = harness();
  h.tap();
  h.tap();
  h.tap(0);
  expect(h.seen).toEqual(['tripleTap']);
  h.wait(1000);
  expect(h.seen).toEqual(['tripleTap']);
});

test('a single tap and two taps too far apart in time do nothing', () => {
  const h = harness();
  h.tap(TIMING.gapMs + 50);
  h.tap(TIMING.gapMs + 50);
  h.wait(1000);
  expect(h.seen).toEqual([]);
});

test('two and three fingers make their own taps', () => {
  const h = harness();
  h.send(DOWN);
  h.send(POINTER_DOWN + 256);
  h.advanceTime(80);
  h.send(UP);
  h.send(DOWN);
  h.send(POINTER_DOWN + 256);
  h.send(POINTER_DOWN + 2 * 256);
  h.advanceTime(80);
  h.send(UP);
  expect(h.seen).toEqual(['twoFingerTap', 'threeFingerTap']);
});

test('a pen stroke never makes a gesture', () => {
  const h = harness();
  for (let i = 0; i < 3; i++) {
    h.send(DOWN, PEN);
    h.advanceTime(50);
    h.send(UP, PEN);
    h.advanceTime(100);
  }
  h.wait(1000);
  expect(h.seen).toEqual([]);
});

test('a palm touch while writing is ignored (palm guard)', () => {
  const h = harness();
  h.send(DOWN, PEN);
  h.send(MOVE, PEN, 520, 510);
  // The palm lands while the pen writes, and lifts in tap time, twice.
  h.tap(50);
  h.send(MOVE, PEN, 540, 520);
  h.tap(50);
  h.send(UP, PEN);
  h.wait(1000);
  expect(h.seen).toEqual([]);
  // Once the guard passed, a double tap acts again.
  h.tap();
  h.tap();
  h.wait(TIMING.gapMs);
  expect(h.seen).toEqual(['doubleTap']);
});

test('a page swipe triggers nothing and drops the taps before it', () => {
  const h = harness();
  h.tap();
  h.send(DOWN, FINGER, 900, 1200);
  h.advanceTime(40);
  h.send(MOVE, FINGER, 600, 1200);
  h.advanceTime(40);
  h.send(UP, FINGER, 300, 1200);
  h.wait(1000);
  expect(h.seen).toEqual([]);
});

test('a long press is no tap', () => {
  const h = harness();
  h.send(DOWN);
  h.advanceTime(TIMING.tapMaxMs + 1);
  h.send(UP);
  h.tap();
  h.wait(1000);
  expect(h.seen).toEqual([]);
});

const READY = `/shared/${READY_FILE}`;
const PERMISSIONS = ['plugin.permission.FILE:READ', 'plugin.permission.FILE:WRITE'];
const requirements = gestureRequirements('/shared', PERMISSIONS);

test('the requirement is data: the file permissions and the service by its ready file', () => {
  expect(requirements).toEqual([
    {kind: 'permission', permission: PERMISSIONS[0]},
    {kind: 'permission', permission: PERMISSIONS[1]},
    {kind: 'service', app: 'Handwriting Language', readyFile: READY},
  ]);
});

test('a missing service makes Gestures unavailable, with the step that fixes it', async () => {
  const check = await checkGestures(requirements, {
    has: async () => ({ok: true, value: true}),
    read: async () => ({ok: true, value: null}),
  });
  expect(check).toEqual({kind: 'unmet', missing: [requirements[2]]});
  expect(describeCheck(check).steps).toHaveLength(1);
});

test('a check the host cannot answer is failed, never met', async () => {
  const check = await checkGestures(requirements, {
    has: async () => ({ok: false, message: 'no answer'}),
    read: async () => ({ok: true, value: '{}'}),
  });
  expect(check.kind).toBe('failed');
});

function fakeHost(ready: boolean) {
  const clock = fakeTimers();
  const writes: {path: string; text: string}[] = [];
  let listener: ((touch: Touch) => void) | null = null;
  const host: GesturesHost = {
    has: async () => ({ok: true, value: true}),
    read: async () => ({ok: true, value: ready ? '{}' : null}),
    write: async (path, text) => {
      writes.push({path, text});
      return {ok: true, value: null};
    },
    onMotion: next => {
      listener = next;
      return {ok: true, value: () => (listener = null)};
    },
    requirements,
    requestPath: '/shared/tool-request.json',
    timers: clock.timers,
    now: () => 1234,
    log: () => {},
  };
  const touch = (action: number, eventTime: number) =>
    listener?.({action, x: 10, y: 10, toolType: FINGER, eventTime});
  return {host, writes, clock, touch, get listening() {
    return listener !== null;
  }};
}

test('with the service there, a double tap writes the request for pen 1', async () => {
  setSettings(DEFAULT_SETTINGS);
  const fake = fakeHost(true);
  const gestures = createGestures(fake.host);
  expect((await gestures.start()).kind).toBe('met');
  fake.touch(DOWN, 1000);
  fake.touch(UP, 1050);
  fake.clock.advance(100);
  fake.touch(DOWN, 1150);
  fake.touch(UP, 1200);
  fake.clock.advance(TIMING.gapMs);
  await Promise.resolve();
  expect(fake.writes).toHaveLength(1);
  expect(fake.writes[0].path).toBe('/shared/tool-request.json');
  expect(JSON.parse(fake.writes[0].text)).toEqual({
    id: '1234-1',
    at: 1234,
    gesture: 'doubleTap',
    action: 'pen1',
    button: 'pen_1',
  });
  gestures.stop();
  expect(fake.listening).toBe(false);
});

test('without the service, Gestures never listen', async () => {
  const fake = fakeHost(false);
  const gestures = createGestures(fake.host);
  expect((await gestures.start()).kind).toBe('unmet');
  expect(fake.listening).toBe(false);
});

test('a gesture mapped to nothing writes nothing', async () => {
  setSettings({...DEFAULT_SETTINGS, doubleTap: 'none'});
  const fake = fakeHost(true);
  const gestures = createGestures(fake.host);
  await gestures.start();
  fake.touch(DOWN, 1000);
  fake.touch(UP, 1050);
  fake.touch(DOWN, 1100);
  fake.touch(UP, 1150);
  fake.clock.advance(TIMING.gapMs);
  await Promise.resolve();
  expect(fake.writes).toEqual([]);
  setSettings(DEFAULT_SETTINGS);
});
