/**
 * A store's repair runs before the pass reads the tablet (#212): a link follows a row whose id
 * changed, and a found row is linked instead of pulled again, with nothing sent to the service.
 */
import {DeviceTask, DeviceTaskStore, RemoteTask, TaskLink, TaskProvider, syncTasks} from '../src/tasks';

const remote = (remoteId: string, title: string): RemoteTask => ({remoteId, title, detail: '', due: null, completed: false, modified: 1});
const device = (localId: string, title: string): DeviceTask => ({localId, title, detail: '', due: null, completed: false, modified: 1, deleted: false});

function setup(rows: DeviceTask[], repair: DeviceTaskStore['repair']) {
  const sent: string[] = [];
  const created: string[] = [];
  const provider: TaskProvider = {
    list: async () => [remote('r1', 'Stretch'), remote('r2', 'Read'), remote('r3', 'Walk')],
    get: async () => null,
    create: async c => { sent.push(c.title); return remote('new', c.title); },
    update: async (id, c) => { sent.push(c.title); return remote(id, c.title); },
    remove: async id => { sent.push(id); },
  };
  const store: DeviceTaskStore = {
    list: async () => rows,
    create: async (c, _list, remoteId) => { created.push(remoteId ?? c.title); return device(`x${remoteId}`, c.title); },
    update: async (id, c) => device(id, c.title),
    remove: async () => undefined,
    repair,
  };
  return {provider, store, sent, created};
}

test('a moved link and a found row are kept, so nothing is pulled twice or sent', async () => {
  const links: TaskLink[] = [{remoteId: 'r1', localId: '446', fingerprint: JSON.stringify(['Stretch', '', null, false]), origin: 'service'}];
  const {provider, store, sent, created} = setup(
    [device('native446', 'Stretch'), device('inktoolsrtr2', 'Read')],
    async () => ({moved: {'446': 'native446'}, found: [{remoteId: 'r2', localId: 'inktoolsrtr2'}, {remoteId: 'r1', localId: 'other'}]}),
  );
  const result = await syncTasks(provider, store, links);
  expect(result.errors).toEqual([]);
  expect(created).toEqual(['r3']);
  expect(sent).toEqual([]);
  expect(result.links.map(l => [l.remoteId, l.localId, l.origin])).toEqual([
    ['r1', 'native446', 'service'],
    ['r2', 'inktoolsrtr2', 'service'],
    ['r3', 'xr3', 'service'],
  ]);
});

test('a failed repair stops the pass, so nothing is pulled twice', async () => {
  const {provider, store, created} = setup([], async () => { throw new Error('provider busy'); });
  await expect(syncTasks(provider, store, [])).rejects.toThrow('repair tablet rows: provider busy');
  expect(created).toEqual([]);
});
