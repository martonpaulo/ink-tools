/**
 * One tap of «Send page» or «Send selection» (#98), from the settings to the toast line, and the
 * note side of «Receive» (#49).
 */
import {
  closePluginView,
  createNote,
  EMPTY_LASSO_CODE,
  fail,
  getCurrentFilePath,
  getCurrentPageNum,
  getLassoElements,
  getLassoRect,
  getPageSize,
  getPluginDirPath,
  insertImage,
  insertNotePage,
  insertText,
  lassoElements,
  lassoImage,
  occupiedRects,
  ok,
  pageImage,
  recognizeElements,
  Result,
  THROWN_CODE,
} from '@ink-tools/sn-adapter/official';
import {OccupiedRead, readLassoQuery} from '@ink-tools/ink-core';
import {Sender} from './localsend/protocol';
import {relay, Relay} from './native';
import {ensurePermissions, refusedLine} from './permissions';
import {Outcome, sendCapture, tempDir} from './send/sendPng';
import {sendText} from './send/sendText';
import {TextDeps} from './send/textSession';
import {Device} from './localsend/protocol';
import {copy} from './copy';
import {Image} from 'react-native';
import {NoteHost, Size} from './receive/receive';
import {loadSettings, ownFingerprint} from './settings/device';

/** How the tablet names itself to a receiver. */
export const ALIAS = 'Supernote';

/** Button ids, each its own (#98). */
export const SEND_PAGE_ID = 100;
export const SEND_SELECTION_ID = 101;
export const RECEIVE_ID = 102;
export const SEND_TEXT_ID = 103;

export type Capture = 'page' | 'selection';

async function currentPage(pngPath: string): Promise<Result<string>> {
  const note = await getCurrentFilePath();
  if (!note.ok) {
    return note;
  }
  const page = await getCurrentPageNum();
  if (!page.ok) {
    return page;
  }
  return pageImage(note.value, page.value, pngPath);
}

export async function runSend(
  capture: Capture,
  native: Relay = relay(),
  ensure: () => Promise<string | null> = ensurePermissions,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<Outcome> {
  // Before the first file or network call (#163): without it every file call fails.
  const refused = await ensure();
  if (refused !== null) {
    return {kind: 'toast', text: refusedLine(refused)};
  }
  const dir = await pluginDir();
  if (!dir.ok) {
    return {kind: 'toast', text: copy.noImage};
  }
  const settings = await loadSettings(native, pluginDir);
  const sender: Sender = {
    alias: ALIAS,
    fingerprint: await ownFingerprint(native, settings, pluginDir),
  };
  return sendCapture(
    native,
    sender,
    settings.device,
    tempDir(dir.value),
    capture,
    capture === 'page' ? currentPage : lassoImage,
  );
}

async function currentPageSize(): Promise<Result<Size>> {
  const note = await getCurrentFilePath();
  if (!note.ok) {
    return note;
  }
  const page = await getCurrentPageNum();
  if (!page.ok) {
    return page;
  }
  return getPageSize(note.value, page.value);
}

async function currentPageKey(): Promise<Result<string>> {
  const note = await getCurrentFilePath();
  if (!note.ok) {
    return note;
  }
  const page = await getCurrentPageNum();
  return page.ok ? ok(`${note.value}#${page.value}`) : page;
}

function log(line: string): void {
  console.log(`Relay: ${line}`);
}

/** The open page's occupied rects, as Word Lookup reads them (#199, #152). */
async function currentOccupied(): Promise<Result<OccupiedRead>> {
  const note = await getCurrentFilePath();
  if (!note.ok) {
    return note;
  }
  const page = await getCurrentPageNum();
  return page.ok ? occupiedRects(note.value, page.value, log) : page;
}

/** A picture file's size from React Native's own decoder, with no pixels read (#196). */
function pictureSize(path: string): Promise<Result<Size>> {
  return new Promise(resolve =>
    Image.getSize(
      `file://${path}`,
      (width, height) => resolve(ok({width, height})),
      error => resolve(fail(THROWN_CODE, String(error))),
    ),
  );
}

/** The open note, as a receive places into it. */
export const noteHost: NoteHost = {
  permissions: ensurePermissions,
  pluginDir: getPluginDirPath,
  pageKey: currentPageKey,
  pageSize: currentPageSize,
  occupied: currentOccupied,
  log,
  closeView: closePluginView,
  insertText,
  lasso: lassoElements,
  insertImage,
  imageSize: pictureSize,
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
  createNote,
  insertNotePage,
};

/** The lassoed handwriting as text, as Lookup reads it (`ink-core`); null when there is none. */
async function readLassoText(): Promise<string | null> {
  const read = await readLassoQuery({
    getLassoElements,
    getLassoRect,
    getCurrentFilePath,
    getCurrentPageNum,
    getPageSize,
    recognizeElements,
    emptyLasso: message => fail(EMPTY_LASSO_CODE, message),
    failure: message => fail(THROWN_CODE, message),
  });
  if (!read.ok) {
    console.log(`Relay: read the lasso failed: ${read.code}`);
    return null;
  }
  return read.value.query;
}

async function sendTo(device: Device, text: string, native: Relay): Promise<string> {
  const settings = await loadSettings(native);
  const sender: Sender = {
    alias: ALIAS,
    fingerprint: await ownFingerprint(native, settings),
  };
  return sendText(native, sender, device, text);
}

/** «Send Text» on the tablet (#99); the view and its toast are the caller's. */
export function textDeps(
  closeView: () => void,
  toast: (line: string) => void,
  native: Relay = relay(),
): TextDeps {
  return {
    permissions: ensurePermissions,
    refused: refusedLine,
    read: readLassoText,
    device: async () => (await loadSettings(native)).device,
    send: (device, text) => sendTo(device, text, native),
    closeView,
    toast,
  };
}
