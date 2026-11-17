/**
 * The tablet's Calendar and To-Do as sync-core's stores (#28, #29, #44), over `ContentRows`: the
 * four content-provider calls a native module answers. The row shapes and the write rules are
 * sn-adapter's descriptor and mappers; this file only joins them to the sync seams, so it is tested
 * with an in-memory table and no device. The native writer behind `ContentRows` builds on the
 * ContentResolver module of #43.
 *
 * Filters are plain column equality; the window and the row match are done here, so the native side
 * stays one query per table.
 */
import {
  BUNDLED_DESCRIPTOR,
  column,
  contentUri,
  Descriptor,
  eventToRow,
  Row,
  rowToDeviceEdit,
  rowToEvent,
  rowToTodoTask,
  todoTaskToRow,
  toTodoInsert,
} from '@supernote-tools/sn-adapter';
import type {
  CalendarEvent,
  DeviceCalendarEditor,
  DeviceTask,
  DeviceTaskStore,
  TaskContent,
  TaskList,
  TimeWindow,
} from '@supernote-tools/sync-core';

/** One content provider, by its `content://` URI. Every call rejects with the provider's reason. */
export interface ContentRows {
  /** Every row whose columns equal `where`; all rows when it is empty. */
  query(uri: string, where: Row): Promise<Row[]>;
  /** The new row's `id`; the provider's -1 is a rejection, never an id. */
  insert(uri: string, row: Row): Promise<string>;
  /** The number of rows changed. */
  update(uri: string, where: Row, row: Row): Promise<number>;
  /** The number of rows deleted. */
  remove(uri: string, where: Row): Promise<number>;
}

const overlaps = (e: {start: number; end: number}, w: TimeWindow) =>
  e.start < w.to && e.end > w.from;

/** Exactly one row changed, or the write failed: a 0 is never a silent success. */
function one(count: number, what: string): void {
  if (count !== 1) {
    throw new Error(`${what} changed ${count} rows, not 1`);
  }
}

/**
 * The provider's own row key. The descriptor lists it among the columns of `data_info` and
 * `task_group_table` but maps no field to it, so it is named here once; a field mapping for it
 * belongs in descriptor.json with the next descriptor change.
 */
const ROW_ID = 'id';
const LIST_ID = 'taskListId';
const DELETED = 'deleted';
/** `task_group_table` columns a new list fills; the descriptor maps no field for them yet. */
const LIST_TITLE = 'title';
const LIST_USER = 'userId';
const LIST_MODIFIED = 'lastModified';
const LIST_CREATED = 'createTime';
const LIST_HAS_SYNC = 'hasSync';
/**
 * The tablet list a service task with no list, or from the service's Inbox, goes into (#212). The
 * provider refuses a task with no list (#63), so the Inbox is a list of its own.
 */
export const INBOX_LIST = 'Inbox';

/** The tablet list name for a service list; the Inbox, or no list, is `INBOX_LIST`. */
export function tabletListName(list: TaskList | undefined): string {
  return !list || list.inbox || !list.name.trim() ? INBOX_LIST : list.name.trim();
}

/**
 * A new list id. shortcut: the native app's own id format is not known, so this is a unique hex
 * string of the same kind as a row key; switch to the app's format once a device round reads one.
 */
function newListId(now: number): string {
  const random = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `inktools${now.toString(16)}${random}`;
}

export function createDeviceCalendar(
  rows: ContentRows,
  now: () => number,
  d: Descriptor = BUNDLED_DESCRIPTOR,
): DeviceCalendarEditor {
  const uri = contentUri(d.calendar, 'events');
  const col = (field: string) => column(d.calendar, 'events', field);
  const ours = () => rows.query(uri, {[col('tag')]: d.calendar.rules.writeTag});
  const keyOf = (calendarId: string, eventId: string): Row => ({
    [col('tag')]: d.calendar.rules.writeTag,
    [col('calendarId')]: calendarId,
    [col('eventId')]: eventId,
  });
  return {
    async listOurs(window) {
      const events: CalendarEvent[] = [];
      for (const row of await ours()) {
        const id = row[col('eventId')];
        // A row made on the tablet has no eventId yet: it is an edit, not a pulled event.
        if (id === null || id === undefined || id === '') {
          continue;
        }
        const event = rowToEvent(d, row);
        if (overlaps(event, window)) {
          events.push(event);
        }
      }
      return events;
    },
    async listEdits(window) {
      return (await ours())
        .map(row => rowToDeviceEdit(d, row))
        .filter(edit => overlaps(edit.event, window));
    },
    async create(event) {
      await rows.insert(uri, eventToRow(d, event, now()));
    },
    async update(event) {
      one(
        await rows.update(
          uri,
          keyOf(event.calendarId, event.eventId),
          eventToRow(d, event, now()),
        ),
        `update ${event.eventId}`,
      );
    },
    async remove(calendarId, eventId) {
      one(
        await rows.remove(uri, keyOf(calendarId, eventId)),
        `remove ${eventId}`,
      );
    },
    async relink(from, to) {
      // The tablet-made row is found by its content, as it has no id of ours yet (#65).
      const row = (await ours()).find(r => {
        const id = r[col('eventId')];
        if (id !== null && id !== undefined && id !== '') {
          return false;
        }
        const e = rowToDeviceEdit(d, r).event;
        return (
          e.title === from.title && e.start === from.start && e.end === from.end
        );
      });
      if (!row) {
        throw new Error(`no tablet row of ${from.title} is waiting for its id`);
      }
      one(
        await rows.update(
          uri,
          {[ROW_ID]: row[ROW_ID]},
          {
            [col('calendarId')]: to.calendarId,
            [col('eventId')]: to.eventId,
          },
        ),
        `relink ${from.title}`,
      );
    },
  };
}

export function createDeviceTasks(
  rows: ContentRows,
  now: () => number,
  d: Descriptor = BUNDLED_DESCRIPTOR,
): DeviceTaskStore {
  const tasks = contentUri(d.todo, 'tasks');
  const groups = contentUri(d.todo, 'groups');
  const col = (field: string) => column(d.todo, 'tasks', field);
  const rowId = col('rowId');
  /** The row whose task id is `localId`, as `rowToTodoTask` reads it. */
  const find = async (localId: string) => {
    const row = (await rows.query(tasks, {})).find(
      r => rowToTodoTask(d, r).localId === localId,
    );
    if (!row) {
      throw new Error(`the tablet has no task ${localId}`);
    }
    return row;
  };
  /**
   * The id of the open tablet list named `name`, created when missing (#212). A list is matched by
   * its name, so a later pass reuses the one an earlier pass made. shortcut: two service lists with
   * one name share a tablet list; key lists by the service id if the owner ever has such a pair.
   */
  const listFor = async (name: string, at: number): Promise<string> => {
    const all = await rows.query(groups, {});
    const open = all.find(
      g => Number(g[DELETED]) !== 1 && String(g[LIST_TITLE] ?? '').trim() === name,
    );
    const known = open?.[LIST_ID];
    if (known !== null && known !== undefined && known !== '') {
      return String(known);
    }
    const id = newListId(at);
    // A list keeps the account owner of the tablet's earlier lists, when one is left to read.
    const user = all.map(g => g[LIST_USER]).find(u => u !== null && u !== undefined && u !== '');
    await rows.insert(groups, {
      [LIST_ID]: id,
      [LIST_TITLE]: name,
      ...(user === undefined ? {} : {[LIST_USER]: user}),
      [LIST_MODIFIED]: at,
      [LIST_CREATED]: at,
      [DELETED]: 0,
      [LIST_HAS_SYNC]: d.todo.rules.writeHasSync,
    });
    return id;
  };
  const saved = (localId: string, c: TaskContent, at: number): DeviceTask => ({
    localId,
    title: c.title,
    detail: c.detail,
    due: c.due,
    completed: c.completed,
    modified: at,
    deleted: false,
  });
  return {
    async list() {
      return (await rows.query(tasks, {})).map(row => rowToTodoTask(d, row));
    },
    async create(c, list) {
      const at = now();
      const listId = await listFor(tabletListName(list), at);
      const row = toTodoInsert(
        d,
        {...todoTaskToRow(d, c, at), [col('listId')]: listId},
        {existingListIds: [listId]},
      );
      // shortcut: with no taskId written, the task is known by its row id, which `rowToTodoTask`
      // reads when taskId is empty; if the native sync later writes a taskId, the link is lost and
      // the next pass sees two tasks. The device round of #44 checks it.
      return saved(await rows.insert(tasks, row), c, at);
    },
    async update(localId, c) {
      const row = await find(localId);
      const at = now();
      one(
        await rows.update(
          tasks,
          {[rowId]: row[rowId]},
          {
            ...todoTaskToRow(d, c, at),
            [col('hasSync')]: d.todo.rules.writeHasSync,
          },
        ),
        `update task ${localId}`,
      );
      return saved(localId, c, at);
    },
    async remove(localId) {
      const row = await find(localId);
      // Soft delete with hasSync=0, as the native app does, so its sync uploads the delete.
      one(
        await rows.update(
          tasks,
          {[rowId]: row[rowId]},
          {
            [col('deleted')]: 1,
            [col('modified')]: now(),
            [col('hasSync')]: d.todo.rules.writeHasSync,
          },
        ),
        `remove task ${localId}`,
      );
    },
  };
}

/** The two stores the sync runner takes (`SyncDevice.stores`). */
export interface DeviceStores {
  calendar: DeviceCalendarEditor;
  tasks: DeviceTaskStore;
}

export function createDeviceStores(
  rows: ContentRows,
  now: () => number,
  d: Descriptor = BUNDLED_DESCRIPTOR,
): DeviceStores {
  return {
    calendar: createDeviceCalendar(rows, now, d),
    tasks: createDeviceTasks(rows, now, d),
  };
}
