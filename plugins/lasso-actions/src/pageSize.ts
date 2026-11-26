/** The current page's size, read from its note's path and number: Headings and Collection place by it. */
import type {Size} from '@ink-tools/ink-core';
import {
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  Result,
} from '@ink-tools/sn-adapter/official';

export async function currentPageSize(): Promise<Result<Size>> {
  const path = await getCurrentFilePath();
  if (!path.ok) {
    return path;
  }
  const page = await getCurrentPageNum();
  if (!page.ok) {
    return page;
  }
  return getPageSize(path.value, page.value);
}
