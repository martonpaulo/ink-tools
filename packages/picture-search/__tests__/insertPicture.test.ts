/**
 * One picture inserted by picture-search's insert tier (#12, #142), over the in-memory picture
 * store of testing/insert.ts. How a plugin's library finds a picture in its own style is the
 * plugin's to test (#103, #302).
 */
import {NativeModules} from 'react-native';
import {FileUtils, PluginCommAPI, PluginNoteAPI, PluginManager} from 'sn-plugin-lib';
import '../testing/profile';
import {
  imageExtension,
  insertBest,
  insertPicture as sharedInsert,
  type EarlyDownload,
  type InsertOptions,
  type LassoPlace,
  startEarlyDownload as sharedEarly,
  type Stop,
  unmeasured,
  wordKeptOptions as sharedWordKept,
} from '../src/insert';
import {closeLogFileForTests, resetSessionForTests} from '../src/storage';
import {CALL_TIMEOUT_MS, logLines, startLog} from '../src/log/memory';
import type {SearchResult} from '../src/types';
import {
  knownKey,
  TEST_COPY,
  TEST_PICTURES_DIR,
  testPictures,
  type TestPictures,
} from '../testing/insert';

/** The store the next insert uses; each test starts with an empty one. */
let pictures: TestPictures;

const insertPicture = (
  picture: SearchResult,
  query: string,
  place: LassoPlace | null = null,
  contour = false,
  options?: InsertOptions,
  early: EarlyDownload | null = null,
  stop: Stop = () => null,
) => sharedInsert(pictures, picture, query, place, contour, options, early, stop);
const startEarlyDownload = (picture: SearchResult) => sharedEarly(picture, pictures);
const wordKeptOptions = () => sharedWordKept(pictures);

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
  // The insert saves the open note first (#524).
  (PluginNoteAPI.saveCurrentNote as jest.Mock).mockResolvedValue({success: true, result: true});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  NativeModules.TestFiles = native;
  NativeModules.TestImage = image;
  image.prepareForEink.mockResolvedValue({
    width: 640,
    height: 593,
    bytes: 40000,
  });
  resetSessionForTests();
  pictures = testPictures();
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

describe('the early download of Insert best picture (#88)', () => {
  const library =
    `${TEST_PICTURES_DIR}/openclipart-340609.png`;

  it('prepares the early file and downloads nothing more when its picture wins', async () => {
    startLog();
    const early = startEarlyDownload(result);
    expect(
      await insertPicture(result, 'soup', null, false, undefined, early),
    ).toEqual({
      ok: true,
      value: library,
    });
    expect(native.downloadToFile).toHaveBeenCalledTimes(1);
    expect(native.downloadToFile.mock.calls[0][1]).toBe(
      '/data/plugin/insert-early-openclipart-340609.png',
    );
    expect(image.prepareForEink.mock.calls[0][0]).toBe(
      '/data/plugin/insert-early-openclipart-340609.png',
    );
    const text = logLines().join('\n');
    expect(text).toMatch(/time download: \d+ ms, early, started \d+ ms before/);
    for (const step of ['conversion', 'insert', 'lasso', 'write']) {
      expect(text).toMatch(new RegExp(`time ${step}: \\d+ ms`));
    }
  });

  it('downloads the winner itself when the early download was for another picture', async () => {
    const early = startEarlyDownload({...result, id: 'openclipart:1'});
    await early.raw;
    native.downloadToFile.mockClear();
    await insertPicture(result, 'soup', null, false, undefined, early);
    expect(native.downloadToFile.mock.calls[0][1]).toBe(
      '/data/plugin/insert-openclipart-340609.png',
    );
    expect(image.prepareForEink.mock.calls[0][0]).toBe(
      '/data/plugin/insert-openclipart-340609.png',
    );
  });

  it('downloads again when the early download failed', async () => {
    native.downloadToFile.mockRejectedValueOnce(
      Object.assign(new Error('HTTP 503'), {code: 'HTTP_503'}),
    );
    const early = startEarlyDownload(result);
    await insertPicture(result, 'soup', null, false, undefined, early);
    expect(native.downloadToFile).toHaveBeenCalledTimes(2);
    expect(native.downloadToFile.mock.calls[1][1]).toBe(
      '/data/plugin/insert-openclipart-340609.png',
    );
  });
});

describe('insertPicture (#12)', () => {
  it('downloads into the library and inserts the file', async () => {
    const path = `${TEST_PICTURES_DIR}/openclipart-340609.png`;
    expect(await insertPicture(result, 'soup')).toEqual({
      ok: true,
      value: path,
    });
    // 800 px is what Openclipart serves: 640 px answers a redirect to it (#48).
    // The download goes to one temporary file in shared storage, which the note app can read
    // (brief section 6.6); the library keeps only the .png (#48).
    expect(native.downloadToFile.mock.calls[0].slice(0, 2)).toEqual([
      'https://openclipart.org/image/800px/340609',
      // Private: replacing a file in MyStyle needs FILE:DELETE (#62).
      '/data/plugin/insert-openclipart-340609.png',
    ]);
    expect(image.prepareForEink.mock.calls[0].slice(0, 5)).toEqual([
      '/data/plugin/insert-openclipart-340609.png',
      path,
      640,
      'png',
      false,
    ]);
    expect(PluginNoteAPI.insertImage).toHaveBeenCalledWith(path);
    // The store records it once it is inserted.
    expect(pictures.records).toHaveLength(1);
    expect(pictures.records[0]).toMatchObject({
      id: 'openclipart:340609',
      query: 'soup',
      path,
    });
  });

  it('prepares a contour drawing when the tile showed one (#66)', async () => {
    expect((await insertPicture(result, 'soup', null, true)).ok).toBe(true);
    expect(image.prepareForEink.mock.calls[0][4]).toBe(true);
  });

  it('inserts a library picture without a download (#15)', async () => {
    const local = {
      ...result,
      id: 'library:openclipart:340609',
      localPath: '/s/a.png',
    };
    expect(await insertPicture(local, 'soup')).toEqual({
      ok: true,
      value: '/s/a.png',
    });
    expect(native.downloadToFile).not.toHaveBeenCalled();
  });

  it('stops at a failed download and does not insert', async () => {
    native.downloadToFile.mockRejectedValue(
      Object.assign(new Error('HTTP 503'), {code: 'HTTP_503'}),
    );
    expect((await insertPicture(result, 'soup')).ok).toBe(false);
    expect(PluginNoteAPI.insertImage).not.toHaveBeenCalled();
  });

  it('keeps the insertImage error', async () => {
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: false,
      error: {code: 1501, message: 'no FILE:WRITE'},
    });
    expect(await insertPicture(result, 'soup')).toEqual({
      ok: false,
      code: 1501,
      message: 'no FILE:WRITE',
      step: 'place',
    });
  });

  it('takes the extension from the URL', () => {
    expect(
      imageExtension('https://upload.wikimedia.org/x/960px-Soup.JPG'),
    ).toBe('jpg');
    expect(imageExtension('https://openclipart.org/image/640px/1')).toBe('png');
  });

  it('uses the downloaded file when the e-ink preparation fails (#17)', async () => {
    image.prepareForEink.mockRejectedValue(
      Object.assign(new Error('bad'), {code: 'NOT_IMAGE'}),
    );
    const done = await insertPicture(result, 'soup');
    // Downloaded again into the library under its own name: the note app may not read the
    // private folder, and a file in MyStyle is never replaced (#62).
    const kept =
      `${TEST_PICTURES_DIR}/openclipart-340609.original.png`;
    expect(done).toEqual({ok: true, value: kept});
    expect(native.downloadToFile.mock.calls.map(call => call[1])).toEqual([
      '/data/plugin/insert-openclipart-340609.png',
      kept,
    ]);
  });

  it('never downloads into the prepared file after a prepare TIMEOUT (#103)', async () => {
    startLog();
    jest.useFakeTimers();
    try {
      // The image module never answers: it may still write the prepared file later.
      image.prepareForEink.mockReturnValue(new Promise(() => {}));
      const done = insertPicture(result, 'soup');
      await jest.advanceTimersByTimeAsync(CALL_TIMEOUT_MS);
      const prepared = image.prepareForEink.mock.calls[0][1];
      expect(prepared).toBe(
        `${TEST_PICTURES_DIR}/openclipart-340609.png`,
      );
      const kept =
        `${TEST_PICTURES_DIR}/openclipart-340609.original.png`;
      expect(await done).toEqual({ok: true, value: kept});
      const written = native.downloadToFile.mock.calls.map(call => call[1]);
      expect(written).toEqual([
        '/data/plugin/insert-openclipart-340609.png',
        kept,
      ]);
      expect(written).not.toContain(prepared);
      expect(logLines().join('\n')).toMatch(/TIMEOUT/);
      // Recorded unprepared: a later contour insert prepares it again.
      expect(pictures.records[0]).toMatchObject({
        path: kept,
        contour: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('inserts a picture the store already holds from disk (#48)', async () => {
    const path = `${TEST_PICTURES_DIR}/openclipart-340609.png`;
    pictures.known.set(knownKey(result.id, false), {path, width: 640, height: 593});
    expect(await insertPicture(result, 'soup')).toEqual({
      ok: true,
      value: path,
    });
    expect(native.downloadToFile).not.toHaveBeenCalled();
    expect(image.prepareForEink).not.toHaveBeenCalled();
    expect(PluginNoteAPI.insertImage).toHaveBeenCalledWith(path);
  });

  it('places the picture at the lasso, else falls back to insertImage (#20)', async () => {
    const place = {
      rect: {left: 100, top: 200, right: 300, bottom: 260},
      page: 3,
      pageSize: {width: 1920, height: 2560},
    };
    (PluginCommAPI.createElement as jest.Mock).mockResolvedValue({
      success: true,
      result: {uuid: 'u'},
    });
    (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({
      success: true,
      result: true,
    });
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    const [elements, page, layer] = (
      PluginCommAPI.insertPageElements as jest.Mock
    ).mock.calls[0];
    expect([page, layer]).toEqual([3, 0]);
    expect(elements[0]).toMatchObject({
      type: 200,
      pageNum: 3,
      // Below the word, never over it (#39).
      picture: {rect: {left: 100, top: 284, right: 740, bottom: 877}},
    });
    expect(PluginNoteAPI.insertImage).not.toHaveBeenCalled();

    (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({
      success: false,
      error: {code: 107, message: 'bad element'},
    });
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    expect(PluginNoteAPI.insertImage).toHaveBeenCalled();
  });

  it('fails at place when insertImage answers false, and records nothing (#47)', async () => {
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: true,
      result: false,
    });
    const done = await insertPicture(result, 'soup');
    expect(done).toMatchObject({ok: false, step: 'place'});
    expect(pictures.records).toEqual([]);
  });

  it('falls back to insertImage when the lasso leaves no visible band (#47)', async () => {
    const place = {
      rect: {left: 100, top: 40, right: 300, bottom: 2500},
      page: 1,
      pageSize: {width: 1920, height: 2560},
    };
    (PluginCommAPI.createElement as jest.Mock).mockResolvedValue({
      success: true,
      result: {uuid: 'u'},
    });
    (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({
      success: true,
      result: true,
    });
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    expect(PluginCommAPI.insertPageElements).not.toHaveBeenCalled();
    expect(PluginNoteAPI.insertImage).toHaveBeenCalled();
  });
});

describe('the inserted picture is left lassoed (#73)', () => {
  // The whole page was read and holds only the word: nothing else is under the picture (#168).
  const place = {
    rect: {left: 100, top: 200, right: 300, bottom: 260},
    page: 3,
    pageSize: {width: 1920, height: 2560},
    occupied: [{left: 110, top: 210, right: 290, bottom: 250}],
  };
  const placedRect = {left: 100, top: 284, right: 740, bottom: 877};
  const lasso = PluginCommAPI.lassoElements as jest.Mock;

  beforeEach(() => {
    (PluginCommAPI.createElement as jest.Mock).mockResolvedValue({
      success: true,
      result: {uuid: 'u'},
    });
    (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({
      success: true,
      result: true,
    });
    lasso.mockResolvedValue({success: true, result: true});
  });

  it('lassoes the placed rect, the picture alone, after the insert', async () => {
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    // The picture's rect, below the word: the handwriting is not selected (#39).
    expect(lasso).toHaveBeenCalledWith(placedRect);
    expect(lasso.mock.invocationCallOrder[0]).toBeGreaterThan(
      (PluginCommAPI.insertPageElements as jest.Mock).mock
        .invocationCallOrder[0],
    );
  });

  it('keeps the insert when the lasso fails, throws or answers false', async () => {
    lasso.mockResolvedValueOnce({
      success: false,
      error: {code: 904, message: 'no lasso context'},
    });
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    lasso.mockRejectedValueOnce(new Error('host gone'));
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    lasso.mockResolvedValueOnce({success: true, result: false});
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
  });

  it('never lassoes ink: strokes under the picture, or a page not wholly read, skip it (#168)', async () => {
    // A line of handwriting fills the page below the word, so the picture lands over it.
    const full = {
      ...place,
      occupied: [{left: 0, top: 262, right: 1920, bottom: 2560}],
    };
    expect((await insertPicture(result, 'soup', full)).ok).toBe(true);
    expect(lasso).not.toHaveBeenCalled();
    expect(logLines().join('\n')).toMatch(
      /lassoElements: skipped, 1 other elements in the rect/,
    );
    const unread = {rect: place.rect, page: place.page, pageSize: place.pageSize};
    expect((await insertPicture(result, 'soup', unread)).ok).toBe(true);
    expect(lasso).not.toHaveBeenCalled();
    expect(logLines().join('\n')).toMatch(/the page's ink is not known/);
  });

  it('skips the lasso when the host placed the picture with insertImage', async () => {
    expect((await insertPicture(result, 'soup')).ok).toBe(true);
    expect(lasso).not.toHaveBeenCalled();
  });

  it('does not lasso a failed insert', async () => {
    (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({
      success: false,
      error: {code: 107, message: 'bad element'},
    });
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: true,
      result: false,
    });
    expect((await insertPicture(result, 'soup', place)).ok).toBe(false);
    expect(lasso).not.toHaveBeenCalled();
  });
});

describe('the insert options from Settings (#70)', () => {
  const place = {
    rect: {left: 100, top: 200, right: 300, bottom: 260},
    page: 3,
    pageSize: {width: 1920, height: 2560},
  };
  const insertElements = PluginCommAPI.insertPageElements as jest.Mock;
  const remove = PluginCommAPI.deleteLassoElements as jest.Mock;
  const placedAt = () => insertElements.mock.calls[0][0][0].picture.rect;

  beforeEach(() => {
    (PluginCommAPI.createElement as jest.Mock).mockResolvedValue({
      success: true,
      result: {uuid: 'u'},
    });
    insertElements.mockResolvedValue({success: true, result: true});
    (PluginCommAPI.lassoElements as jest.Mock).mockResolvedValue({
      success: true,
      result: true,
    });
    remove.mockResolvedValue({success: true, result: true});
  });

  it('prepares the picture at the chosen width', async () => {
    await insertPicture(result, 'soup', place, false, {
      width: 960,
      placement: 'below',
      contour: false,
    });
    expect(image.prepareForEink.mock.calls[0][2]).toBe(960);
  });

  it('inserts the picture as its tile shows it under All contour: a photo shown as found stays a photo (#104)', async () => {
    const allContour = {width: 640, placement: 'below' as const, contour: true};
    await insertPicture(result, 'soup', place, false, allContour);
    expect(image.prepareForEink.mock.calls[0][4]).toBe(false);
    await insertPicture(result, 'soup', place, true, allContour);
    expect(image.prepareForEink.mock.calls[1][4]).toBe(true);
  });

  it('shrinks a larger library picture to the chosen width', async () => {
    const local = {
      ...result,
      localPath: '/l.png',
      localSize: {width: 960, height: 900},
    };
    await insertPicture(local, 'soup', place, false, {
      width: 480,
      placement: 'below',
      contour: false,
    });
    const rect = placedAt();
    expect(rect.right - rect.left).toBe(480);
    expect(rect.bottom - rect.top).toBe(450);
  });

  it('deletes the word after the picture is placed at it, in place of the word', async () => {
    expect(
      (
        await insertPicture(result, 'soup', place, false, {
          width: 640,
          placement: 'replace',
          contour: false,
        })
      ).ok,
    ).toBe(true);
    expect(placedAt().top).toBe(200);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.invocationCallOrder[0]).toBeGreaterThan(
      insertElements.mock.invocationCallOrder[0],
    );
  });

  it('lassoes the picture in place of the word once the word is deleted (#168)', async () => {
    remove.mockResolvedValue({success: true, result: true});
    const word = {...place, occupied: [{left: 110, top: 210, right: 290, bottom: 250}]};
    await insertPicture(result, 'soup', word, false, {
      width: 640,
      placement: 'replace',
      contour: false,
    });
    expect(PluginCommAPI.lassoElements).toHaveBeenCalledTimes(1);
  });

  it('keeps the word when the insert fails or the picture is not at it', async () => {
    const options = {
      width: 640,
      placement: 'replace' as const,
      contour: false,
    };
    insertElements.mockResolvedValue({success: true, result: false});
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: true,
      result: false,
    });
    expect(
      (await insertPicture(result, 'soup', place, false, options)).ok,
    ).toBe(false);
    // The host placed it with insertImage: not at the word.
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: true,
      result: true,
    });
    expect(
      (await insertPicture(result, 'soup', place, false, options)).ok,
    ).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it('Insert best picture never deletes the word, even in place of it (#106)', async () => {
    pictures = testPictures({placement: 'replace'});
    expect((await wordKeptOptions()).placement).toBe('below');
    const inserted = await insertBest('soup', place, {
      search: jest.fn().mockResolvedValue({
        outcome: {
          results: [result],
          statuses: {},
          sourceDown: false,
          allFailed: false,
        },
        thumbDir: '/p',
      }),
      measure: jest.fn().mockResolvedValue(unmeasured([result])),
      insert: insertPicture,
      record: jest.fn().mockResolvedValue(null),
      early: jest.fn().mockReturnValue(null),
      options: wordKeptOptions,
    }, TEST_COPY);
    expect(inserted.ok).toBe(true);
    // Below the word, as «Below» places it; the word stays.
    expect(placedAt().top).toBeGreaterThanOrEqual(place.rect.bottom);
    expect(remove).not.toHaveBeenCalled();
  });

  it('never deletes the word below or beside it', async () => {
    for (const placement of ['below', 'beside'] as const) {
      await insertPicture(result, 'soup', place, false, {
        width: 640,
        placement,
        contour: false,
      });
    }
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('«Insert Sticker» pastes a sticker made of pen strokes (#35, D62 A)', () => {
  const sticker = {width: 640, placement: 'below' as const, contour: false, sticker: true};
  const convert = PluginCommAPI.convertElement2Sticker as jest.Mock;
  const paste = PluginCommAPI.insertSticker as jest.Mock;
  const accessor = () => ({add: jest.fn().mockResolvedValue(true)});
  /** A 4 x 4 ink square in an 8 x 8 picture, as the image module's mask. */
  const square = Array.from({length: 8}, (_, y) =>
    Array.from({length: 8}, (__, x) => (x >= 2 && x < 6 && y >= 2 && y < 6 ? '1' : '0')).join(''),
  ).join('');

  beforeEach(() => {
    (PluginManager.getDeviceType as jest.Mock).mockResolvedValue(5);
    (PluginCommAPI.createElement as jest.Mock).mockImplementation(async () => ({
      success: true,
      result: {
        uuid: 'u',
        stroke: {points: accessor(), pressures: accessor(), flagDraw: accessor()},
      },
    }));
    (image as Record<string, jest.Mock>).readInkMask = jest
      .fn()
      .mockResolvedValue({width: 8, height: 8, rows: square});
    convert.mockResolvedValue({success: true, result: true});
    paste.mockResolvedValue({success: true, result: true});
    (FileUtils.exists as jest.Mock).mockResolvedValue(false);
    (FileUtils.makeDir as jest.Mock).mockResolvedValue(true);
  });

  it('traces the picture into strokes, writes them as a .sticker file and pastes it, never as an image', async () => {
    const done = await insertPicture(result, 'ladle', null, false, sticker);
    expect(done.ok).toBe(true);
    expect(PluginCommAPI.createElement).toHaveBeenCalledWith(0);
    const [params] = convert.mock.calls[0];
    expect(params.machineType).toBe(5);
    // In the plugin's stickers folder under MyStyle, which the Sticker plugin's import lists (#35).
    expect(params.stickerPath).toBe('/storage/emulated/0/MyStyle/Test/stickers/openclipart-340609.sticker');
    expect(FileUtils.makeDir).toHaveBeenCalledWith('/storage/emulated/0/MyStyle/Test/stickers');
    expect(params.elements).toHaveLength(1);
    expect(params.elements[0].stroke.penType).toBe(10);
    // The square's outline: its 4 corners and the closing point.
    expect(params.elements[0].stroke.points.add).toHaveBeenCalledTimes(5);
    expect(paste).toHaveBeenCalledWith(params.stickerPath);
    expect(PluginNoteAPI.insertImage).not.toHaveBeenCalled();
    expect(logLines().join('\n')).toMatch(/sticker: 1 strokes, 5 points, from trace/);
  });

  it('inserts a picture when the sticker fails, and the picture insert never asks for a sticker', async () => {
    convert.mockResolvedValue({success: true, result: false});
    await insertPicture(result, 'ladle', null, false, sticker);
    expect(paste).not.toHaveBeenCalled();
    expect(PluginNoteAPI.insertImage).toHaveBeenCalledTimes(1);
    expect(logLines().join('\n')).toMatch(/convertElement2Sticker answered false; inserted as a picture/);
    convert.mockClear();
    await insertPicture(result, 'ladle', null, false, {...sticker, sticker: false});
    expect(convert).not.toHaveBeenCalled();
    expect(PluginNoteAPI.insertImage).toHaveBeenCalledTimes(2);
  });

  it('inserts a picture when the picture has no ink to trace', async () => {
    (image as Record<string, jest.Mock>).readInkMask.mockResolvedValue({
      width: 8,
      height: 8,
      rows: '0'.repeat(64),
    });
    await insertPicture(result, 'ladle', null, false, sticker);
    expect(convert).not.toHaveBeenCalled();
    expect(PluginNoteAPI.insertImage).toHaveBeenCalledTimes(1);
    expect(logLines().join('\n')).toMatch(/no ink to trace; inserted as a picture/);
  });

  it('takes the strokes from a Commons SVG original when there is one', async () => {
    const svg: SearchResult = {
      ...result,
      id: 'commons:7',
      source: 'commons',
      mime: 'image/svg+xml',
      original: {url: 'https://upload.wikimedia.org/a.svg', width: 512},
    };
    native.readText.mockImplementation(async (file: string) =>
      file.endsWith('.svg') ? '<svg><rect x="0" y="0" width="10" height="5"/></svg>' : null,
    );
    const done = await insertPicture(svg, 'box', null, false, sticker);
    expect(done.ok).toBe(true);
    expect(native.downloadToFile).toHaveBeenCalledWith(
      'https://upload.wikimedia.org/a.svg',
      expect.stringMatching(/commons-7-vector\.svg$/),
      expect.anything(),
    );
    expect(logLines().join('\n')).toMatch(/sticker: 1 strokes, 5 points, from svg/);
  });

  it('refuses a sticker from an SVG of raster pictures in a frame, puts the picture in and says so once (device round 6)', async () => {
    const svg: SearchResult = {
      ...result,
      id: 'commons:8',
      source: 'commons',
      mime: 'image/svg+xml',
      original: {url: 'https://upload.wikimedia.org/b.svg', width: 512},
    };
    native.readText.mockImplementation(async (file: string) =>
      file.endsWith('.svg')
        ? '<svg><rect x="0" y="0" width="10" height="5"/><image href="data:image/png;base64,AA" width="10" height="5"/></svg>'
        : null,
    );
    const stickerRefused = jest.fn();
    pictures = {...pictures, stickerRefused};
    const done = await insertPicture(svg, 'apple', null, false, sticker);
    expect(done.ok).toBe(true);
    expect(convert).not.toHaveBeenCalled();
    expect(paste).not.toHaveBeenCalled();
    expect(PluginNoteAPI.insertImage).toHaveBeenCalledTimes(1);
    expect(stickerRefused).toHaveBeenCalledTimes(1);
  });

  it('pastes nothing when the stickers folder cannot be made', async () => {
    (FileUtils.makeDir as jest.Mock).mockResolvedValue(false);
    await insertPicture(result, 'ladle', null, false, sticker);
    expect(convert).not.toHaveBeenCalled();
    expect(PluginNoteAPI.insertImage).toHaveBeenCalledTimes(1);
    expect(logLines().join('\n')).toMatch(/stickers could not be made; inserted as a picture/);
  });
});
