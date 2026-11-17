/**
 * «Undo Conversion» (#188): the last conversion's text box goes and the word's strokes come back,
 * rebuilt from their saved points, in ONE batchUpdatePageElements call. Only the last conversion is
 * kept, in memory [inference: a restart loses it, enough for «the last conversion»]; a record from
 * another note or page is never applied.
 */
import type {Rect} from '@supernote-tools/ink-core';
import {
  fail,
  ok,
  type Result,
  type SavedStroke,
  TEXT_TYPE,
  type TextBoxInput,
  THROWN_CODE,
} from '@supernote-tools/sn-adapter/official';

export type Conversion = {path: string; page: number; box: TextBoxInput; strokes: SavedStroke[]};

let last: Conversion | null = null;

export function setLastConversion(conversion: Conversion | null): void {
  last = conversion;
}

export function lastConversion(): Conversion | null {
  return last;
}

/** How far, in page pixels, the host may have moved the box's rect [inference]. */
export const RECT_SLACK = 4;

export type UndoHost = {
  getCurrentFilePath(): Promise<Result<string>>;
  getCurrentPageNum(): Promise<Result<number>>;
  getElements(page: number, path: string): Promise<Result<object[]>>;
  rebuildStroke(saved: SavedStroke): Promise<Result<object>>;
  batchUpdatePageElements(
    deleteNums: number[],
    elements: object[],
    page: number,
  ): Promise<Result<boolean>>;
  recycleElement(element: object): Promise<Result<true>>;
  log(line: string): void;
};

export type UndoOutcome = 'undone' | 'nothing' | 'failed';

type PageText = {
  type?: number;
  numInPage?: number;
  textBox?: {textRect?: Rect; textContentFull?: string | null} | null;
};

/** The largest distance between the top-left corners of two rects. */
const cornerDistance = (a: Rect, b: Rect) =>
  Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top));

const rectText = (rect: Rect | undefined) =>
  rect ? `${rect.left},${rect.top},${rect.right},${rect.bottom}` : 'none';

/**
 * The number of the conversion's text box in a page read: a text box with its text whose top-left
 * corner is within RECT_SLACK of the written one, the nearest first. Only the corner is compared:
 * the host may size the box again to its text, and on the tablet the exact rect never matched
 * («the converted text box is no longer on the page» right after a conversion, #206). A miss says
 * what the page holds, in counts and rects only, never the text.
 */
export function boxNumber(conversion: Conversion, page: readonly object[]): Result<number> {
  const boxes = (page as PageText[]).filter(element => element.type === TEXT_TYPE);
  const sameText = boxes.filter(
    element => element.textBox?.textContentFull?.trim() === conversion.box.text.trim(),
  );
  const nearest = sameText
    .filter(element => element.textBox?.textRect && element.numInPage !== undefined)
    .sort(
      (a, b) =>
        cornerDistance(a.textBox?.textRect as Rect, conversion.box.rect) -
        cornerDistance(b.textBox?.textRect as Rect, conversion.box.rect),
    )[0];
  const rect = nearest?.textBox?.textRect;
  if (nearest && rect && cornerDistance(rect, conversion.box.rect) <= RECT_SLACK) {
    return ok(nearest.numInPage as number);
  }
  return fail(
    THROWN_CODE,
    `the converted text box is no longer on the page: ${boxes.length} text boxes, ` +
      `${sameText.length} with its text, nearest rect ${rectText(rect)}, ` +
      `written ${rectText(conversion.box.rect)}`,
  );
}

export async function undoLast(host: UndoHost): Promise<UndoOutcome> {
  const conversion = last;
  if (!conversion) {
    host.log('undo: nothing to undo');
    return 'nothing';
  }
  const path = await host.getCurrentFilePath();
  const page = await host.getCurrentPageNum();
  if (!path.ok || !page.ok) {
    host.log(`undo: ${path.ok ? (page as {message: string}).message : path.message}`);
    return 'failed';
  }
  if (path.value !== conversion.path || page.value !== conversion.page) {
    host.log('undo: the last conversion is on another page');
    return 'nothing';
  }
  const read = await host.getElements(page.value, path.value);
  if (!read.ok) {
    host.log(`undo: getElements ${read.message}`);
    return 'failed';
  }
  const num = boxNumber(conversion, read.value);
  read.value.forEach(element => host.recycleElement(element).catch(() => {}));
  if (!num.ok) {
    host.log(`undo: ${num.message}`);
    // The box was edited or removed: the record no longer matches the page.
    last = null;
    return 'nothing';
  }
  const strokes: object[] = [];
  for (const saved of conversion.strokes) {
    const rebuilt = await host.rebuildStroke(saved);
    if (!rebuilt.ok) {
      host.log(`undo: rebuildStroke ${rebuilt.message}`);
      return 'failed';
    }
    strokes.push(rebuilt.value);
  }
  const written = await host.batchUpdatePageElements([num.value], strokes, page.value);
  strokes.forEach(element => host.recycleElement(element).catch(() => {}));
  if (!written.ok || !written.value) {
    host.log(`undo: batchUpdatePageElements ${written.ok ? 'answered false' : written.message}`);
    return 'failed';
  }
  last = null;
  host.log(`undo: ${strokes.length} strokes back`);
  return 'undone';
}
