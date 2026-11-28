/**
 * The Gestures module at run time (#270): it checks its requirements, then listens to the motion
 * listener and turns each gesture into the request file Handwriting Language's `WritingWatcher`
 * reads in the shared folder, naming the toolbar button to press. A gesture mapped to nothing
 * writes nothing; a failed write is logged, and the next gesture writes again.
 */
import {createDetector, type DetectorTimers, type Touch} from './detect';
import {
  checkGestures,
  type GestureCheck,
  type GestureRequirement,
  type RequirementPorts,
} from './requirement';
import {getSettings, TOOLBAR_BUTTON, type Gesture} from './settings';

type Answer<T> = {ok: true; value: T} | {ok: false; message: string};

export type GesturesHost = RequirementPorts & {
  onMotion(listener: (touch: Touch) => void): Answer<() => void>;
  write(path: string, text: string): Promise<Answer<unknown>>;
  requirements: readonly GestureRequirement[];
  requestPath: string;
  timers: DetectorTimers;
  now(): number;
  log(line: string): void;
};

/** The request file's content: one press, with an id that changes on each gesture. */
export function requestText(gesture: Gesture, action: keyof typeof TOOLBAR_BUTTON, at: number, seq: number): string {
  return JSON.stringify({id: `${at}-${seq}`, at, gesture, action, button: TOOLBAR_BUTTON[action]});
}

export function createGestures(host: GesturesHost) {
  let stop: (() => void) | null = null;
  let seq = 0;
  let last: GestureCheck | null = null;
  const detector = createDetector(gesture => {
    const action = getSettings()[gesture];
    if (action === 'none') {
      return;
    }
    seq += 1;
    host
      .write(host.requestPath, requestText(gesture, action, host.now(), seq))
      .then(written => {
        host.log(written.ok ? `${gesture}: ${action}` : `${gesture}: request not written: ${written.message}`);
      })
      .catch(error => host.log(`${gesture}: request not written: ${String(error)}`));
  }, host.timers);

  return {
    /** Checks the requirements and listens only when every one is met. */
    async start(): Promise<GestureCheck> {
      last = await checkGestures(host.requirements, host);
      if (last.kind !== 'met') {
        host.log(`unavailable: ${last.kind === 'failed' ? last.reason : last.missing.map(need => need.kind === 'permission' ? need.permission : need.app).join(', ')}`);
        return last;
      }
      if (!stop) {
        const listening = host.onMotion(detector.motion);
        if (!listening.ok) {
          last = {kind: 'failed', reason: `motion listener: ${listening.message}`};
          host.log(last.reason);
          return last;
        }
        stop = listening.value;
      }
      return last;
    },
    stop(): void {
      if (stop) {
        stop();
        stop = null;
      }
      detector.reset();
    },
    /** The last check, null before the first start. */
    get check(): GestureCheck | null {
      return last;
    },
    get listening(): boolean {
      return stop !== null;
    },
  };
}
