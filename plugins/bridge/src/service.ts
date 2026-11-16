/**
 * The one sync runner of the plugin host process (#28, #44), bound to the tablet: the saved
 * Settings and the sign-in files in the private plugin folder (#40, #90) and the network. `index.js`
 * starts its automatic pass when PluginHost loads Bridge; the Settings view's «Sync now» presses the
 * same runner, so a press during an automatic pass joins it.
 *
 * The content providers and the device probe are not bound yet: they come with the ContentResolver
 * module of #43 and the native writer over it. Until then every module that is on shows «the device
 * check has not answered», and nothing is written.
 */
import {useEffect, useState} from 'react';
import {getPluginDirPath} from '@supernote-tools/sn-adapter/official';
import {createSecretStore} from './secretStore';
import {loadSettings} from './settingsStore';
import {createSyncRunner, SyncDevice, SyncRunner, SyncSnapshot} from './sync';

export const device: SyncDevice = {
  loadSettings: () => loadSettings(getPluginDirPath),
  secrets: createSecretStore(getPluginDirPath),
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
