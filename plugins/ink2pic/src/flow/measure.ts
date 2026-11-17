/**
 * The measured order of pages 1 and 2 (#66) and a later page's tiles (#72) moved to
 * picture-search's insert tier (#142); this binds them to Ink2Pic's analyzer, thumbnail store,
 * style (#70) and picks (#34).
 */
import {
  deviceAnalyzer,
  getSettings,
  LATER_MEASURE_LIMIT_MS,
  MEASURE_LIMIT_MS,
  measureFirstPages as sharedFirstPages,
  measureThumb as sharedThumb,
  type MeasureDeps,
  type MeasuredPages,
} from '../profile';
import {pickedFor} from '../picks/device';
import {thumbUri} from '../search/thumbs';
import {styleFlags} from '../settings/settings';
import type {SearchResult} from '@ink-tools/picture-search';

export {
  isContourUri,
  LATER_MEASURE_LIMIT_MS,
  MEASURE_LIMIT_MS,
  MEASURE_WIDTH,
  unmeasured,
} from '../profile';
export type {MeasureDeps, MeasuredPages} from '../profile';

const DEVICE: MeasureDeps = {
  analyzer: deviceAnalyzer,
  thumb: (result, dir) => thumbUri(result, dir),
  limitMs: MEASURE_LIMIT_MS,
  allContour: async () => styleFlags(await getSettings()).contour,
  photos: async () => styleFlags(await getSettings()).photos,
  picked: word => pickedFor(word),
};

const LATER: MeasureDeps = {...DEVICE, limitMs: LATER_MEASURE_LIMIT_MS};

export function measureThumb(
  result: SearchResult,
  thumbDir: string,
  query: string,
  deps: MeasureDeps = LATER,
): Promise<string> {
  return sharedThumb(result, thumbDir, query, deps);
}

export function measureFirstPages(
  results: SearchResult[],
  thumbDir: string | null,
  query: string,
  deps: MeasureDeps = DEVICE,
  onThumbs?: () => void,
  untilLeader = false,
): Promise<MeasuredPages> {
  return sharedFirstPages(results, thumbDir, query, deps, onThumbs, untilLeader);
}
