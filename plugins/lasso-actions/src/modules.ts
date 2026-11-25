/**
 * Lasso Actions' modules (#306), one row each: its id, its title in Settings and its lasso buttons.
 * A module that is off registers no lasso button. Only Lookup is built today: «Convert to Text»
 * joins from Smart Pen once its engine is on `main` (#305), and Headings (#252) and Collection
 * (#249) stay paused; each adds a row here when it is built. A switch a newer build wrote for one of
 * them is kept in the settings file (src/settings.ts), never dropped.
 */
import {BUTTONS, type LassoButton} from './buttons';
import {copy} from './copy';
import {SWITCH_KEYS, type LookupSettings} from './settings';

import type {ModuleId} from './moduleIds';

export {MODULE_IDS, type ModuleId} from './moduleIds';

export type ModuleRow = {
  id: ModuleId;
  title: string;
  note: string;
  buttons: readonly LassoButton[];
};

export const MODULES: readonly ModuleRow[] = [
  {
    id: 'lookup',
    title: copy['module.lookup'],
    note: copy['module.lookupNote'],
    buttons: BUTTONS,
  },
];

/**
 * Lookup's settings as its buttons should follow them: as saved while the module is on, and with
 * every switch off while it is off, so turning the module off removes every one of its buttons and
 * turning it on again brings back the ones that were on.
 */
export function activeLookup(
  modules: Record<ModuleId, boolean>,
  lookup: LookupSettings,
): LookupSettings {
  if (modules.lookup) {
    return lookup;
  }
  return {
    ...lookup,
    ...Object.fromEntries(SWITCH_KEYS.map(key => [key, false])),
    directions: Object.fromEntries(
      Object.keys(lookup.directions).map(id => [id, false]),
    ),
  };
}
