/**
 * Ink2Pic's library under the shared insert (#103): a picture is reused only in its own style,
 * read from and written to MyStyle/Ink2Pic/library/library.json. The insert itself runs in the
 * packages gate, packages/picture-search/__tests__/insertPicture.test.ts (#142, D63 A).
 */
import {NativeModules} from 'react-native';
import {FileUtils, PluginManager, PluginNoteAPI} from 'sn-plugin-lib';
import {insertPicture, startEarlyDownload} from '../src/flow/insertPicture';
import {resetSessionForTests, closeLogFileForTests} from '../src/profile';
import {resetLibraryForTests} from '../src/library/device';
import type {SearchResult} from '@ink-tools/picture-search/types';

const result: SearchResult = {
  id: 'openclipart:340609',
  source: 'openclipart',
  title: 'Ladle',
  thumbUrl: 'https://openclipart.org/image/400px/340609',
  license: 'CC0 1.0',
  attribution: 'Openclipart',
};
const image = {prepareForEink: jest.fn()};
const native = {
  downloadToFile: jest.fn(),
  writeText: jest.fn(),
  readText: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  NativeModules.Ink2PicFiles = native;
  NativeModules.Ink2PicImage = image;
  image.prepareForEink.mockResolvedValue({
    width: 640,
    height: 593,
    bytes: 40000,
  });
  resetSessionForTests();
  resetLibraryForTests();
  closeLogFileForTests();
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue(
    '/data/plugin',
  );
  native.readText.mockResolvedValue(null);
  native.writeText.mockResolvedValue(null);
  (FileUtils.getExternalDirPath as jest.Mock).mockResolvedValue([
    '/storage/emulated/0',
  ]);
  native.downloadToFile.mockResolvedValue(64109);
  (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
    success: true,
    result: true,
  });
});

/** library.json holding Ladle saved as `saved` (#103); `contour` absent as before #103. */
function libraryHolds(saved: {contour?: boolean} = {}): void {
  native.readText.mockImplementation(async (file: string) =>
    file.endsWith('/library.json')
      ? JSON.stringify({
          version: 1,
          recentSearches: [],
          items: [
            {
              id: 'openclipart:340609',
              source: 'openclipart',
              sourceId: '340609',
              sourceUrl: 'https://openclipart.org/image/800px/340609',
              query: 'ladle',
              license: 'CC0 1.0',
              attribution: 'Openclipart',
              savedAt: '2026-11-06T00:00:00.000Z',
              path: `/storage/emulated/0/MyStyle/Ink2Pic/library/openclipart-340609${
                saved.contour ? '.contour' : ''
              }.png`,
              width: 640,
              height: 593,
              ...saved,
            },
          ],
        })
      : null,
  );
}

describe('a library picture is reused only in its own style (#103)', () => {
  const dir = '/storage/emulated/0/MyStyle/Ink2Pic/library';

  it('prepares a contour drawing again when the library holds the picture plain', async () => {
    libraryHolds({contour: false});
    expect(await insertPicture(result, 'soup', null, true)).toEqual({
      ok: true,
      value: `${dir}/openclipart-340609.contour.png`,
    });
    expect(native.downloadToFile).toHaveBeenCalledTimes(1);
    expect(image.prepareForEink.mock.calls[0].slice(1, 5)).toEqual([
      `${dir}/openclipart-340609.contour.png`,
      640,
      'png',
      true,
    ]);
    const saved = native.writeText.mock.calls.find(call =>
      call[0].endsWith('/library.json'),
    );
    expect(JSON.parse(saved[1]).items[0]).toMatchObject({
      path: `${dir}/openclipart-340609.contour.png`,
      contour: true,
    });
  });

  it('prepares it plain again when the library holds its contour drawing', async () => {
    libraryHolds({contour: true});
    await insertPicture(result, 'soup');
    expect(image.prepareForEink.mock.calls[0].slice(1, 5)).toEqual([
      `${dir}/openclipart-340609.png`,
      640,
      'png',
      false,
    ]);
  });

  it('reuses the contour drawing for a contour insert', async () => {
    libraryHolds({contour: true});
    expect(await insertPicture(result, 'soup', null, true)).toEqual({
      ok: true,
      value: `${dir}/openclipart-340609.contour.png`,
    });
    expect(native.downloadToFile).not.toHaveBeenCalled();
    expect(image.prepareForEink).not.toHaveBeenCalled();
  });

  it('reads an item saved before #103 as plain', async () => {
    libraryHolds();
    await insertPicture(result, 'soup', null, true);
    expect(image.prepareForEink.mock.calls[0][4]).toBe(true);
  });

  it('downloads early when the library holds only the other style', async () => {
    libraryHolds({contour: true});
    const early = startEarlyDownload(result);
    expect(await early.raw).toEqual({
      ok: true,
      value: '/data/plugin/insert-early-openclipart-340609.png',
    });
  });

  it('downloads nothing early when the library holds the style asked for', async () => {
    libraryHolds({contour: false});
    expect(await startEarlyDownload(result).raw).toBeNull();
    expect(native.downloadToFile).not.toHaveBeenCalled();
  });
});
