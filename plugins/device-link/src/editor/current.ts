/**
 * The action `current` (#320): the note open on the tablet and the page on screen, for Note
 * Editor's Follow Tablet, through `inkctl note current`. It reads and writes nothing else. The page
 * counts from 0, as `getCurrentPageNum` answers; that it matches the screen's page waits for the
 * device round of #320.
 */
import type {ActionResult, Result} from '@ink-tools/sn-adapter/official';
import type {EditHost} from './operations';

export type CurrentHost = Pick<EditHost, 'openNote'> & {currentPage(): Promise<Result<number>>};

export function currentAction(host: CurrentHost) {
  return async (): Promise<ActionResult> => {
    const open = await host.openNote();
    if (!open.ok) {
      throw new Error(`getCurrentFilePath failed: ${open.code} ${open.message}`);
    }
    if (!open.value) {
      return {line: 'DeviceLink: current: no note is open', openNote: null, page: null};
    }
    const page = await host.currentPage();
    if (!page.ok) {
      throw new Error(`getCurrentPageNum failed: ${page.code} ${page.message}`);
    }
    if (!Number.isInteger(page.value) || page.value < 0) {
      throw new Error(`getCurrentPageNum answered ${String(page.value)}, not a page index from 0`);
    }
    return {line: `DeviceLink: current: page ${page.value} of ${open.value}`, openNote: open.value, page: page.value};
  };
}
