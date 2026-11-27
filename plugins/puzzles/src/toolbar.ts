/**
 * The press of Puzzles' one toolbar button (#453): it shows the full view, and the press then goes
 * on to the mounted view, which starts at the game list (#539). sn-adapter's `startButtonQueue`
 * passes a press to the view's `onButtonEvent` listeners only when this answers false; answering
 * true, as it did, kept the press from the view, so a press after «Show Solution» and × opened on
 * the Solution again (device round of 2026-11-27).
 */
import {showPluginView} from '@ink-tools/sn-adapter/official';

/** The one toolbar button's id; its press opens the Puzzles view. */
export const PUZZLES_ID = 1;

/** Shows the view on a Puzzles press; always false, so sn-adapter hands the press to the view too. */
export function onToolbarPress(id: number, show: () => unknown = showPluginView): false {
  if (id === PUZZLES_ID) {
    show();
  }
  return false;
}
