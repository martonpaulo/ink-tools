/**
 * @format
 */

import {AppRegistry, Image, ToastAndroid} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {
  errorTip,
  hasPermission,
  initPlugin,
  onMotion,
  onPenUp,
  recycleElement,
  registerButton,
  registerSettingsEntry,
  requestPermission,
  showPluginView,
  startButtonQueue,
  unregisterButton,
} from '@ink-tools/sn-adapter/official';
import {Buttons, converterFor} from './src/modules/text/buttons';
import {
  DEVICE_CONVERT,
  DEVICE_LASSO,
  DEVICE_UNDO,
} from './src/modules/text/device';
import {DEVICE as SHAPES_DEVICE} from './src/modules/shapes/device';
import {HoldTracker} from './src/modules/shapes/hold';
import {createRunner} from './src/modules/shapes/run';
import {STILL_RADIUS_PX} from './src/modules/shapes/settings';
import {createPenRouter} from './src/pen';
import {getSettings} from './src/profile';
import {applySettings, setModuleHost} from './src/runtime';
import {penActions, readActionFile, TICKS_MODULE} from './src/actions';
import {nativeTimers, startActionChannel} from '@ink-tools/sn-adapter/actions';
import {working} from './src/working';

AppRegistry.registerComponent(appName, () => App);

const log = line => console.log(`SmartPen: ${line}`);

registerSettingsEntry(() => showPluginView()).catch(error => {
  console.error(`SmartPen: ${error.message}`);
});

// One pen-up listener for both modules: Smart Shapes decides first (#305).
const router = createPenRouter({onPenUp, recycleElement, log});

const buttons = new Buttons({
  register: registerButton,
  unregister: unregisterButton,
  hasPermission,
  requestPermission,
  makeConverter: () =>
    converterFor({...DEVICE_CONVERT, onPenUp: router.onTextPenUp}),
  undo: DEVICE_UNDO,
  lasso: DEVICE_LASSO,
  toast: text => ToastAndroid.show(text, ToastAndroid.SHORT),
  errorTip,
  fail: problem => working.hold(problem),
  needs: problem => working.hold(problem, 'needs'),
  dismiss: () => working.dismiss(),
  log,
  icons: {
    on: Image.resolveAssetSource(require('./assets/mode-on.png')).uri,
    off: Image.resolveAssetSource(require('./assets/mode-off.png')).uri,
    undo: Image.resolveAssetSource(require('./assets/undo.png')).uri,
    lasso: Image.resolveAssetSource(require('./assets/convert.png')).uri,
  },
});

const runner = createRunner(
  SHAPES_DEVICE,
  new HoldTracker(() => STILL_RADIUS_PX),
  {
    now: () => Date.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  },
);
let stopMotion = null;

setModuleHost({
  startText: () => buttons.registerAll(),
  stopText: () => buttons.unregisterAll(),
  startShapes: () => {
    const motion = onMotion(runner.motion);
    if (motion.ok) {
      stopMotion = motion.value;
    } else {
      log(`shapes: motion listener failed: ${motion.message}`);
    }
    const penUp = router.setShapes(runner.penUp);
    if (!penUp.ok) {
      log(`shapes: pen-up listener failed: ${penUp.message}`);
    }
  },
  stopShapes: () => {
    if (stopMotion) {
      stopMotion();
      stopMotion = null;
    }
    router.setShapes(null);
  },
});

// At start-up, before any view exists (Ink2Pic gotcha 11): every button runs with no view.
const listening = startButtonQueue(id => buttons.press(id));
if (!listening.ok) {
  console.error(`SmartPen: button listener failed: ${listening.message}`);
}

// The pen recorder and replay by command (#298): inkctl's request file, read on the native timer,
// which ticks with no view open.
startActionChannel({
  plugin: 'smart-pen',
  read: () => readActionFile(),
  actions: penActions(),
  timers: nativeTimers(TICKS_MODULE),
});

// The modules start as the settings file says, once the plugin is initialised.
initPlugin()
  .then(started => {
    if (!started.ok) {
      log(`init: ${started.message}`);
    }
    return getSettings();
  })
  .then(applySettings)
  .catch(error => log(`start: ${String(error)}`));
