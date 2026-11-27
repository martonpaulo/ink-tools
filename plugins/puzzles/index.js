/**
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {
  BUTTON_TYPE_SIDEBAR,
  initPlugin,
  registerButton,
  SHOW_FULL_VIEW,
  showPluginView,
  startButtonQueue,
} from '@ink-tools/sn-adapter/official';
import {copy} from './src/copy';

/** The one toolbar button's id; its press opens the Puzzles view (#453). */
const PUZZLES_ID = 1;

AppRegistry.registerComponent(appName, () => App);

function report(what, result) {
  if (!result.ok) {
    console.error(`Puzzles: ${what} failed: ${result.code} ${result.message}`);
  }
}

initPlugin().then(result => report('init', result));

registerButton(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
  id: PUZZLES_ID,
  name: copy.title,
  icon: Image.resolveAssetSource(require('./assets/icon.png')).uri,
  showType: SHOW_FULL_VIEW,
}).then(result => report('button', result));

// At start-up, before the view exists, as the press can come first: it shows the view, which
// checks what a game needs when the game opens (src/PuzzlesView.tsx).
report(
  'button listener',
  startButtonQueue(id => {
    if (id !== PUZZLES_ID) {
      return false;
    }
    showPluginView();
    return true;
  }),
);
