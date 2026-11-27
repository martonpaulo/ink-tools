/**
 * What arrived with no note open (#289): a background receive cannot place a text or a picture,
 * so the item waits in the private folder until a note is open, and the next «Receive» tap or the
 * next pen-up places it. The list is one small JSON file in `tempDir`, `pending.json`; a picture
 * stays at the path the receiver saved it to. An unreadable list is empty, never a crash.
 */
import {Relay} from '../native';
import {tempDir} from '../send/sendPng';

export type PendingItem = {kind: 'text'; text: string} | {kind: 'image'; path: string};

export function pendingPath(pluginDir: string): string {
  return `${tempDir(pluginDir)}/pending.json`;
}

function readItem(value: unknown): PendingItem | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const item = value as Record<string, unknown>;
  if (item.kind === 'text' && typeof item.text === 'string') {
    return {kind: 'text', text: item.text};
  }
  if (item.kind === 'image' && typeof item.path === 'string' && item.path.startsWith('/')) {
    return {kind: 'image', path: item.path};
  }
  return null;
}

/**
 * False once a read found nothing waiting, until an item is kept: a pen-up comes with each
 * stroke, and only one after a kept item reads the list (#289).
 */
let mayWait = true;

export function mayHavePending(): boolean {
  return mayWait;
}

export function resetPendingForTests(): void {
  mayWait = true;
}

function parseItems(text: string | null): PendingItem[] {
  if (text === null) {
    return [];
  }
  try {
    const value = JSON.parse(text);
    return Array.isArray(value)
      ? value.map(readItem).filter((item): item is PendingItem => item !== null)
      : [];
  } catch {
    return [];
  }
}

export async function loadPending(native: Relay, pluginDir: string): Promise<PendingItem[]> {
  const read = await native.readText(pendingPath(pluginDir));
  const items = read.ok ? parseItems(read.value) : [];
  mayWait = items.length > 0;
  return items;
}

export async function savePending(
  native: Relay,
  pluginDir: string,
  items: readonly PendingItem[],
): Promise<boolean> {
  const written = await native.writeText(pendingPath(pluginDir), JSON.stringify(items));
  mayWait = items.length > 0;
  return written.ok;
}

export async function addPending(native: Relay, pluginDir: string, item: PendingItem): Promise<boolean> {
  return savePending(native, pluginDir, [...(await loadPending(native, pluginDir)), item]);
}
