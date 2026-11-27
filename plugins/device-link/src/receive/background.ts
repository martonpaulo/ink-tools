/**
 * «Receive in the background» (#289): with the Settings switch on, the receiver starts at plugin
 * start, with no tap and no view, and places each item in the open note as it lands; with no note
 * open the item waits (`pending.ts`) for the next «Receive» tap or pen-up. One receiver only: a
 * tap while it runs shows its view, and the switch turned off stops it, also while it still starts.
 * A background receive that ends otherwise, by «Stop» or a failure, turns the switch off, with a log
 * line, a toast with the reason for a failure, and the open Settings view told, so the switch never
 * reads on for a receiver that is not there. Turned on while a tap's window runs, it starts when
 * that window ends.
 */
import {Relay} from '../native';
import {loadSettings, saveSettings} from '../settings/device';
import {mayHavePending} from './pending';
import {NoteHost, placePending} from './receive';
import {copy} from '../copy';
import {onReceiveState, receiveState, receivingInBackground, runBackgroundReceive, stopReceiving} from './session';

export type BackgroundDeps = {
  native: Relay;
  host: NoteHost;
  alias: string;
  /** Each item's line as it lands, for its toast. */
  onItem(line: string): void;
};

/** The open Settings view's switch, told when a background receive turns the saved switch off. */
const switchListeners = new Set<(on: boolean) => void>();

/** Calls `listener` with the saved switch when a background receive changes it; answers the stop. */
export function onBackgroundSwitch(listener: (on: boolean) => void): () => void {
  switchListeners.add(listener);
  return () => {
    switchListeners.delete(listener);
  };
}

/** Counts the switch's changes, so a receive the switch itself stopped leaves the saved switch alone. */
let switchChanges = 0;

/** Resolves once no receive runs. */
function untilIdle(): Promise<void> {
  if (receiveState() === 'idle') {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const stop = onReceiveState(next => {
      if (next === 'idle') {
        stop();
        resolve();
      }
    });
  });
}

/**
 * Starts the background receive when the switch is on; answers whether it runs, started now or
 * after the running tap's window ends.
 */
export async function startBackgroundIfOn(deps: BackgroundDeps): Promise<boolean> {
  const settings = await loadSettings(deps.native);
  if (!settings.background) {
    return false;
  }
  if (receivingInBackground()) {
    return true;
  }
  if (receiveState() !== 'idle') {
    // A tap's window holds the one receiver: the background one follows it.
    untilIdle()
      .then(() => startBackgroundIfOn(deps))
      .catch(error => deps.host.log(`receive: the background receive failed: ${error.message}`));
    return true;
  }
  const changes = switchChanges;
  runBackgroundReceive(deps.native, deps.host, deps.alias, deps.onItem)
    .then(
      end => (end === null ? undefined : ended(deps, changes, typeof end === 'string' ? null : end.problem.what)),
      // A run that threw ends as a failure: the switch still reads off.
      (error: Error) => {
        deps.host.log(`receive: the background receive failed: ${error.message}`);
        return ended(deps, changes, copy.receiveFailed);
      },
    )
    .catch(error => deps.host.log(`receive: the switch could not be turned off: ${error.message}`));
  return true;
}

/**
 * A background receive ended, by «Stop» (`failure` null) or a failure: unless the switch stopped
 * it, the switch turns off, a failure says why in a toast, and an open Settings view is told.
 */
async function ended(deps: BackgroundDeps, changes: number, failure: string | null): Promise<void> {
  deps.host.log(`receive: the background receive ended: ${failure ?? 'stopped'}`);
  if (changes !== switchChanges) {
    // The switch stopped it, and the switch's own save stands.
    return;
  }
  if (failure !== null) {
    deps.onItem(copy.backgroundStopped(failure));
  }
  // Nothing listens any more: the switch reads off, never a silent second path (Plan › Architecture).
  const current = await loadSettings(deps.native);
  if (current.background) {
    await saveSettings(deps.native, {...current, background: false});
  }
  switchListeners.forEach(listener => listener(false));
}

/** The Settings switch: saves it, then starts the background receive or stops it. */
export async function setBackground(deps: BackgroundDeps, on: boolean): Promise<boolean> {
  const saved = await saveSettings(deps.native, {...(await loadSettings(deps.native)), background: on});
  if (!saved) {
    return false;
  }
  if (on) {
    if (receivingInBackground()) {
      // Turned off and on again while the last one still stops: the new one follows it.
      await untilIdle();
    }
    await startBackgroundIfOn(deps);
  } else if (receivingInBackground()) {
    // Counted only for a stop this call makes, after its save: a run that ends otherwise turns the switch off.
    switchChanges += 1;
    await stopReceiving(deps.native);
  }
  return true;
}

/**
 * On a pen-up (#289): places what waits from a receive with no note open, once a note is open.
 * A pen-up comes with each stroke, so only the first one after a kept item reads the list.
 */
export async function placePendingOnPenUp(deps: BackgroundDeps): Promise<number> {
  if (!mayHavePending()) {
    return 0;
  }
  const dir = await deps.host.pluginDir();
  return dir.ok ? placePending(deps.native, deps.host, dir.value, deps.onItem) : 0;
}
