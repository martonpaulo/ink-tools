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
} from '@ink-tools/sn-adapter/official';
import {clearChoice, openChoose} from './src/choose';
import {DEFINE_BUTTON_ID, defineLasso} from './src/definition';
import {SUMMARY_BUTTON_ID, summaryLasso} from './src/summary';
import {CHOOSE_BUTTON_ID, MODES, TRANSLATIONS} from './src/modes';
import {pictureLasso} from './src/pictures';
import {warmRanking} from '@ink-tools/picture-search';
import {syncModules} from './src/modules';
import {headingLevel} from './src/headings/buttons';
import {headingLasso} from './src/headings/run';
import {ADD_ID, CUT_ID, PASTE_ID} from './src/collection/buttons';
import {addToCollection, DEVICE_HOST} from './src/collection/run';
import {closeCollection, openCollection} from './src/collection/view';
import {getSettings, saveSettings} from './src/profile';
import {translateLasso} from './src/translation';
import {working} from './src/working';

AppRegistry.registerComponent(appName, () => App);

// The Settings entry always opens Settings, never a Choose screen left from an earlier press.
registerSettingsEntry(() => {
  clearChoice();
  closeCollection();
  showPluginView();
}).catch(error => {
  console.error(`Lookup: ${error.message}`);
});

// The saved switches register their lasso buttons (#142): a switch survives a restart. A module
// that is off registers none (#306). A file in Word Lookup's shape is written once in the new one.
getSettings()
  .then(async settings => {
    if (settings.oldShape) {
      await saveSettings({...settings, oldShape: false});
    }
    await syncModules(settings);
  })
  .catch(error => {
    console.error(`Lookup: buttons: ${error.message}`);
  });

// At start-up, before the view exists (Ink2Pic gotcha 11). Every lasso button runs here, with no
// view (#111, #115, #174), under the «Loading…» strip (#103); each button itself follows its
// Settings switch (src/buttons.ts).
const listening = startButtonQueue(id => {
  if (id === CHOOSE_BUTTON_ID) {
    // Reads the lasso, then opens the view on the Choose screen (#156).
    openChoose();
    return true;
  }
  if (id === ADD_ID || id === CUT_ID) {
    // Collection (#249): the lasso becomes the next piece; a cut deletes it after the write.
    working
      .run(() => addToCollection(DEVICE_HOST, id === CUT_ID))
      .catch(error => {
        console.error(`Lookup: collection: ${error.message}`);
      });
    return true;
  }
  if (id === PASTE_ID) {
    // Opens the view on the collection: its count, Paste, Clear and Keep After Paste (#249).
    clearChoice();
    openCollection();
    showPluginView();
    return true;
  }
  const level = headingLevel(id);
  if (level !== null) {
    // Headings (#252): the lasso becomes a native title, moved to the margin.
    working
      .run(() => headingLasso(level))
      .catch(error => {
        console.error(`Lookup: heading: ${error.message}`);
      });
    return true;
  }
  if (id === DEFINE_BUTTON_ID) {
    working.run(defineLasso).catch(error => {
      console.error(`Lookup: define: ${error.message}`);
    });
    return true;
  }
  if (id === SUMMARY_BUTTON_ID) {
    working.run(summaryLasso).catch(error => {
      console.error(`Lookup: summary: ${error.message}`);
    });
    return true;
  }
  const translation = TRANSLATIONS.find(each => each.buttonId === id);
  if (translation) {
    working
      .run(() => translateLasso(translation.direction))
      .catch(error => {
        console.error(`Lookup: translate: ${error.message}`);
      });
    return true;
  }
  const mode = MODES.find(each => each.buttonId === id);
  if (!mode) {
    return false;
  }
  working
    .run(() => pictureLasso(mode))
    .catch(error => {
      console.error(`Lookup: picture: ${error.message}`);
    });
  return true;
});
if (!listening.ok) {
  console.error(`Lookup: button listener failed: ${listening.message}`);
}

// Once per JS instance, after the buttons are registered: the first press then ranks as fast as
// the next one, since the scorers' first-run cost is spent here (#19).
setTimeout(() => {
  try {
    warmRanking();
  } catch (error) {
    console.error(`Lookup: warm-up: ${error.message}`);
  }
}, 0);
