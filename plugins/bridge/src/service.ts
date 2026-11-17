/**
 * The one sync runner of the plugin host process (#28, #44), bound to the tablet: the saved
 * Settings and the sign-in files in the private plugin folder (#40, #90) and the network. `index.js`
 * starts its automatic pass when PluginHost loads Bridge; the Settings view's «Sync now» presses the
 * same runner, so a press during an automatic pass joins it.
 *
 * The Calendar and To-Do are written through `BridgeProviders` (#43, `deviceRows.ts`), and each pass
 * first runs sn-adapter's probe with the same module, so a module the device does not clear is
 * blocked and nothing is written for it. The Google OAuth client is not on the tablet yet (#200), so
 * the Google source fails its run with that reason.
 */
import {useEffect, useState} from 'react';
import {BUNDLED_DESCRIPTOR, probeAll} from '@supernote-tools/sn-adapter';
import {getPluginDirPath} from '@supernote-tools/sn-adapter/official';
import {deviceReader} from './deviceReader';
import {deviceRows} from './deviceRows';
import {createDeviceStores} from './deviceStores';
import {createSecretStore, importSecretDrops} from './secretStore';
import {loadSettings, saveSettings} from './settingsStore';
import {createSyncRunner, SyncDevice, SyncRunner, SyncSnapshot} from './sync';

export const device: SyncDevice = {
  loadSettings: () => loadSettings(getPluginDirPath),
  saveSettings: s => saveSettings(getPluginDirPath, s),
  secrets: createSecretStore(getPluginDirPath),
  importSecrets: () => importSecretDrops(getPluginDirPath),
  stores: createDeviceStores(deviceRows(), () => Date.now()),
  probe: () => probeAll(BUNDLED_DESCRIPTOR, deviceReader()),
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
};

export const bridgeSync: SyncRunner = createSyncRunner(device);

/** The runner's state for a view, redrawn on each change. */
export function useSync(runner: SyncRunner = bridgeSync): SyncSnapshot {
  const [snapshot, setSnapshot] = useState(runner.snapshot());
  useEffect(() => {
    setSnapshot(runner.snapshot());
    return runner.subscribe(setSnapshot);
  }, [runner]);
  return snapshot;
}
