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
import {DEFINE_BUTTON_ID, defineLasso} from './src/definition';

AppRegistry.registerComponent(appName, () => App);

registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Lookup: ${error.message}`);
});

// At start-up, before the view exists (Ink2Pic gotcha 11). «Insert definition» runs here, with no
// view (#115); the button itself follows its Settings switch (src/buttons.ts).
const listening = startButtonQueue(id => {
  if (id !== DEFINE_BUTTON_ID) {
    return false;
  }
  defineLasso().catch(error => {
    console.error(`Lookup: define: ${error.message}`);
  });
  return true;
});
if (!listening.ok) {
  console.error(`Lookup: button listener failed: ${listening.message}`);
}
