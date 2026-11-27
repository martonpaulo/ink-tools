/**
 * Whether a receive is under way (#49), so the view shows «Ready to receive» instead of Settings
 * and a second tap on «Receive» starts nothing.
 */
import {Relay} from '../native';
import {NoteHost, ReceiveHeld, receiveOne} from './receive';

export type ReceiveState = 'idle' | 'starting' | 'ready';

let state: ReceiveState = 'idle';
const listeners = new Set<(next: ReceiveState) => void>();

export function receiveState(): ReceiveState {
  return state;
}

function setState(next: ReceiveState): void {
  state = next;
  listeners.forEach(listener => listener(next));
}

/**
 * A stop asked for the running receive (#289). A stop that reaches the native receiver before its
 * start is lost, since the start clears what is queued; the run stops again once it is ready.
 */
let stopAsked = false;

/** Stops the running receive, also one still starting («Stop», the switch turned off). */
export async function stopReceiving(native: Relay): Promise<void> {
  stopAsked = state !== 'idle';
  await native.stopReceive();
}

/** The receive is ready: a stop asked while it started is sent again. */
function ready(native: Relay): void {
  setState('ready');
  if (stopAsked) {
    native.stopReceive();
  }
}

/** Calls `listener` on each change; answers the function that stops it. */
export function onReceiveState(listener: (next: ReceiveState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * One receive window; answers its last line, the failure to hold (#438), or null when one is already running. Closing the view
 * never stops it (#289): the native receiver runs on its own thread and takes every item until the
 * window ends or «Stop» is pressed, `onItem` getting each item's line as it lands, so a tap on
 * «Receive» while one runs shows its view again, with «Stop».
 */
export async function runReceive(
  native: Relay,
  host: NoteHost,
  alias: string,
  showView: () => void,
  onItem: (line: string) => void = () => {},
): Promise<string | ReceiveHeld | null> {
  if (state !== 'idle') {
    showView();
    return null;
  }
  setState('starting');
  stopAsked = false;
  showView();
  try {
    return await receiveOne(native, host, alias, () => ready(native), undefined, undefined, onItem);
  } finally {
    stopAsked = false;
    setState('idle');
  }
}

/** True while the running receive is the background one (#289), started with no tap. */
let inBackground = false;

export function receivingInBackground(): boolean {
  return state !== 'idle' && inBackground;
}

/**
 * The background receive (#289): the same one receiver as a tap's, with no window end and no
 * view, until «Stop» or the switch turned off stops it. Answers null when a receive already runs,
 * else how it ended. A tap on «Receive» while it runs shows its view, with «Stop».
 */
export async function runBackgroundReceive(
  native: Relay,
  host: NoteHost,
  alias: string,
  onItem: (line: string) => void,
): Promise<string | ReceiveHeld | null> {
  if (state !== 'idle') {
    return null;
  }
  setState('starting');
  stopAsked = false;
  inBackground = true;
  try {
    return await receiveOne(native, host, alias, () => ready(native), undefined, null, onItem);
  } finally {
    stopAsked = false;
    inBackground = false;
    setState('idle');
  }
}
