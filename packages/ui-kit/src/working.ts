/**
 * The «Loading…» of a no-view action (#103, #287, docs/plugin-scope.md › Design direction): while a
 * lasso or toolbar button with `showType: 0` works, the plugin opens its own view, which shows the
 * native loading box centred over the note, and closes it when the action
 * succeeds. A failure keeps the view open on the Error state, with its reason and Close, until the
 * owner closes it (#255); a run past the timeout replaces the strip with a toast.
 *
 * The plugin view is the only surface the plugin can both show and clear on command
 * (docs/supernote.md › «What a plugin can show while a no-view action runs»). The SDK calls are
 * the plugin's ports, so this file never imports `sn-plugin-lib` (docs/architecture.md › Layer rules).
 */
import {Problem, reasonOf} from './problem';

/** Which state a held problem shows: `Needs` after a check, `ErrorView` after a failure (#256). */
export type HeldState = 'needs' | 'error';

/** The strip's one line, in the owner's words (A7). */
export const WORKING_TEXT = 'Loading…';

/** How long a run may keep the strip before it is cleared with the timeout toast. */
export const WORKING_TIMEOUT_MS = 60000;

export type WorkingPorts = {
  /** Opens the plugin view (`showPluginView`). */
  show: () => Promise<unknown>;
  /** Closes the plugin view (`closePluginView`). */
  close: () => Promise<unknown>;
  /** A short message over the note (`ToastAndroid`, docs/supernote.md). */
  toast: (text: string) => void;
  log: (line: string) => void;
  copy: {
    /** What failed, the Error state's title; the error's message is its reason. */
    failed: string;
    /** Shown when the strip is cleared at the timeout while the action still runs. */
    timeout: string;
  };
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type WorkingRun = {
  /**
   * Milliseconds before the strip shows; 0 shows it at once. A JS timer may not fire while no
   * view is open (Ink2Pic brief section 3.3), so a delayed strip may never show.
   * shortcut: a later strip rests on a timer; when the Manta shows timers stop with no view, show
   * the strip at once for every action that may pass the delay.
   */
  showAfterMs?: number;
  timeoutMs?: number;
};

export type Working = {
  /**
   * Runs `task` with the strip on. Resolves with the task's value, or rejects with its error after
   * the strip is gone and the failure is held as `problem`, the view left open.
   */
  run: <T>(task: () => Promise<T>, options?: WorkingRun) => Promise<T>;
  /**
   * The running action opens the plugin's own screen (Settings, a permission question): the strip
   * goes, and the end of the run leaves the view open.
   */
  handOver: () => void;
  isWorking: () => boolean;
  /** The failure the view shows until `dismiss`, or null. */
  problem: () => Problem | null;
  /** Which state the held problem shows, or null when none is held. */
  heldState: () => HeldState | null;
  /**
   * Holds `problem` with no throw (#256): a known failure or a check a run answers as a value. The
   * view opens on it, or stays open when a run's strip shows now, until `dismiss`.
   */
  hold: (problem: Problem, state?: HeldState) => void;
  /** Clears the held failure and closes the view, as the Error state's Close does. */
  dismiss: () => Promise<void>;
  /** Calls `listener` on each change of `isWorking` or `problem`; the value is the unsubscribe call. */
  subscribe: (listener: (working: boolean) => void) => () => void;
};

export function createWorking(ports: WorkingPorts): Working {
  const setTimer =
    ports.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer =
    ports.clearTimer ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const listeners = new Set<(working: boolean) => void>();
  /** The runs whose strip shows now. */
  const showing = new Set<number>();
  let next = 0;
  let handedOver = false;
  let held: Problem | null = null;
  let heldAs: HeldState = 'error';

  const notify = () => {
    const working = showing.size > 0;
    listeners.forEach(listener => listener(working));
  };
  const show = (id: number) => {
    const first = showing.size === 0;
    showing.add(id);
    if (first) {
      handedOver = false;
      // A new run replaces a held failure: its own ending decides what the view does next.
      held = null;
      notify();
      ports.show().catch(error => ports.log(`strip: show failed: ${error}`));
    }
  };
  /** Clears run `id`'s strip; the last one closes the view, unless it was handed over. */
  const clear = async (id: number) => {
    if (!showing.delete(id) || showing.size > 0) {
      return;
    }
    notify();
    if (handedOver) {
      handedOver = false;
      return;
    }
    // A held failure keeps the view open for the Error state.
    if (held !== null) {
      return;
    }
    try {
      await ports.close();
    } catch (error) {
      closeFailed(error);
    }
  };
  const closeFailed = (error: unknown) => ports.log(`strip: close failed: ${error}`);

  return {
    run: async (task, options = {}) => {
      const id = ++next;
      const delay = options.showAfterMs ?? 0;
      let timeout: unknown = null;
      let ended = false;
      let timedOut = false;
      let started = false;
      const start = () => {
        if (ended) {
          return;
        }
        started = true;
        show(id);
        // The view is open now, so its timers run.
        timeout = setTimer(() => {
          timeout = null;
          if (showing.has(id)) {
            timedOut = true;
            ports.log('strip: still working at the timeout');
            clear(id).then(() => ports.toast(ports.copy.timeout));
          }
        }, options.timeoutMs ?? WORKING_TIMEOUT_MS);
      };
      const later = delay > 0 ? setTimer(start, delay) : null;
      if (delay <= 0) {
        start();
      }
      const end = async () => {
        ended = true;
        if (later !== null) {
          clearTimer(later);
        }
        if (timeout !== null) {
          clearTimer(timeout);
        }
        await clear(id);
      };
      try {
        const value = await task();
        await end();
        return value;
      } catch (error) {
        ports.log(`strip: the action failed: ${error}`);
        // The view closed at the timeout, so that failure has only the toast left.
        if (!timedOut) {
          held = {what: ports.copy.failed, reason: reasonOf(error)};
          heldAs = 'error';
        }
        await end();
        if (timedOut) {
          ports.toast(ports.copy.failed);
        } else {
          notify();
          if (!started) {
            // A delayed strip that never showed: open the view for the Error state.
            ports.show().catch(failure => ports.log(`strip: show failed: ${failure}`));
          }
        }
        throw error;
      }
    },
    handOver: () => {
      if (showing.size > 0) {
        handedOver = true;
        showing.clear();
        notify();
      }
    },
    isWorking: () => showing.size > 0,
    problem: () => held,
    heldState: () => (held === null ? null : heldAs),
    hold: (problem, state = 'error') => {
      const open = held !== null;
      held = problem;
      heldAs = state;
      notify();
      // A run's strip keeps the view open, and its ending then leaves it on the held state.
      if (showing.size === 0 && !open) {
        ports.show().catch(error => ports.log(`strip: show failed: ${error}`));
      }
    },
    dismiss: async () => {
      if (held === null) {
        return;
      }
      held = null;
      notify();
      if (showing.size === 0) {
        await ports.close().catch(closeFailed);
      }
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
