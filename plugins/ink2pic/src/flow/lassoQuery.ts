/**
 * The lassoed handwriting as a search query (brief section 8.2, #20, #44): ink-core's
 * readLassoQuery (#109) over this plugin's SDK wrappers and log.
 */
import {
  readLassoQuery as readWith,
  type LassoHost,
  type LassoQuery,
} from '@supernote-tools/ink-core';
import {logged} from '../log/memory';
import {
  getLassoElements,
  getLassoRect,
  recognizeElements,
} from '../sdk/lasso';
import {getCurrentFilePath, getCurrentPageNum, getPageSize} from '../sdk/page';
import {
  CallFailure,
  EMPTY_LASSO_CODE,
  fail,
  Result,
  THROWN_CODE,
} from '../sdk/result';

export type {LassoQuery};

const host: LassoHost<CallFailure> = {
  getLassoElements,
  getLassoRect,
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  recognizeElements,
  emptyLasso: message => fail(EMPTY_LASSO_CODE, message),
  failure: message => fail(THROWN_CODE, message),
  logged: (label, call) => logged(label, call),
};

/** The recognized word and where the lasso was; `known` are the elements the opening read. */
export function readLassoQuery(known?: object[]): Promise<Result<LassoQuery>> {
  return readWith(host, known);
}
