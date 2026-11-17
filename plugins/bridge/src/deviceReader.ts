/**
 * sn-adapter's `DeviceReader` on the tablet (#43): `BridgeProviders`, Bridge's Java module over
 * Android's ContentResolver. Every URI and column comes from sn-adapter's descriptor, so this file
 * names no provider. A missing module rejects each call, so the probe blocks every module with that
 * reason instead of reporting a device it never read.
 */
import {NativeModules} from 'react-native';
import type {DeviceReader, Row} from '@supernote-tools/sn-adapter';
import {ROW_ID} from './deviceStores';

export const PROVIDERS_MODULE = 'BridgeProviders';

/** The calls of the Java module, as `native/com/bridge/providers/BridgeProvidersModule.java` defines them. */
export type ProvidersModule = {
  columnsOf: (uri: string) => Promise<string[]>;
  /** The test row is deleted again by its `idColumn`, the provider's row key (#43). */
  dryInsert: (
    uri: string,
    markerColumn: string,
    idColumn: string,
    values: Row,
  ) => Promise<null>;
};

/** `providers` is for tests; without it, each call reads the module PluginHost loaded. */
export function deviceReader(providers?: ProvidersModule): DeviceReader {
  const loaded = (): ProvidersModule => {
    const module =
      providers ??
      (NativeModules[PROVIDERS_MODULE] as ProvidersModule | undefined);
    if (!module) {
      throw new Error(`the ${PROVIDERS_MODULE} module is not loaded`);
    }
    return module;
  };
  return {
    columnsOf: async uri => loaded().columnsOf(uri),
    dryInsert: async (uri, markerColumn, values) => {
      try {
        await loaded().dryInsert(uri, markerColumn, ROW_ID, values);
      } catch (e) {
        // `insert_refused` means the provider wrote no row; only `revert_failed` says one may remain (#43).
        if ((e as {code?: unknown}).code === 'insert_refused') {
          throw new Error(`no test row was written: ${e instanceof Error ? e.message : String(e)}`);
        }
        throw e;
      }
    },
  };
}
