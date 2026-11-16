/**
 * Bridge's small text files through its own Java module, `BridgeFiles` (picture-search's file module
 * under Bridge's name, #40, #142): sn-plugin-lib 0.2.3 has no file writer. A missing module or a
 * refused call is a failure with the module's reason, never an empty file.
 */
import {NativeModules} from 'react-native';
import {
  fail,
  MODULE_CODE,
  ok,
  Result,
} from '@supernote-tools/sn-adapter/official';

/** The calls Bridge uses of the module; `readText` answers null for a file that is not there. */
export type TextFiles = {
  readText: (path: string) => Promise<string | null>;
  writeText: (path: string, text: string) => Promise<null>;
};

export const FILES_MODULE = 'BridgeFiles';

const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Runs one call of the module; MISSING when PluginHost did not load it. */
export async function callFiles<T>(
  run: (files: TextFiles) => Promise<T>,
  files: TextFiles | undefined = NativeModules[FILES_MODULE] as
    | TextFiles
    | undefined,
): Promise<Result<T>> {
  if (!files) {
    return fail(
      MODULE_CODE,
      `the ${FILES_MODULE} module is not loaded`,
      'MISSING',
    );
  }
  try {
    return ok(await run(files));
  } catch (error) {
    const code = (error as {code?: unknown} | null)?.code;
    return fail(
      MODULE_CODE,
      reason(error),
      typeof code === 'string' ? code : undefined,
    );
  }
}
