/**
 * What happens to the rows Bridge wrote when a module is turned off (#89, owner decision D15 A).
 * Turning a module or a provider off keeps every row. The owner removes them only with the module's
 * «Remove what Bridge wrote» button in Settings, after a confirmation. The removal touches only rows
 * Bridge wrote: calendar rows tagged `task` (the store's `listOurs`) and To-Do tasks Bridge created
 * from the service. A task the owner wrote on the tablet stays, even when it was synced to the service.
 */
import {eventKey} from './calendar';
import type {DeviceCalendarStore, TimeWindow} from './calendar';
import type {DeviceTask, DeviceTaskStore, TaskLink} from './tasks';

/** Every time the device store can hold, so no row of ours is left outside the window. */
export const ALL_TIME: TimeWindow = {from: 0, to: Number.MAX_SAFE_INTEGER};

export interface CleanupResult {
  removed: number;
  /** One line per row that failed to go; the others are still removed. */
  errors: string[];
}

/**
 * Remove every calendar row Bridge wrote. Rows Bridge did not write are never listed, so never touched.
 * An event listed twice, as duplicated rows are (#218), is removed once: the store's remove takes every
 * row of the event.
 */
export async function removeCalendarRows(store: DeviceCalendarStore): Promise<CleanupResult> {
  const result: CleanupResult = {removed: 0, errors: []};
  // A row an older build wrote is listed only once it has its current shape (#28).
  if (store.repair) await store.repair();
  const events = new Map((await store.listOurs(ALL_TIME)).map(e => [eventKey(e), e]));
  for (const e of events.values()) {
    try {
      await store.remove(e.calendarId, e.eventId);
      result.removed++;
    } catch (err) {
      result.errors.push(`remove ${e.title}: ${(err as Error).message}`);
    }
  }
  return result;
}

export interface TaskCleanupResult extends CleanupResult {
  /** The links to store afterwards: the removed tasks' links are dropped, every other link stays. */
  links: TaskLink[];
}

/**
 * Soft-delete each To-Do task Bridge created from the service and drop its link. The proof is the
 * link's `origin: 'service'`, or the store's own mark on the row (`fromService`, #423), which a
 * restart keeps while the links in memory are lost. A task with neither, such as one the owner wrote
 * on the tablet or a link written before #89, stays with its link: without proof, nothing is
 * removed. The service is not touched: the module is off.
 */
export async function removeImportedTasks(store: DeviceTaskStore, links: TaskLink[]): Promise<TaskCleanupResult> {
  const result: TaskCleanupResult = {removed: 0, errors: [], links: []};
  const tasks = await store.list();
  const byId = new Map(links.map(link => [link.localId, link]));
  const ours = (task: DeviceTask) => byId.get(task.localId)?.origin === 'service' || store.fromService?.(task) === true;
  const kept = new Set<string>();
  for (const task of tasks) {
    if (!ours(task)) {
      kept.add(task.localId);
      continue;
    }
    if (task.deleted) continue; // already gone on the tablet; only the link is left to drop
    try {
      await store.remove(task.localId);
      result.removed++;
    } catch (err) {
      kept.add(task.localId);
      result.errors.push(`remove ${task.title}: ${(err as Error).message}`);
    }
  }
  // A link whose task the tablet no longer lists is kept, as before: nothing proves it is ours to drop.
  const live = new Set(tasks.map(task => task.localId));
  result.links = links.filter(link => kept.has(link.localId) || !live.has(link.localId));
  return result;
}
