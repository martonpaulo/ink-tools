/** The sign-in files `inkctl secret set` writes, read and deleted in the private folder (#90). */
import {ok, fail, THROWN_CODE} from '@ink-tools/sn-adapter/official';
import {signInState} from '@ink-tools/sync-core/secrets';
import {TextFiles} from '../src/files';
import {
  createSecretStore,
  importSecretDrops,
  readGoogleClient,
  SECRET_DROP_FOLDER,
} from '../src/secretStore';

const DIR = '/data/data/com.ratta.supernote.pluginhost/files/plugins/bridge/';
const folder = async () => ok(DIR);

function disk(start: Record<string, string> = {}) {
  const files = {...start};
  const native: TextFiles = {
    readText: async p => files[p] ?? null,
    writeText: async (p, text) => {
      files[p] = text;
      return null;
    },
    deleteFile: async p => {
      delete files[p];
      return true;
    },
  };
  return {files, native};
}

test('reads the file inkctl writes, by sync-core name, dropping the pipe newline', async () => {
  const {native} = disk({[`${DIR}todoist.secret`]: 'tok-1234\n'});
  const store = createSecretStore(folder, native);
  expect(await store.read('todoist')).toBe('tok-1234');
  expect(await store.read('google')).toBeNull();
  expect(await signInState(store, 'todoist')).toEqual({state: 'signedIn'});
});

test('a broken file or a refused read is never signed out', async () => {
  const empty = createSecretStore(
    folder,
    disk({[`${DIR}google.secret`]: '\n'}).native,
  );
  await expect(empty.read('google')).rejects.toThrow(/empty/);
  const refused: TextFiles = {
    readText: () => Promise.reject(new Error('EACCES')),
    writeText: async () => null,
  };
  expect(
    await signInState(createSecretStore(folder, refused), 'icloud'),
  ).toEqual({
    state: 'unreadable',
    reason: 'EACCES',
  });
  const noFolder = createSecretStore(
    async () => fail(THROWN_CODE, 'no folder'),
    disk().native,
  );
  await expect(noFolder.read('todoist')).rejects.toThrow('no folder');
});

test('sign out deletes the file; a delete that did not happen throws', async () => {
  const {files, native} = disk({[`${DIR}todoist.secret`]: 'tok-1234'});
  await createSecretStore(folder, native).remove('todoist');
  expect(files).toEqual({});
  const stuck = {...native, deleteFile: async () => false};
  await expect(
    createSecretStore(folder, stuck).remove('todoist'),
  ).rejects.toThrow('the todoist sign-in was not deleted');
});

const DROP = `${SECRET_DROP_FOLDER}/todoist.secret`;

test('a drop file inkctl left moves into the private folder and is deleted at once (#116)', async () => {
  const {files, native} = disk({[DROP]: 'tok-SYNTHETIC-1234\n'});
  expect(await importSecretDrops(folder, native)).toEqual([
    {provider: 'todoist', moved: true},
  ]);
  expect(files[DROP]).toBeUndefined();
  expect(files[`${DIR}todoist.secret`]).toBe('tok-SYNTHETIC-1234');
  expect(await importSecretDrops(folder, native)).toEqual([]);
});

test('a broken drop file is deleted too, and its problem never holds the value', async () => {
  const {files, native} = disk({[DROP]: 'tok\tSYNTHETIC'});
  const [drop] = await importSecretDrops(folder, native);
  expect(drop).toMatchObject({provider: 'todoist', moved: false});
  expect(JSON.stringify(drop)).not.toContain('SYNTHETIC');
  expect(files[DROP]).toBeUndefined();
  expect(files[`${DIR}todoist.secret`]).toBeUndefined();
});

test('a drop file that cannot be deleted is a problem, not a move', async () => {
  const {native} = disk({[DROP]: 'tok-SYNTHETIC-1234'});
  native.deleteFile = async () => false;
  const [drop] = await importSecretDrops(folder, native);
  expect(drop).toEqual({
    provider: 'todoist',
    moved: false,
    problem: 'the drop file was not deleted: it is still there',
  });
});

test('the Google client reads from its own file; absent is null, broken throws (#200)', async () => {
  const client = JSON.stringify({client_id: 'id-fixture', client_secret: 'fixture'});
  const {native} = disk({[`${DIR}google-client.secret`]: `${client}\n`});
  expect(await readGoogleClient(createSecretStore(folder, native))).toEqual({
    clientId: 'id-fixture',
    clientSecret: 'fixture',
  });
  expect(await readGoogleClient(createSecretStore(folder, disk().native))).toBeNull();
  const broken = disk({[`${DIR}google-client.secret`]: JSON.stringify({client_id: 'x'})});
  await expect(readGoogleClient(createSecretStore(folder, broken.native))).rejects.toThrow('no client_secret');
});

test('a Google client drop file moves in like the other secrets (#200)', async () => {
  const drop = `${SECRET_DROP_FOLDER}/google-client.secret`;
  const {files, native} = disk({[drop]: '{"client_id":"c","client_secret":"s"}'});
  expect(await importSecretDrops(folder, native)).toEqual([{provider: 'google-client', moved: true}]);
  expect(files[drop]).toBeUndefined();
  expect(files[`${DIR}google-client.secret`]).toBe('{"client_id":"c","client_secret":"s"}');
});

test('inkctl writes the drop files where Bridge reads them', () => {
  const fs = require('fs');
  const path = require('path');
  const cli = fs.readFileSync(
    path.join(__dirname, '../../../cli/inkctl/src/inkctl'),
    'utf8',
  );
  // Both sides read registry item storage.sign-in-drop-folder (#294).
  expect(cli).toContain('SIGN_IN_DROP_FOLDER = REGISTRY["storage.sign-in-drop-folder"]["folder"]');
  expect(cli).toContain(`"folder": "${SECRET_DROP_FOLDER}"`);
});

import config from '../PluginConfig.json';

/**
 * The permission the host asks for each file call outside the private folder, which needs none
 * (Supernote's Plugin Permissions page): a delete needs `FILE:DELETE` even with `FILE:READ` and
 * `FILE:WRITE` granted (docs/supernote.md, #116).
 */
const NEEDS = {
  read: 'plugin.permission.FILE:READ',
  write: 'plugin.permission.FILE:WRITE',
  delete: 'plugin.permission.FILE:DELETE',
} as const;

test('the declared permissions cover every file call the secrets mover makes (#116)', async () => {
  const calls: {op: keyof typeof NEEDS; path: string}[] = [];
  const {native} = disk({
    [`${SECRET_DROP_FOLDER}/todoist.secret`]: 'tok-1234\n',
    [`${SECRET_DROP_FOLDER}/google.secret`]: '\n',
  });
  const recording: TextFiles = {
    readText: p => {
      calls.push({op: 'read', path: p});
      return native.readText(p);
    },
    writeText: (p, t) => {
      calls.push({op: 'write', path: p});
      return native.writeText(p, t);
    },
    deleteFile: p => {
      calls.push({op: 'delete', path: p});
      return native.deleteFile!(p);
    },
  };
  await importSecretDrops(folder, recording);
  await createSecretStore(folder, recording).remove('todoist');
  // Each kind of call happened, so a new one cannot slip past this check unseen.
  expect(new Set(calls.map(c => c.op))).toEqual(new Set(['read', 'write', 'delete']));
  const needed = new Set(
    calls.filter(c => !c.path.startsWith(DIR)).map(c => NEEDS[c.op]),
  );
  expect(needed).toEqual(new Set([NEEDS.read, NEEDS.delete]));
  for (const permission of needed) {
    expect(config['uses-permissions']).toContain(permission);
  }
});
