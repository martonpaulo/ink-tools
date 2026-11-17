/**
 * Retouch's native modules (#136): `RetouchImage`, its own edits, and `RetouchFiles`, Ink2Pic's
 * file module under Retouch's name (#142). Each call is a Result; a rejection keeps the module's
 * text code (`NOT_FOUND`, `TOO_LARGE`, `IO`) in `moduleCode`.
 */
import {NativeModules} from 'react-native';
import {
  fail,
  MODULE_CODE,
  ok,
  Result,
} from '@ink-tools/sn-adapter/official';

export const IMAGE_MODULE = 'RetouchImage';
export const FILES_MODULE = 'RetouchFiles';

/** The edits the Java side runs; Undo and Restore original need no pixel work. */
export type PixelEdit =
  | 'enhance'
  | 'lighter'
  | 'darker'
  | 'rotate'
  | 'mirror'
  | 'flip'
  | 'invert'
  | 'trim'
  | 'background'
  | 'sticker'
  | 'document'
  | 'crop'
  | 'erase'
  | StyleId;

/** The grid's styles (#133), each ending on the screen's greys. */
export type StyleId =
  | 'photo'
  | 'line_art'
  | 'black_white'
  | 'dither'
  | 'atkinson';

/**
 * A style's two options (#133): `transparent` clears near-white pixels so the page template shows
 * through; `thick` widens Line art's lines. The other edits ignore them.
 */
export type StyleOptions = {transparent: boolean; thick: boolean};

export const NO_OPTIONS: StyleOptions = {transparent: false, thick: false};

/**
 * The result's size, and where its top left sits in the picture it came from: 0, 0 for every edit
 * but Trim, which cuts the margin off, and Crop, which cuts to the drawn box (#132).
 */
export type Edited = {
  width: number;
  height: number;
  left: number;
  top: number;
  ms: number;
  /** Document's page corners from the top left clockwise, or `none` (#137). */
  quad?: string;
};

type Native = {
  edit(
    edit: PixelEdit,
    srcPath: string,
    beforePath: string,
    destPath: string,
    width: number,
    height: number,
    pageWidth: number,
    transparent: boolean,
    thick: boolean,
  ): Promise<Edited>;
  crop(
    srcPath: string,
    beforePath: string,
    destPath: string,
    width: number,
    height: number,
    boxLeft: number,
    boxTop: number,
    boxWidth: number,
    boxHeight: number,
  ): Promise<Edited>;
  erase(
    srcPath: string,
    beforePath: string,
    destPath: string,
    width: number,
    height: number,
    points: number[],
    ends: number[],
  ): Promise<Edited>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<null>;
  deleteFile(path: string): Promise<boolean>;
  /** The names in a folder, or null when it does not exist (#182). */
  listDir(path: string): Promise<string[] | null>;
};

const MODULE_OF: Record<keyof Native, string> = {
  edit: IMAGE_MODULE,
  crop: IMAGE_MODULE,
  erase: IMAGE_MODULE,
  readText: FILES_MODULE,
  writeText: FILES_MODULE,
  deleteFile: FILES_MODULE,
  listDir: FILES_MODULE,
};

/** Every call as a Result; MISSING when PluginHost did not load the module. */
export type RetouchNative = {
  [K in keyof Native]: (
    ...args: Parameters<Native[K]>
  ) => Promise<Result<Awaited<ReturnType<Native[K]>>>>;
};

export function retouchNative(
  modules: Record<string, unknown> = NativeModules,
): RetouchNative {
  const call =
    <K extends keyof Native>(name: K) =>
    async (...args: Parameters<Native[K]>) => {
      const moduleName = MODULE_OF[name];
      const native = modules[moduleName] as Native | undefined;
      if (!native) {
        return fail(
          MODULE_CODE,
          `MISSING: ${moduleName} is not loaded; check reactPackages`,
          'MISSING',
        );
      }
      try {
        const run = native[name] as (...a: unknown[]) => Promise<unknown>;
        return ok(await run(...args));
      } catch (error) {
        const code = (error as {code?: string}).code ?? 'IO';
        const message = (error as {message?: string}).message ?? code;
        return fail(MODULE_CODE, message, code);
      }
    };
  return {
    edit: call('edit'),
    crop: call('crop'),
    erase: call('erase'),
    readText: call('readText'),
    writeText: call('writeText'),
    deleteFile: call('deleteFile'),
    listDir: call('listDir'),
  } as RetouchNative;
}
