import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {attempt, Result} from './result';

/** The page size, owned by the adapter's model (#491). */
import type {Size} from './model';

export type {Size};

export function getCurrentFilePath(): Promise<Result<string>> {
  return attempt(() => PluginCommAPI.getCurrentFilePath());
}

export function getCurrentPageNum(): Promise<Result<number>> {
  return attempt(() => PluginCommAPI.getCurrentPageNum());
}

/** Replaces the deprecated `getPageDisplaySize`, as `sn-plugin-lib` 0.2.3 advises. */
export function getPageSize(
  notePath: string,
  page: number,
): Promise<Result<Size>> {
  return attempt(() => PluginFileAPI.getPageSize(notePath, page));
}

/** `Element.TYPE_PICTURE` in sn-plugin-lib 0.2.3 (brief section 4.7). */
export const PICTURE_TYPE = 200;

/** A new element with its native cache, as the official docs require before an insert. */
export function createElement(
  type: number,
): Promise<Result<Record<string, unknown>>> {
  return attempt(() => PluginCommAPI.createElement(type));
}

/** Inserts elements into a page of the current file, in pixel coordinates from getPageSize. */
export function insertPageElements(
  elements: object[],
  page: number,
  layer = 0,
): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.insertPageElements(elements, page, layer));
}


/**
 * Writes the elements as a `.sticker` file at `stickerPath` (#35). `machineType` is the device's
 * type from `getDeviceType` (5 is the Manta).
 */
export function convertElement2Sticker(
  machineType: number,
  elements: object[],
  stickerPath: string,
): Promise<Result<boolean>> {
  return attempt(() =>
    PluginCommAPI.convertElement2Sticker({machineType, elements, stickerPath}),
  );
}

/** Pastes a `.sticker` file on the current page, where the host puts it (#35). */
export function insertSticker(path: string): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.insertSticker(path));
}

/**
 * Draws the open page again from its file (#296): the host runs `reloadCurrentNotePage`. It is for
 * a page change the host did not draw, such as a `batchUpdatePageElements` that answered without a
 * redraw; never while the pen is down, as a reload mid-stroke may drop that stroke.
 */
export function reloadFile(): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.reloadFile());
}
