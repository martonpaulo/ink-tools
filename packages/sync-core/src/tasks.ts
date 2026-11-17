/** Provider-agnostic two-way task sync. Pure apart from the injected provider and device store. */

/** What the sync compares and copies. Anything else (priority, labels) is left to each side. */
export interface TaskContent {
  title: string;
  detail: string;
  /** Due time in epoch milliseconds, or null. */
  due: number | null;
  completed: boolean;
}

/**
 * The service's list a task belongs to (a Todoist project), so the tablet files it in a To-Do list of
 * the same name (#212). `inbox` marks the service's own unfiled list.
 */
export interface TaskList {
  name: string;
  inbox: boolean;
}

export interface RemoteTask extends TaskContent {
  remoteId: string;
  /** Absent when the service does not say; the tablet then files it as an Inbox task. */
  list?: TaskList;
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
  /** `list` is the service list the task comes from; the store files it there (#212). */
  create(content: TaskContent, list?: TaskList): Promise<DeviceTask>;
  update(localId: string, content: TaskContent): Promise<DeviceTask>;
  /** Soft delete. */
  remove(localId: string): Promise<void>;
}

/** One synced pair. `fingerprint` is the content both sides held after the last sync. */
export interface TaskLink {
  remoteId: string;
  localId: string;
  fingerprint: string;
  /** `service` when Bridge created the tablet task from the service; only those are removed at cleanup (#89). */
  origin?: 'service';
}

export function content(t: TaskContent): TaskContent {
  return {title: t.title, detail: t.detail, due: t.due, completed: t.completed};
}

export function fingerprint(t: TaskContent): string {
  return JSON.stringify([t.title, t.detail, t.due, t.completed]);
}

/**
 * Which tablet-only items a pass may send to the account (owner assumption, see docs/decisions.md):
 * none on the module's first pass, only those changed after the first link (`firstLinked`), or all
 * when the module's «Send tablet-only items» switch is on. shortcut: the tablet keeps no creation
 * time, so «created after the first link» is read as «changed after it»; switch to a creation time
 * if the provider ever exposes one.
 */
export interface TabletOnlyPolicy {
  /** Epoch ms of the module's first pass; absent before it, so the first pass only pulls. */
  firstLinked?: number;
  sendTabletOnly: boolean;
}

export const PULL_ONLY: TabletOnlyPolicy = {sendTabletOnly: false};

export function maySend(modified: number | undefined, policy: TabletOnlyPolicy): boolean {
  if (policy.sendTabletOnly) return true;
  return policy.firstLinked !== undefined && modified !== undefined && modified > policy.firstLinked;
}

/** Open, unlinked tablet tasks the policy keeps on the tablet: what Settings shows before a sync. */
export function tabletOnlyKept(devices: DeviceTask[], links: TaskLink[], policy: TabletOnlyPolicy): number {
  const linked = new Set(links.map(l => l.localId));
  return devices.filter(d => !linked.has(d.localId) && !d.deleted && !d.completed && !maySend(d.modified, policy)).length;
}

export interface SyncResult {
  links: TaskLink[];
  /** Tablet-only tasks the policy kept on the tablet this pass. */
  keptLocal: number;
  counts: {createdLocal: number; createdRemote: number; updatedLocal: number; updatedRemote: number; removedLocal: number; removedRemote: number};
  /** Per-task failures; one bad task never stops the others. */
  errors: string[];
  /** A task changed on both sides: which version was kept and the losing one's title (#87). */
  warnings: string[];
}

/**
 * Run one sync pass. Rules:
 * - a service task missing on the tablet is created there; a tablet task missing on the service is
 *   created there only when `policy` allows it (`maySend`), so a first pass never floods the account;
 * - a linked task changed on one side is copied to the other;
 * - changed on both sides, the later `modified` wins, a tie goes to the service;
 * - deleted (soft-delete flag on the tablet, gone on the service) removes it from the other; a tablet
 *   row that is merely absent from the list is an error and removes nothing.
 */
export async function syncTasks(
  provider: TaskProvider,
  store: DeviceTaskStore,
  previous: TaskLink[],
  policy: TabletOnlyPolicy = PULL_ONLY,
): Promise<SyncResult> {
  const result: SyncResult = {
    links: [],
    keptLocal: 0,
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
      const d = await store.create(content(r), r.list);
      result.counts.createdLocal++;
      result.links.push({remoteId: r.remoteId, localId: d.localId, fingerprint: fingerprint(r), origin: 'service'});
    } catch (e) {
      result.errors.push(`create on device ${r.remoteId}: ${(e as Error).message}`);
    }
  }
  for (const d of devices.values()) {
    if (linkedLocal.has(d.localId) || d.deleted || d.completed) continue;
    if (!maySend(d.modified, policy)) {
      result.keptLocal++;
      continue;
    }
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
