import {REGISTRY_ITEMS, RegistryItem} from './registry.generated';

/**
 * A port of the TypeScript adapter (#294, docs/architecture.md › Layer rules): one set of operations
 * named in our words, with one implementation per level, keyed by the `active` text a registry item
 * gives. The registry item names the implementation in use; a part moved to a higher level adds its
 * implementation beside the old one and the item's `active` switches, so no tool changes.
 *
 * Before each operation the port checks the item's kill switch (#293): an item that is off stops
 * its module with `ModuleOff`, never a second path.
 */

/** Thrown before an operation of a module whose registry item is turned off (#293). */
export class ModuleOff extends Error {
  readonly item: RegistryItem;
  /** The operation that was refused, in our words. */
  readonly method: string;

  constructor(item: RegistryItem, method: string) {
    super(`${item.id} is turned off ${item.off}; ${method} did not run`);
    this.name = 'ModuleOff';
    this.item = item;
    this.method = method;
  }
}

/** Registry item `id`; an id the registry does not hold is a bug, so it throws. */
export function registryItem(id: string, items: readonly RegistryItem[] = REGISTRY_ITEMS): RegistryItem {
  const item = items.find(entry => entry.id === id);
  if (!item) {
    throw new Error(`no registry item ${id}`);
  }
  return item;
}

/** Throws `ModuleOff` when the item's kill switch is off; the caller then does nothing (#293). */
export function requireOn(item: RegistryItem, method: string): void {
  if (item.off !== null) {
    throw new ModuleOff(item, method);
  }
}

type Operations = object;

/**
 * The implementation the registry item `id` names as active, with every method checking the kill
 * switch first. A missing implementation throws: the registry and the code disagree, and no other
 * implementation is taken in its place.
 */
export function port<T extends Operations>(
  id: string,
  implementations: Readonly<Record<string, T>>,
  items: readonly RegistryItem[] = REGISTRY_ITEMS,
): T {
  const item = registryItem(id, items);
  const chosen = implementations[item.active];
  if (!chosen) {
    throw new Error(`no implementation of ${id} for its active ${item.active}`);
  }
  return guarded(item, chosen);
}

/**
 * `operations` with each function checking the item's kill switch before it runs. The refusal is
 * thrown at the call, before any promise exists, so an async caller's `await` turns it into its own
 * rejection and nothing of the operation has started.
 */
export function guarded<T extends Operations>(item: RegistryItem, operations: T): T {
  const wrapped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(operations)) {
    wrapped[name] =
      typeof value === 'function'
        ? (...args: unknown[]) => {
            requireOn(item, name);
            return (value as (...a: unknown[]) => unknown).apply(operations, args);
          }
        : value;
  }
  return wrapped as T;
}
