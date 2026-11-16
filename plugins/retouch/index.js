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
import {syncButtons} from './src/buttons';
import {defaultSettings, editOfButton} from './src/edits';
import {runEdit} from './src/edit';

AppRegistry.registerComponent(appName, () => App);

registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Retouch: ${error.message}`);
});

// Every edit starts on, so its lasso button is registered at start-up (#136).
syncButtons(defaultSettings).catch(error => {
  console.error(`Retouch: buttons: ${error.message}`);
});

// At start-up, before the view exists (Ink2Pic gotcha 11). An edit button's press runs here, with
// no view (src/edit.ts).
const listening = startButtonQueue(id => {
  const edit = editOfButton(id);
  if (!edit) {
    return false;
  }
  runEdit(edit.id).catch(error => {
    console.error(`Retouch: ${edit.name}: ${error.message}`);
  });
  return true;
});
if (!listening.ok) {
  console.error(`Retouch: button listener failed: ${listening.message}`);
}
