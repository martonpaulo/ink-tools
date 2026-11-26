/**
 * Headings' pure rules (#252): which native title style each level gets, and where a heading goes.
 * The host's title has four styles and no levels, so «Heading 1» to «Heading 4» is a map onto them
 * (the #252 Plan's map, accepted). A heading sits on its own line at the page's leading margin
 * and spans the writing width (owner D78 A, D81 A).
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
 * Where the heading of the lassoed `rect` goes on a page of `page` size: from the leading margin to
 * the trailing one, at the lasso's own top and height, so it stays on its line. A lasso that
 * reaches past the page is moved back onto it; null when the page is narrower than its margins or
 * the rect is empty.
 */
export function placement(
  rect: Rect,
  page: Size,
  margin = HEADING_MARGIN,
): Rect | null {
  const height = rect.bottom - rect.top;
  if (rect.right <= rect.left || height <= 0 || page.width <= 2 * margin) {
    return null;
  }
  const tall = Math.min(height, page.height);
  const top = Math.min(Math.max(0, rect.top), page.height - tall);
  return {
    left: margin,
    top: Math.round(top),
    right: page.width - margin,
    bottom: Math.round(top + tall),
  };
}
