/**
 * The helper's pause while the pen is on the page (#312): an edit waits for the pen to lift and stay
 * up for PEN_PAUSE.quietMs, at most PEN_PAUSE.waitMs, so a write never lands under a stroke being drawn. The
 * motion listener feeds it; the action channel runs one request at a time, so a request that
 * arrives meanwhile queues behind the one waiting.
 */

/** MotionEvent actions (Android `MotionEvent.ACTION_*`). */
const ACTION_DOWN = 0;
const ACTION_UP = 1;
const ACTION_MOVE = 2;
const ACTION_CANCEL = 3;

/** The quiet after the pen lifts, the longest wait, and the step between two looks, in ms. */
export const PEN_PAUSE = {quietMs: 400, waitMs: 20_000, stepMs: 100};

export type PenGateClock = {now(): number; sleep(ms: number): Promise<void>};

const realClock: PenGateClock = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

export class PenGate {
  private down = false;
  private liftedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly clock: PenGateClock = realClock) {}

  /** One motion event of the pen. */
  motion(event: {action: number}): void {
    if (event.action === ACTION_DOWN || event.action === ACTION_MOVE) {
      this.down = true;
    } else if (event.action === ACTION_UP || event.action === ACTION_CANCEL) {
      this.down = false;
      this.liftedAt = this.clock.now();
    }
  }

  /** True once the pen is up and quiet; false when it stayed down past `waitMs`. */
  async idle(waitMs: number = PEN_PAUSE.waitMs): Promise<boolean> {
    const started = this.clock.now();
    while (this.down || this.clock.now() - this.liftedAt < PEN_PAUSE.quietMs) {
      if (this.clock.now() - started >= waitMs) {
        return false;
      }
      await this.clock.sleep(PEN_PAUSE.stepMs);
    }
    return true;
  }
}
