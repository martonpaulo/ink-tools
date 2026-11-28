/** «Insert Sticker» keeps each sticker as a `.snstk` collection the Sticker plugin's Import lists (#35). */
import {NativeModules} from 'react-native';
import '../testing/profile';
import {collectionPath, keepCollection} from '../src/insert/sticker';
import {REGISTRY} from '@ink-tools/sn-adapter/registry';

const SANDBOX = REGISTRY.pluginhostFileSandbox;
const EXPORT = `${SANDBOX.sharedRoot}/${SANDBOX.stickerCollectionFolder}`;
const native = {writeStickerCollection: jest.fn()};

beforeEach(() => {
  jest.resetAllMocks();
  NativeModules.TestFiles = native;
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

it('names the collection by the sticker file, in the folder the Import lists', () => {
  expect(collectionPath('/storage/emulated/0/MyStyle/Test/stickers/apple.sticker')).toBe(`${EXPORT}/apple.snstk`);
});

it('writes the sticker as its collection through the native module', async () => {
  native.writeStickerCollection.mockResolvedValue(120);
  const sticker = '/storage/emulated/0/MyStyle/Test/stickers/apple.sticker';
  expect(await keepCollection(sticker)).toEqual({ok: true, value: `${EXPORT}/apple.snstk`});
  expect(native.writeStickerCollection).toHaveBeenCalledWith(sticker, `${EXPORT}/apple.snstk`);
});

it('reports a collection that was not written', async () => {
  native.writeStickerCollection.mockRejectedValue(Object.assign(new Error('disk full'), {code: 'IO'}));
  expect(await keepCollection('/x/apple.sticker')).toMatchObject({ok: false, moduleCode: 'IO'});
});
