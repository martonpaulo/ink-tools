/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {bridgeSync} from './src/service';
import {startAutoSync} from './src/sync';
import {
  registerSettingsEntry,
  showPluginView,
} from '@supernote-tools/sn-adapter/official';

AppRegistry.registerComponent(appName, () => App);

// Settings only: Bridge never shows inside a note (docs/architecture.md).
registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Bridge: ${error.message}`);
});

// The automatic sync (#28, #44): one pass when PluginHost loads Bridge, then one every
// AUTO_SYNC_MINUTES while the host process lives (docs/supernote.md: every enabled plugin loads
// into one PluginHost process at its start).
startAutoSync(bridgeSync);
