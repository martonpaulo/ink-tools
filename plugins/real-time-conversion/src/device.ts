/** The tablet's side of the conversion and the undo: every SDK call through sn-adapter (#101). */
import {
  batchUpdatePageElements,
  createElement,
  createTextBox,
  readEmrRange,
  getCurrentFilePath,
  getCurrentPageNum,
  getElements,
  getLassoElements,
  getLassoRect,
  getPageSize,
  onPenUp,
  rebuildStroke,
  recognizeElements,
  recycleElement,
  saveStroke,
  strokePoints,
  strokeTimes,
} from '@ink-tools/sn-adapter/official';
import type {ConvertHost} from './convert';
import type {LassoConvertHost} from './lasso';
import type {UndoHost} from './undo';

const log = (line: string) => console.log(`RealTimeConversion: ${line}`);

export const DEVICE_CONVERT: ConvertHost = {
  onPenUp,
  strokePoints,
  strokeTimes,
  saveStroke,
  recycleElement,
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  readEmrRange,
  recognizeElements,
  getElements,
  createTextBox,
  batchUpdatePageElements: (nums, elements, page) =>
    batchUpdatePageElements(nums, elements, page),
  now: () => Date.now(),
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
  log,
};

export const DEVICE_UNDO: UndoHost = {
  getCurrentFilePath,
  getCurrentPageNum,
  getElements,
  rebuildStroke: saved => rebuildStroke(saved, createElement),
  batchUpdatePageElements: (nums, elements, page) =>
    batchUpdatePageElements(nums, elements, page),
  recycleElement,
  log,
};

export const DEVICE_LASSO: LassoConvertHost = {
  getLassoElements,
  getLassoRect,
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  recognizeElements,
  saveStroke,
  createTextBox,
  batchUpdatePageElements: (nums, elements, page) =>
    batchUpdatePageElements(nums, elements, page),
  recycleElement,
  log,
};
