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
import {nativeTimers, startActionChannel} from '@ink-tools/sn-adapter/actions';
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

// «Run Probe» by command from inkctl, with no screen (#283): `inkctl plugin action ink-tools-probe run-probe`.
startActionChannel({
  plugin: 'ink-tools-probe',
  read: () => readActionFile(),
  actions: {'run-probe': runProbeAction(PluginManager)},
  // The native ProbeTicks timer (ProbePackage): a JS timer stops while no Probe view shows (#283).
  timers: nativeTimers('ProbeTicks'),
});
