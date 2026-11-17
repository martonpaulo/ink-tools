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
  todoShapeGaps,
  todoTaskToRow,
  toTodoInsert,
} from '@ink-tools/sn-adapter';
import {content, fingerprint} from '@ink-tools/sync-core';
import type {
  CalendarEvent,
  DeviceCalendarEditor,
  DeviceTask,
  DeviceTaskStore,
  RemoteTask,
  TaskContent,
  TaskList,
  TaskRepair,
  TimeWindow,
} from '@ink-tools/sync-core';

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
 * The row key the native dry insert deletes its test row by (#43), which takes no descriptor. Every
 * store write takes the key from the descriptor's `rowId` field instead; `deviceStores.test.ts`
 * fails when this copy differs from one of them (#217).
 */
export const ROW_ID = 'id';
const LIST_ID = 'taskListId';
const DELETED = 'deleted';
/** `task_group_table` columns a new list fills; the descriptor maps no field for them yet. */
const LIST_TITLE = 'title';
const LIST_USER = 'userId';
const LIST_MODIFIED = 'lastModified';
const LIST_CREATED = 'createTime';
const LIST_HAS_SYNC = 'hasSync';
/**
 * The list name Account Sync beta 15 to 17 gave the service's Inbox (#212). The app keeps unfiled
 * tasks (`taskListId` NULL) as its own Inbox, so `repair` moves those tasks out and removes the list.
 */
export const INBOX_LIST = 'Inbox';

/** The tablet list name for a service list; null, an unfiled task, for the Inbox or no list (#212). */
export function tabletListName(list: TaskList | undefined): string | null {
  return !list || list.inbox || !list.name.trim() ? null : list.name.trim();
}

/** Every list and task id Account Sync makes starts with this, so its own rows are known. */
const ID_PREFIX = 'inktools';
/** A task id made from a service task's id: the row names its service task after a restart. */
const SERVICE_TASK_PREFIX = `${ID_PREFIX}rt`;

export const serviceTaskId = (remoteId: string): string =>
  `${SERVICE_TASK_PREFIX}${remoteId}`;

const empty = (v: Row[string] | undefined): boolean =>
  v === null || v === undefined || v === '';

/**
 * A new list or task id. shortcut: the native app's own id format is not known, so this is a unique
 * text of the kind the native sync already accepted for lists (device round of #212); switch to the
 * app's format once a device round reads one.
 */
function newId(now: number): string {
  const random = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `${ID_PREFIX}${now.toString(16)}${random}`;
}

/** The Calendar store, with the warnings of its writes since the last call (`CalendarModule.takeWarnings`). */
export interface DeviceCalendar extends DeviceCalendarEditor {
  takeWarnings(): string[];
}

/** Newest first: a higher row id is a later insert. A non-numeric id sorts after every number. */
const newestFirst = (rowId: string) => (a: Row, b: Row) => {
  const n = (r: Row) => {
    const v = Number(r[rowId]);
    return Number.isFinite(v) ? v : -Infinity;
  };
  return n(b) - n(a);
};

export function createDeviceCalendar(
  rows: ContentRows,
  now: () => number,
  d: Descriptor = BUNDLED_DESCRIPTOR,
): DeviceCalendar {
  const uri = contentUri(d.calendar, 'events');
  const col = (field: string) => column(d.calendar, 'events', field);
  const rowId = col('rowId');
  const ours = () => rows.query(uri, {[col('tag')]: d.calendar.rules.writeTag});
  let warnings: string[] = [];
  /**
   * Our rows of a pulled event, newest first (#213). The rows are matched here, not by the
   * provider's selection: on the tablet a Calendar delete selected by `title` removed 0 rows (#43),
   * so a write selects only the row id, as `relink` and the To-Do store do. No row is an error,
   * never a write.
   */
  const rowsOf = async (calendarId: string, eventId: string): Promise<Row[]> => {
    const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
    const hits = (await ours()).filter(
      r =>
        text(r[col('tag')]) === d.calendar.rules.writeTag &&
        text(r[col('calendarId')]) === calendarId &&
        text(r[col('eventId')]) === eventId,
    );
    if (!hits.length) {
      throw new Error(`event ${eventId} has 0 tablet rows`);
    }
    return hits.sort(newestFirst(rowId));
  };
  /**
   * Removes each row by its id. Earlier failures of #43 could leave two rows of one event (#218):
   * both are Account Sync's copies of one source event, so the extra ones go, with a warning.
   */
  const removeRows = async (list: Row[], what: string) => {
    for (const r of list) {
      one(await rows.remove(uri, {[rowId]: r[rowId]}), what);
    }
  };
  return {
    takeWarnings() {
      const out = warnings;
      warnings = [];
      return out;
    },
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
      const [newest, ...older] = await rowsOf(event.calendarId, event.eventId);
      one(
        await rows.update(
          uri,
          {[rowId]: newest[rowId]},
          eventToRow(d, event, now()),
        ),
        `update ${event.eventId}`,
      );
      if (older.length) {
        await removeRows(older, `remove a copy of ${event.eventId}`);
        warnings.push(
          `event ${event.eventId} had ${older.length + 1} tablet rows: kept the newest, removed ${older.length}`,
        );
      }
    },
    async remove(calendarId, eventId) {
      const all = await rowsOf(calendarId, eventId);
      await removeRows(all, `remove ${eventId}`);
      if (all.length > 1) {
        warnings.push(`event ${eventId} had ${all.length} tablet rows: removed them all`);
      }
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
          {[rowId]: row[rowId]},
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
  const groupId = column(d.todo, 'groups', 'rowId');
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
      g =>
        Number(g[DELETED]) !== 1 && String(g[LIST_TITLE] ?? '').trim() === name,
    );
    const known = open?.[LIST_ID];
    if (known !== null && known !== undefined && known !== '') {
      return String(known);
    }
    const id = newId(at);
    // A list keeps the account owner of the tablet's earlier lists, when one is left to read.
    const user = all
      .map(g => g[LIST_USER])
      .find(u => u !== null && u !== undefined && u !== '');
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
  /**
   * Rows Account Sync wrote are those whose taskId it made, or that sit in a list it made. Each one
   * gets the columns a native insert fills (beta 15 to 17 left `deleted` and `sort` NULL, which hides
   * the task), a taskId, and leaves the old «Inbox» list for no list. A row with no stored link is
   * matched to an open service task by its taskId, or else by its content. A hidden row that matches
   * none was never shown nor uploaded, so it is deleted and nothing is pulled twice (#212).
   */
  const repairTasks = async (
    remotes: RemoteTask[],
    links: {remoteId: string; localId: string}[],
  ): Promise<TaskRepair> => {
    const at = now();
    const all = await rows.query(tasks, {});
    const lists = await rows.query(groups, {});
    const ownLists = lists.filter(g =>
      String(g[LIST_ID] ?? '').startsWith(ID_PREFIX),
    );
    const ownListIds = new Set(ownLists.map(g => String(g[LIST_ID])));
    const oldInbox = ownLists.filter(
      g =>
        Number(g[DELETED]) !== 1 &&
        String(g[LIST_TITLE] ?? '').trim() === INBOX_LIST,
    );
    const oldInboxIds = new Set(oldInbox.map(g => String(g[LIST_ID])));
    const localOf = (r: Row) => rowToTodoTask(d, r).localId;
    const twinKey = (r: Row) => {
      const t = rowToTodoTask(d, r);
      return JSON.stringify([String(r[col('listId')] ?? ''), t.title, t.due]);
    };
    const moved: Record<string, string> = {};
    const found: TaskRepair['found'] = [];
    // A link to a row id whose row the native sync has since given a taskId follows the row.
    const readIds = new Set(all.map(localOf));
    for (const l of links) {
      const r = readIds.has(l.localId)
        ? undefined
        : all.find(x => String(x[rowId]) === l.localId);
      if (r) {
        moved[l.localId] = localOf(r);
      }
    }
    const linked = new Set([
      ...links.map(l => l.localId),
      ...Object.values(moved),
    ]);
    const takenRemote = new Set(links.map(l => l.remoteId));
    const open = new Map<string, RemoteTask>();
    const byContent = new Map<string, RemoteTask[]>();
    for (const r of remotes) {
      if (takenRemote.has(r.remoteId)) {
        continue;
      }
      open.set(r.remoteId, r);
      const key = fingerprint(content(r));
      byContent.set(key, [...(byContent.get(key) ?? []), r]);
    }
    const take = (r: RemoteTask | undefined): string | null => {
      if (!r || !open.has(r.remoteId)) {
        return null;
      }
      open.delete(r.remoteId);
      const key = fingerprint(content(r));
      byContent.set(
        key,
        (byContent.get(key) ?? []).filter(x => x.remoteId !== r.remoteId),
      );
      return r.remoteId;
    };
    // A row that names its service task goes first, so a twin never takes its service task (#212).
    const marked = (r: Row) =>
      String(r[col('taskId')] ?? '').startsWith(SERVICE_TASK_PREFIX);
    const ordered = [...all.filter(marked), ...all.filter(r => !marked(r))];
    /** Rows kept as one side of a pair, by `twinKey`: a twin of one is removed below. */
    const anchors = new Set<string>();
    for (const r of ordered) {
      const taskId = r[col('taskId')];
      const listId = r[col('listId')];
      const mark =
        !empty(taskId) && String(taskId).startsWith(SERVICE_TASK_PREFIX)
          ? String(taskId).slice(SERVICE_TASK_PREFIX.length)
          : null;
      const task = rowToTodoTask(d, r);
      if (
        task.deleted ||
        (mark === null && (empty(listId) || !ownListIds.has(String(listId))))
      ) {
        continue;
      }
      const isLinked = linked.has(task.localId);
      let remoteId: string | null = null;
      if (!isLinked) {
        remoteId =
          mark !== null
            ? take(open.get(mark))
            : take((byContent.get(fingerprint(content(task))) ?? [])[0]);
      }
      const fix: Row = todoShapeGaps(d, r, at);
      if (!empty(listId) && oldInboxIds.has(String(listId))) {
        fix[col('listId')] = null;
      }
      let localId = task.localId;
      if (empty(taskId)) {
        if (!isLinked && remoteId === null) {
          if (Number(r[col('hasSync')]) !== 1) {
            one(
              await rows.remove(tasks, {[rowId]: r[rowId]}),
              `remove hidden task ${task.title}`,
            );
          }
          continue;
        }
        localId = remoteId === null ? newId(at) : serviceTaskId(remoteId);
        fix[col('taskId')] = localId;
        if (isLinked) {
          moved[task.localId] = localId;
        }
      }
      if (Object.keys(fix).length) {
        fix[col('hasSync')] = d.todo.rules.writeHasSync;
        one(
          await rows.update(tasks, {[rowId]: r[rowId]}, fix),
          `repair task ${task.title}`,
        );
      }
      if (remoteId !== null) {
        found.push({remoteId, localId});
      }
      if (isLinked || remoteId !== null) {
        anchors.add(twinKey(r));
      }
    }
    // The native cloud sync copied rows of the beta 15 pass into new rows with a taskId of its own
    // (#212). Such a twin shares its list, title and due time with a row kept as a pair; it would
    // read as a tablet-only task and be sent to the service again, so it is soft-deleted as the app
    // does. A row with no such twin, perhaps the owner's own task, is kept. shortcut: a twin's own
    // edit (a completion) is not copied to its pair; merge it if a device round shows one.
    const pairs = new Set([...linked, ...found.map(f => f.localId)]);
    for (const r of all) {
      const taskId = r[col('taskId')];
      const task = rowToTodoTask(d, r);
      if (
        task.deleted ||
        empty(taskId) ||
        String(taskId).startsWith(ID_PREFIX) ||
        pairs.has(task.localId) ||
        !anchors.has(twinKey(r))
      ) {
        continue;
      }
      one(
        await rows.update(
          tasks,
          {[rowId]: r[rowId]},
          {
            [col('deleted')]: 1,
            [col('modified')]: at,
            [col('hasSync')]: d.todo.rules.writeHasSync,
          },
        ),
        `remove twin task ${task.title}`,
      );
    }
    // The old «Inbox» list is empty now; a soft delete lets the native sync remove it too.
    for (const g of oldInbox) {
      one(
        await rows.update(
          groups,
          {[groupId]: g[groupId]},
          {
            [DELETED]: 1,
            [LIST_MODIFIED]: at,
            [LIST_HAS_SYNC]: d.todo.rules.writeHasSync,
          },
        ),
        `remove list ${INBOX_LIST}`,
      );
    }
    return {moved, found};
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
    async create(c, list, remoteId) {
      const at = now();
      const name = tabletListName(list);
      const listId = name === null ? null : await listFor(name, at);
      const taskId = remoteId ? serviceTaskId(remoteId) : newId(at);
      const row = toTodoInsert(
        d,
        {
          ...todoTaskToRow(d, c, at),
          [col('listId')]: listId,
          [col('taskId')]: taskId,
        },
        {existingListIds: listId === null ? [] : [listId], now: at},
      );
      // The task is known by the taskId written here. shortcut: that the native sync keeps it is
      // inferred from the lists, which kept theirs (#212); if it does not, `repair` finds the row by
      // its content in a list Account Sync made, and a task with no list is pulled again.
      await rows.insert(tasks, row);
      return saved(taskId, c, at);
    },
    repair: (remotes, links) => repairTasks(remotes, links),
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
  calendar: DeviceCalendar;
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
