/**
 * One tap of «Send page» or «Send selection» (#98), from the settings to the toast line, and the
 * note side of «Receive» (#49).
 */
import {
  closePluginView,
  createNote,
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  getPluginDirPath,
  insertImage,
  insertNotePage,
  insertText,
  lassoElements,
  lassoImage,
  pageImage,
  Result,
} from '@supernote-tools/sn-adapter/official';
import {Sender} from './localsend/protocol';
import {relay, Relay} from './native';
import {Outcome, sendCapture, tempDir} from './send/sendPng';
import {copy} from './copy';
import {NoteHost, Size} from './receive/receive';
import {loadSettings, ownFingerprint} from './settings/device';

/** How the tablet names itself to a receiver. */
export const ALIAS = 'Supernote';

/** Button ids, each its own (#98). */
export const SEND_PAGE_ID = 100;
export const SEND_SELECTION_ID = 101;
export const RECEIVE_ID = 102;

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
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<Outcome> {
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

/** The open note, as a receive places into it. */
export const noteHost: NoteHost = {
  pluginDir: getPluginDirPath,
  pageSize: currentPageSize,
  closeView: closePluginView,
  insertText,
  lasso: lassoElements,
  insertImage,
  createNote,
  insertNotePage,
};
