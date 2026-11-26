/**
 * Whether a receive is under way (#49), so the view shows «Ready to receive» instead of Settings
 * and a second tap on «Receive» starts nothing.
 */
import {Relay} from '../native';
import {NoteHost, receiveOne} from './receive';

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

/** Calls `listener` on each change; answers the function that stops it. */
export function onReceiveState(listener: (next: ReceiveState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * One receive; answers the toast line, or null when one is already running. Closing the view never
 * stops it (#289): the native receiver runs on its own thread until an item lands, the window ends
 * or «Stop» is pressed, so a tap on «Receive» while one runs shows its view again, with «Stop».
 */
export async function runReceive(
  native: Relay,
  host: NoteHost,
  alias: string,
  showView: () => void,
): Promise<string | null> {
  if (state !== 'idle') {
    showView();
    return null;
  }
  setState('starting');
  showView();
  try {
    return await receiveOne(native, host, alias, () => setState('ready'));
  } finally {
    setState('idle');
  }
}
