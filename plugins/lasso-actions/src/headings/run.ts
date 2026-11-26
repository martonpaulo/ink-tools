/**
 * One Headings press (#252): the lassoed handwriting becomes a native title of the level's style,
 * then the lasso box moves to the heading's place, on its own line from the leading margin across
 * the writing width. It runs over a host interface, so the tests use a fake page; `DEVICE_HOST`
 * is the tablet's.
 */
import {rectProblem, type Rect, type Size} from '@ink-tools/ink-core';
import {
  getLassoRect,
  resizeLassoRect,
  Result,
  setLassoTitle,
  type TitleStyle,
} from '@ink-tools/sn-adapter/official';
import {copy} from '../copy';
import {currentPageSize} from '../pageSize';
import {lookupLog, showToast, whyNot} from '../textBox';
import {levelStyle, placement, type HeadingLevel} from './levels';

export type HeadingHost = {
  lassoRect: () => Promise<Result<Rect>>;
  pageSize: () => Promise<Result<Size>>;
  setTitle: (style: TitleStyle) => Promise<Result<boolean>>;
  resize: (rect: Rect) => Promise<Result<boolean>>;
  toast: (text: string) => void;
  log: (line: string) => void;
};

/** How a press ended: the toast it showed names it to the person. */
export type HeadingOutcome =
  | {ok: true; rect: Rect}
  | {ok: false; why: 'lasso' | 'page' | 'unplaced' | 'title' | 'resize'};

/**
 * Makes the lasso a heading of `level`. Nothing changes when the lasso or the page cannot be read,
 * or the lasso is a pasted piece with no place on the page yet (#165). A failed title leaves the
 * lasso untouched; a failed resize keeps the title and says so. A second press on a heading only
 * changes its style, since the host's title call changes a lassoed title's style.
 */
export async function applyHeading(
  level: HeadingLevel,
  host: HeadingHost,
): Promise<HeadingOutcome> {
  const tag = `heading ${level}`;
  const rect = await host.lassoRect();
  if (!rect.ok) {
    host.log(`${tag}: lasso failed: ${rect.code} ${rect.message}`);
    host.toast(copy['heading.noLasso']);
    return {ok: false, why: 'lasso'};
  }
  const page = await host.pageSize();
  if (!page.ok) {
    host.log(`${tag}: page size failed: ${page.code} ${page.message}`);
    host.toast(copy['heading.failed']);
    return {ok: false, why: 'page'};
  }
  const problem = rectProblem(rect.value, page.value);
  const target = problem ? null : placement(rect.value, page.value);
  if (!target) {
    host.log(`${tag}: ${problem ?? 'no place on the page'}`);
    host.toast(copy['error.unplaced']);
    return {ok: false, why: 'unplaced'};
  }
  const titled = await host.setTitle(levelStyle(level));
  if (!titled.ok || !titled.value) {
    host.log(`${tag}: setLassoTitle ${whyNot(titled)}`);
    host.toast(copy['heading.failed']);
    return {ok: false, why: 'title'};
  }
  const resized = await host.resize(target);
  if (!resized.ok || !resized.value) {
    host.log(`${tag}: resizeLassoRect ${whyNot(resized)}`);
    host.toast(copy['heading.notMoved']);
    return {ok: false, why: 'resize'};
  }
  host.log(`${tag}: done at ${JSON.stringify(target)}`);
  return {ok: true, rect: target};
}

export const DEVICE_HOST: HeadingHost = {
  lassoRect: getLassoRect,
  pageSize: currentPageSize,
  setTitle: setLassoTitle,
  resize: resizeLassoRect,
  toast: showToast,
  log: lookupLog,
};

/** The press of one «Heading N» button, on the tablet. */
export function headingLasso(level: HeadingLevel): Promise<HeadingOutcome> {
  return applyHeading(level, DEVICE_HOST);
}
