/**
 * The note pages a game reads and writes (#386), through sn-adapter's official tier and the
 * plugin's page file module. A new puzzle is a PNG named by its code in the plugin's hidden folder,
 * which Supernote Cloud does not sync, inserted as the background of a new page after the current
 * one; the note keeps the background (#377). A successful insert reloads the note and ends this
 * JavaScript (device round, #386), so nothing after it runs: the next game view deletes the page
 * files an earlier one left. The page's background then reads `user_<code>`, so «Check» and «Show
 * solution» find the puzzle of the current page again from it, and the plugin stores nothing.
 */
import {NativeModules} from 'react-native';
import {
  fail,
  getCurrentFilePath,
  getCurrentPageNum,
  getElements,
  getPageSize,
  insertPageAfter,
  NO_TEXT_MESSAGE,
  ok,
  onSavedPage,
  pageTemplate,
  recognizeElements,
  closePluginView,
  pluginDataFolder,
  showPluginView,
  saveCurrentNote,
  strokePoints,
  STROKE_TYPE,
  THROWN_CODE,
  type Result,
} from '@ink-tools/sn-adapter/official';
import {toBase64, type InkStroke, type Orientation, type ReadText} from '@ink-tools/puzzle-core';

/** The native module of `PageFileModule.java`. */
export const PAGE_FILE_MODULE = 'PuzzlesPages';

/**
 * Where a page PNG waits for its insert: the plugin's folder of the hidden `.data/plugin/`, never
 * `MyStyle/`, whose every file Supernote Cloud uploads within seconds (`docs/supernote.md`, #386).
 */
export const PAGE_FOLDER = `${pluginDataFolder('inktools-puzzles')}/pages`;

/** The page the person is on. */
export type Here = {
  notePath: string;
  /** From 0, as `getCurrentPageNum` counts. */
  page: number;
  size: {width: number; height: number};
  orientation: Orientation;
};

export type PagePorts = {
  here: () => Promise<Result<Here>>;
  /** The puzzle code the page's background names, or null for a page no game made. */
  codeOf: (here: Here) => Promise<Result<string | null>>;
  /**
   * Puts `png` on a new page after `here`, named by `code`. A success may never answer: the note
   * reload of the insert can end this JavaScript.
   */
  insert: (here: Here, code: string, png: Uint8Array) => Promise<Result<true>>;
  /** Deletes the page files earlier inserts left; how many. */
  clear: () => Promise<Result<number>>;
  /** Closes the plugin's view, so the note shows the new page; `show` opens it again on a failure. */
  hide: () => Promise<unknown>;
  show: () => Promise<unknown>;
  /** The page's strokes in page pixels, as the note saved them. */
  ink: (here: Here) => Promise<Result<InkStroke<object>[]>>;
  /** The tablet's recognition of some strokes of `here`. */
  read: (here: Here, elements: object[]) => Promise<ReadText>;
  log: (line: string) => void;
};

/** The template name of a page inserted from `<code>.png`; the device check confirms the form (#386). */
const USER_TEMPLATE = /^user_(.+?)(?:\.png)?$/i;

/** The code in a page background's name, or null when no Puzzles page has that background. */
export function codeOfTemplate(name: string): string | null {
  return USER_TEMPLATE.exec(name)?.[1] ?? null;
}

type PageFiles = {
  writeBase64: (path: string, base64: string) => Promise<boolean>;
  removePages: (folder: string) => Promise<number>;
};

/** Calls the page file module, its absence or its throw a failure. */
async function pageFiles<T>(modules: Record<string, unknown>, what: string, call: (files: PageFiles) => Promise<T>): Promise<Result<T>> {
  const files = modules[PAGE_FILE_MODULE] as PageFiles | undefined;
  if (!files) {
    return fail(THROWN_CODE, `${PAGE_FILE_MODULE} is not loaded; check reactPackages`);
  }
  try {
    return ok(await call(files));
  } catch (error) {
    return fail(THROWN_CODE, `${what}: ${String((error as Error)?.message ?? error)}`);
  }
}

export function devicePages(modules: Record<string, unknown> = NativeModules): PagePorts {
  const log = (line: string) => console.log(`Puzzles: ${line}`);
  return {
    log,
    here: async () => {
      const notePath = await getCurrentFilePath();
      if (!notePath.ok) {return notePath;}
      const page = await getCurrentPageNum();
      if (!page.ok) {return page;}
      const size = await getPageSize(notePath.value, page.value);
      if (!size.ok) {return size;}
      const orientation = size.value.width > size.value.height ? 'landscape' : 'portrait';
      return ok({notePath: notePath.value, page: page.value, size: size.value, orientation});
    },
    codeOf: async here => {
      const template = await pageTemplate(here.notePath, here.page);
      return template.ok ? ok(codeOfTemplate(template.value.name)) : template;
    },
    clear: async () => {
      const removed = await pageFiles(modules, `${PAGE_FOLDER} was not cleared`, files => files.removePages(PAGE_FOLDER));
      log(`cleared ${PAGE_FOLDER}: ${removed.ok ? removed.value : removed.message}`);
      return removed;
    },
    hide: () => closePluginView(),
    show: () => showPluginView(),
    insert: async (here, code, png) => {
      const path = `${PAGE_FOLDER}/${code}.png`;
      const written = await pageFiles(modules, `${path} was not written`, files => files.writeBase64(path, toBase64(png)));
      if (!written.ok) {return written;}
      if (!written.value) {return fail(THROWN_CODE, `${path} was not written`);}
      // An insert reloads the note, so an edit the Note app holds unsaved would be lost (#524).
      const inserted = await onSavedPage(() => insertPageAfter(here.notePath, here.page, path));
      if (!inserted.ok) {return inserted;}
      return inserted.value ? ok(true) : fail(THROWN_CODE, 'insertNotePage answered false');
    },
    ink: async here => {
      // The newest strokes are in the file only once the note saved (#296).
      const saved = await saveCurrentNote();
      if (!saved.ok) {return saved;}
      const elements = await getElements(here.page, here.notePath);
      if (!elements.ok) {return elements;}
      const strokes: InkStroke<object>[] = [];
      for (const element of elements.value) {
        if ((element as {type?: unknown}).type !== STROKE_TYPE) {continue;}
        const points = await strokePoints(element);
        if (!points.ok) {return points;}
        strokes.push({points: points.value, element});
      }
      return ok(strokes);
    },
    read: async (here, elements) => {
      const text = await recognizeElements(elements, here.size);
      if (text.ok) {return {ok: true, text: text.value.trim() === '' ? null : text.value};}
      return text.message.startsWith(NO_TEXT_MESSAGE) ? {ok: true, text: null} : {ok: false, message: text.message};
    },
  };
}
