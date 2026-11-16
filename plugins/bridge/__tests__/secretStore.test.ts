/** The sign-in files `inkctl secret set` writes, read and deleted in the private folder (#90). */
import {ok, fail, THROWN_CODE} from '@supernote-tools/sn-adapter/official';
import {signInState} from '@supernote-tools/sync-core/secrets';
import {TextFiles} from '../src/files';
import {createSecretStore} from '../src/secretStore';

const DIR = '/data/data/com.ratta.supernote.pluginhost/files/plugins/bridge/';
const folder = async () => ok(DIR);

function disk(start: Record<string, string> = {}) {
  const files = {...start};
  const native: TextFiles = {
    readText: async p => files[p] ?? null,
    writeText: async () => null,
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
