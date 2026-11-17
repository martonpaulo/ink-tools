/**
 * `ContentRows` on the tablet (#28, #44): the write half of `BridgeProviders`, Bridge's Java module
 * over Android's ContentResolver, whose read half is the device probe's reader (#43,
 * `deviceReader.ts`). Every URI and column comes from sn-adapter's descriptor through
 * `deviceStores.ts`, so this file names no provider. A missing module rejects each call.
 */
import {NativeModules} from 'react-native';
import type {Row} from '@ink-tools/sn-adapter';
import type {ContentRows} from './deviceStores';
import {PROVIDERS_MODULE} from './deviceReader';

/** The write calls of `native/com/bridge/providers/BridgeProvidersModule.java`. */
export type ProviderRows = {
  query: (uri: string, where: Row) => Promise<Row[]>;
  insert: (uri: string, row: Row) => Promise<string>;
  update: (uri: string, where: Row, row: Row) => Promise<number>;
  remove: (uri: string, where: Row) => Promise<number>;
};

/** `providers` is for tests; without it, each call reads the module PluginHost loaded. */
export function deviceRows(providers?: ProviderRows): ContentRows {
  const loaded = (): ProviderRows => {
    const module =
      providers ??
      (NativeModules[PROVIDERS_MODULE] as ProviderRows | undefined);
    if (!module?.query) {
      throw new Error(`the ${PROVIDERS_MODULE} module cannot write yet`);
    }
    return module;
  };
  return {
    query: async (uri, where) => loaded().query(uri, where),
    insert: async (uri, row) => loaded().insert(uri, row),
    update: async (uri, where, row) => loaded().update(uri, where, row),
    remove: async (uri, where) => loaded().remove(uri, where),
  };
}
