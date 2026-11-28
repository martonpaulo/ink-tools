/** A scripted RelayLocalSend for the send, receive and Settings tests (#98, #49). */
import {Arrival, relay, RelayNative} from '../src/native';

export type Calls = {
  post: unknown[][];
  removed: string[];
  written: string[];
  answers: unknown[][];
  started: unknown[][];
  stopped: number;
};

/** `arrivals` are what `nextReceived` answers in turn; null once they run out. */
export function fakeRelay(
  overrides: Partial<RelayNative> = {},
  arrivals: (Arrival | null)[] = [],
) {
  const calls: Calls = {
    post: [],
    removed: [],
    written: [],
    answers: [],
    started: [],
    stopped: 0,
  };
  // As the native receiver: after a stop, a wait answers «stopped» until the next start.
  let stopped = false;
  const native: RelayNative = {
    discover: jest.fn(async () => []),
    post: jest.fn(async (...args: unknown[]) => {
      calls.post.push(args);
      return {status: 200, body: ''};
    }),
    fileInfo: jest.fn(async () => ({size: 3, sha256: 'abc'})),
    remove: jest.fn(async (path: string) => {
      calls.removed.push(path);
      return true;
    }),
    readText: jest.fn(async () => null),
    writeText: jest.fn(async (_path: string, text: string) => {
      calls.written.push(text);
      return null;
    }),
    identity: jest.fn(async () => 'cert-fp'),
    startReceive: jest.fn(async (...args: unknown[]) => {
      calls.started.push(args);
      stopped = false;
      return 'cert-fp';
    }),
    nextReceived: jest.fn(async () =>
      arrivals.length > 0 ? arrivals.shift() ?? null : stopped ? {kind: 'stopped' as const} : null,
    ),
    answer: jest.fn(async (...args: unknown[]) => {
      calls.answers.push(args);
      return true;
    }),
    stopReceive: jest.fn(async () => {
      calls.stopped += 1;
      stopped = true;
      return true;
    }),
    exists: jest.fn(async () => false),
    move: jest.fn(async () => true),
    renderPdf: jest.fn(async (_pdf: string, outDir: string) => [
      `${outDir}/page-1.png`,
      `${outDir}/page-2.png`,
    ]),
    ...overrides,
  };
  return {native, calls, api: relay({RelayLocalSend: native})};
}
