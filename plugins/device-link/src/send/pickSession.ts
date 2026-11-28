/**
 * The pick of «Send Page» and «Send Selection» (#307): after the search, the view lists the
 * receivers found, and one tap sends to that one under the «Loading…» strip, then the toast says
 * how it went. A selection first asks how to send: as text, in an editable preview, or as an image,
 * preselected by `preselect`. Back or × closes the view, and nothing is sent.
 */
import {Device} from '../localsend/protocol';
import type {Outcome} from './sendPng';
import type {SelectionRead, SendKind} from './selectionKind';

/** What a send captures: the open page, the lasso selection, or the whole open note (#504). */
export type Capture = 'page' | 'selection' | 'note';

export type PickState =
  | {phase: 'idle'}
  | {phase: 'picking'; capture: Capture; devices: Device[]}
  /** The selection is read for the choice, after the tap on its receiver. */
  | {phase: 'reading'; device: Device}
  /** Text or image for the selection; `text` is the preview as the person edited it. */
  | {phase: 'choosing'; device: Device; kind: SendKind; text: string};

const IDLE: PickState = {phase: 'idle'};
let state: PickState = IDLE;
const listeners = new Set<(next: PickState) => void>();

export function pickState(): PickState {
  return state;
}

function setState(next: PickState): void {
  state = next;
  listeners.forEach(listener => listener(next));
}

/** Calls `listener` on each change; answers the function that stops it. */
export function onPickState(listener: (next: PickState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The search found `devices` (never empty): the view lists them. */
export function startPick(capture: Capture, devices: Device[]): void {
  setState({phase: 'picking', capture, devices});
}

export type PickDeps = {
  /** Sends the capture to the picked receiver; answers its toast line or its failure. */
  send(capture: Capture, device: Device): Promise<Outcome>;
  /** Reads the lasso for the choice: its recognized text and the preselected kind. */
  read(): Promise<SelectionRead>;
  /** Sends the selection's text, as the person left it, to the picked receiver. */
  sendText(device: Device, text: string): Promise<Outcome>;
  /** Runs the send under the «Loading…» strip, which closes the view when it ends. */
  run(task: () => Promise<Outcome>): Promise<Outcome>;
  toast(line: string): void;
  /** Holds a failure on the tablet on the Error state, with its reason and Close (#256). */
  fail(line: string): void;
  log(line: string): void;
  closeView(): void;
};

/**
 * A tap on one receiver: a page is sent once to it; a selection is read, then waits for the choice
 * of text or image (`confirmChoice`). A tap with no list open is ignored.
 */
export async function pickDevice(deps: PickDeps, device: Device): Promise<void> {
  if (state.phase !== 'picking') {
    return;
  }
  const {capture} = state;
  if (capture === 'page') {
    setState(IDLE);
    await runSend(deps, () => deps.send(capture, device));
    return;
  }
  const reading: PickState = {phase: 'reading', device};
  setState(reading);
  let read: SelectionRead;
  try {
    read = await deps.read();
  } catch (error) {
    deps.log(`read the selection failed: ${String(error)}`);
    read = {text: '', kind: 'image'};
  }
  // Back or × while the lasso was read closed the view: nothing more.
  if (pickState() === reading) {
    setState({phase: 'choosing', device, ...read});
  }
}

/** The switch between text and image, at any time while the choice shows. */
export function chooseKind(kind: SendKind): void {
  if (state.phase === 'choosing') {
    setState({...state, kind});
  }
}

/** An edit of the text preview; the edited text is what a text send sends. */
export function editText(text: string): void {
  if (state.phase === 'choosing') {
    setState({...state, text});
  }
}

/** True when the choice can be sent: an image, or a text that is not blank. */
export function canSend(choice: Extract<PickState, {phase: 'choosing'}>): boolean {
  return choice.kind === 'image' || choice.text.trim() !== '';
}

/** «Send» on the choice: sends the selection once, as the chosen kind. */
export async function confirmChoice(deps: PickDeps): Promise<void> {
  if (state.phase !== 'choosing' || !canSend(state)) {
    return;
  }
  const {device, kind, text} = state;
  setState(IDLE);
  await runSend(deps, () =>
    kind === 'text' ? deps.sendText(device, text) : deps.send('selection', device),
  );
}

async function runSend(deps: PickDeps, send: () => Promise<Outcome>): Promise<void> {
  try {
    const outcome = await deps.run(send);
    if (outcome.kind === 'failed') {
      deps.fail(outcome.text);
    } else {
      deps.toast(outcome.text);
    }
  } catch (error) {
    // The strip holds the failure on its Error state.
    deps.log(`send failed: ${String(error)}`);
  }
}

/** Back or ×: the list or the choice closes and nothing is sent. */
export function cancelPick(deps: Pick<PickDeps, 'closeView'>): void {
  setState(IDLE);
  deps.closeView();
}
