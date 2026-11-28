/**
 * What the Puzzles view watches at start (#492): the registry items it uses, each with the feature a
 * person knows it as. A Supernote update that turned one off shows ui-kit's Needs state, and with
 * every item on nothing extra is shown.
 */
import type {WatchedFeature} from '@ink-tools/sn-adapter/registry';

export const WATCH: readonly WatchedFeature[] = [
  {item: 'pluginhost.overlay-back-key', feature: 'The Back key in a game'},
];
export const STILL_WORKS = 'The games themselves are not affected.';
