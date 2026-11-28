/**
 * Headings' pure rules (#252): which native title style each level gets, and where a heading goes.
 * The host's title has four styles and no levels, so «Heading 1» to «Heading 4» is a map onto them
 * (the #252 Plan's map, accepted). A heading sits on its own line at the page's leading margin
 * (owner D78 A, D81 A), at the size Settings › «Heading Size» names (owner D90): its handwriting's
 * own size, the default, or the full writing width, which stretches the strokes to it, since the
 * tablet cannot widen a title past its strokes otherwise (device round 7).
 */
import type {Rect, Size} from '@ink-tools/ink-core';
import {headingStyle, type HeadingLevel, type TitleStyle} from '@ink-tools/sn-adapter/official';

/** The level map is sn-adapter's, which Note Editor's Format › Heading shares (#345). */
export {HEADING_LEVELS, type HeadingLevel} from '@ink-tools/sn-adapter/official';

/** Settings › «Heading Size» (owner D90): `own`, the handwriting's own size, or `full`, the writing width. */
export const HEADING_SIZES = ['own', 'full'] as const;
export type HeadingSize = (typeof HEADING_SIZES)[number];
export const DEFAULT_HEADING_SIZE: HeadingSize = 'own';

export function levelStyle(level: HeadingLevel): TitleStyle {
  return headingStyle(level);
}

/**
 * The page's margin on each side, in page pixels, between the edge and the writing width
 * [INFERENCE]. shortcut: one fixed margin for every template; #252's device probe (its Task 1)
 * measures where the host's own title starts and replaces this value.
 */
export const HEADING_MARGIN = 96;

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
  const width = size === 'full' ? page.width - 2 * margin : rect.right - rect.left;
  const left = Math.min(margin, Math.max(0, page.width - width));
  const tall = Math.min(height, page.height);
  const top = Math.min(Math.max(0, rect.top), page.height - tall);
  return {
    left: Math.round(left),
    top: Math.round(top),
    right: Math.round(left + width),
    bottom: Math.round(top + tall),
  };
}
