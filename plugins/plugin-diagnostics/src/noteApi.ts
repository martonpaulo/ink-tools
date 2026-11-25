import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {HelperError, type HelperApi, type Point, type Rect} from './helper';

/** sn-plugin-lib 0.2.3 element types and the pen values the 2026-11-16 round measured (docs/supernote.md › Plugins). */
const STROKE = 0;
const PICTURE = 200;
const TEXT = 500;
const PRESSURE = 2000;
/** `generateNotePng` at the page's own size, on white (sn-adapter's `pageImage` uses the same). */
const PAGE_SCALE = 1;
const WHITE_BACKGROUND = 1;

type Response = {success?: boolean; result?: unknown; error?: {code?: number; message?: string}};
type Accessor<T> = {size(): Promise<number>; getRange(start: number, count: number): Promise<T[]>; add(index: number, value: T): Promise<boolean>};
type Element = {
  type: number;
  stroke?: {points: Accessor<Point>; pressures: Accessor<number>; flagDraw: Accessor<boolean>};
  picture?: {rect: Rect};
  textBox?: {textRect: Rect};
};

/** The result of a call that answers `{success, result}`, or a HelperError with the SDK's own code. */
function unwrap<T>(what: string, response: unknown): T {
  const answer = response as Response | null | undefined;
  if (!answer || answer.success !== true) {
    throw new HelperError(answer?.error?.code ?? 1, `${what}: ${answer?.error?.message ?? 'no answer'}`);
  }
  return answer.result as T;
}

async function strokePoints(element: Element): Promise<Point[]> {
  const points = element.stroke?.points;
  if (!points) {
    return [];
  }
  return points.getRange(0, await points.size());
}

/** sn-plugin-lib behind HelperApi. Thin on purpose: every rule lives in helper.ts or the CLI. */
export const noteApi: HelperApi = {
  async pageNumber() {
    return unwrap<number>('getCurrentPageNum', await PluginCommAPI.getCurrentPageNum());
  },

  async jumpToPage(page) {
    unwrap('jumpToPage', await PluginCommAPI.jumpToPage(page));
  },

  async insertStrokes(strokes, page) {
    const elements: Element[] = [];
    for (const points of strokes) {
      const element = unwrap<Element>('createElement', await PluginCommAPI.createElement(STROKE));
      if (!element.stroke) {
        throw new HelperError(1, 'createElement gave no stroke');
      }
      for (let index = 0; index < points.length; index += 1) {
        await element.stroke.points.add(index, points[index]);
        await element.stroke.pressures.add(index, PRESSURE);
        await element.stroke.flagDraw.add(index, true);
      }
      elements.push(element);
    }
    unwrap('insertPageElements', await PluginCommAPI.insertPageElements(elements, page, null));
  },

  async renderPage(page, pngPath) {
    const notePath = unwrap<string>('getCurrentFilePath', await PluginCommAPI.getCurrentFilePath());
    const made = unwrap<boolean>(
      'generateNotePng',
      await PluginFileAPI.generateNotePng({notePath, page, times: PAGE_SCALE, pngPath, type: WHITE_BACKGROUND}),
    );
    if (made !== true) {
      throw new HelperError(1, 'generateNotePng: the page image was not generated');
    }
  },

  async insertPicture(path) {
    unwrap('insertImage', await PluginNoteAPI.insertImage(path));
  },

  async insertTextBox(text, rect, fontSize) {
    // sn-plugin-lib 0.2.3 TextBox: a plain, left-aligned, fixed-width box in the host's font.
    const textRect = {left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom)};
    const box = {fontSize, fontPath: null, textContentFull: text, textRect, textDigestData: null, textAlign: 0, textBold: 0, textItalics: 0, textFrameWidthType: 0, textFrameStyle: 0, textEditable: 0};
    unwrap('insertText', await PluginNoteAPI.insertText(box));
  },

  async insertPage(page, template) {
    const notePath = unwrap<string>('getCurrentFilePath', await PluginCommAPI.getCurrentFilePath());
    unwrap('insertNotePage', await PluginFileAPI.insertNotePage({notePath, page, template}));
  },

  async lasso(rect) {
    unwrap('lassoElements', await PluginCommAPI.lassoElements(rect));
    return unwrap<Record<string, unknown>>('getLassoElementTypeCounts', await PluginCommAPI.getLassoElementTypeCounts());
  },

  async lastElementRect() {
    const element = unwrap<Element>('getLastElement', await PluginFileAPI.getLastElement());
    if (element.type === PICTURE && element.picture) {
      return element.picture.rect;
    }
    if (element.type === TEXT && element.textBox) {
      return element.textBox.textRect;
    }
    const points = await strokePoints(element);
    if (!points.length) {
      throw new HelperError(1, `the last element (type ${element.type}) has no rect to lasso`);
    }
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    return {left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys)};
  },

  async lassoStrokes() {
    const elements = unwrap<Element[]>('getLassoElements', await PluginCommAPI.getLassoElements());
    const strokes: Point[][] = [];
    for (const element of elements.filter(item => item.type === STROKE)) {
      strokes.push(await strokePoints(element));
    }
    return strokes;
  },
};
