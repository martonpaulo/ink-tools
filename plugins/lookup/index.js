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
import {syncButtons} from './src/buttons';
import {MODES} from './src/modes';
import {pictureLasso} from './src/pictures';
import {getSettings} from './src/profile';

AppRegistry.registerComponent(appName, () => App);

registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Lookup: ${error.message}`);
});

// The saved switches register their lasso buttons (#142): a switch survives a restart.
getSettings()
  .then(settings => syncButtons(settings))
  .catch(error => {
    console.error(`Lookup: buttons: ${error.message}`);
  });

// At start-up, before the view exists (Ink2Pic gotcha 11). Every lasso button runs here, with no
// view (#111, #115); each button itself follows its Settings switch (src/buttons.ts).
const listening = startButtonQueue(id => {
  if (id === DEFINE_BUTTON_ID) {
    defineLasso().catch(error => {
      console.error(`Lookup: define: ${error.message}`);
    });
    return true;
  }
  const mode = MODES.find(each => each.buttonId === id);
  if (!mode) {
    return false;
  }
  pictureLasso(mode);
  return true;
});
if (!listening.ok) {
  console.error(`Lookup: button listener failed: ${listening.message}`);
}
