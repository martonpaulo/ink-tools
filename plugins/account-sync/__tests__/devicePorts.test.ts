/**
 * The device ports' shared contract tests (#294): each port's contract runs on every implementation
 * it has, one per level, and the port stops a module whose kill switch is off before it acts (#293).
 * Today each port has its level-2 implementation; a higher level's joins its table here.
 */
import {BUNDLED_DESCRIPTOR, ModuleOff, REGISTRY_ITEMS, Row} from '@ink-tools/sn-adapter';
import type {DeviceTaskStore} from '@ink-tools/sync-core';
import {ContentRows, createDeviceCalendar, createDeviceStores, createDeviceTasks, DeviceCalendar} from '../src/deviceStores';
import {createDeviceDigest, DeviceDigest, providerDigest} from '../src/digestStore';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

/** Every call any URI receives, with one in-memory table per URI and plain equality filters. */
function memoryRows() {
  const tables: Record<string, Row[]> = {};
  const calls: string[] = [];
  const table = (uri: string) => (tables[uri] ??= []);
  const match = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  let next = 100;
  const rows: ContentRows = {
    query: async (uri, where) => {
      calls.push(`query ${uri}`);
      if (uri.includes('/count/by_unique_identifier/')) {
        const id = uri.slice(uri.lastIndexOf('/') + 1);
        return [{count: Object.values(tables).flat().filter(r => String(r.metadata ?? '').includes(id)).length}];
      }
      return table(uri).filter(r => match(r, where)).map(r => ({...r}));
    },
    insert: async (uri, row) => {
      calls.push(`insert ${uri}`);
      const id = String(next++);
      table(uri).push({...row, id});
      return id;
    },
    update: async (uri, where, row) => {
      calls.push(`update ${uri}`);
      const hit = Object.keys(where).length ? table(uri).filter(r => match(r, where)) : Object.values(tables).flat();
      hit.forEach(r => Object.assign(r, row));
      return hit.length;
    },
    remove: async (uri, where) => {
      calls.push(`remove ${uri}`);
      const before = table(uri).length;
      tables[uri] = table(uri).filter(r => !match(r, where));
      return before - tables[uri].length;
    },
  };
  return {rows, calls};
}

const tasksImplementations: Array<[string, (rows: ContentRows) => DeviceTaskStore]> = [
  ['level 2: the To-Do provider', rows => createDeviceTasks(rows, () => NOW, BUNDLED_DESCRIPTOR)],
];
const calendarImplementations: Array<[string, (rows: ContentRows) => DeviceCalendar]> = [
  ['level 2: the Calendar provider', rows => createDeviceCalendar(rows, () => NOW, BUNDLED_DESCRIPTOR)],
];
const digestImplementations: Array<[string, (rows: ContentRows) => DeviceDigest]> = [
  ['level 2: the Digest provider', rows => providerDigest(rows, '', BUNDLED_DESCRIPTOR)],
];

describe.each(tasksImplementations)('the tasks port contract, %s', (_name, make) => {
  test('a created task is listed, an update changes it, and a removed one leaves the list', async () => {
    const tasks = make(memoryRows().rows);
    const made = await tasks.create({title: 'Buy milk', detail: '', due: null, completed: false}, undefined, 'r1');
    expect((await tasks.list()).map(t => t.title)).toEqual(['Buy milk']);
    await tasks.update(made.localId, {title: 'Buy bread', detail: '', due: null, completed: true});
    expect((await tasks.list()).map(t => [t.title, t.completed])).toEqual([['Buy bread', true]]);
    await tasks.remove(made.localId);
    expect((await tasks.list()).filter(t => !t.deleted)).toEqual([]);
  });
});

describe.each(calendarImplementations)('the calendar port contract, %s', (_name, make) => {
  test('a created event is listed in its window and not outside it', async () => {
    const calendar = make(memoryRows().rows);
    const event = {eventId: 'g1', calendarId: 'work', title: 'Standup', content: '', start: NOW, end: NOW + HOUR, allDay: false};
    await calendar.create(event);
    expect((await calendar.listOurs({from: NOW - HOUR, to: NOW + 2 * HOUR})).map(e => e.title)).toEqual(['Standup']);
    expect(await calendar.listOurs({from: NOW + 3 * HOUR, to: NOW + 4 * HOUR})).toEqual([]);
  });
});

describe.each(digestImplementations)('the digest port contract, %s', (_name, make) => {
  test('a new entry is inserted, and the same entry again is an update', async () => {
    const digest = make(memoryRows().rows);
    const entry = {sourceId: 'a1', title: 'A title', text: 'Text.', url: 'https://example.com/a', savedAt: 0};
    expect(await digest.write([entry])).toEqual({inserted: 1, updated: 0, failed: []});
    expect(await digest.write([entry])).toEqual({inserted: 0, updated: 1, failed: []});
  });
});

describe('a module whose kill switch is off (#293)', () => {
  const off = (id: string) =>
    REGISTRY_ITEMS.map(item => (item.id === id ? {...item, off: 'until 2026-12-31: changed by an update'} : item));

  test('the tasks and calendar stores stop before any provider call', async () => {
    const {rows, calls} = memoryRows();
    const stores = createDeviceStores(rows, () => NOW, BUNDLED_DESCRIPTOR, off('todo.provider'));
    expect(() => stores.tasks.list()).toThrow(ModuleOff);
    expect(calls).toEqual([]);
    await stores.calendar.listOurs({from: NOW, to: NOW + HOUR});
    expect(calls).toHaveLength(1);
    const calendarOff = createDeviceStores(rows, () => NOW, BUNDLED_DESCRIPTOR, off('calendar.provider'));
    expect(() => calendarOff.calendar.takeWarnings()).toThrow('calendar.provider is turned off');
  });

  test('the Digest stops before any provider call, and its failure is not an entry result', async () => {
    const {rows, calls} = memoryRows();
    const digest = createDeviceDigest(rows, '', BUNDLED_DESCRIPTOR, off('digest.provider'));
    expect(() => digest.write([])).toThrow(ModuleOff);
    expect(calls).toEqual([]);
  });
});
