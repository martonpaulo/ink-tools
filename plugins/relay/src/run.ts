/**
 * One tap of «Send page» or «Send selection» (#98), from the settings to the toast line.
 */
import {
  getCurrentFilePath,
  getCurrentPageNum,
  lassoImage,
  pageImage,
  Result,
} from '@supernote-tools/sn-adapter/official';
import {Sender} from './localsend/protocol';
import {relay, Relay} from './native';
import {Outcome, sendCapture} from './send/sendPng';
import {loadSettings} from './settings/device';

/** How the tablet names itself to a receiver. */
export const ALIAS = 'Supernote';

/** Button ids, each its own (#98). */
export const SEND_PAGE_ID = 100;
export const SEND_SELECTION_ID = 101;

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
): Promise<Outcome> {
  const settings = await loadSettings(native);
  const sender: Sender = {alias: ALIAS, fingerprint: settings.fingerprint};
  return sendCapture(
    native,
    sender,
    settings.device,
    capture,
    capture === 'page' ? currentPage : lassoImage,
  );
}
