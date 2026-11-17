/**
 * @format
 */

import {AppRegistry, Image, ToastAndroid} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {
  hasPermission,
  registerButton,
  registerSettingsEntry,
  requestPermission,
  showPluginView,
  startButtonQueue,
  unregisterButton,
} from '@ink-tools/sn-adapter/official';
import {Buttons, converterFor} from './src/buttons';
import {DEVICE_CONVERT, DEVICE_UNDO} from './src/device';

AppRegistry.registerComponent(appName, () => App);

const log = line => console.log(`RealTimeConversion: ${line}`);

registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`RealTimeConversion: ${error.message}`);
});

const buttons = new Buttons({
  register: registerButton,
  unregister: unregisterButton,
  hasPermission,
  requestPermission,
  makeConverter: () => converterFor(DEVICE_CONVERT),
  undo: DEVICE_UNDO,
  toast: text => ToastAndroid.show(text, ToastAndroid.SHORT),
  log,
  icons: {
    on: Image.resolveAssetSource(require('./assets/mode-on.png')).uri,
    off: Image.resolveAssetSource(require('./assets/mode-off.png')).uri,
    undo: Image.resolveAssetSource(require('./assets/undo.png')).uri,
  },
});

buttons.registerAll().catch(error => log(`buttons: ${error.message}`));

// At start-up, before any view exists (Ink2Pic gotcha 11): both sidebar buttons run with no view.
const listening = startButtonQueue(id => buttons.press(id));
if (!listening.ok) {
  console.error(`RealTimeConversion: button listener failed: ${listening.message}`);
}
