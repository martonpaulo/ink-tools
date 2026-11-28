/**
 * Smart Pen's modules (#305), one row each: its id, its title in Settings, and how it starts and
 * stops against the plugin's host. A module that is off is never registered: it has no button and
 * listens to no pen event.
 */
import {copy} from './copy';

export const MODULE_IDS = ['text', 'shapes', 'gestures'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

/** What a module starts and stops through: the plugin's host (index.js), a fake in the tests. */
export type ModuleHost = {
  startText(): Promise<void>;
  stopText(): Promise<void>;
  startShapes(): void;
  stopShapes(): void;
  startGestures(): Promise<void>;
  stopGestures(): void;
};

export type ModuleRow = {
  id: ModuleId;
  title: string;
  note: string;
  register(host: ModuleHost): Promise<void>;
  unregister(host: ModuleHost): Promise<void>;
};

export const MODULES: readonly ModuleRow[] = [
  {
    id: 'text',
    title: copy['module.text'],
    note: copy['module.textNote'],
    register: host => host.startText(),
    unregister: host => host.stopText(),
  },
  {
    id: 'shapes',
    title: copy['module.shapes'],
    note: copy['module.shapesNote'],
    register: async host => host.startShapes(),
    unregister: async host => host.stopShapes(),
  },
  {
    id: 'gestures',
    title: copy['module.gestures'],
    note: copy['module.gesturesNote'],
    register: host => host.startGestures(),
    unregister: async host => host.stopGestures(),
  },
];

/**
 * Starts each module `next` turns on and stops each one it turns off, against `previous` (null at
 * start-up, when every module is off); a module whose switch did not change is left alone.
 */
export async function applyModules(
  host: ModuleHost,
  previous: Record<ModuleId, boolean> | null,
  next: Record<ModuleId, boolean>,
): Promise<void> {
  for (const row of MODULES) {
    const was = previous?.[row.id] ?? false;
    if (next[row.id] && !was) {
      await row.register(host);
    } else if (!next[row.id] && was) {
      await row.unregister(host);
    }
  }
}
