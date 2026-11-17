/** The tablet's side of the conversion and the undo: every SDK call through sn-adapter (#101). */
import {
  batchUpdatePageElements,
  createElement,
  createTextBox,
  emrRange,
  getCurrentFilePath,
  getCurrentPageNum,
  getElements,
  getPageSize,
  onPenUp,
  rebuildStroke,
  recognizeElements,
  recycleElement,
  saveStroke,
  strokePoints,
} from '@supernote-tools/sn-adapter/official';
import type {ConvertHost} from './convert';
import type {UndoHost} from './undo';

const log = (line: string) => console.log(`RealTimeConversion: ${line}`);

export const DEVICE_CONVERT: ConvertHost = {
  onPenUp,
  strokePoints,
  saveStroke,
  recycleElement,
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  emrRange,
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
