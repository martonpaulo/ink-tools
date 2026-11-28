/**
 * An in-memory tablet for the pack-store tests (#503): files in a map, downloads served from the
 * URLs given, hashes by Node's crypto. Each call is recorded, so a test sees what the store did.
 */
import {createHash} from 'crypto';
import type {HostResult, PackHost} from '../src/store';

export type FakeHost = PackHost & {files: Map<string, Uint8Array>; calls: string[]};

const done = <T>(value: T): HostResult<T> => ({ok: true, value});
const missing = (path: string): HostResult<never> => ({ok: false, message: `${path} does not exist`});

export function fakeHost(served: Record<string, Uint8Array>): FakeHost {
  const files = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const text = new TextDecoder();
  return {
    files,
    calls,
    download: async (url, path) => {
      calls.push(`download ${url}`);
      const bytes = served[url];
      if (!bytes) {
        return {ok: false, message: `HTTP_404 for ${url}`};
      }
      files.set(path, bytes);
      return done(bytes.length);
    },
    sha256: async path => {
      const bytes = files.get(path);
      return bytes ? done(createHash('sha256').update(bytes).digest('hex')) : missing(path);
    },
    size: async path => {
      const bytes = files.get(path);
      return bytes ? done(bytes.length) : missing(path);
    },
    move: async (from, to) => {
      const bytes = files.get(from);
      if (!bytes) {
        return missing(from);
      }
      files.delete(from);
      files.set(to, bytes);
      return done(null);
    },
    remove: async path => {
      files.delete(path);
      return done(true);
    },
    readText: async path => {
      const bytes = files.get(path);
      return done(bytes ? text.decode(bytes) : null);
    },
    writeText: async (path, value) => {
      files.set(path, new TextEncoder().encode(value));
      return done(null);
    },
    makeFolder: async path => {
      calls.push(`makeFolder ${path}`);
      return done(null);
    },
  };
}
