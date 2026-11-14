/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {registerSettingsEntry} from './src/register';
import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

registerSettingsEntry(() => PluginManager.showPluginView()).catch(error => {
  console.error(`Lingo: ${error.message}`);
});
