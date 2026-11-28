/**
 * Headings' pure rules (#252): which native title style each level gets, and where a heading goes.
 * The host's title has four styles and no levels, so «Heading 1» to «Heading 4» is a map onto them
 * (the #252 Plan's map, accepted). A heading sits on its own line at the page's leading margin
 * (owner D78 A, D81 A), at the size Settings › «Heading Size» names (owner D90): its handwriting's
 * own size, the default, or the full writing width, which stretches the strokes to it, since the
 * tablet cannot widen a title past its strokes otherwise (device round 7).
 */
import type {Rect, Size} from '@ink-tools/ink-core';
import {TITLE_STYLE, type TitleStyle} from '@ink-tools/sn-adapter/official';

export const HEADING_LEVELS = [1, 2, 3, 4] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** Level 1 the strongest style, level 4 the lightest. */
const LEVEL_STYLE: Readonly<Record<HeadingLevel, TitleStyle>> = {
  1: TITLE_STYLE.black,
  2: TITLE_STYLE.shadow,
  3: TITLE_STYLE.darkGrey,
  4: TITLE_STYLE.lightGrey,
};

/** Settings › «Heading Size» (owner D90): `own`, the handwriting's own size, or `full`, the writing width. */
export const HEADING_SIZES = ['own', 'full'] as const;
export type HeadingSize = (typeof HEADING_SIZES)[number];
export const DEFAULT_HEADING_SIZE: HeadingSize = 'own';

export function levelStyle(level: HeadingLevel): TitleStyle {
  return LEVEL_STYLE[level];
}

/**
 * The page's margin on each side, in page pixels, between the edge and the writing width
 * [INFERENCE]. shortcut: one fixed margin for every template; #252's device probe (its Task 1)
 * measures where the host's own title starts and replaces this value.
 */
export const HEADING_MARGIN = 96;

/**
 * The space NOTE's lasso rect holds around its ink on each side, in page pixels (device round 12,
 * #252: an Own Size heading sent to x 96 to 352 saved its TITLERECT at 101 to 347, and a Full Width
 * one sent to 96 to 1824 saved 121 to 1803, the same space scaled with the strokes).
 */
export const LASSO_SPACE = 5;

/**
 * Where the heading of the lassoed `rect` goes on a page of `page` size: at the leading margin, at
 * the lasso's own top and height, so it stays on its line. With `own` it keeps the handwriting's
 * width and proportions: `resizeLassoRect` scales the strokes to the rect it is given, and the
 * title's box is its strokes' box (device round 7, #252: a 290 px lasso sent to 1,728 px stretched
 * «save» from 280 to 1,666 px), so only `full` makes it as wide as the writing width, stretching
 * the strokes. A lasso wider than the writing width starts nearer the edge, never past it; one
 * that reaches past the page's foot is moved back onto it; null when the page is narrower than its
 * margins or the rect is empty.
 */
export function placement(
  rect: Rect,
  page: Size,
  size: HeadingSize = DEFAULT_HEADING_SIZE,
  margin = HEADING_MARGIN,
): Rect | null {
  const height = rect.bottom - rect.top;
  if (rect.right - rect.left <= 0 || height <= 0 || page.width <= 2 * margin) {
    return null;
  }
  if (size === 'full') {
    return {...fullWidth(rect.right - rect.left, page.width, margin), ...rows(rect, page, height)};
  }
  const width = rect.right - rect.left;
  const left = Math.min(margin, Math.max(0, page.width - width));
  return {left: Math.round(left), right: Math.round(left + width), ...rows(rect, page, height)};
}

/** The lasso's own top and height, moved back onto the page when it reaches past the foot. */
function rows(rect: Rect, page: Size, height: number): Pick<Rect, 'top' | 'bottom'> {
  const tall = Math.min(height, page.height);
  const top = Math.min(Math.max(0, rect.top), page.height - tall);
  return {top: Math.round(top), bottom: Math.round(top + tall)};
}

/**
 * The lasso rect whose ink spans the writing width: `resizeLassoRect` scales the whole lasso rect,
 * its space around the ink too, so the rect grows past each margin by that space at the new scale,
 * and the ink, not the rect, lands on the margins (device round 12, #252). Kept inside the page.
 */
function fullWidth(lassoWidth: number, pageWidth: number, margin: number): Pick<Rect, 'left' | 'right'> {
  const ink = lassoWidth - 2 * LASSO_SPACE;
  const grow = ink > 0 ? (LASSO_SPACE * (pageWidth - 2 * margin)) / ink : 0;
  return {
    left: Math.round(Math.max(0, margin - grow)),
    right: Math.round(Math.min(pageWidth, pageWidth - margin + grow)),
  };
}
