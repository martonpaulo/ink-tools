/**
 * The command channel inkctl drives (#148): inkctl pushes one JSON command to COMMAND_PATH, presses
 * the «Run Command» sidebar button in the open note, and reads the answer from logcat. This module
 * owns the command's shape and the answer's lines; `noteApi.ts` is the thin glue to sn-plugin-lib.
 * The CLI owns every rule (text to strokes, rect arithmetic, refusals); this side only executes.
 */

import {REGISTRY} from '@ink-tools/sn-adapter/registry';

/** Registry item storage.helper-channel, which inkctl reads too (#294). */
const CHANNEL = REGISTRY.storageHelperChannel;

/** The only folder a command may name a file in: inkctl's own folder (`MyStyle/Probe/`). */
export const PROBE_FOLDER = `${CHANNEL.folder}/`;
/** Where inkctl pushes the command; `cli/inkctl/src/inkctl` reads the same registry item. */
export const COMMAND_PATH = `${PROBE_FOLDER}${CHANNEL.commandFile}`;
/** Every answer line starts with this, then the command id, the chunk number and the count. */
export const ANSWER_MARK = CHANNEL.answerMark;
/** The id of an answer whose command carries none it could read. */
export const UNKNOWN_ID = 'unknown';
/** A logcat line holds about 4 KB; a longer answer goes in chunks of this many characters. */
export const ANSWER_CHUNK = 3000;
/** The page's size in pixels on the owner's tablet (docs/supernote.md › Screen and units). */
export const PAGE_WIDTH = 1920;
export const PAGE_HEIGHT = 2560;
/** Room around the last element, so its whole outline lies inside the lasso. */
export const LASSO_MARGIN = 8;
/** At most this many points in one command, so one press stays within a few seconds. */
export const MAX_POINTS = 5000;
/** At most this many steps in one `batch` command, each held to its own command's limits (#286). */
export const MAX_BATCH_STEPS = 64;
/** Where `renderPage` writes the page's PNG for inkctl to pull (#261). */
export const RENDER_PATH = `${PROBE_FOLDER}page.png`;
/** A text box's text, and its font size in page pixels, kept to what one press needs. */
export const MAX_TEXT = 500;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 200;
/** The folder under the plugin's private folder where sticker probes go (#249). */
export const PLUGIN_STICKERS = 'collection';
/** The only folder `movePage` may name a note in: the shared notes folder (#263). */
export const NOTES_FOLDER = '/storage/emulated/0/Note/';
/**
 * The screen suffix a page's template name carries in the file (`style_5mm_grid_a5x2`), which
 * `insertNotePage` refuses with code 802 (docs/supernote.md › Note file format, #214).
 */
const SCREEN_SUFFIX = /_a[0-9]+x[0-9]*$/;

export type Point = {x: number; y: number};
export type Rect = {left: number; top: number; right: number; bottom: number};

/** What the note can do for a command, as `noteApi.ts` wraps sn-plugin-lib. Each call throws a HelperError. */
export interface HelperApi {
  pageNumber(): Promise<number>;
  insertStrokes(strokes: Point[][], page: number): Promise<void>;
  lasso(rect: Rect): Promise<Record<string, unknown>>;
  lastElementRect(): Promise<Rect>;
  lassoStrokes(): Promise<Point[][]>;
  jumpToPage(page: number): Promise<void>;
  /** Writes page `page` of the open note to `pngPath`, at the page's size, on white. */
  renderPage(page: number, pngPath: string): Promise<void>;
  /** Places a PNG or JPEG on the current page, where the host puts it. */
  insertPicture(path: string): Promise<void>;
  insertTextBox(text: string, rect: Rect, fontSize: number): Promise<void>;
  /** Inserts a page at index `page` of the open note, with a system template such as `style_white`. */
  insertPage(page: number, template: string): Promise<void>;
  /** Saves the lassoed elements as a sticker file (#249). */
  saveSticker(path: string): Promise<void>;
  /** Inserts a sticker file on the current page, where the host puts it (#249). */
  insertSticker(path: string): Promise<void>;
  /** The lasso's rect on the page (#249). */
  lassoBox(): Promise<Rect>;
  /** Moves and resizes the lasso box with what it holds to `rect` (#249). */
  resizeLasso(rect: Rect): Promise<void>;
  /** The plugin's private folder, with no trailing slash (#249). */
  pluginFolder(): Promise<string>;
  makeDir(path: string): Promise<void>;
  listFiles(path: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;
  /** The page count of the note at `notePath`, open or not (#263). */
  notePageCount(notePath: string): Promise<number>;
  /** The template name `getNotePageTemplate` gives for a page of that note, as the file stores it. */
  notePageTemplate(notePath: string, page: number): Promise<string>;
  /** Every element of a page of that note, as the SDK gives them; the helper only passes them on. */
  notePageElements(notePath: string, page: number): Promise<unknown[]>;
  /** Inserts a page at index `page` of that note, with a system template. */
  insertNotePage(notePath: string, page: number, template: string): Promise<void>;
  insertNoteElements(notePath: string, page: number, elements: unknown[]): Promise<void>;
  removeNotePage(notePath: string, page: number): Promise<void>;
}

export class HelperError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

/** inkctl's command id: hex, as uuid4().hex. */
const ID_PATTERN = /^[0-9a-f]{8,64}$/;
/** A command that is not one of these shapes is refused before any note call. */
const USAGE = 2;

type Command = Step | {id: string; op: 'batch'; steps: Step[]};

/** One command of the channel; a `batch` holds a list of them, run in order in one press (#286). */
type Step =
  | {id: string; op: 'insertStrokes'; strokes: Point[][]}
  | {id: string; op: 'lassoRect'; rect: Rect}
  | {id: string; op: 'lassoLast'}
  | {id: string; op: 'readLasso'}
  | {id: string; op: 'jumpToPage'; page: number}
  | {id: string; op: 'renderPage'; page: number}
  | {id: string; op: 'insertPicture'; path: string}
  | {id: string; op: 'insertTextBox'; text: string; rect: Rect; fontSize: number}
  | {id: string; op: 'insertPage'; page: number; template: string}
  | {id: string; op: 'saveSticker'; where: Where; name: string; rect?: Rect}
  | {id: string; op: 'insertSticker'; where: Where; name: string; moveTo?: Rect}
  | {id: string; op: 'deleteFile'; where: Where; name: string}
  | {id: string; op: 'listFiles'; where: Where}
  | {id: string; op: 'readLassoRect'}
  | {id: string; op: 'resizeLasso'; rect: Rect}
  | {id: string; op: 'movePage'; path: string; from: number; to: number; template?: string};

/** Where a sticker probe keeps its file: inkctl's own folder, or the plugin's private folder (#249). */
type Where = 'probe' | 'plugin';
/** A plain file name in that folder: no folder part, so a command never leaves it. */
const NAME_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/;

/** A system template name, as `getNoteSystemTemplates` lists them (docs/supernote.md). */
const TEMPLATE_PATTERN = /^[a-z0-9_]+$/;
const PICTURE_PATTERN = /\.(png|jpe?g)$/i;

function onPage(x: unknown, y: unknown): boolean {
  return (
    typeof x === 'number' && typeof y === 'number' && x >= 0 && y >= 0 && x <= PAGE_WIDTH && y <= PAGE_HEIGHT
  );
}

function parseStrokes(value: unknown): Point[][] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HelperError(USAGE, 'strokes must be a non-empty list');
  }
  let count = 0;
  const strokes = value.map(stroke => {
    if (!Array.isArray(stroke) || stroke.length < 2) {
      throw new HelperError(USAGE, 'each stroke needs two points or more');
    }
    return stroke.map(point => {
      if (!Array.isArray(point) || !onPage(point[0], point[1])) {
        throw new HelperError(USAGE, `a point is not [x, y] on the page: ${JSON.stringify(point)}`);
      }
      count += 1;
      return {x: Math.round(point[0]), y: Math.round(point[1])};
    });
  });
  if (count > MAX_POINTS) {
    throw new HelperError(USAGE, `${count} points is more than ${MAX_POINTS}`);
  }
  return strokes;
}

/** A page index, from 0, as `PluginCommAPI.jumpToPage` takes it. */
function parsePage(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new HelperError(USAGE, 'page must be a page index from 0');
  }
  return value;
}

/** A picture file in PROBE_FOLDER, with no folder below it. */
function parsePicture(value: unknown): string {
  const name = typeof value === 'string' && value.startsWith(PROBE_FOLDER) ? value.slice(PROBE_FOLDER.length) : '';
  if (!name || name.includes('/') || name.startsWith('.') || !PICTURE_PATTERN.test(name)) {
    throw new HelperError(USAGE, `path must be a .png, .jpg or .jpeg file in ${PROBE_FOLDER}`);
  }
  return value as string;
}

function parseText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_TEXT) {
    throw new HelperError(USAGE, `text must hold 1 to ${MAX_TEXT} characters`);
  }
  return value;
}

function parseFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_FONT_SIZE || value > MAX_FONT_SIZE) {
    throw new HelperError(USAGE, `fontSize must be a whole number from ${MIN_FONT_SIZE} to ${MAX_FONT_SIZE}`);
  }
  return value;
}

function parseTemplate(value: unknown): string {
  if (typeof value !== 'string' || !TEMPLATE_PATTERN.test(value)) {
    throw new HelperError(USAGE, 'template must be a system template name such as style_white');
  }
  return value;
}

/** A note file in NOTES_FOLDER, at any depth, with no `..` part; inkctl keeps it to Note/Tests/. */
function parseNotePath(value: unknown): string {
  const name = typeof value === 'string' && value.startsWith(NOTES_FOLDER) ? value.slice(NOTES_FOLDER.length) : '';
  if (!name.endsWith('.note') || name.split('/').some(part => !part || part === '..' || part === '.')) {
    throw new HelperError(USAGE, `path must be a .note file in ${NOTES_FOLDER}`);
  }
  return value as string;
}

function parseRect(value: unknown): Rect {
  const rect = value as Rect;
  if (!rect || !onPage(rect.left, rect.top) || !onPage(rect.right, rect.bottom)) {
    throw new HelperError(USAGE, 'rect must hold left, top, right and bottom on the page');
  }
  if (rect.right <= rect.left || rect.bottom <= rect.top) {
    throw new HelperError(USAGE, 'rect must have a width and a height');
  }
  return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom};
}

function parseWhere(value: unknown): Where {
  if (value !== 'probe' && value !== 'plugin') {
    throw new HelperError(USAGE, 'where must be probe or plugin');
  }
  return value;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string' || !NAME_PATTERN.test(value) || value.includes('..')) {
    throw new HelperError(USAGE, 'name must be a plain file name');
  }
  return value;
}

/** The command's id and shape, or a HelperError; the id is kept whenever it can be read. */
export function parseCommand(text: string): Command {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HelperError(USAGE, 'the command is not JSON');
  }
  const id = typeof raw?.id === 'string' ? raw.id : '';
  if (!ID_PATTERN.test(id)) {
    throw new HelperError(USAGE, 'the command has no hex id');
  }
  if (raw.op === 'batch') {
    return {id, op: 'batch', steps: parseSteps(id, raw.steps)};
  }
  return parseStep(id, raw);
}

/** A batch's steps: 1 to MAX_BATCH_STEPS commands of any op but `batch`, each checked as alone (#286). */
function parseSteps(id: string, value: unknown): Step[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_STEPS) {
    throw new HelperError(USAGE, `steps must be a list of 1 to ${MAX_BATCH_STEPS} commands`);
  }
  return value.map((step, index) => {
    if (!step || typeof step !== 'object' || (step as {op?: unknown}).op === 'batch') {
      throw new HelperError(USAGE, `step ${index + 1} must be one command, not a batch`);
    }
    try {
      return parseStep(id, step as Record<string, unknown>);
    } catch (error) {
      throw new HelperError(USAGE, `step ${index + 1}: ${(error as Error).message}`);
    }
  });
}

function parseStep(id: string, raw: Record<string, unknown>): Step {
  switch (raw.op) {
    case 'insertStrokes':
      return {id, op: 'insertStrokes', strokes: parseStrokes(raw.strokes)};
    case 'lassoRect':
      return {id, op: 'lassoRect', rect: parseRect(raw.rect)};
    case 'lassoLast':
    case 'readLasso':
      return {id, op: raw.op};
    case 'jumpToPage':
      return {id, op: 'jumpToPage', page: parsePage(raw.page)};
    case 'renderPage':
      return {id, op: 'renderPage', page: parsePage(raw.page)};
    case 'insertPicture':
      return {id, op: 'insertPicture', path: parsePicture(raw.path)};
    case 'insertTextBox':
      return {id, op: 'insertTextBox', text: parseText(raw.text), rect: parseRect(raw.rect), fontSize: parseFontSize(raw.fontSize)};
    case 'insertPage':
      return {id, op: 'insertPage', page: parsePage(raw.page), template: parseTemplate(raw.template)};
    // A press of «Run Command» clears the lasso (code 904), so a lasso-based op lassoes in the same press (#249).
    case 'saveSticker':
      return {id, op: 'saveSticker', where: parseWhere(raw.where), name: parseName(raw.name), rect: raw.rect === undefined ? undefined : parseRect(raw.rect)};
    case 'insertSticker':
      return {id, op: 'insertSticker', where: parseWhere(raw.where), name: parseName(raw.name), moveTo: raw.moveTo === undefined ? undefined : parseRect(raw.moveTo)};
    case 'deleteFile':
      return {id, op: 'deleteFile', where: parseWhere(raw.where), name: parseName(raw.name)};
    case 'listFiles':
      return {id, op: 'listFiles', where: parseWhere(raw.where)};
    case 'readLassoRect':
      return {id, op: 'readLassoRect'};
    case 'resizeLasso':
      return {id, op: 'resizeLasso', rect: parseRect(raw.rect)};
    case 'movePage': {
      const from = parsePage(raw.from);
      const to = parsePage(raw.to);
      if (from === to) {
        throw new HelperError(USAGE, 'from and to must be different pages');
      }
      const template = raw.template === undefined ? undefined : parseTemplate(raw.template);
      return {id, op: 'movePage', path: parseNotePath(raw.path), from, to, template};
    }
    default:
      throw new HelperError(USAGE, `unknown op: ${String(raw.op)}`);
  }
}

/** The smallest rect holding every point. */
export function boundsOf(strokes: Point[][]): Rect {
  const points = strokes.flat();
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys)};
}

/** A rect grown by LASSO_MARGIN on each side and kept on the page. */
export function padded(rect: Rect): Rect {
  return {
    left: Math.max(0, rect.left - LASSO_MARGIN),
    top: Math.max(0, rect.top - LASSO_MARGIN),
    right: Math.min(PAGE_WIDTH, rect.right + LASSO_MARGIN),
    bottom: Math.min(PAGE_HEIGHT, rect.bottom + LASSO_MARGIN),
  };
}

/** The folder a sticker probe names, made when it is the plugin's own (#249). */
async function folderOf(where: Where, api: HelperApi): Promise<string> {
  if (where === 'probe') {
    return PROBE_FOLDER;
  }
  const folder = `${await api.pluginFolder()}/${PLUGIN_STICKERS}/`;
  await api.makeDir(folder);
  return folder;
}

/**
 * Move page `from` of a note to index `to` (both from 0), through the file API, which has no move
 * call (#263): copy the page's elements to a new page at the target, then remove the old page.
 * The new page goes in before the old one is removed, so the note never holds fewer pages.
 */
async function movePage(command: Extract<Command, {op: 'movePage'}>, api: HelperApi): Promise<Record<string, unknown>> {
  const {path, from, to} = command;
  const pages = await api.notePageCount(path);
  if (pages < 2) {
    throw new HelperError(USAGE, `the note has ${pages} page; a move needs two pages or more`);
  }
  if (from >= pages || to >= pages) {
    throw new HelperError(USAGE, `from and to must be pages of the note, 0 to ${pages - 1}`);
  }
  const stored = await api.notePageTemplate(path, from);
  const template = command.template ?? stored.replace(SCREEN_SUFFIX, '');
  const elements = await api.notePageElements(path, from);
  // Moving down, the new page goes after the target, since the old page above it still counts.
  const inserted = to > from ? to + 1 : to;
  const old = to > from ? from : from + 1;
  await api.insertNotePage(path, inserted, template);
  if (elements.length) {
    await api.insertNoteElements(path, inserted, elements);
  }
  await api.removeNotePage(path, old);
  return {path, from, to, pages: await api.notePageCount(path), template, storedTemplate: stored, elements: elements.length};
}

/** A batch step that failed: the steps before it ran, and their answers stay in the batch's answer. */
class StepError extends HelperError {
  constructor(code: number, message: string, readonly step: number, readonly steps: object[]) {
    super(code, message);
  }
}

/** Each step's own answer, `{ok, op, ms, ...}`, in order; the first failure stops the batch (#286). */
async function runSteps(steps: Step[], api: HelperApi, now: () => number): Promise<Record<string, unknown>> {
  const answers: object[] = [];
  for (const [index, step] of steps.entries()) {
    const started = now();
    try {
      const result = await execute(step, api);
      answers.push({ok: true, op: step.op, ms: now() - started, ...result});
    } catch (error) {
      const code = error instanceof HelperError ? error.code : 1;
      const message = (error as Error).message;
      answers.push({ok: false, op: step.op, code, message});
      throw new StepError(code, `step ${index + 1} (${step.op}): ${message}`, index + 1, answers);
    }
  }
  return {steps: answers};
}

async function execute(command: Step, api: HelperApi): Promise<Record<string, unknown>> {
  switch (command.op) {
    case 'insertStrokes': {
      const page = await api.pageNumber();
      await api.insertStrokes(command.strokes, page);
      return {page, strokes: command.strokes.length, rect: boundsOf(command.strokes)};
    }
    case 'lassoRect':
      return {rect: command.rect, counts: await api.lasso(command.rect)};
    case 'lassoLast': {
      const rect = padded(await api.lastElementRect());
      return {rect, counts: await api.lasso(rect)};
    }
    case 'readLasso': {
      const strokes = await api.lassoStrokes();
      return {strokes: strokes.map(stroke => stroke.map(point => [point.x, point.y]))};
    }
    case 'jumpToPage': {
      // The note app ignores `note open`'s page extra for a note opened before (#220); the answer's
      // page is read after the jump, so inkctl proves the page the note shows.
      await api.jumpToPage(command.page);
      return {page: await api.pageNumber()};
    }
    case 'renderPage':
      await api.renderPage(command.page, RENDER_PATH);
      return {page: command.page, path: RENDER_PATH};
    case 'insertPicture':
      await api.insertPicture(command.path);
      return {page: await api.pageNumber(), path: command.path};
    case 'insertTextBox':
      await api.insertTextBox(command.text, command.rect, command.fontSize);
      return {page: await api.pageNumber(), rect: command.rect};
    case 'insertPage':
      await api.insertPage(command.page, command.template);
      return {page: command.page, template: command.template};
    case 'saveSticker': {
      const path = (await folderOf(command.where, api)) + command.name;
      const counts = command.rect ? await api.lasso(command.rect) : undefined;
      await api.saveSticker(path);
      return {path, counts};
    }
    case 'insertSticker': {
      const path = (await folderOf(command.where, api)) + command.name;
      await api.insertSticker(path);
      const rect = await api.lassoBox();
      if (command.moveTo) {
        await api.resizeLasso(command.moveTo);
      }
      return {page: await api.pageNumber(), path, rect, moved: command.moveTo ? await api.lassoBox() : undefined};
    }
    case 'deleteFile': {
      const path = (await folderOf(command.where, api)) + command.name;
      await api.deleteFile(path);
      return {path};
    }
    case 'listFiles': {
      const folder = await folderOf(command.where, api);
      return {folder, files: await api.listFiles(folder)};
    }
    case 'readLassoRect':
      return {rect: await api.lassoBox()};
    case 'resizeLasso':
      await api.resizeLasso(command.rect);
      return {rect: await api.lassoBox()};
    case 'movePage':
      return movePage(command, api);
  }
}

/**
 * Run one command text and answer it as JSON: `{ok: true, op, ms, ...}` or `{ok: false, code,
 * message}`. Never throws: a failure is an answer, so inkctl always learns the outcome.
 */
export async function runCommand(text: string, api: HelperApi, now: () => number = Date.now) {
  const started = now();
  let id = '';
  try {
    const command = parseCommand(text);
    id = command.id;
    const result = command.op === 'batch' ? await runSteps(command.steps, api, now) : await execute(command, api);
    return {id, answer: {ok: true, op: command.op, ms: now() - started, ...result}};
  } catch (error) {
    const code = error instanceof HelperError ? error.code : 1;
    id = id || commandId(text) || UNKNOWN_ID;
    const batch = error instanceof StepError ? {step: error.step, steps: error.steps} : {};
    return {id, answer: {ok: false, code, message: (error as Error).message, ...batch}};
  }
}

/** The command's hex id when the text is a JSON object that carries one, else null; never throws. */
export function commandId(text: string): string | null {
  try {
    const id = JSON.parse(text)?.id;
    return typeof id === 'string' && ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The logcat lines of one answer: `SNPROBE answer <id> <n>/<count> <chunk>`, in order. */
export function answerLines(id: string, answer: object): string[] {
  const text = JSON.stringify(answer);
  const count = Math.max(1, Math.ceil(text.length / ANSWER_CHUNK));
  const lines: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const chunk = text.slice(index * ANSWER_CHUNK, (index + 1) * ANSWER_CHUNK);
    lines.push(`${ANSWER_MARK} ${id} ${index + 1}/${count} ${chunk}`);
  }
  return lines;
}
