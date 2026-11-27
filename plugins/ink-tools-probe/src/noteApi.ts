import {FileUtils, PluginCommAPI, PluginFileAPI, PluginManager, PluginNoteAPI} from 'sn-plugin-lib';
import {HelperError, type HelperApi, type Point, type Rect} from './helper';
import {TAG} from './probe';

/** sn-plugin-lib 0.2.3 element types and the pen values the 2026-11-16 round measured (docs/supernote.md › Plugins). */
const STROKE = 0;
const PICTURE = 200;
const TEXT = 500;
const PRESSURE = 2000;
/**
 * The fineliner (sn-plugin-lib's pen types) and the width the 2026-11-16 round drew with: a new
 * element's penType is 0, which the host refuses as «Invalid pen type» (code 302, #249).
 */
const FINELINER = 10;
const THICKNESS = 400;
/** `generateNotePng` at the page's own size, on white (sn-adapter's `pageImage` uses the same). */
const PAGE_SCALE = 1;
const WHITE_BACKGROUND = 1;
/**
 * The page PNG's name in the plugin's private folder: `generateNotePng` refuses the hidden
 * `.data/plugin/` folder inkctl reads, code 1204 «Invalid file path», while it writes the private
 * folder, `EXPORT/` and `MyStyle/` (measured, Manta, 2026-11-26, #296). So the page is drawn there
 * and copied to the channel folder; `MyStyle/` would sync it to Supernote Cloud (#148).
 */
const DRAWN_PAGE = 'page.png';

type Response = {success?: boolean; result?: unknown; error?: {code?: number; message?: string}};
type Accessor<T> = {size(): Promise<number>; getRange(start: number, count: number): Promise<T[]>; add(index: number, value: T): Promise<boolean>};
type Element = {
  type: number;
  thickness?: number;
  stroke?: {points: Accessor<Point>; pressures: Accessor<number>; flagDraw: Accessor<boolean>; penType?: number};
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

const SAVED = 'the note saved';

/** Saves the open note and logs the save and its time; true when it saved. Never throws (#296). */
export async function saveFirst(
  log: (line: string) => void = line => console.log(`${TAG} ${line}`),
  now: () => number = Date.now,
): Promise<boolean> {
  const started = now();
  let why: string;
  try {
    const answer = (await PluginNoteAPI.saveCurrentNote()) as Response | null | undefined;
    why =
      answer?.success === true && answer.result === true
        ? SAVED
        : `failed: ${answer?.error?.code ?? 'no code'} ${answer?.error?.message ?? 'answered false'}`;
  } catch (error) {
    why = `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  const ms = now() - started;
  const after = why === SAVED ? '' : ': the page is drawn as the file holds it';
  log(`save: ${why} in ${ms} ms${after}`);
  return why === SAVED;
}

/**
 * The picture elements on page `page` of the note at `notePath`, or null when the page's elements
 * did not read: the tablet's page PNG leaves every picture out (device round 5, #263), so the
 * answer says how many are missing from it.
 */
async function picturesOn(notePath: string, page: number): Promise<number | null> {
  try {
    const answer = (await PluginFileAPI.getElements(page, notePath)) as Response | null | undefined;
    const elements = answer?.success === true ? answer.result : null;
    return Array.isArray(elements) ? elements.filter(e => (e as Element)?.type === PICTURE).length : null;
  } catch {
    return null;
  }
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
      element.stroke.penType = FINELINER;
      element.thickness = THICKNESS;
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
    // generateNotePng reads the note's file: save first, so the newest strokes are in the PNG
    // (#296). A failed save is logged and the page is drawn as the file holds it.
    await saveFirst();
    const notePath = unwrap<string>('getCurrentFilePath', await PluginCommAPI.getCurrentFilePath());
    const drawn = `${await noteApi.pluginFolder()}/${DRAWN_PAGE}`;
    const made = unwrap<boolean>(
      'generateNotePng',
      await PluginFileAPI.generateNotePng({notePath, page, times: PAGE_SCALE, pngPath: drawn, type: WHITE_BACKGROUND}),
    );
    if (made !== true) {
      throw new HelperError(1, 'generateNotePng: the page image was not generated');
    }
    if (!(await FileUtils.copyFile(drawn, pngPath))) {
      throw new HelperError(1, `copyFile: the page image did not reach ${pngPath}`);
    }
    return {pictures: await picturesOn(notePath, page)};
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
    // insertNotePage rewrites the open note's file and drops the ink written since its last save
    // (device round 5, #263): save first, and insert nothing when the save fails.
    if (!(await saveFirst())) {
      throw new HelperError(1, 'saveCurrentNote did not save the open note: an insert would drop its unsaved ink, so no page was inserted');
    }
    const notePath = unwrap<string>('getCurrentFilePath', await PluginCommAPI.getCurrentFilePath());
    unwrap('insertNotePage', await PluginFileAPI.insertNotePage({notePath, page, template}));
  },

  async lasso(rect) {
    // A rect that catches nothing answers false, and the counts read after it are the previous
    // lasso's (device round 13, #325): so a false answer is a refusal, never those counts.
    if (unwrap<boolean>('lassoElements', await PluginCommAPI.lassoElements(rect)) !== true) {
      throw new HelperError(1, `lassoElements: the rect ${JSON.stringify(rect)} lassoed nothing`);
    }
    return unwrap<Record<string, unknown>>('getLassoElementTypeCounts', await PluginCommAPI.getLassoElementTypeCounts());
  },

  async openNotePath() {
    return unwrap<string>('getCurrentFilePath', await PluginCommAPI.getCurrentFilePath());
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

  async saveSticker(path) {
    unwrap('saveStickerByLasso', await PluginCommAPI.saveStickerByLasso(path));
  },

  async insertSticker(path) {
    unwrap('insertSticker', await PluginCommAPI.insertSticker(path));
  },

  async lassoBox() {
    return unwrap<Rect>('getLassoRect', await PluginCommAPI.getLassoRect());
  },

  async resizeLasso(rect) {
    unwrap('resizeLassoRect', await PluginCommAPI.resizeLassoRect(rect));
  },

  async pluginFolder() {
    const folder = await PluginManager.getPluginDirPath();
    if (!folder) {
      throw new HelperError(1, 'getPluginDirPath: no folder');
    }
    return folder.replace(/\/$/, '');
  },

  async makeDir(path) {
    if (!(await FileUtils.exists(path)) && !(await FileUtils.makeDir(path))) {
      throw new HelperError(1, `makeDir: ${path} was not made`);
    }
  },

  async listFiles(path) {
    const files = await FileUtils.listFiles(path);
    if (!files) {
      throw new HelperError(1, `listFiles: ${path} gave no list`);
    }
    return files;
  },

  async deleteFile(path) {
    if (!(await FileUtils.deleteFile(path))) {
      throw new HelperError(1, `deleteFile: ${path} was not deleted`);
    }
  },

  async fileDigest(path) {
    if (!(await FileUtils.exists(path))) {
      throw new HelperError(1, `fileDigest: ${path} is not there`);
    }
    const md5 = await FileUtils.getFileMD5(path);
    if (!md5) {
      throw new HelperError(1, `fileDigest: ${path} gave no digest`);
    }
    return md5.toLowerCase();
  },

  async notePageCount(notePath) {
    return unwrap<number>('getNoteTotalPageNum', await PluginFileAPI.getNoteTotalPageNum(notePath));
  },

  async notePageTemplate(notePath, page) {
    const info = unwrap<{name?: string}>('getNotePageTemplate', await PluginFileAPI.getNotePageTemplate(notePath, page));
    if (!info?.name) {
      throw new HelperError(1, `getNotePageTemplate: page ${page} gave no template name`);
    }
    return info.name;
  },

  async notePageElements(notePath, page) {
    const elements = unwrap<unknown>('getElements', await PluginFileAPI.getElements(page, notePath));
    if (!Array.isArray(elements)) {
      throw new HelperError(1, `getElements: page ${page} gave no element list`);
    }
    return elements;
  },

  async insertNotePage(notePath, page, template) {
    unwrap('insertNotePage', await PluginFileAPI.insertNotePage({notePath, page, template}));
  },

  async insertNoteElements(notePath, page, elements) {
    unwrap('insertElements', await PluginFileAPI.insertElements(notePath, page, elements as object[]));
  },

  async removeNotePage(notePath, page) {
    unwrap('removeNotePage', await PluginFileAPI.removeNotePage(notePath, page));
  },
};
