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

// Settings only, until each mode brings its own lasso button (#110).
registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Lookup: ${error.message}`);
});
