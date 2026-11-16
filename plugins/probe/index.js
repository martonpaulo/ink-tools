/**
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {registerProbe} from './src/register';
import {pressCommand} from './src/command';
import {noteApi} from './src/noteApi';
import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

registerProbe(
  () => PluginManager.showPluginView(),
  () => pressCommand(noteApi),
  Image.resolveAssetSource(require('./assets/icon.png')).uri,
).catch(error => {
  console.error(`Probe: ${error.message}`);
});
