/**
 * One tap of «Send page» or «Send selection» (#98), from the search for receivers through the
 * pick (#307) to the toast line, and the note side of «Receive» (#49).
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
import {relay, Relay} from './native';
import {ensurePermissions, refusedLine} from './permissions';
import {
  Delivered,
  discoverDevices,
  findAgain,
  Outcome,
  savedFirst,
  sendCapture,
  sendLog,
  tempDir,
} from './send/sendPng';
import {sendText} from './send/sendText';
import {TextDeps} from './send/textSession';
import {Capture, PickDeps} from './send/pickSession';
import {working} from './working';
import {Device} from './localsend/protocol';
import {copy} from './copy';
import {Image} from 'react-native';
import {NoteHost, Size} from './receive/receive';
import {
  afterSent,
  checkPin,
  lastFirst,
  loadSettings,
  ownIdentity,
  saveSettings,
  Self,
} from './settings/device';

/** How the tablet names itself to a receiver. */
export const ALIAS = 'Supernote';

/** Button ids, each its own (#98). */
export const SEND_PAGE_ID = 100;
export const SEND_SELECTION_ID = 101;
export const RECEIVE_ID = 102;
export const SEND_TEXT_ID = 103;

export type {Capture} from './send/pickSession';

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

/** What a send tap finds (#307): a toast line, the receivers to pick from, or none at all. */
export type Found =
  | {kind: 'toast'; text: string}
  | {kind: 'pick'; devices: Device[]}
  | {kind: 'none'};

/** The receivers one search finds, the last pick first (#307); none is `none`, never a pick. */
export async function findReceivers(
  native: Relay,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<Device[]> {
  const settings = await loadSettings(native, pluginDir);
  const self = {
    alias: ALIAS,
    ...(await ownIdentity(native, settings, pluginDir)),
  };
  const found = await discoverDevices(native, self, pluginDir);
  return found.ok ? lastFirst(found.value, settings.last) : [];
}

/** The tap of «Send Page» or «Send Selection»: the permissions, then the search (#163, #307). */
export async function findForSend(
  native: Relay = relay(),
  ensure: () => Promise<string | null> = ensurePermissions,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<Found> {
  // Before the first file or network call (#163): without it every file call fails.
  const refused = await ensure();
  if (refused !== null) {
    return {kind: 'toast', text: refusedLine(refused)};
  }
  const devices = await findReceivers(native, pluginDir);
  sendLog(`found ${devices.length} receivers`);
  return devices.length === 0 ? {kind: 'none'} : {kind: 'pick', devices};
}

/**
 * Sends to the picked `device` when its fingerprint is its pin or it is new; a known alias with
 * another fingerprint is refused, and its pin is kept (#307). The receiver that took the item is
 * pinned and becomes the last pick.
 */
export async function pinnedSend(
  native: Relay,
  device: Device,
  send: (self: Self, delivered: Delivered) => Promise<string>,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<string> {
  const settings = await loadSettings(native, pluginDir);
  if (checkPin(settings, device) === 'changed') {
    const line = copy.identityChanged(device.alias);
    sendLog(`${device.alias} announced another fingerprint: ${line}`);
    return line;
  }
  const self = {
    alias: ALIAS,
    ...(await ownIdentity(native, settings, pluginDir)),
  };
  return send(self, async target => {
    const now = await loadSettings(native, pluginDir);
    await saveSettings(native, afterSent(now, target), pluginDir);
  });
}

/** The picked device's send of the page or the selection (#307), to the toast line. */
export async function sendPicked(
  capture: Capture,
  device: Device,
  native: Relay = relay(),
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<Outcome> {
  const dir = await pluginDir();
  if (!dir.ok) {
    return {kind: 'toast', text: copy.noImage};
  }
  const text = await pinnedSend(
    native,
    device,
    async (self, delivered) =>
      (
        await sendCapture(
          native,
          self,
          device,
          tempDir(dir.value),
          capture,
          // Only the page is read from the file; the lasso preview is drawn from the open page.
          capture === 'page' ? savedFirst(currentPage) : lassoImage,
          Date.now,
          findAgain(native, self, pluginDir),
          delivered,
        )
      ).text,
    pluginDir,
  );
  return {kind: 'toast', text};
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

function sendTo(device: Device, text: string, native: Relay): Promise<string> {
  return pinnedSend(native, device, (self, delivered) =>
    sendText(native, self, device, text, findAgain(native, self), delivered),
  );
}

/** The pick of «Send Page» and «Send Selection» on the tablet (#307), under the strip. */
export function pickDeps(
  closeView: () => void,
  toast: (line: string) => void,
  native: Relay = relay(),
): PickDeps {
  return {
    send: async (capture, device) => (await sendPicked(capture, device, native)).text,
    run: task => working.run(task),
    toast,
    log,
    closeView,
  };
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
    devices: () => findReceivers(native),
    send: (device, text) => sendTo(device, text, native),
    closeView,
    toast,
  };
}
