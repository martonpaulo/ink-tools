/**
 * @format
 */

import {AppRegistry, Image, ToastAndroid} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {
  closePluginView,
  initPlugin,
  registerButton,
  registerSettingsEntry,
  showPluginView,
  startButtonQueue,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './src/copy';
import {
  ALIAS,
  noteHost,
  RECEIVE_ID,
  runSend,
  SEND_PAGE_ID,
  SEND_SELECTION_ID,
} from './src/run';
import {relay} from './src/native';
import {runReceive} from './src/receive/session';

/** sn-plugin-lib 0.2.3 button types and show types, as Ink2Pic names them. */
const BUTTON_TYPE_SIDEBAR = 1;
const BUTTON_TYPE_LASSO = 2;
const SHOW_NO_VIEW = 0;
const SHOW_FULL_VIEW = 1;
const EDIT_DATA_STROKES = 0;

AppRegistry.registerComponent(appName, () => App);

function report(what, result) {
  if (!result.ok) {
    console.error(`Relay: ${what} failed: ${result.code} ${result.message}`);
  }
}

initPlugin().then(result => report('init', result));

registerButton(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
  id: SEND_PAGE_ID,
  name: copy.sendPage,
  icon: Image.resolveAssetSource(require('./assets/send-page.png')).uri,
  showType: SHOW_NO_VIEW,
}).then(result => report('send page button', result));

registerButton(BUTTON_TYPE_LASSO, ['NOTE'], {
  id: SEND_SELECTION_ID,
  name: copy.sendSelection,
  icon: Image.resolveAssetSource(require('./assets/send-selection.png')).uri,
  editDataTypes: [EDIT_DATA_STROKES],
  showType: SHOW_NO_VIEW,
}).then(result => report('send selection button', result));

registerButton(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
  id: RECEIVE_ID,
  name: copy.receive,
  icon: Image.resolveAssetSource(require('./assets/receive.png')).uri,
  showType: SHOW_FULL_VIEW,
}).then(result => report('receive button', result));

/** The view shows «Ready to receive» until one item lands in the note (#49). */
function receive() {
  runReceive(relay(), noteHost, ALIAS, () => showPluginView())
    .then(line => {
      if (line !== null) {
        closePluginView();
        ToastAndroid.show(line, ToastAndroid.SHORT);
      }
    })
    .catch(error => console.error(`Relay: receive failed: ${error.message}`));
}

/** No view: the person stays on the note and reads a toast; with no device, Settings opens. */
function send(capture) {
  runSend(capture)
    .then(outcome => {
      if (outcome.kind === 'choose') {
        showPluginView();
      } else {
        // Whether the host shows the toast is measured in the device round (#98 Task 8).
        ToastAndroid.show(outcome.text, ToastAndroid.SHORT);
      }
    })
    .catch(error => console.error(`Relay: send failed: ${error.message}`));
}

report(
  'button listener',
  startButtonQueue(id => {
    if (id === SEND_PAGE_ID) {
      send('page');
      return true;
    }
    if (id === SEND_SELECTION_ID) {
      send('selection');
      return true;
    }
    if (id === RECEIVE_ID) {
      receive();
      return true;
    }
    return false;
  }),
);

registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`Relay: ${error.message}`);
});
