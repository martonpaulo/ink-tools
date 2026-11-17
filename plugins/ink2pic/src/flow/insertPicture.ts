/**
 * One tap on a result: picture-search's insert (#142, moved from Ink2Pic) over Ink2Pic's library
 * in MyStyle/Ink2Pic/library (#12, #15), its insert settings (#70) and its OpenMoji symbols (#91).
 */
import {getLibrary, recordInsert} from '../library/device';
import {findItem} from '../library/library';
import {
  getSettings,
  insertPicture as sharedInsert,
  libraryDir,
  startEarlyDownload as sharedEarly,
  wordKeptOptions as sharedWordKept,
  type EarlyDownload,
  type InsertOptions,
  type LassoPlace,
  type PictureStore,
  type Stop,
} from '../profile';
import type {SearchResult} from '@ink-tools/picture-search';
import type {Done} from './failure';
import {saveSymbol, symbolFile} from '../symbols/store';
import {SIZE_WIDTHS, styleFlags} from '../settings/settings';

export {dropEarly, imageExtension, placedSize} from '../profile';
export type {EarlyDownload, InsertOptions, Stop} from '../profile';

/** About one third of the 1920 px page (brief section 7): the default prepared width. */
export const INSERT_WIDTH = SIZE_WIDTHS.medium;

/** Ink2Pic's picture store: its library folder and file, its settings and its symbols. */
export const INK2PIC_PICTURES: PictureStore = {
  dir: () => libraryDir(),
  options: async () => {
    const settings = await getSettings();
    return {
      width: SIZE_WIDTHS[settings.size],
      placement: settings.placement,
      contour: styleFlags(settings).contour,
    };
  },
  find: async (result, contour) =>
    findItem(await getLibrary(), result.id, contour) ?? null,
  record: item => recordInsert(item),
  symbolFile: result => symbolFile(result),
  saveSymbol: result => saveSymbol(result),
};

/**
 * The options of «Insert best picture»: it never deletes the handwriting (#106), so «In place of
 * word» places the picture below it.
 */
export function wordKeptOptions(): Promise<InsertOptions> {
  return sharedWordKept(INK2PIC_PICTURES);
}

/** Starts the leading picture's download before it is known to win (#88). Never rejects. */
export function startEarlyDownload(result: SearchResult): EarlyDownload {
  return sharedEarly(result, INK2PIC_PICTURES);
}

export function insertPicture(
  result: SearchResult,
  query: string,
  place: LassoPlace | null = null,
  contour = false,
  options?: InsertOptions,
  early: EarlyDownload | null = null,
  stop: Stop = () => null,
): Promise<Done<string>> {
  return sharedInsert(
    INK2PIC_PICTURES,
    result,
    query,
    place,
    contour,
    options,
    early,
    stop,
  );
}
