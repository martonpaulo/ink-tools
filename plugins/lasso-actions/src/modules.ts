/**
 * Lasso Actions' modules (#306), one row each: its id, its title in Settings and its lasso buttons.
 * A module that is off registers no button. Lookup, Headings (#252) and Collection (#249) are built: «Convert
 * to Text» joins from Smart Pen once its engine is on `main` (#305), and each other module adds a
 * row here when it is built. A switch a newer build wrote for a module this build does not know is
 * kept in the settings file (src/settings.ts), never dropped.
 */
import {
  BUTTONS,
  lookupStates,
  statesChanged,
  syncStates,
  type ButtonDeps,
  type ButtonState,
  type PluginButton,
} from './buttons';
import {copy} from './copy';
import {COLLECTION_BUTTONS} from './collection/buttons';
import {HEADING_BUTTONS} from './headings/buttons';
import {SWITCH_KEYS, type LassoSettings, type LookupSettings} from './settings';

import type {ModuleId} from './moduleIds';

export {MODULE_IDS, type ModuleId} from './moduleIds';

export type ModuleRow = {
  id: ModuleId;
  title: string;
  note: string;
  buttons: readonly PluginButton[];
};

export const MODULES: readonly ModuleRow[] = [
  {
    id: 'lookup',
    title: copy['module.lookup'],
    note: copy['module.lookupNote'],
    buttons: BUTTONS,
  },
  {
    id: 'headings',
    title: copy['module.headings'],
    note: copy['module.headingsNote'],
    buttons: HEADING_BUTTONS,
  },
  {
    id: 'collection',
    title: copy['module.collection'],
    note: copy['module.collectionNote'],
    buttons: COLLECTION_BUTTONS,
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

/**
 * Every module's buttons and whether each should be registered: Lookup's follow their own switches
 * while the module is on; every other module's buttons follow the module's switch alone.
 */
export function moduleStates(settings: LassoSettings): ButtonState[] {
  return MODULES.flatMap(row =>
    row.id === 'lookup'
      ? lookupStates(activeLookup(settings.modules, settings.lookup))
      : row.buttons.map(button => ({button, on: settings.modules[row.id]})),
  );
}

/** At start-up: every module's buttons follow the saved switches. */
export function syncModules(
  settings: LassoSettings,
  deps?: ButtonDeps,
): Promise<void> {
  return syncStates(moduleStates(settings), deps);
}

/** The Settings path: the buttons follow the switches, then each missing permission is asked. */
export function modulesChanged(
  settings: LassoSettings,
  deps?: ButtonDeps,
): Promise<void> {
  return statesChanged(moduleStates(settings), deps);
}
