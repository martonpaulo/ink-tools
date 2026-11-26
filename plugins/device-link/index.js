/**
 * @format
 */

import {AppRegistry, Image, ToastAndroid} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {
  BUTTON_TYPE_LASSO,
  BUTTON_TYPE_SIDEBAR,
  closePluginView,
  EDIT_DATA_STROKES,
  initPlugin,
  nativeTimers,
  onMotion,
  startActionChannel,
  registerButton,
  registerSettingsEntry,
  SHOW_FULL_VIEW,
  SHOW_NO_VIEW,
  showPluginView,
  startButtonQueue,
} from '@ink-tools/sn-adapter/official';
import {copy} from './src/copy';
import {
  ALIAS,
  findForSend,
  noteHost,
  RECEIVE_ID,
  SEND_PAGE_ID,
  SEND_SELECTION_ID,
  SEND_TEXT_ID,
  textDeps,
} from './src/run';
import {startTextSend} from './src/send/textSession';
import {startPick} from './src/send/pickSession';
import {relay} from './src/native';
import {ensurePermissions, logPermissions} from './src/permissions';
import {runReceive} from './src/receive/session';
import {working} from './src/working';
import {editAction} from './src/editor/operations';
import {deviceEditHost, readEditorRequest} from './src/editor/device';
import {PenGate} from './src/editor/penGate';
import {saveNoteAction} from './src/editor/save';

AppRegistry.registerComponent(appName, () => App);

function report(what, result) {
  if (!result.ok) {
    console.error(`Relay: ${what} failed: ${result.code} ${result.message}`);
  }
}

initPlugin().then(result => report('init', result));

// Each launch logs what the host holds; each tap asks for what is missing (#163).
logPermissions().catch(error =>
  console.error(`Relay: permissions failed: ${error.message}`),
);

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

registerButton(BUTTON_TYPE_LASSO, ['NOTE'], {
  id: SEND_TEXT_ID,
  name: copy.sendText,
  icon: Image.resolveAssetSource(require('./assets/send-text.png')).uri,
  editDataTypes: [EDIT_DATA_STROKES],
  showType: SHOW_FULL_VIEW,
}).then(result => report('send text button', result));

registerButton(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
  id: RECEIVE_ID,
  name: copy.receive,
  icon: Image.resolveAssetSource(require('./assets/receive.png')).uri,
  showType: SHOW_FULL_VIEW,
}).then(result => report('receive button', result));

/** The view shows «Ready to receive» until one item lands in the note (#49). */
function receive() {
  runReceive(relay(), noteHost, ALIAS, () => showPluginView())
    .then(end => {
      if (end === null) {
        return;
      }
      if (typeof end !== 'string') {
        // A failed receive stays on screen in the Error or Needs state (#438).
        working.hold(end.problem, end.state);
        return;
      }
      closePluginView();
      ToastAndroid.show(end, ToastAndroid.SHORT);
    })
    .catch(error => console.error(`Relay: receive failed: ${error.message}`));
}

/**
 * The search runs under the «Loading…» strip (#103); then the view lists the receivers found, and
 * a tap there sends (#307). With none found, Settings opens on «No LocalSend device found».
 */
function send(capture) {
  working
    .run(() => findForSend())
    .then(found => {
      if (found.kind === 'needs') {
        // The view opens on the Needs state, with the steps that allow the permission (#256).
        working.hold(found.problem, 'needs');
        return;
      }
      if (found.kind === 'pick') {
        startPick(capture, found.devices);
      }
      // The strip has closed the view; the list or Settings opens on its own.
      showPluginView();
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
    if (id === SEND_TEXT_ID) {
      // The view shows the recognised text before anything is sent (#99).
      startTextSend(
        textDeps(
          () => closePluginView(),
          line => ToastAndroid.show(line, ToastAndroid.SHORT),
        ),
      ).catch(error => console.error(`Relay: send text failed: ${error.message}`));
      return true;
    }
    if (id === RECEIVE_ID) {
      receive();
      return true;
    }
    return false;
  }),
);

// Settings is a view, so the host's dialog has a place to show; a no-view tap asks too (#163).
registerSettingsEntry(() => {
  showPluginView();
  ensurePermissions();
}).catch(error => {
  console.error(`Relay: ${error.message}`);
});

// The Ink Notebook Editor's tablet helper (#312): inkctl's request file, read on the native timer,
// which ticks with no view open; an edit waits while the pen is on the page. `save-note` saves the
// open note before inkctl opens another (#426).
const pen = new PenGate();
report('pen listener', onMotion(event => pen.motion(event)));
const editHost = deviceEditHost(pen);
startActionChannel({
  plugin: 'device-link',
  read: () => readEditorRequest(relay()),
  actions: {edit: editAction(editHost), 'save-note': saveNoteAction(editHost)},
  timers: nativeTimers('DeviceLinkTicks'),
});
