/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {
  registerSettingsEntry,
  showPluginView,
} from '@supernote-tools/sn-adapter/official';

AppRegistry.registerComponent(appName, () => App);

// Settings only: Bridge never shows inside a note (docs/architecture.md).
registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Bridge: ${error.message}`);
});
