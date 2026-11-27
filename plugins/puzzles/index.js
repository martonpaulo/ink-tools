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
  startButtonQueue,
} from '@ink-tools/sn-adapter/official';
import {copy} from './src/copy';
import {onToolbarPress, PUZZLES_ID} from './src/toolbar';

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
// checks what a game needs when the game opens (src/PuzzlesView.tsx), and starts at the game list.
report('button listener', startButtonQueue(id => onToolbarPress(id)));
