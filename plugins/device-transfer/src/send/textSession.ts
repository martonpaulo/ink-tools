/**
 * The «Send Text» view's state (#99): the lasso is read when the button is pressed, then the view
 * shows the recognised text with the receivers found, one tap each to send (#307), and «Cancel»,
 * or «No text recognized» with «Close». With no receiver found, the view shows Settings and its
 * «No LocalSend device found».
 */
import {Device} from '../localsend/protocol';

export type TextState =
  | {phase: 'idle'}
  | {phase: 'reading'}
  | {phase: 'ready'; text: string; devices: Device[]}
  | {phase: 'empty'}
  | {phase: 'sending'; text: string; devices: Device[]; to: Device};

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
  /** The receivers one search finds, the last pick first (#307); empty when none answers. */
  devices(): Promise<Device[]>;
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
  const devices = await deps.devices();
  if (devices.length === 0) {
    // The view shows Settings, with «No LocalSend device found», while the state is idle.
    setState(IDLE);
    return;
  }
  const text = await deps.read();
  setState(
    text === null || text.trim() === '' ? {phase: 'empty'} : {phase: 'ready', text, devices},
  );
}

/** A tap on one receiver of the list: sends once to it, then closes the view with the toast. */
export async function confirmTextSend(deps: TextDeps, device: Device): Promise<void> {
  if (state.phase !== 'ready') {
    return;
  }
  const {text, devices} = state;
  setState({phase: 'sending', text, devices, to: device});
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
