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
  SEND_NOTE_ID,
  textDeps,
} from './src/run';
import {startTextSend} from './src/send/textSession';
import {startPick} from './src/send/pickSession';
import {relay} from './src/native';
import {ensurePermissions, logPermissions} from './src/permissions';
import {runReceive} from './src/receive/session';
import {placePendingOnPenUp, startBackgroundIfOn} from './src/receive/background';
import {working} from './src/working';
import {editAction} from './src/editor/operations';
import {templatesAction} from './src/editor/templates';
import {deviceEditHost, readEditorRequest} from './src/editor/device';
import {PenGate} from './src/editor/penGate';
import {EDIT_PEN_MS, serveEdits} from './src/receive/remote';
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

// The whole open note goes to the Mac (#504).
// shortcut: Send Page's icon stands in until a note icon is drawn; draw one before a release.
registerButton(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
  id: SEND_NOTE_ID,
  name: copy.sendNote,
  icon: Image.resolveAssetSource(require('./assets/send-page.png')).uri,
  showType: SHOW_NO_VIEW,
}).then(result => report('send note button', result));

registerButton(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
  id: RECEIVE_ID,
  name: copy.receive,
  icon: Image.resolveAssetSource(require('./assets/receive.png')).uri,
  showType: SHOW_FULL_VIEW,
}).then(result => report('receive button', result));

function showLine(line) {
  closePluginView();
  ToastAndroid.show(line, ToastAndroid.SHORT);
}

/**
 * The view shows «Ready to receive» until the first item lands in the note (#49); the window then
 * goes on with the view closed, and each item shows its toast as it lands (#289). The end line
 * shows only when no item landed.
 */
function receive() {
  let landed = 0;
  runReceive(relay(), noteHost, ALIAS, () => showPluginView(), line => {
    landed += 1;
    showLine(line);
  })
    .then(end => {
      if (end === null) {
        return;
      }
      if (typeof end !== 'string') {
        // A failed receive stays on screen in the Error or Needs state (#438).
        working.hold(end.problem, end.state);
        return;
      }
      if (landed === 0) {
        showLine(end);
      }
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
    if (id === SEND_NOTE_ID) {
      send('note');
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

// «Receive in the background» (#289): with the switch on, the receiver starts here, with no tap.
const backgroundDeps = {native: relay(), host: noteHost, alias: ALIAS, onItem: showLine};
startBackgroundIfOn(backgroundDeps).catch(error =>
  console.error(`Relay: background receive failed: ${error.message}`),
);

// Settings is a view, so the host's dialog has a place to show; a no-view tap asks too (#163).
registerSettingsEntry(() => {
  showPluginView();
  ensurePermissions();
}).catch(error => {
  console.error(`Relay: ${error.message}`);
});

// The Note Editor's tablet helper (#312): inkctl's request file, read on the native timer,
// which ticks with no view open; an edit waits while the pen is on the page. `save-note` saves the
// open note before inkctl opens another (#426); `templates` lists the tablet's page templates (#451).
const pen = new PenGate();
// A pen-up places what a background receive kept with no note open (#289).
const MOTION_UP = 1;
report(
  'pen listener',
  onMotion(event => {
    pen.motion(event);
    if (event.action === MOTION_UP) {
      placePendingOnPenUp(backgroundDeps).catch(error =>
        console.error(`Relay: place the waiting items failed: ${error.message}`),
      );
    }
  }),
);
const editHost = deviceEditHost(pen);
// Note Editor's edits over Device Link (#493): the same action, with a pen wait the receiver's
// answer window holds.
serveEdits(editAction({...editHost, penIdle: () => pen.idle(EDIT_PEN_MS)}));
startActionChannel({
  plugin: 'device-link',
  read: () => readEditorRequest(relay()),
  actions: {edit: editAction(editHost), 'save-note': saveNoteAction(editHost), templates: templatesAction(editHost)},
  timers: nativeTimers('DeviceLinkTicks'),
});
