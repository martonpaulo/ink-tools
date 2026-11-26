/**
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {registerProbe} from './src/register';
import {createCommandRunner} from './src/command';
import {noteApi} from './src/noteApi';
import {readActionFile, runProbeAction} from './src/actions';
import {startActionChannel} from '@ink-tools/sn-adapter/actions';
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

// «Run Probe» by command from inkctl, with no screen (#283): `inkctl plugin action plugin-diagnostics run-probe`.
startActionChannel({
  plugin: 'plugin-diagnostics',
  read: () => readActionFile(),
  actions: {'run-probe': runProbeAction(PluginManager)},
});
