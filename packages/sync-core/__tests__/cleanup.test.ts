/** «Remove what Bridge wrote» touches only rows Bridge wrote (#89, D15 A). */
import {
  ALL_TIME,
  CalendarEvent,
  DeviceCalendarStore,
  DeviceTask,
  DeviceTaskStore,
  RemoteTask,
  TaskLink,
  TaskProvider,
  TimeWindow,
  fingerprint,
  removeCalendarRows,
  removeImportedTasks,
  syncTasks,
} from '../src';

/** A device Calendar holding the owner's rows (tag=event) and Bridge's (tag=task). */
function calendar(rows: Array<CalendarEvent & {tag: 'event' | 'task'}>, failOn?: string) {
  const windows: TimeWindow[] = [];
  const store: DeviceCalendarStore = {
    listOurs: async w => {
      windows.push(w);
      return rows.filter(r => r.tag === 'task' && r.end > w.from && r.start < w.to);
    },
    create: async () => {},
    update: async () => {},
    remove: async (calendarId, eventId) => {
      if (eventId === failOn) throw new Error('provider refused');
      rows.splice(rows.findIndex(r => r.calendarId === calendarId && r.eventId === eventId), 1);
    },
  };
  return {store, rows, windows};
}
const ev = (eventId: string, tag: 'event' | 'task', start = 1_000): CalendarEvent & {tag: 'event' | 'task'} => ({
  eventId, calendarId: 'work', title: eventId, content: '', start, end: start + 1, allDay: false, tag,
});

test('the calendar cleanup removes every row Bridge wrote, at any date, and none of the owner\'s', async () => {
  const far = Date.UTC(2090, 0, 1);
  const c = calendar([ev('mine', 'event'), ev('ours', 'task'), ev('ours-later', 'task', far)]);
  const out = await removeCalendarRows(c.store);
  expect(out).toEqual({removed: 2, errors: []});
  expect(c.rows.map(r => r.eventId)).toEqual(['mine']);
  expect(c.windows).toEqual([ALL_TIME]);
});

test('a row that fails to go is reported and the others are still removed', async () => {
  const c = calendar([ev('a', 'task'), ev('b', 'task')], 'a');
  const out = await removeCalendarRows(c.store);
  expect(out).toEqual({removed: 1, errors: ['remove a: provider refused']});
  expect(c.rows.map(r => r.eventId)).toEqual(['a']);
});

const task = (localId: string, title: string, deleted = false): DeviceTask => ({
  localId, title, detail: '', due: null, completed: false, modified: 1, deleted,
});
function todo(tasks: DeviceTask[]) {
  const store: DeviceTaskStore = {
    list: async () => tasks,
    create: async x => {
      const t = {...x, localId: `l${tasks.length + 1}`, modified: 1, deleted: false};
      tasks.push(t);
      return t;
    },
    update: async () => tasks[0],
    remove: async id => {
      tasks.find(t => t.localId === id)!.deleted = true;
    },
  };
  return {store, tasks};
}
const link = (localId: string, origin?: 'service'): TaskLink => ({
  remoteId: `r-${localId}`, localId, fingerprint: '', ...(origin ? {origin} : {}),
});

test('the To-Do cleanup removes only tasks Bridge imported and keeps the owner\'s own synced tasks', async () => {
  const t = todo([task('l1', 'imported'), task('l2', 'written on the tablet'), task('l3', 'old link'), task('l4', 'unsynced')]);
  const links = [link('l1', 'service'), link('l2'), link('l3')];
  const out = await removeImportedTasks(t.store, links);
  expect(out.removed).toBe(1);
  expect(out.errors).toEqual([]);
  expect(t.tasks.filter(x => x.deleted).map(x => x.localId)).toEqual(['l1']);
  expect(out.links).toEqual([link('l2'), link('l3')]);
});

test('an imported task already deleted on the tablet only drops its link', async () => {
  const t = todo([task('l1', 'gone', true)]);
  const out = await removeImportedTasks(t.store, [link('l1', 'service')]);
  expect(out).toEqual({removed: 0, errors: [], links: []});
});

test('sync marks the tasks it imports from the service, and only those', async () => {
  const remote: RemoteTask[] = [{remoteId: 'r1', title: 'from service', detail: '', due: null, completed: false, modified: 1}];
  const provider: TaskProvider = {
    list: async () => remote,
    get: async () => null,
    create: async x => ({...x, remoteId: 'r2', modified: 1}),
    update: async (id, x) => ({...x, remoteId: id, modified: 1}),
    remove: async () => {},
  };
  const t = todo([task('l0', 'from tablet')]);
  const out = await syncTasks(provider, t.store, [], {sendTabletOnly: true});
  expect(out.links).toEqual([
    {remoteId: 'r1', localId: 'l2', fingerprint: fingerprint(remote[0]), origin: 'service'},
    {remoteId: 'r2', localId: 'l0', fingerprint: fingerprint(t.tasks[0])},
  ]);
});
