/**
 * One no-view edit button's press (#170): a press either changes the picture or shows why it did
 * not, never nothing. A file permission the host does not hold now («Ask Every Time», or «Allow
 * This Time Only», which the host revokes when the next press starts: docs/supernote.md ›
 * Plugins) opens Settings, which asks for it while a view shows, and tells the person to choose
 * Always Allow. An edit past the owner's 2 s limit shows the «Loading…» strip (#103, #145).
 */
import {
  hasPermission,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  requestPermission,
  showPluginView,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';
import {Done, NOT_EDITED, NOT_ONE_PICTURE, runEdit} from './edit';
import {EditDefinition, EditId} from './edits';
import {PAGE_EDITS, PageDone, runPageEdit} from './page';
import {askFilePermissions} from './permissions';
import {showToast, STRIP_AFTER_MS, working} from './working';

/** The host's code for a file call made without the file permission (docs/supernote.md). */
const NO_FILE_PERMISSION = /\b150[13]\b/;

/**
 * What a press cannot run without; FILE:DELETE only removes old PNG files, and its failure is
 * logged, so it never blocks a press (#182).
 */
export const PRESS_NEEDS = [PERMISSION_FILE_READ, PERMISSION_FILE_WRITE] as const;

export type PressDeps = {
  /** The file permissions the host does not grant now. */
  missing: () => Promise<string[]>;
  /** Opens Settings and asks for the missing permissions there. */
  ask: () => Promise<void>;
  /** The edit under the strip. */
  edit: (edit: EditId) => Promise<Done>;
  /** A page-wide edit under the strip, shown at once: it runs one edit per picture (#140). */
  page: (edit: EditId) => Promise<PageDone>;
  toast: (text: string) => void;
  log: (line: string) => void;
};

const DEVICE: PressDeps = {
  missing: async () => {
    const missing: string[] = [];
    for (const permission of PRESS_NEEDS) {
      const granted = await hasPermission(permission);
      if (!(granted.ok && granted.value)) {
        missing.push(permission);
      }
    }
    return missing;
  },
  ask: async () => {
    await showPluginView();
    await askFilePermissions({
      has: hasPermission,
      request: requestPermission,
      log: line => console.log(`Retouch: ${line}`),
    });
  },
  edit: edit =>
    working.run(() => runEdit(edit), {showAfterMs: STRIP_AFTER_MS}),
  page: edit => working.run(() => runPageEdit(edit)),
  toast: showToast,
  log: line => console.log(`Retouch: ${line}`),
};

/** The toast for a press that changed nothing. */
export function reasonOf(name: string, done: Done): string | null {
  if (done.kind === 'edited') {
    return null;
  }
  if (done.kind === 'nothing') {
    if (done.why === NOT_ONE_PICTURE) {
      return copy['press.notPicture'];
    }
    if (done.why === NOT_EDITED) {
      return copy['press.notEdited'];
    }
    return copy['press.failed'](name, done.why);
  }
  return NO_FILE_PERMISSION.test(done.why)
    ? copy['press.permission']
    : copy['press.failed'](name, done.why);
}

/** The toast of a page-wide press. */
export function pageToast(done: PageDone): string {
  return done.kind === 'failed'
    ? copy['page.failed'](done.why)
    : copy['page.done'](done.edited, done.pictures);
}

/** Runs `edit`'s press; the value is the edit's outcome, or null when a permission was missing. */
export async function pressEdit(
  edit: EditDefinition,
  deps: PressDeps = DEVICE,
): Promise<Done | PageDone | null> {
  const missing = await deps.missing();
  if (missing.length > 0) {
    deps.log(`${edit.id}: missing ${missing.join(', ')}; opening Settings`);
    deps.toast(copy['press.permission']);
    await deps.ask();
    return null;
  }
  const each = PAGE_EDITS[edit.id];
  if (each) {
    const page = await deps.page(each);
    deps.toast(pageToast(page));
    return page;
  }
  const done = await deps.edit(edit.id);
  const reason = reasonOf(edit.name, done);
  if (reason) {
    deps.toast(reason);
  }
  return done;
}
