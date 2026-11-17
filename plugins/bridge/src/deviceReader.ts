/**
 * sn-adapter's `DeviceReader` on the tablet (#43): `BridgeProviders`, Bridge's Java module over
 * Android's ContentResolver. Every URI and column comes from sn-adapter's descriptor, so this file
 * names no provider. A missing module rejects each call, so the probe blocks every module with that
 * reason instead of reporting a device it never read.
 */
import {NativeModules} from 'react-native';
import type {DeviceReader, Row} from '@supernote-tools/sn-adapter';

export const PROVIDERS_MODULE = 'BridgeProviders';

/** The calls of the Java module, as `native/com/bridge/providers/BridgeProvidersModule.java` defines them. */
export type ProvidersModule = {
  columnsOf: (uri: string) => Promise<string[]>;
  /**
   * The probe's test write is the module's plain `update`, never an insert: the Calendar provider
   * cannot delete a row again, so a test row would stay in the owner's Calendar (#43).
   */
  update: (uri: string, where: Row, row: Row) => Promise<number>;
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
    testWrite: async (uri, where, values) => loaded().update(uri, where, values),
  };
}
