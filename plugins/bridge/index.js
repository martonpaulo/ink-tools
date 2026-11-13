/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {registerSettingsOnly} from './src/register';
import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

registerSettingsOnly(() => PluginManager.showPluginView()).catch(error => {
  console.error(`Bridge: ${error.message}`);
});
