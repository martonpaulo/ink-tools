/**
 * The lassoed handwriting as a search query (brief section 8.2, #20, #44): ink-core's
 * readLassoQuery (#109) over the official SDK wrappers and the plugin's log, for every
 * plugin that reads a lasso (#142).
 */
import {
  readLassoQuery as readWith,
  type LassoHost,
  type LassoQuery,
} from '@ink-tools/ink-core';
import {log, logged} from '../log/memory';
import {
  getLassoElements,
  getLassoRect,
  recognizeElements,
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  occupiedRects,
  CallFailure,
  EMPTY_LASSO_CODE,
  fail,
  Result,
  THROWN_CODE,
} from '@ink-tools/sn-adapter/official';

export type {LassoQuery};

const host: LassoHost<CallFailure> = {
  getLassoElements,
  getLassoRect,
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  recognizeElements,
  getOccupied: (path, page) => occupiedRects(path, page, log),
  log,
  emptyLasso: message => fail(EMPTY_LASSO_CODE, message),
  failure: message => fail(THROWN_CODE, message),
  logged: (label, call) => logged(label, call),
};

/** The recognized word and where the lasso was; `known` are the elements the opening read. */
export function readLassoQuery(known?: object[]): Promise<Result<LassoQuery>> {
  return readWith(host, known);
}
