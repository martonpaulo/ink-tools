/**
 * Image Editing's «Loading…» strip (#103): an edit that runs past `STRIP_AFTER_MS` shows it until
 * the picture is replaced (src/press.ts), from the shared ui-kit.
 */
import {ToastAndroid} from 'react-native';
import {createWorking} from '@supernote-tools/ui-kit';
import {
  closePluginView,
  showPluginView,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';

/** The owner's limit: an edit finishes within 2 s; a longer one shows the strip (plugin-scope.md). */
export const STRIP_AFTER_MS = 2000;

/** A short toast at the bottom of the note (docs/supernote.md, «What a plugin can show»). */
export function showToast(text: string): void {
  ToastAndroid.show(text, ToastAndroid.SHORT);
}

export const working = createWorking({
  show: showPluginView,
  close: closePluginView,
  toast: showToast,
  log: line => console.log(`Retouch: ${line}`),
  copy: {failed: copy['working.failed'], timeout: copy['working.timeout']},
});
