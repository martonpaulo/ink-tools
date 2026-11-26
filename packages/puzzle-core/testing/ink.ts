/**
 * Ink as `inkctl ink write` draws it, for the ink check's tests (#382, #387): each character from
 * its own glyphs (scripts/inkctl_glyphs.py), centred in a cell, and a recogniser that reads it back.
 */
import glyphData from '../__tests__/fixtures/inkctl-glyphs.json';
import { type InkStroke, type ReadText } from '../src/check';
import { cellCenter, type Grid } from '../src/page/grid';

/** The glyphs `inkctl ink write` draws, from its own font (scripts/inkctl_glyphs.py). */
const GLYPHS = glyphData.glyphs as unknown as Record<string, number[][][]>;
const GLYPH_HEIGHT = 90;
/** A written character fills about 70 % of the cell's height, as in the digit probe (#378). */
const WRITTEN_SHARE = 0.7;

/** A stroke's element in these tests: the character it belongs to, and which written copy. */
export type Tag = { ch: string; copy: number };
let copies = 0;

/** The character written in a cell as inkctl draws it, centred, with its strokes tagged. */
export function write(grid: Grid, column: number, row: number, ch: string, dx = 0): InkStroke<Tag>[] {
  const strokes = GLYPHS[ch];
  const points = strokes.flat();
  const scale = (WRITTEN_SHARE * grid.cell) / GLYPH_HEIGHT;
  const width = (Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]))) * scale;
  const [cx, cy] = cellCenter(grid, column, row);
  const left = cx - width / 2 - Math.min(...points.map(p => p[0])) * scale + dx;
  const top = cy - (GLYPH_HEIGHT * scale) / 2;
  const tag = { ch, copy: copies++ };
  return strokes.map(stroke => ({ points: stroke.map(([x, y]) => ({ x: left + x * scale, y: top + y * scale })), element: tag }));
}

/** A recogniser that reads each written copy's character back, spaced, and counts its calls. */
export function fakeRecognizer(read: (ch: string) => string | null = ch => ch) {
  const calls: number[] = [];
  const recognize = async (elements: Tag[]): Promise<ReadText> => {
    calls.push(elements.length);
    const seen: Tag[] = [];
    for (const tag of elements) if (!seen.includes(tag)) seen.push(tag);
    const parts = seen.map(tag => read(tag.ch)).filter((part): part is string => part !== null);
    return { ok: true, text: parts.length ? parts.join(' ') : null };
  };
  return { recognize, calls };
}
