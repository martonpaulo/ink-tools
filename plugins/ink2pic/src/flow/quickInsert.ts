/**
 * «Insert best picture» (#74): picture-search's no-view insert (#142, moved from Ink2Pic) over
 * Ink2Pic's search, measured order, insert and recent searches, with Ink2Pic's sentences.
 */
import {
  insertBest as sharedInsertBest,
  type InsertLimit,
  type LassoPlace,
  type QuickInsert,
  type QuickInsertDeps as SharedDeps,
} from '../profile';
import {
  insertPicture,
  startEarlyDownload,
  wordKeptOptions,
} from './insertPicture';
import {measureFirstPages} from './measure';
import {afterSearch, runSearch} from './search';
import {copy} from '../ui/copy';

export type {InsertLimit, QuickInsert} from '../profile';

/** Ink2Pic records each search as a recent one, so its deps always hold `record`. */
export type QuickInsertDeps = Required<SharedDeps>;

const DEVICE: QuickInsertDeps = {
  search: runSearch,
  measure: measureFirstPages,
  insert: insertPicture,
  record: afterSearch,
  early: startEarlyDownload,
  options: wordKeptOptions,
};

export function insertBest(
  word: string,
  place: LassoPlace | null,
  deps: QuickInsertDeps = DEVICE,
  limit: InsertLimit = {},
): Promise<QuickInsert> {
  return sharedInsertBest(word, place, deps, copy, limit);
}
