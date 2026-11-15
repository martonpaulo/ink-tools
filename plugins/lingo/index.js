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

// Settings only, until the translate flow brings its lasso button (#46).
registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Lingo: ${error.message}`);
});
