/**
 * One «Convert to Text» press (#250, #306): the lasso conversion of `lasso.ts` over the tablet's
 * SDK calls, each through sn-adapter; a converted or empty lasso says so in a toast, and a failure
 * is held on the Error state with its reason and Close (#256).
 */
import {
  batchUpdatePageElements,
  createTextBox,
  getCurrentFilePath,
  getCurrentPageNum,
  getLassoElements,
  getLassoRect,
  getPageSize,
  recognizeElements,
  recycleElement,
} from '@ink-tools/sn-adapter/official';
import type {Problem} from '@ink-tools/ui-kit';
import {copy} from '../copy';
import {lookupLog, showToast} from '../textBox';
import {working} from '../working';
import {convertLasso, type LassoConvertHost, type LassoOutcome} from './lasso';

/** What a press shows the person, apart from the conversion itself; tests pass a fake. */
export type ConvertShow = {
  toast: (text: string) => void;
  fail: (problem: Problem) => void;
};

const FAILED: Problem = {
  what: copy['convert.failed'],
  reason: copy['convert.failedReason'],
};

export async function convertPress(
  host: LassoConvertHost,
  show: ConvertShow,
): Promise<LassoOutcome> {
  const outcome = await convertLasso(host);
  if (outcome === 'failed') {
    show.fail(FAILED);
  } else {
    show.toast(outcome === 'converted' ? copy['convert.done'] : copy['convert.empty']);
  }
  return outcome;
}

export const DEVICE_CONVERT: LassoConvertHost = {
  getLassoElements,
  getLassoRect,
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  recognizeElements,
  createTextBox,
  batchUpdatePageElements: (nums, elements, page) =>
    batchUpdatePageElements(nums, elements, page),
  recycleElement,
  log: line => lookupLog(`convert: ${line}`),
};

/** The press of «Convert to Text», on the tablet. */
export function convertToText(): Promise<LassoOutcome> {
  return convertPress(DEVICE_CONVERT, {
    toast: showToast,
    fail: problem => working.hold(problem),
  });
}
