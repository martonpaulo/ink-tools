/**
 * The one sync runner of the plugin host process (#28, #44), bound to the tablet: the saved
 * Settings and the sign-in files in the private plugin folder (#40, #90) and the network. `index.js`
 * starts its automatic pass when PluginHost loads Bridge; the Settings view's «Sync now» presses the
 * same runner, so a press during an automatic pass joins it.
 *
 * The Calendar and To-Do are written through `BridgeProviders` (#43, `deviceRows.ts`), and a pass
 * that needs a module first runs sn-adapter's probe of it with the same module, so a module the
 * device does not clear is blocked and nothing is written for it. The load pass never probes. The Google OAuth client comes from its own file beside the
 * refresh token, which `inkctl secret set google-client` puts there (#200).
 */
import {useEffect, useState} from 'react';
import {BUNDLED_DESCRIPTOR, probeAll} from '@ink-tools/sn-adapter';
import {getPluginDirPath} from '@ink-tools/sn-adapter/official';
import {deviceReader} from './deviceReader';
import {deviceRows} from './deviceRows';
import {createDeviceStores} from './deviceStores';
import {createSecretStore, importSecretDrops, readGoogleClient} from './secretStore';
import {loadSettings, saveSettings} from './settingsStore';
import {createSyncRunner, SyncDevice, SyncRunner, SyncSnapshot} from './sync';

const secrets = createSecretStore(getPluginDirPath);

export const device: SyncDevice = {
  loadSettings: () => loadSettings(getPluginDirPath),
  saveSettings: s => saveSettings(getPluginDirPath, s),
  secrets,
  googleClient: () => readGoogleClient(secrets),
  importSecrets: () => importSecretDrops(getPluginDirPath),
  stores: createDeviceStores(deviceRows(), () => Date.now()),
  probe: capabilities => probeAll(BUNDLED_DESCRIPTOR, deviceReader(), capabilities),
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
