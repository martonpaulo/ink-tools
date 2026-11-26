/** The current page's size, read from its note's path and number: Headings and Collection place by it. */
import type {Size} from '@ink-tools/ink-core';
import {
  getCurrentFilePath,
  getCurrentPageNum,
  getPageSize,
  Result,
} from '@ink-tools/sn-adapter/official';

export async function currentPageSize(): Promise<Result<Size>> {
  // Asked together: two independent bridge calls cost one round trip, not two (#252).
  const [path, page] = await Promise.all([getCurrentFilePath(), getCurrentPageNum()]);
  if (!path.ok) {
    return path;
  }
  if (!page.ok) {
    return page;
  }
  return getPageSize(path.value, page.value);
}
