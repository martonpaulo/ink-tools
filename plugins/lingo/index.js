/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {
  registerSettingsEntry,
  showPluginView,
  startButtonQueue,
} from '@supernote-tools/sn-adapter/official';
import {buttonOf} from './src/buttons';
import {translateLasso} from './src/translate';

AppRegistry.registerComponent(appName, () => App);

registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Lingo: ${error.message}`);
});

// At start-up, before the view exists (Ink2Pic gotcha 11). A direction button's press runs here,
// with no view (#128); the buttons themselves follow the Settings switches (src/buttons.ts).
const listening = startButtonQueue(id => {
  const button = buttonOf(id);
  if (!button) {
    return false;
  }
  translateLasso(button).catch(error => {
    console.error(`Lingo: ${button.name}: ${error.message}`);
  });
  return true;
});
if (!listening.ok) {
  console.error(`Lingo: button listener failed: ${listening.message}`);
}
