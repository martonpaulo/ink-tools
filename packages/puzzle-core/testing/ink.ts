/**
 * Synthetic ink for the check tests (#382, #383): characters written in grid cells as
 * `inkctl ink write` draws them, from its own font (scripts/inkctl_glyphs.py), and a recogniser
 * that reads each written copy back.
 */
import glyphData from '../__tests__/fixtures/inkctl-glyphs.json';
import { type InkStroke, type ReadText } from '../src/check';
import { cellCenter, type Grid } from '../src/page/grid';

const GLYPHS = glyphData.glyphs as unknown as Record<string, number[][][]>;
const GLYPH_HEIGHT = 90;
/** A written character fills about 70 % of the cell's height, as in the digit probe (#378). */
const WRITTEN_SHARE = 0.7;
/** The distance between the digits of a written number, as a share of the cell. */
const DIGIT_SPACING = 0.25;

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

/** A number of one or more digits written side by side in one cell, as a player writes 12. */
export function writeNumber(grid: Grid, column: number, row: number, text: string): InkStroke<Tag>[] {
  const step = grid.cell * DIGIT_SPACING;
  const first = -((text.length - 1) * step) / 2;
  return [...text].flatMap((ch, i) => write(grid, column, row, ch, first + i * step));
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
