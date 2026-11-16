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
    async create(c) {
      const lists = (await rows.query(groups, {[DELETED]: 0}))
        .map(g => g[LIST_ID])
        .filter(
          (id): id is string | number =>
            id !== null && id !== undefined && id !== '',
        )
        .map(String);
      if (!lists.length) {
        throw new Error('the tablet has no To-Do list to add a task to');
      }
      const at = now();
      // shortcut: a new task goes into the first list the provider returns; a list setting comes
      // when the owner asks for one.
      const row = toTodoInsert(
        d,
        {...todoTaskToRow(d, c, at), [col('listId')]: lists[0]},
        {existingListIds: lists},
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
