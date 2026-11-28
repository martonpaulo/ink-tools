/**
 * The start-up notice when a Supernote update turned one of this plugin's features off (#492): the
 * registry's kill switches of the items it uses, read once at start, shown as ui-kit's Needs state
 * on the plugin's own view. With every item on, nothing is shown.
 */
import {holdFirmwareNotice} from '@ink-tools/ui-kit';
import {brokenFeatures, REGISTRY_ITEMS, type RegistryItem, type WatchedFeature} from '@ink-tools/sn-adapter/registry';
import {working} from './working';

/** The registry items this plugin uses, each with the feature a person knows it as. */
export const WATCH: readonly WatchedFeature[] = [
  {item: 'pen.pen-types', feature: 'Smart Shapes'},
  {item: 'pen.digitizer-units', feature: 'Smart Shapes'},
  {item: 'plugin-api.pen-up-uuid', feature: 'Real-Time Text'},
];
export const STILL_WORKS = 'The rest of Smart Pen is not affected.';

/** Reads the kill switches and holds the notice when a feature is off; true when it was held. */
export const checkFirmware = (items: readonly RegistryItem[] = REGISTRY_ITEMS): Promise<boolean> =>
  holdFirmwareNotice(working, brokenFeatures(WATCH, items, console.log), STILL_WORKS);
