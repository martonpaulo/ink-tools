/** Provider-agnostic two-way task sync. Pure apart from the injected provider and device store. */

/** What the sync compares and copies. Anything else (priority, labels) is left to each side. */
export interface TaskContent {
  title: string;
  detail: string;
  /** Due time in epoch milliseconds, or null. */
  due: number | null;
  completed: boolean;
}

export interface RemoteTask extends TaskContent {
  remoteId: string;
  /** Epoch ms of the last change on the service; 0 when the service does not say. */
  modified: number;
}

export interface DeviceTask extends TaskContent {
  localId: string;
  /** Epoch ms of the last change on the tablet. */
  modified: number;
  /** The tablet's soft-delete flag. A deleted task is propagated, never re-created. */
  deleted: boolean;
}

/** The seam to a task service. Todoist is one implementation; another service replaces it. */
export interface TaskProvider {
  /** Every open task. Completed tasks are fetched one by one with `get`. */
  list(): Promise<RemoteTask[]>;
  /** One task by id, completed or not; null when it no longer exists. */
  get(remoteId: string): Promise<RemoteTask | null>;
  create(content: TaskContent): Promise<RemoteTask>;
  update(remoteId: string, content: TaskContent): Promise<RemoteTask>;
  remove(remoteId: string): Promise<void>;
}

/** The seam to the tablet's To-Do (sn-adapter implements it over the content provider). */
export interface DeviceTaskStore {
  list(): Promise<DeviceTask[]>;
  create(content: TaskContent): Promise<DeviceTask>;
  update(localId: string, content: TaskContent): Promise<DeviceTask>;
  /** Soft delete. */
  remove(localId: string): Promise<void>;
}

/** One synced pair. `fingerprint` is the content both sides held after the last sync. */
export interface TaskLink {
  remoteId: string;
  localId: string;
  fingerprint: string;
}

export function content(t: TaskContent): TaskContent {
  return {title: t.title, detail: t.detail, due: t.due, completed: t.completed};
}

export function fingerprint(t: TaskContent): string {
  return JSON.stringify([t.title, t.detail, t.due, t.completed]);
}

export interface SyncResult {
  links: TaskLink[];
  counts: {createdLocal: number; createdRemote: number; updatedLocal: number; updatedRemote: number; removedLocal: number; removedRemote: number};
  /** Per-task failures; one bad task never stops the others. */
  errors: string[];
  /** A task changed on both sides: which version was kept and the losing one's title (#87). */
  warnings: string[];
}

/**
 * Run one sync pass. Rules:
 * - a task on one side only is created on the other;
 * - a linked task changed on one side is copied to the other;
 * - changed on both sides, the later `modified` wins, a tie goes to the service;
 * - deleted (soft-delete flag on the tablet, gone on the service) removes it from the other; a tablet
 *   row that is merely absent from the list is an error and removes nothing.
 */
export async function syncTasks(
  provider: TaskProvider,
  store: DeviceTaskStore,
  previous: TaskLink[],
): Promise<SyncResult> {
  const result: SyncResult = {
    links: [],
    counts: {createdLocal: 0, createdRemote: 0, updatedLocal: 0, updatedRemote: 0, removedLocal: 0, removedRemote: 0},
    errors: [],
    warnings: [],
  };
  const remotes = new Map((await provider.list()).map(t => [t.remoteId, t]));
  const devices = new Map((await store.list()).map(t => [t.localId, t]));
  const linkedRemote = new Set(previous.map(l => l.remoteId));
  const linkedLocal = new Set(previous.map(l => l.localId));

  for (const link of previous) {
    try {
      const next = await syncLinked(provider, store, link, remotes, devices, result);
      if (next) result.links.push(next);
    } catch (e) {
      result.links.push(link); // keep the pair so the next pass retries it
      result.errors.push(`${link.remoteId}/${link.localId}: ${(e as Error).message}`);
    }
  }

  for (const r of remotes.values()) {
    if (linkedRemote.has(r.remoteId) || r.completed) continue; // a finished task is not worth importing
    try {
      const d = await store.create(content(r));
      result.counts.createdLocal++;
      result.links.push({remoteId: r.remoteId, localId: d.localId, fingerprint: fingerprint(r)});
    } catch (e) {
      result.errors.push(`create on device ${r.remoteId}: ${(e as Error).message}`);
    }
  }
  for (const d of devices.values()) {
    if (linkedLocal.has(d.localId) || d.deleted || d.completed) continue;
    try {
      const r = await provider.create(content(d));
      result.counts.createdRemote++;
      result.links.push({remoteId: r.remoteId, localId: d.localId, fingerprint: fingerprint(d)});
    } catch (e) {
      result.errors.push(`create on service ${d.localId}: ${(e as Error).message}`);
    }
  }
  return result;
}

async function syncLinked(
  provider: TaskProvider,
  store: DeviceTaskStore,
  link: TaskLink,
  remotes: Map<string, RemoteTask>,
  devices: Map<string, DeviceTask>,
  result: SyncResult,
): Promise<TaskLink | null> {
  const device = devices.get(link.localId);
  // A finished task, unchanged on the tablet since the last pass, needs no request: the link is
  // dropped, so history never costs one `get` per pass (#92). A task reopened on the service
  // later is listed as an open task and imported as a new one.
  if (device && !device.deleted && device.completed && fingerprint(device) === link.fingerprint && !remotes.has(link.remoteId)) {
    return null;
  }
  // An open task absent from the list is either completed or deleted; `get` tells which.
  const remote = remotes.get(link.remoteId) ?? (await provider.get(link.remoteId));

  // A row missing from the list is not a delete: only the soft-delete flag is. An empty or failed
  // read must never remove real service tasks, so fail closed and keep the link (#69).
  if (!device) throw new Error('device row missing from the list; nothing removed, link kept');
  if (device.deleted) {
    if (remote) {
      await provider.remove(link.remoteId);
      result.counts.removedRemote++;
    }
    return null;
  }
  if (!remote) {
    await store.remove(link.localId);
    result.counts.removedLocal++;
    return null;
  }

  const remoteChanged = fingerprint(remote) !== link.fingerprint;
  const deviceChanged = fingerprint(device) !== link.fingerprint;
  const direction = !remoteChanged && !deviceChanged
    ? 'none'
    : remoteChanged && deviceChanged
      ? (device.modified > remote.modified ? 'toRemote' : 'toLocal')
      : remoteChanged ? 'toLocal' : 'toRemote';

  if (remoteChanged && deviceChanged) {
    const [kept, lost] = direction === 'toRemote' ? ["the tablet's", remote] : ["the service's", device];
    const other = direction === 'toRemote' ? "the service's" : "the tablet's";
    result.warnings.push(`Changed on both sides: kept ${kept} version; ${other} was "${lost.title}"`);
  }
  if (direction === 'toLocal') {
    await store.update(link.localId, content(remote));
    result.counts.updatedLocal++;
    return {...link, fingerprint: fingerprint(remote)};
  }
  if (direction === 'toRemote') {
    await provider.update(link.remoteId, content(device));
    result.counts.updatedRemote++;
    return {...link, fingerprint: fingerprint(device)};
  }
  return link;
}
