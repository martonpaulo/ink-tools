/**
 * Text on a page (#379), drawn from Figtree's outlines in `font-data.ts` with no font engine.
 * shortcut: no kerning; add the font's kerning pairs if a footer line ever looks uneven.
 */
import { FONT_GLYPHS, FONT_METRICS } from './font-data';
import { type Tone } from './look';
import { MASK_CACHE_LIMIT, MASK_SUBPIXEL, MaskCache, paintMask, placedMask, type PlacedMask, type Raster } from './raster';

/** Regular for clues and the footer, bold for givens: the two weights font-data.ts holds. */
export const FONT_WEIGHTS = { regular: 400, bold: 700 } as const;
export type FontWeight = (typeof FONT_WEIGHTS)[keyof typeof FONT_WEIGHTS];
export type TextAlign = 'left' | 'center' | 'right';

export interface TextStyle {
  /** The em in pixels. */
  size: number;
  weight: FontWeight;
  tone: Tone;
  align?: TextAlign;
}

function glyph(char: string, weight: FontWeight): readonly (number | readonly number[])[] {
  const found = FONT_GLYPHS[weight][char];
  if (!found) throw new Error(`the page font has no «${char}» (U+${char.charCodeAt(0).toString(16).toUpperCase()})`);
  return found;
}

/**
 * The text as the page font can draw it: a letter the font lacks loses its accent (é as e, ü as u),
 * and ß is written ss. shortcut: the font holds printable ASCII and Ñ only; add the accented
 * letters to `scripts/font-outlines.swift` on the Mac and drop this fold when the clue text of a
 * crossword (#400) must show them.
 */
export function pageText(text: string): string {
  return [...text]
    .map(char => {
      if (FONT_GLYPHS[FONT_WEIGHTS.regular][char] && FONT_GLYPHS[FONT_WEIGHTS.bold][char]) return char;
      if (char === 'ß') return 'ss';
      return char.normalize('NFD').replace(/\p{M}/gu, '');
    })
    .join('');
}

/** The width of `text` in pixels at `size`. */
export function measureText(text: string, size: number, weight: FontWeight): number {
  let units = 0;
  for (const char of text) units += glyph(char, weight)[0] as number;
  return (units * size) / FONT_METRICS.unitsPerEm;
}

/** The height of a capital letter or digit in pixels at `size`. */
export function capHeight(size: number): number {
  return (FONT_METRICS.capHeight * size) / FONT_METRICS.unitsPerEm;
}

/**
 * Each glyph's coverage for a size, a weight and the pen's place within its pixel. A page repeats
 * a few glyphs many times (a word search's letters, a sudoku's digits), so each is filled once
 * and then only blended: filling it every time was most of a text page's drawing time on the
 * tablet (#379, device round 11).
 */
const glyphMasks = new MaskCache(MASK_CACHE_LIMIT);

function glyphMask(char: string, style: TextStyle, fx: number, fy: number): PlacedMask | null {
  const [, ...outline] = glyph(char, style.weight);
  if (outline.length === 0) return null;
  return glyphMasks.get(`${style.weight} ${style.size} ${fx} ${fy} ${char}`, () => {
    const scale = style.size / FONT_METRICS.unitsPerEm;
    const ox = fx / MASK_SUBPIXEL;
    const oy = fy / MASK_SUBPIXEL;
    return placedMask(
      (outline as readonly (readonly number[])[]).map((contour) => contour.map((v, i) => (i % 2 === 0 ? ox + v * scale : oy - v * scale))),
    );
  });
}

/** Draws `text` with its baseline at `baseline`, starting, centred or ending at `x`. */
export function drawText(raster: Raster, text: string, x: number, baseline: number, style: TextStyle): void {
  const scale = style.size / FONT_METRICS.unitsPerEm;
  const width = measureText(text, style.size, style.weight);
  let pen = style.align === 'center' ? x - width / 2 : style.align === 'right' ? x - width : x;
  // The baseline and each glyph's start snap to 1/MASK_SUBPIXEL px, so equal glyphs share one mask.
  const line = Math.round(baseline * MASK_SUBPIXEL);
  for (const char of text) {
    const [advance] = glyph(char, style.weight);
    const start = Math.round(pen * MASK_SUBPIXEL);
    const fx = ((start % MASK_SUBPIXEL) + MASK_SUBPIXEL) % MASK_SUBPIXEL;
    const fy = ((line % MASK_SUBPIXEL) + MASK_SUBPIXEL) % MASK_SUBPIXEL;
    const entry = glyphMask(char, style, fx, fy);
    if (entry) paintMask(raster, entry.mask, (start - fx) / MASK_SUBPIXEL + entry.left, (line - fy) / MASK_SUBPIXEL + entry.top, style.tone);
    pen += (advance as number) * scale;
  }
}

/** Draws `text` centred on (cx, cy): the middle of its capital height sits on cy. */
export function drawCentredText(raster: Raster, text: string, cx: number, cy: number, style: TextStyle): void {
  drawText(raster, text, cx, cy + capHeight(style.size) / 2, { ...style, align: 'center' });
}
