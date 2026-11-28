/**
 * «Convert to Text» (#250): a lasso button that recognizes the whole lassoed handwriting in ONE
 * recognizeElements call and, in ONE batchUpdatePageElements call, replaces its strokes with one
 * text box at the lasso's place. Line breaks in the recognized text stay as paragraphs. «Undo
 * Conversion» (#188) undoes it, as it undoes a word. Any failure keeps the handwriting and is
 * logged; the lasso's elements are freed either way.
 *
 * shortcut: the box uses the tablet's default font, as the word conversion does, until the chosen
 * font of #144 has its device fact (`fontPath`); then the settings' font goes into the box here.
 */
import {writableSize, type Rect, type Size} from '@ink-tools/ink-core';
import type {
  Result,
  SavedStroke,
  TextBoxInput,
} from '@ink-tools/sn-adapter/official';
import {
  LINE_SHARE,
  MIN_FONT_SIZE,
  type HostElement,
  setLastConversion,
} from '@ink-tools/ink-core/conversion';

/**
 * A handwritten line is about this many typed line heights tall, ascenders and descenders with
 * the gap below [inference: about 2.5 letter heights over Lookup's 1.5 font sizes a line]; the
 * device round sets it.
 */
export const INK_LINE_PER_TEXT_LINE = 1.2;

/** The SDK calls «Convert to Text» makes, each through sn-adapter; tests pass a fake. */
export type LassoConvertHost = {
  getLassoElements(): Promise<Result<object[]>>;
  getLassoRect(): Promise<Result<Rect>>;
  getCurrentFilePath(): Promise<Result<string>>;
  getCurrentPageNum(): Promise<Result<number>>;
  getPageSize(path: string, page: number): Promise<Result<Size>>;
  recognizeElements(elements: object[], size: Size): Promise<Result<string>>;
  saveStroke(element: object): Promise<Result<SavedStroke>>;
  createTextBox(box: TextBoxInput): Promise<Result<object>>;
  batchUpdatePageElements(
    deleteNums: number[],
    elements: object[],
    page: number,
  ): Promise<Result<boolean>>;
  recycleElement(element: object): Promise<Result<true>>;
  log(line: string): void;
};

/** What the press did: converted, nothing to convert, or kept after a failure. */
export type LassoOutcome = 'converted' | 'empty' | 'failed';

/** The recognized text as paragraphs: one per handwritten line, blank lines dropped. */
export function paragraphsOf(text: string): string {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * The text box for `text` over the lasso's `rect`: from its top-left, at least as wide as the
 * lasso, each paragraph one line of a font sized from the lasso's height per line, inside the page
 * and above the note's page bar (#577), as the word box is.
 */
export function lassoBoxFor(
  text: string,
  rect: Rect,
  pageSize: Size,
): TextBoxInput {
  const page = writableSize(pageSize);
  const lines = Math.max(1, text.split('\n').length);
  const inkLine = (rect.bottom - rect.top) / lines;
  const fontSize = Math.max(
    MIN_FONT_SIZE,
    Math.round(inkLine / (INK_LINE_PER_TEXT_LINE * LINE_SHARE)),
  );
  // Whole pixels, as the word box (#206); one font size more, so the host never wraps a line.
  const width = Math.min(
    page.width,
    Math.ceil(rect.right - rect.left) + fontSize,
  );
  const left = Math.max(0, Math.min(Math.round(rect.left), page.width - width));
  const height = Math.ceil(
    Math.max(rect.bottom - rect.top, lines * fontSize * LINE_SHARE),
  );
  const top = Math.max(0, Math.min(Math.round(rect.top), page.height - height));
  return {
    text,
    fontSize,
    rect: {
      left,
      top,
      right: left + width,
      bottom: Math.min(page.height, top + height),
    },
  };
}

/** One press of «Convert to Text». The lasso is read first: its context is short-lived. */
export async function convertLasso(
  host: LassoConvertHost,
): Promise<LassoOutcome> {
  const {log} = host;
  const read = await host.getLassoElements();
  if (!read.ok) {
    log(`lasso: getLassoElements ${read.message}`);
    return 'failed';
  }
  try {
    const strokes = (read.value as HostElement[]).filter(
      element => element.type === 0 && element.numInPage !== undefined,
    ) as object[];
    if (strokes.length === 0) {
      log(`lasso: no handwriting in ${read.value.length} lassoed elements`);
      return 'empty';
    }
    return await replaceLasso(host, strokes);
  } finally {
    read.value.forEach(element => host.recycleElement(element).catch(() => {}));
  }
}

async function replaceLasso(
  host: LassoConvertHost,
  strokes: object[],
): Promise<LassoOutcome> {
  const {log} = host;
  const rect = await host.getLassoRect();
  const path = await host.getCurrentFilePath();
  const page = await host.getCurrentPageNum();
  if (!rect.ok || !path.ok || !page.ok) {
    const failed = [rect, path, page].find(each => !each.ok) as {
      message: string;
    };
    log(`lasso kept: ${failed.message}`);
    return 'failed';
  }
  const size = await host.getPageSize(path.value, page.value);
  if (!size.ok) {
    log(`lasso kept: getPageSize ${size.message}`);
    return 'failed';
  }
  // Lassoed elements hold page pixels at the page size, as recognition needs (#206).
  const text = await host.recognizeElements(strokes, size.value);
  if (!text.ok) {
    log(`lasso kept: recognizeElements ${text.message}`);
    return 'failed';
  }
  const paragraphs = paragraphsOf(text.value);
  if (!paragraphs) {
    log('lasso kept: recognized as empty text');
    return 'failed';
  }
  // Kept for «Undo Conversion» before the strokes leave the page (#188).
  const saved: SavedStroke[] = [];
  for (const element of strokes) {
    const one = await host.saveStroke(element);
    if (!one.ok) {
      log(`lasso kept: saveStroke ${one.message}`);
      return 'failed';
    }
    saved.push(one.value);
  }
  const box = lassoBoxFor(paragraphs, rect.value, size.value);
  const made = await host.createTextBox(box);
  if (!made.ok) {
    log(`lasso kept: createTextBox ${made.message}`);
    return 'failed';
  }
  const nums = (strokes as HostElement[]).map(
    element => element.numInPage as number,
  );
  const written = await host.batchUpdatePageElements(
    nums,
    [made.value],
    page.value,
  );
  if (!written.ok || !written.value) {
    log(
      `lasso kept: batchUpdatePageElements ${
        written.ok ? 'answered false' : written.message
      }`,
    );
    return 'failed';
  }
  setLastConversion({path: path.value, page: page.value, box, strokes: saved});
  log(
    `lasso converted ${[...paragraphs].length} characters in ` +
      `${paragraphs.split('\n').length} paragraphs from ${nums.length} strokes`,
  );
  return 'converted';
}
