/**
 * One receive (#49): the tablet is a LocalSend receiver for its window, and each item lands in the
 * open note, floating and selected, for the person to move (#289). Text becomes a text box; a PNG or JPEG goes
 * through `insertImage`, which the host shows as its own floating selection, and is then lassoed
 * by its rect (#196); a PDF becomes a new note (#143, `pdfNote.ts`).
 */
import {freeRect, inkUnderRect, isFree, OccupiedRead, PLACE_GAP} from '@ink-tools/ink-core';
import {fail, Result, TextBoxInput, TIMEOUT_CODE} from '@ink-tools/sn-adapter/official';
import type {HeldState, Problem} from '@ink-tools/ui-kit';
import {copy} from '../copy';
import {
  announce,
  announceAnswer,
  decideOffer,
  LOCALSEND_PORT,
  MULTICAST_GROUP,
  receiverInfo,
  Taken,
} from '../localsend/protocol';
import {Relay} from '../native';
import {refusedProblem} from '../permissions';
import {tempDir} from '../send/sendPng';
import {NoteFiles, pdfToNote} from './pdfNote';
import {addPending, loadPending, PendingItem, savePending} from './pending';
import {handleRemote} from './remote';

/** How long one tap on «Receive» keeps the tablet visible. */
export const RECEIVE_WINDOW_MS = 2 * 60 * 1000;

/** The longest single wait of a background receive, which has no window end (#289). */
export const BACKGROUND_WAIT_MS = 60 * 1000;

/**
 * How long a read of the open page's size may take. A text received with no note open hung the
 * receive loop: the item was lost, every later offer got the receiver's 500, and Stop did nothing
 * (measured twice on the Manta, 2026-11-27, #289); no «no note open» line was logged, so the
 * page read is the call that never answered [inference]. A page read past it counts as no note
 * open, and the item waits for the next one.
 * shortcut: 4.5 s is a guess well above a page read with a note open; measure that read and set it.
 */
export const PAGE_READ_MS = 4500;

export const TEXT_FONT_SIZE = 32;
const LINE_HEIGHT = Math.round(TEXT_FONT_SIZE * 1.5);
/** A character's width as a share of the font size, as Ink2Pic measures it. */
const CHAR_WIDTH = 0.55;

type Rect = TextBoxInput['rect'];
export type Size = {width: number; height: number};

/** The note side of a receive, so the test runs it without a device. */
export type NoteHost = NoteFiles & {
  /** Asks for each declared permission; the first refused one, or null (#163). */
  permissions(): Promise<string | null>;
  pluginDir(): Promise<Result<string>>;
  /** Which page is open (note path and page), so a second text goes below the first (#49). */
  pageKey(): Promise<Result<string>>;
  /** The open page's strokes, text boxes and pictures, so a text avoids them (#199, #152). */
  occupied(): Promise<Result<OccupiedRead>>;
  /** One line for the plugin's log. */
  log(line: string): void;
  closeView(): Promise<unknown>;
  insertText(box: TextBoxInput): Promise<Result<boolean>>;
  lasso(rect: Rect): Promise<Result<boolean>>;
  insertImage(path: string): Promise<Result<boolean>>;
  /** A picture file's own size in pixels, for the rect the host places it at (#196). */
  imageSize(path: string): Promise<Result<Size>>;
  /** Waits `ms`, so a page read can retry while the host commits a floating picture (#196). */
  wait(ms: number): Promise<void>;
};

/**
 * The text box: half the page wide, centred, from 15% of the page down, as tall as its wrapped
 * lines and never past the page's bottom. With `after`, the bottom of the text received before
 * on this page, it starts one line below it, or at the top again when it would not fit (#49).
 */
export function textBox(page: Size, text: string, after: number | null = null): Rect {
  const width = Math.round(page.width / 2);
  const left = Math.round((page.width - width) / 2);
  const first = Math.round(page.height * 0.15);
  const perLine = Math.max(1, Math.floor(width / (TEXT_FONT_SIZE * CHAR_WIDTH)));
  const lines = text
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
  const below = after === null ? first : after + LINE_HEIGHT;
  const top = below + lines * LINE_HEIGHT <= page.height - LINE_HEIGHT ? below : first;
  const bottom = Math.min(page.height - LINE_HEIGHT, top + lines * LINE_HEIGHT);
  return {left, top, right: left + width, bottom: Math.max(bottom, top + LINE_HEIGHT)};
}

/**
 * `host` with a page-size read that gives up after {@link PAGE_READ_MS}, on the host's own wait:
 * a JS timer never fires while the view is closed (#289). The device host is made with it
 * (`src/run.ts`); a test host whose wait ends at once is not, as every read would lose that race.
 */
export function boundedPage<H extends NoteHost>(host: H): H {
  return {
    ...host,
    pageSize: () => {
      let answered = false;
      const read = host.pageSize().then(size => {
        answered = true;
        return size;
      });
      const late = host.wait(PAGE_READ_MS).then(() => {
        if (!answered) {
          host.log(`receive: no page size in ${PAGE_READ_MS} ms: no note open`);
        }
        return fail(TIMEOUT_CODE, `no page size in ${PAGE_READ_MS} ms`);
      });
      return Promise.race([read, late]);
    },
  };
}

/** The last text this run placed: its page and its box's bottom. */
let lastText: {page: string; bottom: number} | null = null;

export function resetPlacedForTests(): void {
  lastText = null;
  keptImages = [];
}

/**
 * The text box moved into the first free band that is tall enough (#199), through ink-core's
 * free placement that Word Lookup uses (#152): down the page from where `textBox` put it, past
 * each stroke, text box or picture it crosses, else upwards. `free` is false when the page has no
 * such band, or its ink is unknown, and the box stays where `textBox` put it.
 */
export function freeTextBox(
  page: Size,
  text: string,
  after: number | null,
  occupied: readonly Rect[] | null,
): {rect: Rect; free: boolean} {
  const rect = textBox(page, text, after);
  if (occupied === null) {
    return {rect, free: false};
  }
  if (isFree(rect, occupied)) {
    return {rect, free: true};
  }
  // An empty mark just above the box, so freeRect's first try is the box's own place.
  const mark = {...rect, top: rect.top - PLACE_GAP, bottom: rect.top - PLACE_GAP};
  const moved = freeRect(mark, rect, page, occupied);
  return moved ? {rect: moved, free: true} : {rect, free: false};
}

async function placeText(host: NoteHost, text: string): Promise<string> {
  const size = await host.pageSize();
  if (!size.ok) {
    return copy.noNote;
  }
  const key = await host.pageKey();
  const page = key.ok ? key.value : null;
  const after = page !== null && lastText?.page === page ? lastText.bottom : null;
  const occupied = await host.occupied();
  const read = occupied.ok ? occupied.value : null;
  // A partial read places at the usual place, never by what was read (#152): placed by part of a
  // full page, a box landed over the person's ink.
  const known = read?.complete ? read.rects : null;
  const {rect, free} = freeTextBox(size.value, text, after, known);
  if (!free) {
    host.log(
      known === null
        ? `receive: ${read === null ? "the page's ink is not known" : "only part of the page's ink is known"}: the text goes at its usual place`
        : `receive: no free band of ${rect.bottom - rect.top} px: the text goes over the ink`,
    );
  }
  await host.closeView();
  const inserted = await host.insertText({text, rect, fontSize: TEXT_FONT_SIZE});
  if (!inserted.ok || inserted.value !== true) {
    return copy.insertFailed;
  }
  lastText = page === null ? null : {page, bottom: rect.bottom};
  // Selected, so the person moves it at once, but never with the person's ink in it (#168).
  const ink = inkUnderRect(rect, read);
  if (ink) {
    host.log(`receive: lassoElements skipped, ${ink}`);
  } else {
    // A failed lasso still leaves the text in place.
    await host.lasso(rect);
  }
  return copy.receivedText;
}

/**
 * The rect of the one picture the insert added: the rect in `after` that `before` lacks, or null
 * when either read failed or is partial, or when the insert added none or more than one (#196).
 */
export function addedRect(before: OccupiedRead | null, after: OccupiedRead | null): Rect | null {
  if (!before?.complete || !after?.complete) {
    return null;
  }
  const same = (a: Rect, b: Rect) =>
    a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
  const added = after.rects.filter(rect => !before.rects.some(old => same(old, rect)));
  return added.length === 1 ? added[0] : null;
}

/**
 * The received picture this run placed last, kept on disk until the next receive (#196): the host's
 * floating `insertImage` selection may still read it when the note saves it, and a photo whose file
 * was removed at once was gone after Back on the beta 7 round.
 * shortcut: one file stays after the last receive of a run until the next run's first receive.
 */
/** The pictures the last receive placed: kept until the next receive, as the host may still read one (#196). */
let keptImages: string[] = [];

async function removeKeptImages(native: Relay): Promise<void> {
  for (const path of keptImages.splice(0)) {
    await native.remove(path);
  }
}

/** How often, and how long, the page is read again until the inserted picture is on it (#196). */
export const PLACED_RETRY_MS = 250;
export const PLACED_WAIT_MS = 3000;

/**
 * The rect the host places an inserted picture at: its own size, scaled down to fit the page,
 * centred, rounded down (measured on the tablet: a 923 x 1200 JPEG on a 1920 x 2560 page landed at
 * `[498, 680, 1421, 1880]`, #196).
 * shortcut: the scale-down rounding is not measured; upgrade when a picture larger than the page
 * lands somewhere else.
 */
export function centredRect(page: Size, picture: Size): Rect {
  const scale = Math.min(1, page.width / picture.width, page.height / picture.height);
  const width = Math.floor(picture.width * scale);
  const height = Math.floor(picture.height * scale);
  const left = Math.floor((page.width - width) / 2);
  const top = Math.floor((page.height - height) / 2);
  return {left, top, right: left + width, bottom: top + height};
}

/**
 * Reads the page again, every `PLACED_RETRY_MS` up to `PLACED_WAIT_MS`, until it holds the one
 * rect the insert added: the host commits a floating `insertImage` picture only later, and a read
 * about 120 ms after the insert still held 0 elements on beta 8 (#196).
 */
async function waitForAdded(host: NoteHost, before: OccupiedRead | null): Promise<Rect | null> {
  if (!before?.complete) {
    return null;
  }
  for (let waited = 0; ; waited += PLACED_RETRY_MS) {
    const after = await host.occupied();
    const rect = addedRect(before, after.ok ? after.value : null);
    if (rect !== null || waited >= PLACED_WAIT_MS) {
      return rect;
    }
    await host.wait(PLACED_RETRY_MS);
  }
}

/** The centred rect the host chose for the picture, or null when its size or the page's is unknown. */
async function expectedRect(host: NoteHost, path: string): Promise<Rect | null> {
  const [page, picture] = [await host.pageSize(), await host.imageSize(path)];
  return page.ok && picture.ok ? centredRect(page.value, picture.value) : null;
}

/**
 * Places a received PNG or JPEG with `insertImage`, then lassoes it by its rect, found as the one
 * rect the insert added to the page once the host commits it, else the centred rect the host
 * places it at, so another plugin's lasso row (Image Editing's «Document») acts on it: the host's
 * floating selection is no lasso for the plugin API (error 904, #196).
 * Under #168's rule, never when the page's ink is not all known or crosses the picture.
 */
async function placeImage(native: Relay, host: NoteHost, path: string): Promise<string> {
  const before = await host.occupied();
  await host.closeView();
  const inserted = await host.insertImage(path);
  if (!inserted.ok || inserted.value !== true) {
    await native.remove(path);
    return copy.insertFailed;
  }
  keptImages.push(path);
  const beforeRead = before.ok ? before.value : null;
  let rect = await waitForAdded(host, beforeRead);
  if (rect === null && beforeRead?.complete) {
    rect = await expectedRect(host, path);
    if (rect !== null) {
      host.log(`receive: the placed picture is not on the page after ${PLACED_WAIT_MS} ms: lasso its centred rect`);
    }
  }
  if (rect === null) {
    host.log('receive: lassoElements skipped, the placed picture is not found on the page');
    return copy.receivedImage;
  }
  const ink = inkUnderRect(rect, beforeRead);
  if (ink) {
    host.log(`receive: lassoElements skipped, ${ink}`);
    return copy.receivedImage;
  }
  const lassoed = await host.lasso(rect);
  if (!lassoed.ok || lassoed.value !== true) {
    // The picture stays placed; only the lasso is missing.
    host.log('receive: lassoElements did not lasso the placed picture');
  }
  return copy.receivedImage;
}

function refusedLine(taken: Taken | null): string {
  if (taken === null || taken.kind !== 'refuse') {
    return copy.nothingArrived;
  }
  switch (taken.reason) {
    case 'type':
      return copy.notAnImage;
    case 'size':
      return copy.tooLarge;
    case 'shape':
      return copy.refusedOffer;
  }
}

/** A receive that failed: the view holds it in ui-kit's Error or Needs state (#438). */
export type ReceiveHeld = {problem: Problem; state: HeldState};

/** The Error state of a receiver that failed; the details go to the log. */
const RECEIVE_FAILED: ReceiveHeld = {problem: {what: copy.receiveFailed}, state: 'error'};

/**
 * Receives and places each item that comes in the window, until the window ends or «Stop»; answers
 * the last item's line, or, when none landed, why. `onReady` runs once the tablet is visible, and
 * `onItem` with each item's line as it lands. A refused offer keeps the window open for the next
 * one. A closed receive took only its first item before (device round 11, #289). A failure the view
 * holds (#438) is answered instead of a line. `windowMs` null is the background receive: no window
 * end, only «Stop» or the switch turned off ends it (#289). Items the receive cannot place, with
 * no note open, wait (`pending.ts`), and the ones waiting from before are placed first.
 */
export async function receiveOne(
  native: Relay,
  host: NoteHost,
  alias: string,
  onReady: () => void = () => {},
  now: () => number = Date.now,
  windowMs: number | null = RECEIVE_WINDOW_MS,
  onItem: (line: string) => void = () => {},
): Promise<string | ReceiveHeld> {
  // Before the first file, note or network call (#163): without it every file call fails.
  const missing = await host.permissions();
  if (missing !== null) {
    return {problem: refusedProblem(missing), state: 'needs'};
  }
  const dir = await host.pluginDir();
  if (!dir.ok) {
    return RECEIVE_FAILED;
  }
  const fingerprint = await native.identity(dir.value);
  if (!fingerprint.ok) {
    return RECEIVE_FAILED;
  }
  const self = {alias, fingerprint: fingerprint.value};
  const started = await native.startReceive(
    dir.value,
    tempDir(dir.value),
    LOCALSEND_PORT,
    MULTICAST_GROUP,
    receiverInfo(self),
    announce(self),
    announceAnswer(self),
  );
  if (!started.ok) {
    return RECEIVE_FAILED;
  }
  await removeKeptImages(native);
  onReady();
  let refused: Taken | null = null;
  let last: string | null = null;
  const landed = (line: string) => {
    last = line;
    onItem(line);
  };
  /** Places a text or a picture, or keeps it for the next open note (#289). */
  const placeOrKeep = async (item: PendingItem) => {
    if (!(await host.pageSize()).ok) {
      const kept = await addPending(native, dir.value, item);
      host.log(kept ? 'receive: no note open: the item waits' : 'receive: no note open, and the item could not be kept');
      landed(kept ? copy.keptForNote : copy.noNote);
      return;
    }
    landed(item.kind === 'text' ? await placeText(host, item.text) : await placeImage(native, host, item.path));
  };
  await placePending(native, host, dir.value, landed);
  try {
    const deadline = windowMs === null ? Number.POSITIVE_INFINITY : now() + windowMs;
    for (let left = deadline - now(); left > 0; left = deadline - now()) {
      const next = await native.nextReceived(windowMs === null ? BACKGROUND_WAIT_MS : left);
      if (!next.ok) {
        return RECEIVE_FAILED;
      }
      const arrival = next.value;
      if (arrival === null) {
        if (windowMs === null) {
          continue;
        }
        break;
      }
      if (arrival.kind === 'stopped') {
        return last ?? copy.receiveStopped;
      }
      if (arrival.kind === 'file') {
        if (arrival.path.endsWith('.pdf')) {
          landed(await pdfToNote(native, host, arrival.path));
        } else {
          await placeOrKeep({kind: 'image', path: arrival.path});
        }
        continue;
      }
      if (arrival.kind === 'offer') {
        const decision = decideOffer(arrival.body, arrival.sessionId, arrival.token);
        if (decision.taken.kind === 'editor') {
          // Note Editor's request (#493): its reply is the answer's body, and a pull sends after it.
          const {taken} = decision;
          const handled = await handleRemote(native, {...self, identityFolder: dir.value}, dir.value, taken.message, taken.info, arrival.token, line => host.log(line));
          await native.answer(handled.status, handled.body, null, null);
          if (handled.line !== null) {
            onItem(handled.line);
          }
          if (handled.after !== null) {
            host.log(`remote: pull: ${await handled.after()}`);
          }
          continue;
        }
        await native.answer(
          decision.status,
          decision.body,
          decision.fileId,
          decision.extension,
        );
        if (decision.taken.kind === 'text') {
          await placeOrKeep({kind: 'text', text: decision.taken.text});
          continue;
        }
        if (decision.taken.kind === 'refuse') {
          refused = decision.taken;
        }
      }
    }
    return last ?? refusedLine(refused);
  } finally {
    await native.stopReceive();
  }
}

/**
 * Places each item that waits from a receive with no note open (#289), in arrival order, while a
 * note is open; what still cannot be placed waits on. `onItem` gets each placed item's line.
 * Answers how many were placed.
 */
export async function placePending(
  native: Relay,
  host: NoteHost,
  pluginDir: string,
  onItem: (line: string) => void = () => {},
): Promise<number> {
  const waiting = await loadPending(native, pluginDir);
  if (waiting.length === 0 || !(await host.pageSize()).ok) {
    return 0;
  }
  // Saved first, so an item is never placed twice when a place throws.
  await savePending(native, pluginDir, []);
  for (const item of waiting) {
    onItem(item.kind === 'text' ? await placeText(host, item.text) : await placeImage(native, host, item.path));
  }
  return waiting.length;
}
