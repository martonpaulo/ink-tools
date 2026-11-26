/**
 * Applies Smart Pen's settings to the running plugin (#305): each module's own settings in memory,
 * where its code reads them, and each module switch through the host index.js sets. The Settings
 * view and the start-up read both apply through here, so a switch acts the same from either.
 */
import {applyModules, type ModuleHost} from './modules';
import {setSettings as setTextSettings} from './modules/text/settings';
import {setSettings as setShapesSettings} from './modules/shapes/settings';
import type {PenSettings} from './settings';

let host: ModuleHost | null = null;
let applied: PenSettings | null = null;

/** index.js sets the host once, before the first settings are applied. */
export function setModuleHost(next: ModuleHost): void {
  host = next;
}

export async function applySettings(next: PenSettings): Promise<void> {
  setTextSettings(next.text);
  setShapesSettings(next.shapes);
  const previous = applied;
  applied = next;
  if (host) {
    await applyModules(host, previous ? previous.modules : null, next.modules);
  }
}

export function resetRuntimeForTests(): void {
  host = null;
  applied = null;
}
