import {REGISTRY_ITEMS, type RegistryItem} from './registry.generated';
import {registryItem} from './port';

/**
 * What a tool watches at start-up (#492): one registry item, the feature a person knows it as, and
 * an optional probe that answers true while the item still works. The registry's kill switch (#293)
 * is read for every item; a probe is for an item that has a safe one.
 */
export type WatchedFeature = {
  item: string;
  /** The feature in the words of the tool's own screen, never a registry id. */
  feature: string;
  probe?: () => Promise<boolean>;
};

/**
 * The features a firmware change turned off or broke, each once, in the order watched: the item's
 * kill switch is on, or its probe answered false or threw. A probe that threw is logged with the
 * item, never shown. An id the registry does not hold is a bug and throws.
 */
export async function brokenFeatures(
  watch: readonly WatchedFeature[],
  items: readonly RegistryItem[] = REGISTRY_ITEMS,
  log: (line: string) => void = () => undefined,
): Promise<string[]> {
  const broken: string[] = [];
  for (const entry of watch) {
    const item = registryItem(entry.item, items);
    let working = item.off === null;
    if (working && entry.probe) {
      try {
        working = await entry.probe();
      } catch (error) {
        log(`firmware watch: the probe of ${item.id} failed: ${String(error)}`);
        working = false;
      }
    }
    if (!working && !broken.includes(entry.feature)) {
      broken.push(entry.feature);
    }
  }
  return broken;
}
