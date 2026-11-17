/**
 * Device Transfer's «Loading…» strip (#103): Send Page and Send Selection run with no view, so
 * each shows it from the press to the toast (index.js), from the shared ui-kit.
 */
import {ToastAndroid} from 'react-native';
import {createWorking} from '@supernote-tools/ui-kit';
import {
  closePluginView,
  showPluginView,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';

export const working = createWorking({
  show: showPluginView,
  close: closePluginView,
  toast: text => ToastAndroid.show(text, ToastAndroid.SHORT),
  log: line => console.log(`Relay: ${line}`),
  copy: {failed: copy.workingFailed, timeout: copy.workingTimeout},
});
