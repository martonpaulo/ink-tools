/**
 * Text on a page (#379), drawn from Figtree's outlines in `font-data.ts` with no font engine.
 * shortcut: no kerning; add the font's kerning pairs if a footer line ever looks uneven.
 */
import { FONT_GLYPHS, FONT_METRICS } from './font-data';
import { type Tone } from './look';
import { fillPolygon, type Raster } from './raster';

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

/** Draws `text` with its baseline at `baseline`, starting, centred or ending at `x`. */
export function drawText(raster: Raster, text: string, x: number, baseline: number, style: TextStyle): void {
  const scale = style.size / FONT_METRICS.unitsPerEm;
  const width = measureText(text, style.size, style.weight);
  let pen = style.align === 'center' ? x - width / 2 : style.align === 'right' ? x - width : x;
  for (const char of text) {
    const [advance, ...outline] = glyph(char, style.weight);
    if (outline.length > 0) {
      const contours = (outline as readonly (readonly number[])[]).map((contour) =>
        contour.map((v, i) => (i % 2 === 0 ? pen + v * scale : baseline - v * scale)),
      );
      fillPolygon(raster, contours, style.tone);
    }
    pen += (advance as number) * scale;
  }
}

/** Draws `text` centred on (cx, cy): the middle of its capital height sits on cy. */
export function drawCentredText(raster: Raster, text: string, cx: number, cy: number, style: TextStyle): void {
  drawText(raster, text, cx, cy + capHeight(style.size) / 2, { ...style, align: 'center' });
}
