/** The tablet's side of Gestures (#270): every SDK call through sn-adapter (#101), files through Smart Pen's own module. */
import {
  hasPermission,
  onMotion,
  SHARED_FOLDER,
  SHARED_FOLDER_PERMISSIONS,
} from '@ink-tools/sn-adapter/official';
import {readText, writeText} from '@ink-tools/picture-search/storage';
import {gestureRequirements, REQUEST_FILE} from './requirement';
import type {GesturesHost} from './run';

export const GESTURE_REQUIREMENTS = gestureRequirements(SHARED_FOLDER, SHARED_FOLDER_PERMISSIONS);

export const DEVICE: GesturesHost = {
  has: permission => hasPermission(permission),
  read: path => readText(path),
  write: (path, text) => writeText(path, text),
  onMotion: listener => onMotion(listener),
  requirements: GESTURE_REQUIREMENTS,
  requestPath: `${SHARED_FOLDER}/${REQUEST_FILE}`,
  timers: {
    set: (run, ms) => setTimeout(run, ms),
    clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
  },
  now: () => Date.now(),
  log: line => console.log(`SmartPen: gestures: ${line}`),
};
