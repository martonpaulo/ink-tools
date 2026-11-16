/**
 * One receive (#49): the tablet is a LocalSend receiver for one item, then it lands in the open
 * note, floating and selected, for the person to move. Text becomes a text box; a PNG or JPEG goes
 * through `insertImage`, which the host shows as its own floating selection; a PDF becomes a new
 * note (#143, `pdfNote.ts`).
 */
import {Result, TextBoxInput} from '@supernote-tools/sn-adapter/official';
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
import {TEMP_DIR} from '../send/sendPng';
import {NoteFiles, pdfToNote} from './pdfNote';

/** How long one tap on «Receive» keeps the tablet visible. */
export const RECEIVE_WINDOW_MS = 2 * 60 * 1000;

export const TEXT_FONT_SIZE = 32;
const LINE_HEIGHT = Math.round(TEXT_FONT_SIZE * 1.5);
/** A character's width as a share of the font size, as Ink2Pic measures it. */
const CHAR_WIDTH = 0.55;

type Rect = TextBoxInput['rect'];
export type Size = {width: number; height: number};

/** The note side of a receive, so the test runs it without a device. */
export type NoteHost = NoteFiles & {
  pluginDir(): Promise<Result<string>>;
  closeView(): Promise<unknown>;
  insertText(box: TextBoxInput): Promise<Result<boolean>>;
  lasso(rect: Rect): Promise<Result<boolean>>;
  insertImage(path: string): Promise<Result<boolean>>;
};

/**
 * The text box: half the page wide, centred, from 15% of the page down, as tall as its wrapped
 * lines and never past the page's bottom.
 */
export function textBox(page: Size, text: string): Rect {
  const width = Math.round(page.width / 2);
  const left = Math.round((page.width - width) / 2);
  const top = Math.round(page.height * 0.15);
  const perLine = Math.max(1, Math.floor(width / (TEXT_FONT_SIZE * CHAR_WIDTH)));
  const lines = text
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
  const bottom = Math.min(page.height - LINE_HEIGHT, top + lines * LINE_HEIGHT);
  return {left, top, right: left + width, bottom: Math.max(bottom, top + LINE_HEIGHT)};
}

async function placeText(host: NoteHost, text: string): Promise<string> {
  const size = await host.pageSize();
  if (!size.ok) {
    return copy.noNote;
  }
  const rect = textBox(size.value, text);
  await host.closeView();
  const inserted = await host.insertText({text, rect, fontSize: TEXT_FONT_SIZE});
  if (!inserted.ok || inserted.value !== true) {
    return copy.insertFailed;
  }
  // Selected, so the person moves it at once; a failed lasso still leaves the text in place.
  await host.lasso(rect);
  return copy.receivedText;
}

async function placeImage(native: Relay, host: NoteHost, path: string): Promise<string> {
  await host.closeView();
  const inserted = await host.insertImage(path);
  await native.remove(path);
  return inserted.ok && inserted.value === true ? copy.receivedImage : copy.insertFailed;
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

/**
 * Receives one item and places it; answers the toast line. `onReady` runs once the tablet is
 * visible. A refused offer keeps the window open for the next one.
 */
export async function receiveOne(
  native: Relay,
  host: NoteHost,
  alias: string,
  onReady: () => void = () => {},
  now: () => number = Date.now,
  windowMs: number = RECEIVE_WINDOW_MS,
): Promise<string> {
  const dir = await host.pluginDir();
  if (!dir.ok) {
    return copy.receiveFailed;
  }
  const fingerprint = await native.identity(dir.value);
  if (!fingerprint.ok) {
    return copy.receiveFailed;
  }
  const self = {alias, fingerprint: fingerprint.value};
  const started = await native.startReceive(
    dir.value,
    TEMP_DIR,
    LOCALSEND_PORT,
    MULTICAST_GROUP,
    receiverInfo(self),
    announce(self),
    announceAnswer(self),
  );
  if (!started.ok) {
    return copy.receiveFailed;
  }
  onReady();
  let refused: Taken | null = null;
  try {
    const deadline = now() + windowMs;
    for (let left = windowMs; left > 0; left = deadline - now()) {
      const next = await native.nextReceived(left);
      if (!next.ok) {
        return copy.receiveFailed;
      }
      const arrival = next.value;
      if (arrival === null) {
        break;
      }
      if (arrival.kind === 'stopped') {
        return copy.receiveStopped;
      }
      if (arrival.kind === 'file') {
        return arrival.path.endsWith('.pdf')
          ? await pdfToNote(native, host, arrival.path)
          : await placeImage(native, host, arrival.path);
      }
      if (arrival.kind === 'offer') {
        const decision = decideOffer(arrival.body, arrival.sessionId, arrival.token);
        await native.answer(
          decision.status,
          decision.body,
          decision.fileId,
          decision.extension,
        );
        if (decision.taken.kind === 'text') {
          return await placeText(host, decision.taken.text);
        }
        if (decision.taken.kind === 'refuse') {
          refused = decision.taken;
        }
      }
    }
    return refusedLine(refused);
  } finally {
    await native.stopReceive();
  }
}
