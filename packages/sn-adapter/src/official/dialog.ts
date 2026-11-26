/**
 * The host's own dialogs (#273, #296): `NativeUIUtils.showRattaDialog` and `showErrorTipDialog`
 * (sn-plugin-lib 0.2.3 source, not in the docs). Both pass `getCurrentActivity()`, which PluginHost
 * leaves null; on PluginHost 1.00.2610150 the host swaps it for the application context and raises
 * the window, so the plugin lives on (docs/supernote.md › Ratta dialog; registry
 * `pluginhost.host-dialogs`). Neither has a close call.
 */
import {NativeUIUtils} from 'sn-plugin-lib';
import {REGISTRY} from '../registry.generated';
import {attempt, attemptNow, fail, ok, Result, THROWN_CODE} from './result';

/**
 * `showRattaDialog`'s `isSuccess` for the «Prompt» dialog a destructive question uses, as a note's
 * Delete This Page (registry `pluginhost.host-dialogs`).
 */
const QUESTION = REGISTRY.pluginhostHostDialogs.questionStyle;

/**
 * The settle of the one question still open, or null. Back closes the host's dialog without calling
 * either of its buttons, so its promise never settles (sn-plugin-lib 0.2.3 `RTNUIUtils`; observed
 * device behaviour, #296): the next question settles it as a Cancel first.
 */
let openQuestion: (() => void) | null = null;

/**
 * Asks `question` in the host's confirm dialog: `cancel` on the left, outlined, and `action` on the
 * right, filled (native catalog). True when the person pressed `action`, false for `cancel`, and
 * false for Back once the next question is asked, since Back gives no answer of its own (#296); so a
 * caller never waits on a question before it asks again. An answer that is not a boolean is a
 * failure, never a «no»: the caller shows its own question. The dialog waits for the person, so the
 * call has no time limit.
 */
export function confirm(
  question: string,
  action: string,
  cancel: string,
): Promise<Result<boolean>> {
  openQuestion?.();
  return new Promise(resolve => {
    let settled = false;
    const settle = (answer: Result<boolean>) => {
      if (settled) {
        return;
      }
      settled = true;
      if (openQuestion === dismissed) {
        openQuestion = null;
      }
      resolve(answer);
    };
    const dismissed = () => settle(ok(false));
    openQuestion = dismissed;
    attempt(
      () => NativeUIUtils.showRattaDialog(question, cancel, action, QUESTION),
      raw =>
        typeof raw === 'boolean'
          ? ok(raw)
          : fail(THROWN_CODE, `showRattaDialog answered ${String(raw)}`),
    ).then(settle);
  });
}

/**
 * Shows `text` in the host's error tip, for a no-view action that failed with nothing to retry and
 * no fix to offer (owner, 2026-11-25); a view keeps its own error with Retry (ui-kit's ErrorView).
 */
export function errorTip(text: string): Result<true> {
  return attemptNow(() => NativeUIUtils.showErrorTipDialog(text));
}
