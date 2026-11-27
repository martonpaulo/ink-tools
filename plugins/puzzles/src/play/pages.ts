/**
 * The note pages a game reads and writes (#386), through sn-adapter's official tier and the
 * plugin's page file module. A new puzzle is a PNG in `MyStyle/` named by its code, inserted as the
 * background of a new page after the current one and then deleted, as the note keeps the background
 * (#377). The page's background then reads `user_<code>`, so «Check» and «Show solution» find the
 * puzzle of the current page again from its background, and the plugin stores nothing.
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
  removeFile,
  saveCurrentNote,
  strokePoints,
  STROKE_TYPE,
  SHARED_ROOT,
  THROWN_CODE,
  type Result,
} from '@ink-tools/sn-adapter/official';
import {REGISTRY} from '@ink-tools/sn-adapter/registry';
import {toBase64, type InkStroke, type Orientation, type ReadText} from '@ink-tools/puzzle-core';

/** The native module of `PageFileModule.java`. */
export const PAGE_FILE_MODULE = 'PuzzlesPages';

/** The folder `insertNotePage` takes a background PNG from (#377). */
export const PAGE_FOLDER = `${SHARED_ROOT}/${REGISTRY.pluginhostFileSandbox.sharedFolder}`;

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
  /** Puts `png` on a new page after `here`, named by `code`. */
  insert: (here: Here, code: string, png: Uint8Array) => Promise<Result<true>>;
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

type PageFiles = {writeBase64: (path: string, base64: string) => Promise<boolean>};

async function writePng(path: string, png: Uint8Array, modules: Record<string, unknown>): Promise<Result<true>> {
  const files = modules[PAGE_FILE_MODULE] as PageFiles | undefined;
  if (!files) {
    return fail(THROWN_CODE, `${PAGE_FILE_MODULE} is not loaded; check reactPackages`);
  }
  try {
    return (await files.writeBase64(path, toBase64(png))) ? ok(true) : fail(THROWN_CODE, `${path} was not written`);
  } catch (error) {
    return fail(THROWN_CODE, `${path} was not written: ${String((error as Error)?.message ?? error)}`);
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
    insert: async (here, code, png) => {
      const path = `${PAGE_FOLDER}/${code}.png`;
      const written = await writePng(path, png, modules);
      if (!written.ok) {return written;}
      // An insert reloads the note, so an edit the Note app holds unsaved would be lost (#524).
      const inserted = await onSavedPage(() => insertPageAfter(here.notePath, here.page, path));
      const removed = await removeFile(path);
      log(`removed ${path}: ${removed.ok ? removed.value : removed.message}`);
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
