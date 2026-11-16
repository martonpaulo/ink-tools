/**
 * Relay's own Java module, `RelayLocalSend` (#98): the only way a plugin reaches a LocalSend
 * receiver, since `fetch` meets cleartext and self-signed HTTPS. Each call is a Result; a
 * rejection keeps the module's text code (`IDENTITY`, `TIMEOUT`, `IO`) in `moduleCode`. The
 * receive half (#49) adds the identity, the receiver and its arrivals.
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
/** One thing the receiver hands on (#49); `offer` waits for `answer`. */
export type Arrival =
  | {kind: 'offer'; body: string; sessionId: string; token: string}
  | {kind: 'file'; path: string}
  | {kind: 'cancel'}
  | {kind: 'stopped'};

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
  identity(folder: string): Promise<string>;
  startReceive(
    identityFolder: string,
    fileFolder: string,
    port: number,
    group: string,
    info: string,
    announce: string,
    answer: string,
  ): Promise<string>;
  nextReceived(timeoutMs: number): Promise<Arrival | null>;
  answer(
    status: number,
    body: string,
    fileId: string | null,
    extension: string | null,
  ): Promise<boolean>;
  stopReceive(): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  /** One PNG path per page; rejects `BROKEN` or `PAGES` (#143). */
  renderPdf(
    pdfPath: string,
    outDir: string,
    width: number,
    height: number,
    maxPages: number,
  ): Promise<string[]>;
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
    identity: call('identity'),
    startReceive: call('startReceive'),
    nextReceived: call('nextReceived'),
    answer: call('answer'),
    stopReceive: call('stopReceive'),
    exists: call('exists'),
    renderPdf: call('renderPdf'),
  } as Relay;
}
