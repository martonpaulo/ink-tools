/**
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {registerProbe} from './src/register';
import {createCommandRunner} from './src/command';
import {noteApi} from './src/noteApi';
import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

// One runner for the host process: it keeps the ids it ran and listens between presses (#286).
const commands = createCommandRunner(noteApi);

registerProbe(
  () => PluginManager.showPluginView(),
  () => commands.press(),
  Image.resolveAssetSource(require('./assets/command.png')).uri, // Run Command's own icon (#271)
).catch(error => {
  console.error(`Probe: ${error.message}`);
});
