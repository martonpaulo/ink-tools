/**
 * The pick of «Send Page» and «Send Selection» (#307): after the search, the view lists the
 * receivers found, and one tap sends to that one under the «Loading…» strip, then the toast says
 * how it went. Back or × closes the view, and nothing is sent.
 */
import {Device} from '../localsend/protocol';
import type {Outcome} from './sendPng';

/** What a send captures: the open page or the lasso selection. */
export type Capture = 'page' | 'selection';

export type PickState =
  | {phase: 'idle'}
  | {phase: 'picking'; capture: Capture; devices: Device[]};

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
  /** Runs the send under the «Loading…» strip, which closes the view when it ends. */
  run(task: () => Promise<Outcome>): Promise<Outcome>;
  toast(line: string): void;
  /** Holds a failure on the tablet on the Error state, with its reason and Close (#256). */
  fail(line: string): void;
  log(line: string): void;
  closeView(): void;
};

/** A tap on one receiver: sends once to it. A tap with no list open is ignored. */
export async function pickDevice(deps: PickDeps, device: Device): Promise<void> {
  if (state.phase !== 'picking') {
    return;
  }
  const {capture} = state;
  setState(IDLE);
  try {
    const outcome = await deps.run(() => deps.send(capture, device));
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

/** Back or ×: the list closes and nothing is sent. */
export function cancelPick(deps: Pick<PickDeps, 'closeView'>): void {
  setState(IDLE);
  deps.closeView();
}
