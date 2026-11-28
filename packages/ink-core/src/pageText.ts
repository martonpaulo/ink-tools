/**
 * The one owner of the typography the plugins use to size a text box before the host draws it
 * (#295): Word Lookup's definition box, Device Link's received text and Smart Pen's conversion.
 */

/** A typed text box's font size in page pixels, as Word Lookup's definition box [INFERENCE]. */
export const TEXT_FONT_SIZE = 32;

/** A line of text is this many font sizes high, as Word Lookup's box [INFERENCE]. */
export const LINE_SHARE = 1.5;

/**
 * About how wide one character is, as a share of the font size, as the retired picture plugin
 * measured it [INFERENCE].
 */
export const CHAR_SHARE = 0.55;

/** One line's height in whole page pixels at `fontSize`. */
export function lineHeight(fontSize: number): number {
  return Math.round(fontSize * LINE_SHARE);
}

/** How many average characters fit on one line `width` page pixels wide, at least one. */
export function charsPerLine(width: number, fontSize: number): number {
  return Math.max(1, Math.floor(width / (fontSize * CHAR_SHARE)));
}
