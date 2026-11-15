/**
 * Relay's own Java module, `RelayLocalSend` (#98): the only way a plugin reaches a LocalSend
 * receiver, since `fetch` meets cleartext and self-signed HTTPS. Each call is a Result; a
 * rejection keeps the module's text code (`IDENTITY`, `TIMEOUT`, `IO`) in `moduleCode`.
 */
import {NativeModules} from 'react-native';
import {
  fail,
  MODULE_CODE,
  ok,
  Result,
} from '@supernote-tools/sn-adapter/official';

export const MODULE_NAME = 'RelayLocalSend';

export type Datagram = {ip: string; text: string};
export type HttpAnswer = {status: number; body: string};
export type FileInfo = {size: number; sha256: string};

export type RelayNative = {
  discover(
    group: string,
    port: number,
    announce: string,
    timeoutMs: number,
  ): Promise<Datagram[]>;
  post(
    url: string,
    headers: Record<string, string>,
    body: string | null,
    filePath: string | null,
    pinned: string | null,
    connectMs: number,
    readMs: number,
  ): Promise<HttpAnswer>;
  fileInfo(path: string): Promise<FileInfo>;
  remove(path: string): Promise<boolean>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<null>;
};

/** Every call as a Result; MISSING when PluginHost did not load the module. */
export type Relay = {
  [K in keyof RelayNative]: (
    ...args: Parameters<RelayNative[K]>
  ) => Promise<Result<Awaited<ReturnType<RelayNative[K]>>>>;
};

export function relay(modules: Record<string, unknown> = NativeModules): Relay {
  const call =
    <K extends keyof RelayNative>(name: K) =>
    async (...args: Parameters<RelayNative[K]>) => {
      const native = modules[MODULE_NAME] as RelayNative | undefined;
      if (!native) {
        return fail(
          MODULE_CODE,
          `MISSING: ${MODULE_NAME} is not loaded; check reactPackages`,
          'MISSING',
        );
      }
      try {
        const run = native[name] as (...a: unknown[]) => Promise<unknown>;
        return ok(await run(...args));
      } catch (error) {
        const code = (error as {code?: string}).code ?? 'IO';
        return fail(MODULE_CODE, code, code);
      }
    };
  return {
    discover: call('discover'),
    post: call('post'),
    fileInfo: call('fileInfo'),
    remove: call('remove'),
    readText: call('readText'),
    writeText: call('writeText'),
  } as Relay;
}
