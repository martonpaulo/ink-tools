/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {bridgeSync} from './src/service';
import {startAutoSync} from './src/sync';
import {watchProviders} from './src/providerWatch';
import {
  nativeTimers,
  registerSettingsEntry,
  showPluginView,
  startActionChannel,
} from '@ink-tools/sn-adapter/official';
import {readActionFile, syncAction} from './src/actions';

AppRegistry.registerComponent(appName, () => App);

// Settings only: Bridge never shows inside a note (docs/architecture.md).
registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Bridge: ${error.message}`);
});

// A JS timer stops while no Account Sync view shows (#283): both timers below tick from the native
// BridgeTicks module (BridgeFilesPackage.TICKS_MODULE) instead.
const timers = nativeTimers('BridgeTicks');

// The automatic sync (#28, #44, #370): one pass when PluginHost loads Bridge, then one every
// AUTO_SYNC_MINUTES while the host process lives, view or not (docs/supernote.md: every enabled
// plugin loads into one PluginHost process at its start).
startAutoSync(bridgeSync, timers);

// «Sync now» by command from inkctl, with no screen (#283): `inkctl plugin action account-sync sync`.
startActionChannel({
  plugin: 'account-sync',
  read: () => readActionFile(),
  actions: {sync: syncAction(bridgeSync)},
  timers,
});

// A tablet edit of the Calendar or the To-Do syncs at once, beside the timer (#296).
watchProviders(bridgeSync);
