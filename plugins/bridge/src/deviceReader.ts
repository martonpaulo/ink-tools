/**
 * sn-adapter's `DeviceReader` on the tablet (#43): `BridgeProviders`, Bridge's Java module over
 * Android's ContentResolver. Every URI and column comes from sn-adapter's descriptor, so this file
 * names no provider. A missing module rejects each call, so the probe blocks every module with that
 * reason instead of reporting a device it never read.
 */
import {NativeModules} from 'react-native';
import type {DeviceReader} from '@supernote-tools/sn-adapter';

export const PROVIDERS_MODULE = 'BridgeProviders';

/** The calls of the Java module, as `native/com/bridge/providers/BridgeProvidersModule.java` defines them. */
export type ProvidersModule = {
  columnsOf: (uri: string) => Promise<string[]>;
  dryInsert: (uri: string, markerColumn: string) => Promise<null>;
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
    dryInsert: async (uri, markerColumn) => {
      await loaded().dryInsert(uri, markerColumn);
    },
  };
}
