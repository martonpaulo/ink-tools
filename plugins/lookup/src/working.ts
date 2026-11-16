/**
 * Lookup's «Loading…» strip (#103): every lasso button that runs with no view shows it from the
 * press to the end of the action (index.js), from the shared ui-kit.
 */
import {createWorking} from '@supernote-tools/ui-kit';
import {
  closePluginView,
  showPluginView,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';
import {showToast} from './textBox';

export const working = createWorking({
  show: showPluginView,
  close: closePluginView,
  toast: showToast,
  log: line => console.log(`Lookup: ${line}`),
  copy: {failed: copy['working.failed'], timeout: copy['working.timeout']},
});

/** Opens Lookup's own view from a press, which then stays open (a missing permission, #142). */
export function showOwnView(): ReturnType<typeof showPluginView> {
  working.handOver();
  return showPluginView();
}
