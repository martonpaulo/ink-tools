/**
 * Finger gestures from the plugin's motion listener (#270): a double tap, a triple tap, a
 * two-finger tap and a three-finger tap. A pen motion (any tool but a finger) never makes a
 * gesture, and a finger touch that starts within the palm guard after the pen's last motion is
 * ignored, so a palm resting while writing does nothing. A touch that moves past the slop, such as
 * a page swipe, or lasts too long is no tap and drops the taps counted so far.
 *
 * A double tap waits `gapMs` after its second tap, so a third one can still make a triple tap; a
 * triple tap and a several-finger tap act at their last lift.
 *
 * shortcut: the timings and the slop are [inference] from Android's tap defaults (ViewConfiguration:
 * 300 ms double-tap gap, about 2 mm of slop); the device round of #270 measures them. That the
 * listener reports ACTION_POINTER_DOWN for a second finger is [inference] too, read by the same round.
 */
import type {Gesture} from './settings';

/** Android MotionEvent actions and tool types (developer.android.com, MotionEvent). */
const DOWN = 0;
const UP = 1;
const MOVE = 2;
const CANCEL = 3;
const POINTER_DOWN = 5;
export const FINGER = 1;
/** The taps of the longest sequence, a triple tap, which acts at its last lift. */
const MOST_TAPS = 3;
/** The gesture each count of fingers down at once makes; one finger counts taps instead. */
const FINGER_TAPS: readonly (Gesture | null)[] = [null, null, 'twoFingerTap', 'threeFingerTap'];

export type Touch = {
  action: number;
  x: number;
  y: number;
  toolType: number;
  eventTime: number;
  /** MotionEvent's pointer count, when the host passes it. */
  pointerCount?: number;
};

export type Timing = {
  /** The longest press that still counts as a tap. */
  tapMaxMs: number;
  /** The longest pause between two taps of one double or triple tap. */
  gapMs: number;
  /** After the pen's last motion, finger touches are ignored this long. */
  palmGuardMs: number;
  /** A touch that moves farther than this, in screen pixels, is no tap. */
  slopPx: number;
  /** The next tap of a double or triple tap lands at most this far from the first. */
  tapRadiusPx: number;
};

/** About 2 mm of slop and 10 mm between taps at the Manta's 11.8 px per mm (docs/supernote.md). */
export const TIMING: Timing = {
  tapMaxMs: 250,
  gapMs: 300,
  palmGuardMs: 600,
  slopPx: 24,
  tapRadiusPx: 120,
};

export type DetectorTimers = {
  set(run: () => void, ms: number): unknown;
  clear(timer: unknown): void;
};

type Press = {
  downAt: number;
  x: number;
  y: number;
  pointers: number;
  moved: boolean;
  guarded: boolean;
};

type Taps = {count: number; x: number; y: number};

const distance = (a: {x: number; y: number}, b: {x: number; y: number}) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function createDetector(
  onGesture: (gesture: Gesture) => void,
  timers: DetectorTimers,
  timing: Timing = TIMING,
) {
  let lastPenAt = Number.NEGATIVE_INFINITY;
  let press: Press | null = null;
  let taps: Taps | null = null;
  let waiting: unknown = null;

  function dropTaps(): void {
    if (waiting !== null) {
      timers.clear(waiting);
      waiting = null;
    }
    taps = null;
  }

  function lifted(touch: Touch, done: Press): void {
    const tap =
      !done.guarded &&
      !done.moved &&
      touch.eventTime - done.downAt <= timing.tapMaxMs;
    if (!tap) {
      dropTaps();
      return;
    }
    if (done.pointers > 1) {
      dropTaps();
      const gesture = FINGER_TAPS[done.pointers] ?? null;
      if (gesture) {
        onGesture(gesture);
      }
      return;
    }
    const count = (taps?.count ?? 0) + 1;
    dropTaps();
    if (count >= MOST_TAPS) {
      onGesture('tripleTap');
      return;
    }
    taps = {count, x: done.x, y: done.y};
    if (count === MOST_TAPS - 1) {
      waiting = timers.set(() => {
        waiting = null;
        taps = null;
        onGesture('doubleTap');
      }, timing.gapMs);
    } else {
      waiting = timers.set(() => {
        waiting = null;
        taps = null;
      }, timing.gapMs);
    }
  }

  return {
    motion(touch: Touch): void {
      if (touch.toolType !== FINGER) {
        lastPenAt = touch.eventTime;
        press = null;
        dropTaps();
        return;
      }
      // The low byte is the action, the next one the pointer index (MotionEvent.ACTION_MASK).
      const action = touch.action % 0x100;
      if (action === DOWN) {
        const guarded = touch.eventTime - lastPenAt < timing.palmGuardMs;
        if (guarded || (taps && distance(touch, taps) > timing.tapRadiusPx)) {
          dropTaps();
        } else if (waiting !== null) {
          // The next tap of a sequence: its gap timer stops, the lift decides.
          timers.clear(waiting);
          waiting = null;
        }
        press = {
          downAt: touch.eventTime,
          x: touch.x,
          y: touch.y,
          pointers: Math.max(1, touch.pointerCount ?? 1),
          moved: false,
          guarded,
        };
      } else if (press && action === POINTER_DOWN) {
        press.pointers = Math.max(press.pointers + 1, touch.pointerCount ?? 0);
      } else if (press && action === MOVE) {
        if (distance(touch, press) > timing.slopPx) {
          press.moved = true;
        }
      } else if (action === CANCEL) {
        press = null;
        dropTaps();
      } else if (press && action === UP) {
        const done = press;
        press = null;
        lifted(touch, done);
      }
    },
    /** Forgets every touch and stops the gap timer, as the module stops. */
    reset(): void {
      press = null;
      dropTaps();
    },
  };
}
