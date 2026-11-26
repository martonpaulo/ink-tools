/**
 * Smart Pen's view for a no-view button's failure (#257): a failed conversion or undo holds ui-kit's
 * Error state, with its reason and Close, from the shared ui-kit.
 */
import {ToastAndroid} from 'react-native';
import {createWorking} from '@ink-tools/ui-kit';
import {closePluginView, showPluginView} from '@ink-tools/sn-adapter/official';
import {copy} from './copy';

export const working = createWorking({
  show: showPluginView,
  close: closePluginView,
  toast: text => ToastAndroid.show(text, ToastAndroid.SHORT),
  log: line => console.log(`SmartPen: ${line}`),
  copy: {failed: copy['working.failed'], timeout: copy['working.timeout']},
});
