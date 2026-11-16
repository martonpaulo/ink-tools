/**
 * The «Send Text» view's state (#99): the lasso is read when the button is pressed, then the view
 * shows the recognised text with «Send to <device>» and «Cancel», or «No text recognized» with
 * «Close». With no device chosen, the view shows Settings first, as a first send does.
 */
import {Device} from '../localsend/protocol';

export type TextState =
  | {phase: 'idle'}
  | {phase: 'reading'}
  | {phase: 'ready'; text: string; device: Device}
  | {phase: 'empty'}
  | {phase: 'sending'; text: string; device: Device};

const IDLE: TextState = {phase: 'idle'};
let state: TextState = IDLE;
const listeners = new Set<(next: TextState) => void>();

export function textState(): TextState {
  return state;
}

function setState(next: TextState): void {
  state = next;
  listeners.forEach(listener => listener(next));
}

/** Calls `listener` on each change; answers the function that stops it. */
export function onTextState(listener: (next: TextState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type TextDeps = {
  /** Asks for each declared permission; the first refused one, or null (#163). */
  permissions(): Promise<string | null>;
  /** The toast for a refused permission. */
  refused(permission: string): string;
  /** The lassoed handwriting as text; null when none was recognised or the call failed. */
  read(): Promise<string | null>;
  /** The chosen device, or null before one is chosen. */
  device(): Promise<Device | null>;
  /** Sends the text; answers the toast line. */
  send(device: Device, text: string): Promise<string>;
  closeView(): void;
  toast(line: string): void;
};

/** The button press: reads the lasso and shows what it found. A press while one runs is ignored. */
export async function startTextSend(deps: TextDeps): Promise<void> {
  if (state.phase !== 'idle') {
    return;
  }
  setState({phase: 'reading'});
  const missing = await deps.permissions();
  if (missing !== null) {
    setState(IDLE);
    deps.closeView();
    deps.toast(deps.refused(missing));
    return;
  }
  const device = await deps.device();
  if (device === null) {
    // The view shows Settings while the state is idle.
    setState(IDLE);
    return;
  }
  const text = await deps.read();
  setState(text === null || text.trim() === '' ? {phase: 'empty'} : {phase: 'ready', text, device});
}

/** «Send to <device>»: sends once, then closes the view with the toast. */
export async function confirmTextSend(deps: TextDeps): Promise<void> {
  if (state.phase !== 'ready') {
    return;
  }
  const {text, device} = state;
  setState({phase: 'sending', text, device});
  try {
    const line = await deps.send(device, text);
    deps.closeView();
    deps.toast(line);
  } finally {
    setState(IDLE);
  }
}

/** «Cancel» or «Close»: nothing is sent. */
export function cancelTextSend(deps: Pick<TextDeps, 'closeView'>): void {
  if (state.phase === 'sending') {
    return;
  }
  setState(IDLE);
  deps.closeView();
}
