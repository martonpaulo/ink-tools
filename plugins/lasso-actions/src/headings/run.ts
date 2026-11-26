/**
 * One Headings press (#252): the lasso box moves to the heading's place, on its own line at the
 * leading margin, at its own size (levels.ts `placement`), then the moved handwriting becomes a
 * native title of the level's style. Moving first keeps the lasso: `resizeLassoRect` leaves the
 * moved strokes lassoed, while `setLassoTitle` clears the lasso, so a title made first had to be
 * lassoed again before it could move, one more bridge call (docs/supernote.md, device round 9).
 * It runs over a host interface, so the tests use a fake page; `DEVICE_HOST` is the tablet's.
 */
import {rectProblem, type Rect, type Size} from '@ink-tools/ink-core';
import {
  getLassoRect,
  resizeLassoRect,
  Result,
  setLassoTitle,
  type TitleStyle,
} from '@ink-tools/sn-adapter/official';
import type {Problem} from '@ink-tools/ui-kit';
import {copy} from '../copy';
import {working} from '../working';
import {currentPageSize} from '../pageSize';
import {lookupLog, showToast, whyNot} from '../textBox';
import {levelStyle, placement, type HeadingLevel} from './levels';

export type HeadingHost = {
  lassoRect: () => Promise<Result<Rect>>;
  pageSize: () => Promise<Result<Size>>;
  setTitle: (style: TitleStyle) => Promise<Result<boolean>>;
  resize: (rect: Rect) => Promise<Result<boolean>>;
  toast: (text: string) => void;
  /** Holds a failure on the tablet on the Error state, with its reason and Close (#256). */
  fail: (problem: Problem) => void;
  log: (line: string) => void;
};

/** The Error state of a heading the tablet could not make (#256). */
const FAILED: Problem = {what: copy['heading.failed'], reason: copy['heading.failedReason']};

/** How a press ended: the toast or the Error state it showed names it to the person. */
export type HeadingOutcome =
  | {ok: true; rect: Rect}
  | {ok: false; why: 'lasso' | 'page' | 'unplaced' | 'title' | 'resize'};

/**
 * Makes the lasso a heading of `level`. Nothing changes when the lasso or the page cannot be read,
 * or the lasso is a pasted piece with no place on the page yet (#165). A failed move still makes the
 * title where the line is and says it was not moved; a failed title shows the Error state. A second
 * press on a heading only changes its style, since the host's title call changes a lassoed title's
 * style, and its place is already the margin.
 */
export async function applyHeading(
  level: HeadingLevel,
  host: HeadingHost,
): Promise<HeadingOutcome> {
  const tag = `heading ${level}`;
  const started = Date.now();
  // The two reads are independent bridge calls: asked together, the press waits for one round trip
  // instead of two (device round 7 measured 1.07 s for a warm press, #252).
  const [rect, page] = await Promise.all([host.lassoRect(), host.pageSize()]);
  if (!rect.ok) {
    host.log(`${tag}: lasso failed: ${rect.code} ${rect.message}`);
    host.toast(copy['heading.noLasso']);
    return {ok: false, why: 'lasso'};
  }
  if (!page.ok) {
    host.log(`${tag}: page size failed: ${page.code} ${page.message}`);
    host.fail(FAILED);
    return {ok: false, why: 'page'};
  }
  const problem = rectProblem(rect.value, page.value);
  const target = problem ? null : placement(rect.value, page.value);
  if (!target) {
    host.log(`${tag}: ${problem ?? 'no place on the page'}`);
    host.toast(copy['error.unplaced']);
    return {ok: false, why: 'unplaced'};
  }
  const resized = await host.resize(target);
  const moved = resized.ok && resized.value;
  if (!moved) {
    host.log(`${tag}: resizeLassoRect ${whyNot(resized)}`);
  }
  const titled = await host.setTitle(levelStyle(level));
  if (!titled.ok || !titled.value) {
    host.log(`${tag}: setLassoTitle ${whyNot(titled)}`);
    host.fail(FAILED);
    return {ok: false, why: 'title'};
  }
  if (!moved) {
    host.toast(copy['heading.notMoved']);
    return {ok: false, why: 'resize'};
  }
  host.log(`${tag}: done at ${JSON.stringify(target)} in ${Date.now() - started} ms`);
  return {ok: true, rect: target};
}

export const DEVICE_HOST: HeadingHost = {
  lassoRect: getLassoRect,
  pageSize: currentPageSize,
  setTitle: setLassoTitle,
  resize: resizeLassoRect,
  toast: showToast,
  fail: problem => working.hold(problem),
  log: lookupLog,
};

/** The press of one «Heading N» button, on the tablet. */
export function headingLasso(level: HeadingLevel): Promise<HeadingOutcome> {
  return applyHeading(level, DEVICE_HOST);
}
