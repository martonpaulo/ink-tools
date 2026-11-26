/**
 * Joins the motion listener's hold to each pen-up (#253): strokes are handled one at a time, in
 * order, so a replace never overlaps the next one. A stroke is freed after it is handled unless
 * `keep` says another module still needs it (Smart Pen's pen router, #305).
 */
import {HoldTracker, type PenMotion} from './hold';
import {handleStroke, type Outcome, type SnapHost} from './snap';

/** The pen-up event may come before the motion listener's lift: wait this long for it (Snap). */
export const LIFT_WAIT_MS = 80;

export type Clock = {now(): number; sleep(ms: number): Promise<void>};

export function createRunner(host: SnapHost, hold: HoldTracker, clock: Clock) {
  let queue: Promise<unknown> = Promise.resolve();

  async function stillMs(): Promise<number | null> {
    const recent = hold.takeRecent(clock.now());
    if (recent !== null || !hold.penSeen) {
      return recent;
    }
    await Promise.race([clock.sleep(LIFT_WAIT_MS), hold.nextUp()]);
    return hold.takeRecent(clock.now());
  }

  async function one(
    element: object,
    keep: (outcome: Outcome) => boolean,
  ): Promise<Outcome> {
    // A thrown stroke counts as failed: its handwriting stays on the page.
    let outcome: Outcome = 'failed';
    try {
      const pen = {
        stillMs: await stillMs(),
        whenUp: () => (hold.penDown ? hold.nextUp() : Promise.resolve()),
      };
      outcome = await handleStroke(host, element, pen);
      return outcome;
    } finally {
      if (!keep(outcome)) {
        await host.recycleElement(element);
      }
    }
  }

  return {
    motion: (event: PenMotion) => hold.feed(event, clock.now()),
    /** Handles the stroke of one pen-up; resolves with its outcome once the earlier ones are done. */
    penUp(
      elements: object[],
      keep: (outcome: Outcome) => boolean = () => false,
    ): Promise<Outcome | null> {
      const first = elements[0];
      const run = queue.then(() => (first ? one(first, keep) : null));
      queue = run.catch(error => host.log(`stroke: ${String(error)}`));
      return run;
    },
  };
}
