/**
 * The delete guard of an insert's temporary downloads (#93, #302): only a file named by
 * `insertDownloadPath` or `earlyDownloadPath`, directly in the plugin's private folder, is ever
 * deleted; a library picture, a file in a sub-folder or in another folder stays.
 */
import {NativeModules} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import '../testing/profile';
import {type EarlyDownload} from '../src/insert';
import {dropEarly} from '../src/insert/insertPicture';
import {
  earlyDownloadPath,
  insertDownloadPath,
  isTemporaryDownload,
  resetSessionForTests,
} from '../src/storage';
import {ok} from '@ink-tools/sn-adapter/official';

const DIR = '/data/plugin';
const native = {deleteFile: jest.fn(), writeText: jest.fn(), readText: jest.fn()};

beforeEach(() => {
  jest.resetAllMocks();
  NativeModules.TestFiles = native;
  native.deleteFile.mockResolvedValue(true);
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue(DIR);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  resetSessionForTests();
});

describe('isTemporaryDownload', () => {
  it('accepts the two temporary names in the plugin folder', () => {
    expect(isTemporaryDownload(DIR, insertDownloadPath(DIR, 'openclipart:1', 'png'))).toBe(true);
    expect(isTemporaryDownload(DIR, earlyDownloadPath(DIR, 'openclipart:1', 'png'))).toBe(true);
  });

  it.each([
    ['a library picture', '/storage/emulated/0/MyStyle/Test/library/openclipart-1.png'],
    ['a kept file in the plugin folder', `${DIR}/settings.json`],
    ['a file whose name only holds the prefix', `${DIR}/kept-insert-1.png`],
    ['a file in a sub-folder', `${DIR}/library/insert-1.png`],
    ['an escape from the plugin folder', `${DIR}/insert-x/../settings.json`],
    ['a sibling folder sharing the name', `${DIR}2/insert-1.png`],
    ['the same name in another folder', '/data/other/insert-1.png'],
  ])('refuses %s', (_, path) => {
    expect(isTemporaryDownload(DIR, path)).toBe(false);
  });
});

/** Lets dropEarly's chain, which returns nothing, run to its end. */
async function settled(early: EarlyDownload): Promise<void> {
  await early.raw.catch(() => null);
  for (let turn = 0; turn < 5; turn++) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

const early = (raw: EarlyDownload['raw']): EarlyDownload => ({id: 'openclipart:1', started: 0, raw});

describe('dropEarly (#93)', () => {
  it('deletes a dropped early download', async () => {
    const path = earlyDownloadPath(DIR, 'openclipart:1', 'png');
    const dropped = early(Promise.resolve(ok(path)));
    dropEarly(dropped);
    await settled(dropped);
    expect(native.deleteFile).toHaveBeenCalledWith(path);
  });

  it('never deletes a path that is not a temporary download', async () => {
    const dropped = early(Promise.resolve(ok('/storage/emulated/0/MyStyle/Test/library/a.png')));
    dropEarly(dropped);
    await settled(dropped);
    expect(native.deleteFile).not.toHaveBeenCalled();
  });

  it('deletes nothing for a picture that needed no download, and never rejects', async () => {
    dropEarly(null);
    const none = early(Promise.resolve(null));
    dropEarly(none);
    await settled(none);
    const thrown = early(Promise.reject(new Error('lost')));
    dropEarly(thrown);
    await settled(thrown);
    expect(native.deleteFile).not.toHaveBeenCalled();
  });

  it('keeps going when the delete fails', async () => {
    native.deleteFile.mockRejectedValue(Object.assign(new Error('busy'), {code: 'IO'}));
    const dropped = early(Promise.resolve(ok(earlyDownloadPath(DIR, 'openclipart:1', 'png'))));
    dropEarly(dropped);
    await settled(dropped);
    expect(native.deleteFile).toHaveBeenCalledTimes(1);
  });
});
