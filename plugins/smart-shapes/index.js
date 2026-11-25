/**
 * @format
 */

import {AppRegistry} from 'react-native';
import {name as appName} from './app.json';
import {initPlugin, onMotion, onPenUp} from '@ink-tools/sn-adapter/official';
import {HoldTracker} from './src/hold';
import {DEVICE} from './src/device';
import {createRunner} from './src/run';
import {STILL_RADIUS_PX} from './src/settings';

// No view yet: the Settings view lands with its renders once the render harness works (#265, #253).
AppRegistry.registerComponent(appName, () => () => null);

const runner = createRunner(DEVICE, new HoldTracker(() => STILL_RADIUS_PX), {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
});

initPlugin().then(started => {
  if (!started.ok) {
    DEVICE.log(`init: ${started.message}`);
  }
  for (const listening of [onMotion(runner.motion), onPenUp(elements => runner.penUp(elements))]) {
    if (!listening.ok) {
      DEVICE.log(`listener failed: ${listening.message}`);
    }
  }
});
