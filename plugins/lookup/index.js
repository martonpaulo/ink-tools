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
import {clearChoice, openChoose} from './src/choose';
import {DEFINE_BUTTON_ID, defineLasso} from './src/definition';
import {SUMMARY_BUTTON_ID, summaryLasso} from './src/summary';
import {syncButtons} from './src/buttons';
import {CHOOSE_BUTTON_ID, MODES, TRANSLATIONS} from './src/modes';
import {pictureLasso} from './src/pictures';
import {getSettings} from './src/profile';
import {translateLasso} from './src/translation';

AppRegistry.registerComponent(appName, () => App);

// The Settings entry always opens Settings, never a Choose screen left from an earlier press.
registerSettingsEntry(() => {
  clearChoice();
  showPluginView();
}).catch(error => {
  console.error(`Lookup: ${error.message}`);
});

// The saved switches register their lasso buttons (#142): a switch survives a restart.
getSettings()
  .then(settings => syncButtons(settings))
  .catch(error => {
    console.error(`Lookup: buttons: ${error.message}`);
  });

// At start-up, before the view exists (Ink2Pic gotcha 11). Every lasso button runs here, with no
// view (#111, #115, #174); each button itself follows its Settings switch (src/buttons.ts).
const listening = startButtonQueue(id => {
  if (id === CHOOSE_BUTTON_ID) {
    // Reads the lasso, then opens the view on the Choose screen (#156).
    openChoose();
    return true;
  }
  if (id === DEFINE_BUTTON_ID) {
    defineLasso().catch(error => {
      console.error(`Lookup: define: ${error.message}`);
    });
    return true;
  }
  if (id === SUMMARY_BUTTON_ID) {
    summaryLasso().catch(error => {
      console.error(`Lookup: summary: ${error.message}`);
    });
    return true;
  }
  const translation = TRANSLATIONS.find(each => each.buttonId === id);
  if (translation) {
    translateLasso(translation.direction).catch(error => {
      console.error(`Lookup: translate: ${error.message}`);
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
