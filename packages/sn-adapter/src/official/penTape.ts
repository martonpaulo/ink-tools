/**
 * Pen replay (#298): a pen tape recorded once from the real pen, played back over inkctl, so a device
 * round tests a pen-driven plugin without the owner's pen. The route is level 1 (registry
 * `pen.replay-route`): the host raises no pen-up event for an inserted stroke, so a replay inserts
 * each recorded stroke with the official `createElement` and `insertPageElements` and hands the new
 * element to the plugin's own listeners, the ones `onPenUp` and `onMotion` registered, through the
 * tap below. It tests our plugin logic, not the host's pen delivery: one real-pen smoke per release
 * stays.
 *
 * Recording is off by default and kept in memory only: `startPenRecording`, then `stopPenRecording`
 * answers the tape, which the plugin's action channel hands to inkctl.
 */
import {REGISTRY} from '../registry.generated';
import {insertPageElements, createElement, getCurrentPageNum} from './page';
import {saveCurrentNote} from './note';
import {rebuildStroke, type SavedStroke} from './elements';
import type {Motion, StrokeTimes} from './pen';
import {fail, ok, Result, THROWN_CODE} from './result';

/** The tape format's version; inkctl reads the same value from the registry. */
export const PEN_TAPE_VERSION: number = REGISTRY.penReplayRoute.tapeVersion;
/** The longest wait between two replayed events: a pause past it changes no decision of ours. */
export const REPLAY_MAX_GAP_MS = 2_500;
/** The most events one tape holds, so a recording left on cannot grow without end. */
export const PEN_TAPE_MAX_EVENTS = 6_000;

export type TapeMotion = {action: number; x: number; y: number; toolType: number};
/** A stroke as the pen wrote it: page pixels, and its times in ms from the tape's first stroke. */
export type TapeStroke = SavedStroke & {times: StrokeTimes | null};
export type TapeEvent =
  | {at: number; motion: TapeMotion}
  | {at: number; penUp: TapeStroke[]};
/** `at` counts ms from the tape's first event. */
export type PenTape = {version: number; events: TapeEvent[]};

export type ReplayCounts = {motions: number; penUps: number; strokes: number; listenerErrors: number};

type PenUpListener = (elements: object[]) => void;
type MotionListener = (motion: Motion) => void;

const penUpListeners = new Set<PenUpListener>();
const motionListeners = new Set<MotionListener>();
/** The recorded times of each replayed element, which `strokeTimes` answers first. */
const replayedTimes = new WeakMap<object, StrokeTimes | null>();

type Recording = {now: () => number; startedAt: number; firstStrokeAt: number | null; events: TapeEvent[]; dropped: number};
let recording: Recording | null = null;
/** The pen-up messages already recorded: each listener receives the same message (sn-plugin-lib 0.2.3). */
let recordedMessages = new WeakSet<object>();

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Adds the listener to the tap; answers its removal. */
export function tapPenUp(listener: PenUpListener): () => void {
  penUpListeners.add(listener);
  return () => penUpListeners.delete(listener);
}

export function tapMotion(listener: MotionListener): () => void {
  motionListeners.add(listener);
  return () => motionListeners.delete(listener);
}

/** The times of an element a replay inserted, or undefined for any other element. */
export function replayTimes(element: object): StrokeTimes | null | undefined {
  return replayedTimes.has(element) ? replayedTimes.get(element) : undefined;
}

export function penRecording(): boolean {
  return recording !== null;
}

/** Why a recording or a replay cannot run: the plugin's modules are all off, so nothing hears the pen. */
const NO_LISTENER = 'no pen listener is on: turn the plugin module on first';

/**
 * Starts a new tape, dropping any open one. With no pen listener on it fails, as the tape could
 * only stay empty: a recording reads the pen through the plugin's own listeners (#449).
 */
export function startPenRecording(now: () => number = Date.now): Result<true> {
  if (penUpListeners.size === 0 && motionListeners.size === 0) {
    return fail(THROWN_CODE, NO_LISTENER);
  }
  recording = {now, startedAt: now(), firstStrokeAt: null, events: [], dropped: 0};
  recordedMessages = new WeakSet<object>();
  return ok(true);
}

/** Ends the recording and answers its tape and how many events it could not keep; a failure when none was on. */
export function stopPenRecording(): Result<{tape: PenTape; dropped: number}> {
  if (!recording) {
    return fail(THROWN_CODE, 'no pen recording is on');
  }
  const {events, dropped} = recording;
  recording = null;
  return ok({tape: {version: PEN_TAPE_VERSION, events}, dropped});
}

function keep(event: TapeEvent): void {
  if (!recording) {
    return;
  }
  if (recording.events.length >= PEN_TAPE_MAX_EVENTS) {
    recording.dropped += 1;
    return;
  }
  recording.events.push(event);
}

export function recordMotion(motion: Motion): void {
  if (recording) {
    const {action, x, y, toolType} = motion;
    keep({at: recording.now() - recording.startedAt, motion: {action, x, y, toolType}});
  }
}

/**
 * The recording's time of a pen-up message, once per message: the first listener to receive it
 * records it; null when no recording is on or the message is recorded already.
 */
export function firstToRecord(message: object): number | null {
  if (!recording || recordedMessages.has(message)) {
    return null;
  }
  recordedMessages.add(message);
  return recording.now();
}

/**
 * Records one pen-up from its strokes, read by the caller in page pixels with their host times; a
 * stroke that did not read counts as dropped, so a tape never claims a stroke it lacks.
 */
export function recordPenUp(
  strokes: Result<TapeStroke>[],
  at: number,
): void {
  if (!recording) {
    return;
  }
  const kept: TapeStroke[] = [];
  for (const stroke of strokes) {
    if (!stroke.ok) {
      recording.dropped += 1;
      continue;
    }
    const {times} = stroke.value;
    if (times && recording.firstStrokeAt === null) {
      recording.firstStrokeAt = times.startedAt;
    }
    const base = recording.firstStrokeAt ?? 0;
    kept.push({
      ...stroke.value,
      times: times ? {startedAt: times.startedAt - base, endedAt: times.endedAt - base} : null,
    });
  }
  if (kept.length > 0) {
    keep({at: at - recording.startedAt, penUp: kept});
  }
}

function isPoint(value: unknown): boolean {
  const point = value as {x?: unknown; y?: unknown} | null;
  return point !== null && typeof point === 'object' && finite(point.x) && finite(point.y);
}

function strokeProblem(raw: unknown): string | null {
  const stroke = raw as Partial<TapeStroke> | null;
  if (stroke === null || typeof stroke !== 'object') {
    return 'a stroke is not an object';
  }
  if (!Array.isArray(stroke.points) || stroke.points.length === 0 || !stroke.points.every(isPoint)) {
    return 'a stroke needs points of numeric x and y';
  }
  if (!Array.isArray(stroke.pressures) || !stroke.pressures.every(finite)) {
    return 'a stroke needs numeric pressures';
  }
  if (!finite(stroke.penType) || !finite(stroke.penColor) || !finite(stroke.thickness)) {
    return 'a stroke needs a numeric penType, penColor and thickness';
  }
  const times = stroke.times as Partial<StrokeTimes> | null | undefined;
  if (times !== null && (typeof times !== 'object' || !finite(times?.startedAt) || !finite(times?.endedAt))) {
    return 'a stroke needs times of numeric startedAt and endedAt, or null';
  }
  return null;
}

function eventProblem(raw: unknown, previous: number): string | null {
  const event = raw as {at?: unknown; motion?: unknown; penUp?: unknown} | null;
  if (event === null || typeof event !== 'object' || !finite(event.at) || event.at < previous) {
    return 'each event needs an at in ms, never earlier than the one before';
  }
  if (event.motion !== undefined) {
    const motion = event.motion as Partial<TapeMotion> | null;
    return motion !== null && typeof motion === 'object' && finite(motion.action) && finite(motion.x) && finite(motion.y) && finite(motion.toolType)
      ? null
      : 'a motion needs a numeric action, x, y and toolType';
  }
  if (Array.isArray(event.penUp) && event.penUp.length > 0) {
    return event.penUp.map(strokeProblem).find(problem => problem !== null) ?? null;
  }
  return 'each event holds a motion or a non-empty penUp';
}

/** The tape in `text`, or why it cannot replay: nothing is inserted from a tape that fails here. */
export function parsePenTape(text: string): Result<PenTape> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return fail(THROWN_CODE, `the tape is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const tape = raw as Partial<PenTape> | null;
  if (tape === null || typeof tape !== 'object') {
    return fail(THROWN_CODE, 'the tape is not an object');
  }
  if (tape.version !== PEN_TAPE_VERSION) {
    return fail(THROWN_CODE, `the tape is version ${String(tape.version)}; this build replays version ${PEN_TAPE_VERSION}`);
  }
  if (!Array.isArray(tape.events) || tape.events.length === 0 || tape.events.length > PEN_TAPE_MAX_EVENTS) {
    return fail(THROWN_CODE, `the tape needs 1 to ${PEN_TAPE_MAX_EVENTS} events`);
  }
  let previous = 0;
  for (const event of tape.events) {
    const problem = eventProblem(event, previous);
    if (problem) {
      return fail(THROWN_CODE, problem);
    }
    previous = (event as TapeEvent).at;
  }
  return ok(tape as PenTape);
}

export interface ReplayHost {
  /** The open page, from 0. */
  page(): Promise<Result<number>>;
  /** A new stroke element holding `stroke`, inserted on `page`. */
  insert(stroke: SavedStroke, page: number): Promise<Result<object>>;
  /** Writes the open note to its file, so what the replay inserted is kept (#298). */
  save(): Promise<Result<boolean>>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

/** The tablet's side: createElement and insertPageElements, as rebuildStroke does for Undo Conversion. */
export const DEVICE_REPLAY: ReplayHost = {
  page: getCurrentPageNum,
  async insert(stroke, page) {
    const element = await rebuildStroke(stroke, createElement);
    if (!element.ok) {
      return element;
    }
    const inserted = await insertPageElements([element.value], page);
    return inserted.ok ? ok(element.value) : inserted;
  },
  save: saveCurrentNote,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

function deliver<T>(listeners: Set<(value: T) => void>, value: T): number {
  let errors = 0;
  // A copy: a listener may stop itself, as Real-Time Text does when it is turned off.
  for (const listener of [...listeners]) {
    try {
      listener(value);
    } catch {
      errors += 1;
    }
  }
  return errors;
}

/**
 * Plays the tape to the listeners on now, with the recorded gaps (each at most REPLAY_MAX_GAP_MS).
 * A motion goes to the motion listeners with this replay's times; a pen-up inserts its strokes on the
 * open page and hands the new elements to the pen-up listeners, each with its recorded times shifted
 * to now. A failed page read or insert stops the replay with why; it is never a partial success.
 */
export async function replayPenTape(tape: PenTape, host: ReplayHost = DEVICE_REPLAY): Promise<Result<ReplayCounts>> {
  if (penUpListeners.size === 0 && motionListeners.size === 0) {
    return fail(THROWN_CODE, NO_LISTENER);
  }
  const page = await host.page();
  if (!page.ok) {
    return page;
  }
  const counts: ReplayCounts = {motions: 0, penUps: 0, strokes: 0, listenerErrors: 0};
  const base = host.now();
  let previous = 0;
  let downTime = base;
  for (const event of tape.events) {
    await host.sleep(Math.min(REPLAY_MAX_GAP_MS, Math.max(0, event.at - previous)));
    previous = event.at;
    if ('motion' in event) {
      const eventTime = host.now();
      if (event.motion.action === 0) {
        downTime = eventTime;
      }
      counts.listenerErrors += deliver(motionListeners, {...event.motion, eventTime, downTime});
      counts.motions += 1;
      continue;
    }
    const elements: object[] = [];
    for (const {times, ...stroke} of event.penUp) {
      const inserted = await host.insert(stroke, page.value);
      if (!inserted.ok) {
        return fail(inserted.code, `stroke ${counts.strokes + 1}: ${inserted.message}`);
      }
      replayedTimes.set(inserted.value, times ? {startedAt: base + times.startedAt, endedAt: base + times.endedAt} : null);
      elements.push(inserted.value);
      counts.strokes += 1;
    }
    // An inserted stroke stays out of the note file until a save (docs/supernote.md, #296), and a
    // conversion's reload draws the page from that file. Saved before the listeners run, the
    // replayed stroke is in the file before any listener's write or reload, and after a close (#298).
    const saved = await host.save();
    if (!saved.ok || saved.value !== true) {
      return fail(saved.ok ? THROWN_CODE : saved.code, `pen-up ${counts.penUps + 1}: the note did not save: ${saved.ok ? 'answered false' : saved.message}`);
    }
    counts.listenerErrors += deliver(penUpListeners, elements);
    counts.penUps += 1;
  }
  return ok(counts);
}

/** For the tests: an empty tap and no recording. */
export function resetPenTapForTests(): void {
  penUpListeners.clear();
  motionListeners.clear();
  recording = null;
  recordedMessages = new WeakSet<object>();
}
