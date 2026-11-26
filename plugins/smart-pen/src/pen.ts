/**
 * Smart Pen's one pen-up listener (#305). Smart Shapes and Real-Time Text both read each pen-up, so
 * the plugin listens once and routes it: Smart Shapes decides first, and a stroke it replaced with
 * a shape never reaches Real-Time Text, so a recognized shape is never also converted. A stroke
 * Smart Shapes kept goes on to Real-Time Text, which frees it; with Real-Time Text not listening,
 * Smart Shapes frees it. With neither module listening the device listener is removed.
 */
import {ok, type Result} from '@ink-tools/sn-adapter/official';
import {replaced, type Outcome} from './modules/shapes/snap';

type Listener = (elements: object[]) => void;

/** Smart Shapes' side: its runner's pen-up, which frees the stroke unless `keep` says not to. */
export type ShapesPenUp = (
  elements: object[],
  keep: (outcome: Outcome) => boolean,
) => Promise<Outcome | null>;

export type PenDevice = {
  onPenUp(listener: Listener): Result<() => void>;
  recycleElement(element: object): Promise<unknown>;
  log(line: string): void;
};

export function createPenRouter(device: PenDevice) {
  let shapes: ShapesPenUp | null = null;
  let text: Listener | null = null;
  let stop: (() => void) | null = null;

  function sync(): Result<true> {
    if ((shapes || text) && !stop) {
      const listening = device.onPenUp(elements => {
        route(elements).catch(error => device.log(`pen-up: ${String(error)}`));
      });
      if (!listening.ok) {
        return listening;
      }
      stop = listening.value;
    } else if (!shapes && !text && stop) {
      stop();
      stop = null;
    }
    return ok(true);
  }

  async function route(elements: object[]): Promise<void> {
    if (shapes) {
      const listening = text !== null;
      let outcome: Outcome | null = null;
      try {
        outcome = await shapes(elements, done => listening && !replaced(done));
      } catch (error) {
        device.log(`shapes: ${String(error)}`);
      }
      if (outcome !== null && replaced(outcome)) {
        return;
      }
      if (listening) {
        // Real-Time Text may have stopped while Smart Shapes decided: then the stroke is freed here.
        if (text) {
          text(elements);
        } else {
          elements.forEach(element =>
            device.recycleElement(element).catch(() => {}),
          );
        }
      }
      return;
    }
    if (text) {
      text(elements);
    } else {
      elements.forEach(element =>
        device.recycleElement(element).catch(() => {}),
      );
    }
  }

  return {
    /** Smart Shapes on (a runner's pen-up) or off (null). */
    setShapes(next: ShapesPenUp | null): Result<true> {
      shapes = next;
      return sync();
    },
    /** Real-Time Text's `onPenUp`, as its converter's host asks for one. */
    onTextPenUp(listener: Listener): Result<() => void> {
      text = listener;
      const synced = sync();
      if (!synced.ok) {
        text = null;
        return synced;
      }
      return ok(() => {
        if (text === listener) {
          text = null;
          sync();
        }
      });
    },
    /** For the tests: whether the device listener is on. */
    get listening(): boolean {
      return stop !== null;
    },
  };
}
