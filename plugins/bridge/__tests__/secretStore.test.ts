/** The sign-in files `inkctl secret set` writes, read and deleted in the private folder (#90). */
import {ok, fail, THROWN_CODE} from '@supernote-tools/sn-adapter/official';
import {signInState} from '@supernote-tools/sync-core/secrets';
import {TextFiles} from '../src/files';
import {
  createSecretStore,
  importSecretDrops,
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
  expect(await signInState(store, 'todoist')).toEqual({
    state: 'signedIn',
    tail: '…1234',
  });
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

test('inkctl writes the drop files where Bridge reads them', () => {
  const fs = require('fs');
  const path = require('path');
  const cli = fs.readFileSync(
    path.join(__dirname, '../../../cli/inkctl/src/inkctl'),
    'utf8',
  );
  expect(cli).toContain(`SIGN_IN_DROP_FOLDER = "${SECRET_DROP_FOLDER}"`);
});
