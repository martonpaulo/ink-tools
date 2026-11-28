/** A received picture's size comes from Relay's module, as `Image.getSize` gave none on the tablet (#540). */
import {NativeModules} from 'react-native';
import {MODULE_CODE, ok} from '@ink-tools/sn-adapter/official';
import {noteHost} from '../src/run';

afterEach(() => {
  delete (NativeModules as Record<string, unknown>).RelayLocalSend;
});

test('the note host reads a picture size from the header Relay\'s module reads', async () => {
  const imageSize = jest.fn(async () => ({width: 450, height: 600}));
  (NativeModules as Record<string, unknown>).RelayLocalSend = {imageSize};
  await expect(noteHost.imageSize('/plugin/tmp/received-s.png')).resolves.toEqual(ok({width: 450, height: 600}));
  expect(imageSize).toHaveBeenCalledWith('/plugin/tmp/received-s.png');
});

test('a file with no picture size is a failure that names it, never a size', async () => {
  const imageSize = jest.fn(async () => {
    throw Object.assign(new Error('no picture size read'), {code: 'NOT_IMAGE'});
  });
  (NativeModules as Record<string, unknown>).RelayLocalSend = {imageSize};
  const read = await noteHost.imageSize('/plugin/tmp/received-s.png');
  expect(read).toMatchObject({ok: false, code: MODULE_CODE, message: 'no picture size read'});
});
