/** A scripted RelayLocalSend for the send and Settings tests (#98). */
import {relay, RelayNative} from '../src/native';

export type Calls = {post: unknown[][]; removed: string[]; written: string[]};

export function fakeRelay(overrides: Partial<RelayNative> = {}) {
  const calls: Calls = {post: [], removed: [], written: []};
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
    ...overrides,
  };
  return {native, calls, api: relay({RelayLocalSend: native})};
}
