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
import {registerEditorButton} from './src/buttons';
import {checkFirmware} from './src/firmware';
import {openEditor} from './src/editor';
import {EDITOR_BUTTON_ID, EDITOR_TOOLBAR_ID} from './src/edits';

AppRegistry.registerComponent(appName, () => App);

registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Retouch: ${error.message}`);
});

// One lasso button, «Image Editing», for a lassoed picture (#226), and the same button on the
// note toolbar (#248); every edit is in its view.
registerEditorButton().catch(error => {
  console.error(`Retouch: buttons: ${error.message}`);
});

// At start-up, before the view exists (Ink2Pic gotcha 11). The press opens the editor view: the
// host shows it (`showType` 1), and the editor reads the lassoed picture (src/editor.ts).
const listening = startButtonQueue(id => {
  if (id !== EDITOR_BUTTON_ID && id !== EDITOR_TOOLBAR_ID) {
    return false;
  }
  console.log('Retouch: Image Editing pressed');
  showPluginView();
  openEditor().catch(error => {
    console.error(`Retouch: editor: ${error.message}`);
  });
  return true;
});
if (!listening.ok) {
  console.error(`Retouch: button listener failed: ${listening.message}`);
}

// A firmware update that turned a feature off is told once, at start (#492).
checkFirmware().catch(error => {
  console.error(`Retouch: firmware check: ${error.message}`);
});
