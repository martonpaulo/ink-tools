/**
 * One edit's press (#170), run from a button of the editor view (#226, src/editor.ts): a press
 * either changes the picture or shows why it did not, never nothing. A file permission the host does not hold now («Ask Every Time», or «Allow
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
} from '@ink-tools/sn-adapter/official';
import type {Problem} from '@ink-tools/ui-kit';
import {copy} from './copy';
import {GUIDE_OUTSIDE, NO_GUIDE, NOT_PICTURE_AND_GUIDE, runCrop} from './crop';
import type {Rect} from '@ink-tools/ink-core';
import {
  DEVICE as EDIT_DEVICE,
  Done,
  INK_ON_PICTURE,
  NOT_EDITED,
  NOT_ONE_PICTURE,
  PICTURE_GONE,
  runEdit,
} from './edit';
import {MARKS_OUTSIDE, NO_MARKS, NOT_PICTURE_AND_MARKS, runErase} from './erase';
import {EditDefinition, EditId} from './edits';
import {NO_OPTIONS} from './native';
import {PAGE_EDITS, PageDone, runPageEdit} from './page';
import {sweepOrphans} from './orphans';
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
  /** Holds a failure on the tablet on the Error state, with its reason and Close (#256). */
  fail: (problem: Problem) => void;
  /** Removes the PNGs earlier builds left, once per session, after the press's own work (#182). */
  sweep: () => Promise<void>;
  log: (line: string) => void;
};

/**
 * The edits whose guide the pen drew over the picture (#132, #134); the others run as they are, on
 * `target`, the editor's picture, when the editor runs them (#522).
 */
export const runPress = (edit: EditId, target?: Rect): Promise<Done> =>
  edit === 'crop'
    ? runCrop()
    : edit === 'erase'
    ? runErase()
    : runEdit(edit, EDIT_DEVICE, {...NO_OPTIONS, target});

export const PRESS_DEVICE: PressDeps = {
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
  edit: edit => working.run(() => runPress(edit), {showAfterMs: STRIP_AFTER_MS}),
  page: edit => working.run(() => runPageEdit(edit)),
  toast: showToast,
  fail: problem => working.hold(problem),
  sweep: () => sweepOrphans(EDIT_DEVICE),
  log: line => console.log(`Retouch: ${line}`),
};

/** The toast of each reason a press changed nothing. */
const NOTHING_TOAST: Record<string, string> = {
  [NOT_ONE_PICTURE]: copy['press.notPicture'],
  [NOT_EDITED]: copy['press.notEdited'],
  [PICTURE_GONE]: copy['editor.gone'],
  [INK_ON_PICTURE]: copy['editor.inkOnPicture'],
  [NO_GUIDE]: copy['press.cropNoGuide'],
  [NOT_PICTURE_AND_GUIDE]: copy['press.cropNotPicture'],
  [GUIDE_OUTSIDE]: copy['press.cropOutside'],
  [NO_MARKS]: copy['press.eraseNoMarks'],
  [NOT_PICTURE_AND_MARKS]: copy['press.eraseNotPicture'],
  [MARKS_OUTSIDE]: copy['press.eraseOutside'],
};

/** The toast for a press that changed nothing. */
export function reasonOf(name: string, done: Done): string | null {
  if (done.kind === 'edited') {
    return null;
  }
  if (done.kind === 'nothing') {
    return NOTHING_TOAST[done.why] ?? copy['press.failed'](name, done.why);
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

/** The Error state of a press that failed on the tablet: what failed and what to do (#256). */
function failedProblem(what: string): Problem {
  return {what, reason: copy['press.failedReason']};
}

/** Runs `edit`'s press; the value is the edit's outcome, or null when a permission was missing. */
export async function pressEdit(
  edit: EditDefinition,
  deps: PressDeps = PRESS_DEVICE,
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
    if (page.kind === 'failed') {
      deps.log(`${edit.id}: page failed: ${page.why}`);
      deps.fail(failedProblem(copy['page.failedTitle']));
    } else {
      deps.toast(pageToast(page));
    }
    await deps.sweep();
    return page;
  }
  const done = await deps.edit(edit.id);
  const reason = reasonOf(edit.name, done);
  if (done.kind === 'failed' && !NO_FILE_PERMISSION.test(done.why)) {
    deps.log(`${edit.id}: failed: ${done.why}`);
    deps.fail(failedProblem(copy['press.failedTitle'](edit.name)));
  } else if (reason) {
    deps.toast(reason);
  }
  await deps.sweep();
  return done;
}
