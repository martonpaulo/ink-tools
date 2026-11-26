/** Written by scripts/registry.py from registry/ (#294); never edit it by hand. */

export const REGISTRY_VERSION = '2026.11.25';

export interface RegistryItem {
  readonly id: string;
  /** From 1, official or our own code, to 5, learned behaviour (docs/architecture.md › Layer rules). */
  readonly level: number;
  readonly impact: 'user' | 'tests';
  readonly owner: string;
  /** The probe's name; null when the item is unprobed. */
  readonly probe: string | null;
  /** Why no safe probe exists yet; null when the item has a probe. */
  readonly unprobed: string | null;
  readonly active: string;
}

export const REGISTRY_ITEMS: readonly RegistryItem[] = [
  {id: 'calendar.provider', level: 2, impact: 'user', owner: 'sn-adapter', probe: 'sn-adapter probeCapability(calendar)', unprobed: null, active: 'sn-adapter internals/calendar.ts'},
  {id: 'calendar.reading-rules', level: 5, impact: 'user', owner: 'sn-adapter', probe: null, unprobed: 'a row\'s visibility shows only on the screen; the effect test is the device round (#293 adds a read round-trip on a known row)', active: 'sn-adapter internals/calendar.ts'},
  {id: 'diagnostics.provider-probes', level: 2, impact: 'tests', owner: 'plugin-diagnostics', probe: 'plugin-diagnostics Run Probe', unprobed: null, active: 'plugin-diagnostics native ProbeTargets.java'},
  {id: 'digest.provider', level: 2, impact: 'user', owner: 'sn-adapter', probe: 'sn-adapter probeCapability(digest)', unprobed: null, active: 'sn-adapter internals/digest.ts'},
  {id: 'pen.digitizer-units', level: 5, impact: 'user', owner: 'sn-adapter', probe: null, unprobed: 'needs a pen stroke; the effect test is the Smart Pen device round', active: 'sn-adapter official/elements.ts'},
  {id: 'pen.pen-types', level: 5, impact: 'user', owner: 'smart-pen', probe: null, unprobed: 'needs a pen stroke and a lasso; the effect test is the Smart Pen device round', active: 'smart-pen src/modules/shapes/guard.ts'},
  {id: 'plugin-api.element-reads', level: 5, impact: 'user', owner: 'sn-adapter', probe: null, unprobed: 'a probe would have to hang the host to see the limit', active: 'sn-adapter official/elements.ts'},
  {id: 'plugin-api.unregister-unknown-button', level: 5, impact: 'user', owner: 'sn-adapter', probe: null, unprobed: 'a probe would hang the plugin', active: 'sn-adapter official/buttons.ts'},
  {id: 'plugin-api.pen-up-uuid', level: 5, impact: 'user', owner: 'smart-pen', probe: null, unprobed: 'needs a pen stroke; the effect test is the Smart Pen device round', active: 'smart-pen src/modules/text/device.ts'},
  {id: 'plugin-api.crop-erase-elements', level: 5, impact: 'user', owner: 'image-editing', probe: null, unprobed: 'needs a picture on a note page; the effect test is the Image Editing device round', active: 'image-editing src/edit.ts'},
  {id: 'plugin-api.inserted-picture-copy', level: 5, impact: 'user', owner: 'image-editing', probe: null, unprobed: 'needs a picture insert on a note page', active: 'image-editing src/edit.ts'},
  {id: 'plugin-api.floating-insert', level: 5, impact: 'user', owner: 'device-transfer', probe: null, unprobed: 'needs a picture insert on a note page', active: 'device-transfer src/receive/receive.ts'},
  {id: 'pluginhost.no-back-press', level: 5, impact: 'user', owner: 'ui-kit', probe: null, unprobed: 'needs a key press on the tablet', active: 'ui-kit src/backKey.ts'},
  {id: 'pluginhost.overlay-back-key', level: 5, impact: 'user', owner: 'image-editing', probe: null, unprobed: 'needs a key press on the tablet', active: 'image-editing native BackKey.java'},
  {id: 'pluginhost.file-sandbox', level: 5, impact: 'user', owner: 'picture-search', probe: null, unprobed: '#293 adds a write and delete of a test file in each allowed folder', active: 'picture-search native SafePaths.java'},
  {id: 'storage.cloud-conflict-folder', level: 5, impact: 'user', owner: 'picture-search', probe: null, unprobed: 'a conflict appears only after two devices sync', active: 'picture-search src/storage/settings.ts'},
  {id: 'storage.sign-in-drop-folder', level: 2, impact: 'user', owner: 'account-sync', probe: null, unprobed: '#293 adds a read of the folder', active: 'account-sync src/secretStore.ts'},
  {id: 'storage.helper-channel', level: 2, impact: 'tests', owner: 'plugin-diagnostics', probe: 'inkctl helper', unprobed: null, active: 'plugin-diagnostics src/helper.ts'},
  {id: 'todo.provider', level: 2, impact: 'user', owner: 'sn-adapter', probe: 'sn-adapter probeCapability(todo)', unprobed: null, active: 'sn-adapter internals/todo.ts'},
  {id: 'todo.row-rules', level: 5, impact: 'user', owner: 'sn-adapter', probe: null, unprobed: 'a row\'s visibility shows only in the app; #293 adds a read round-trip on a known row', active: 'sn-adapter internals/rules.ts'},
  {id: 'todo.twin-repair', level: 5, impact: 'user', owner: 'account-sync', probe: null, unprobed: 'a twin appears only after a cloud sync; the accepted risk is a real task soft-deleted, so the repair logs each removal', active: 'account-sync deviceStores.ts'},
  {id: 'ui.measured-tokens', level: 5, impact: 'user', owner: 'ui-kit', probe: null, unprobed: 'a look is checked by a side-by-side screenshot in a device round (#299)', active: 'ui-kit src/tokens.json'},
];

/** Each item's values, by the item's id in camel case. */
export const REGISTRY = {
  calendarProvider: {
    authority: 'com.ratta.supernote.calendar.provider',
    eventsUri: 'content://com.ratta.supernote.calendar.provider/data_info',
    configUri: 'content://com.ratta.supernote.calendar.provider/config_info',
  },
  diagnosticsProviderProbes: {
    digestRootPath: '',
    digestPath: 'digest',
    digestMarkerColumn: 'digest_content',
  },
  digestProvider: {
    authority: 'com.ratta.supernote.knowledge.provider',
    knowledgeUri: 'content://com.ratta.supernote.knowledge.provider/knowledge',
  },
  penPenTypes: {
    lasso: 4,
    ink: [1, 10, 11, 15, 16],
  },
  pluginApiElementReads: {
    maxConcurrent: 4,
  },
  pluginhostFileSandbox: {
    sharedRoot: '/storage/emulated/0',
    sharedFolder: 'MyStyle',
    exportFolder: 'EXPORT',
    hiddenFolder: '.data/plugin',
    privateHomes: ['/data/data/com.ratta.supernote.pluginhost/files/plugins', '/data/user/0/com.ratta.supernote.pluginhost/files/plugins'],
  },
  storageCloudConflictFolder: {
    marker: '_CONFLICT_',
    digits: 17,
  },
  storageSignInDropFolder: {
    folder: '/storage/emulated/0/.data/plugin/inktools-account-sync',
  },
  storageHelperChannel: {
    folder: '/storage/emulated/0/MyStyle/Probe',
    commandFile: 'command.json',
    answerMark: 'SNPROBE answer',
  },
  todoProvider: {
    authority: 'com.ratta.supernote.task.provider',
    tasksUri: 'content://com.ratta.supernote.task.provider/tasks_table',
    groupsUri: 'content://com.ratta.supernote.task.provider/task_group_table',
  },
} as const;
