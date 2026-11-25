/** The tablet's side of Smart Shapes: every SDK call through sn-adapter (#101, #253). */
import {
  createElement,
  deleteLassoElements,
  deletePageElements,
  readEmrRange,
  emrToPage,
  getCurrentFilePath,
  getCurrentPageNum,
  getLassoElements,
  getLassoRect,
  getLastElement,
  getPageSize,
  getPenInfo,
  hasPermission,
  insertGeometry,
  insertPageElements,
  LASSO_BOX,
  lassoElements,
  offPage,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  rebuildStroke,
  recycleElement,
  requestPermission,
  saveStroke,
  setLassoBoxState,
  strokePoints,
} from '@ink-tools/sn-adapter/official';
import {copy} from './copy';
import type {SnapHost} from './snap';

const log = (line: string) => console.log(`SmartPen: shapes: ${line}`);

let access = false;

/** Asks for each file permission the host has not granted yet; deleting a stroke is a file write. */
async function ensureAccess(): Promise<boolean> {
  if (access) {
    return true;
  }
  for (const permission of [PERMISSION_FILE_READ, PERMISSION_FILE_WRITE]) {
    const has = await hasPermission(permission);
    if (has.ok && has.value) {
      continue;
    }
    const asked = await requestPermission(permission, copy['toast.permission']);
    if (!asked.ok || (asked.value !== 1 && asked.value !== 2)) {
      return false;
    }
  }
  access = true;
  return true;
}

export const DEVICE: SnapHost = {
  strokePoints,
  saveStroke,
  restoreStroke: async (saved, page) => {
    const built = await rebuildStroke(saved, createElement);
    return built.ok ? insertPageElements([built.value], page) : built;
  },
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  offPage,
  readEmrRange,
  emrToPage,
  getPenInfo,
  getLassoRect,
  lassoElements,
  getLassoElements,
  deleteLassoElements,
  clearLasso: () => setLassoBoxState(LASSO_BOX.remove),
  getLastElement,
  deletePageElements: (nums, page) => deletePageElements(nums, page),
  insertGeometry,
  ensureAccess,
  recycleElement,
  log,
};
