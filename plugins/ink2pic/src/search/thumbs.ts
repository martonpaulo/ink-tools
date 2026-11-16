/**
 * The stored thumbnails (#16, #46) moved to picture-search's insert tier (#142); Ink2Pic hands it
 * its OpenMoji symbol store (#91), which keeps symbols outside the thumbnail store.
 */
import {setThumbSymbols} from '../profile';
import {savedSymbolUri, symbolUri} from '../symbols/store';

setThumbSymbols({
  savedUri: result => savedSymbolUri(result),
  uri: result => symbolUri(result),
});

export {
  cachedThumbUri,
  CONTOUR_SUFFIX,
  DARKENED_SUFFIX,
  needsDownload,
  prepareThumbs,
  resetThumbsForTests,
  storeDerived,
  THUMB_LIMIT,
  THUMB_TIMEOUT_MS,
  thumbPath,
  thumbUri,
  webRetryUri,
} from '../profile';
