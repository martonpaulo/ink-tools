import {
  fail,
  MODULE_CODE,
  ok,
  PICTURE_TYPE,
  THROWN_CODE,
} from '@ink-tools/sn-adapter/official';
import {EditDeps, historyPath, runEdit} from '../src/edit';
import {parseHistory} from '../src/history';
import {NO_OPTIONS, RetouchNative} from '../src/native';

/** The private plugin folder's work/ (#198), as getPluginDirPath would give it. */
const RETOUCH_DIR = '/data/user/0/com.ratta.supernote.pluginhost/files/plugins/retouch/work';
const HISTORY_PATH = historyPath(RETOUCH_DIR);

const RECT = {left: 100, top: 200, right: 500, bottom: 500};

/** A page with one picture, a file store and a Java module that halves wide pictures. */
function world() {
  const files = new Map<string, string>();
  const element = {
    type: PICTURE_TYPE,
    numInPage: 3,
    layerNum: 1,
    picture: {rect: {...RECT}, picturePath: '/storage/emulated/0/.data/plugin/a.png'},
  };
  const modified: {path: string; rect: typeof RECT; layer: number | null}[] = [];
  let clock = 1000;
  const native: RetouchNative = {
    edit: jest.fn(async (_edit, src, before, dest, width, height, pageWidth) => {
      expect(files.has(src)).toBe(true);
      if (before) {
        files.set(before, 'png');
      }
      files.set(dest, 'png');
      const w = Math.min(width, pageWidth);
      const h = Math.round((height * w) / width);
      return ok({width: w, height: h, left: 0, top: 0, ms: 5});
    }),
    crop: jest.fn(async (src, before, dest, _w, _h, _left, _top, width, height) => {
      expect(files.has(src)).toBe(true);
      if (before) {
        files.set(before, 'png');
      }
      files.set(dest, 'png');
      return ok({width, height, left: _left, top: _top, ms: 5});
    }),
    erase: jest.fn(async (src, before, dest, width, height) => {
      expect(files.has(src)).toBe(true);
      if (before) {
        files.set(before, 'png');
      }
      files.set(dest, 'png');
      return ok({width, height, left: 0, top: 0, ms: 5});
    }),
    readText: jest.fn(async path => ok(files.get(path) ?? null)),
    writeText: jest.fn(async (path, text) => {
      files.set(path, text);
      return ok(null);
    }),
    deleteFile: jest.fn(async path => ok(files.delete(path) || true)),
    listDir: jest.fn(async () => ok(null)),
  };
  const deps: EditDeps = {
    workDir: async () => ok(RETOUCH_DIR),
    lassoElements: jest.fn(async () => ok([element])),
    notePath: async () => ok('/Note/a.note'),
    pageNum: async () => ok(0),
    pageWidth: async () => ok(1920),
    preview: jest.fn(async path => {
      files.set(path, 'png');
      return ok(path);
    }),
    modify: jest.fn(async (elements, _page, layer) => {
      const changed = elements[0] as typeof element;
      modified.push({path: changed.picture.picturePath, rect: changed.picture.rect, layer});
      element.picture = {...changed.picture};
      return ok([3]);
    }),
    native,
    now: () => (clock += 10),
    log: () => {},
  };
  const history = () => parseHistory(files.get(HISTORY_PATH) ?? null)!;
  const pngs = () => [...files.keys()].filter(k => k.endsWith('.png')).sort();
  return {files, element, modified, deps, native, history, pngs};
}

test('Enhance keeps the original, replaces the picture in place and removes the preview', async () => {
  const w = world();
  const done = await runEdit('enhance', w.deps);
  expect(done.kind).toBe('edited');
  expect(w.modified).toHaveLength(1);
  expect(w.modified[0].path).toMatch(new RegExp(`^${RETOUCH_DIR}/\\d+-enhance\\.png$`));
  expect(w.modified[0].rect).toEqual(RECT);
  expect(w.modified[0].layer).toBe(1);
  // The Java side crops the lasso margin to the picture's own size.
  expect(w.native.edit).toHaveBeenCalledWith(
    'enhance',
    expect.stringContaining('/preview-'),
    expect.stringMatching(/-original\.png$/),
    w.modified[0].path,
    400,
    300,
    1920,
    false,
    false,
  );
  const states = w.history().entries[0].states;
  expect(states.map(s => s.path)).toEqual([
    expect.stringMatching(/-original\.png$/),
    w.modified[0].path,
  ]);
  expect(w.pngs()).toEqual(states.map(s => s.path).sort());
});

test('every working file stays in the private plugin folder, out of Supernote Cloud sync (#198)', async () => {
  const w = world();
  await runEdit('enhance', w.deps);
  await runEdit('undo', w.deps);
  const written = [
    ...w.files.keys(),
    ...(w.deps.preview as jest.Mock).mock.calls.map(call => String(call[0])),
  ];
  expect(written.length).toBeGreaterThan(0);
  expect(written.filter(path => !path.startsWith(`${RETOUCH_DIR}/`))).toEqual([]);
});

test('no private plugin folder: the press fails and the page is left as it was (#198)', async () => {
  const w = world();
  w.deps.workDir = async () => fail(THROWN_CODE, 'getPluginDirPath returned nothing');
  const done = await runEdit('enhance', w.deps);
  expect(done).toEqual({
    kind: 'failed',
    why: `getPluginDirPath: ${THROWN_CODE} getPluginDirPath returned nothing`,
  });
  expect(w.modified).toEqual([]);
  expect(w.files.size).toBe(0);
});

test('a second edit saves no new original, and Undo then Restore bring the original back', async () => {
  const w = world();
  await runEdit('enhance', w.deps);
  await runEdit('lighter', w.deps);
  expect((w.native.edit as jest.Mock).mock.calls[1][2]).toBe('');
  const [original, enhanced] = w.history().entries[0].states;
  expect(await runEdit('undo', w.deps)).toMatchObject({kind: 'edited'});
  expect(w.element.picture.picturePath).toBe(enhanced.path);
  expect(await runEdit('restore', w.deps)).toMatchObject({kind: 'edited'});
  expect(w.element.picture.picturePath).toBe(original.path);
  expect(w.history().entries).toEqual([]);
  // The host copied every PNG it showed, so none is left behind.
  expect(w.pngs()).toEqual([]);
  expect(await runEdit('undo', w.deps)).toMatchObject({kind: 'nothing'});
});

test('Crop cuts to its box and keeps the kept area where it was on the page (#132)', async () => {
  const w = world();
  const box = {left: 40, top: 30, width: 120, height: 100};
  const done = await runEdit('crop', w.deps, {...NO_OPTIONS, box});
  expect(done.kind).toBe('edited');
  expect(w.native.crop).toHaveBeenCalledWith(
    expect.stringContaining('/preview-'),
    expect.stringMatching(/-original\.png$/),
    w.modified[0].path,
    400,
    300,
    40,
    30,
    120,
    100,
  );
  expect(w.native.edit).not.toHaveBeenCalled();
  expect(w.modified[0].rect).toEqual({left: 140, top: 230, right: 260, bottom: 330});
  // Undo brings the whole picture back at its old place.
  expect(await runEdit('undo', w.deps)).toMatchObject({kind: 'edited'});
  expect(w.modified[1].rect).toEqual(RECT);
});

test('Crop without its box fails before anything is read or written (#132)', async () => {
  const w = world();
  expect(await runEdit('crop', w.deps)).toEqual({kind: 'failed', why: 'Crop has no box'});
  expect(w.deps.preview).not.toHaveBeenCalled();
  expect(w.modified).toEqual([]);
});

test('Erase sends its marks and keeps the picture in place, with Undo (#134)', async () => {
  const w = world();
  const marks = {points: [10, 20, 30, 40, 50.5, 60], ends: [1, 3]};
  const done = await runEdit('erase', w.deps, {...NO_OPTIONS, marks});
  expect(done.kind).toBe('edited');
  expect(w.native.erase).toHaveBeenCalledWith(
    expect.stringContaining('/preview-'),
    expect.stringMatching(/-original\.png$/),
    w.modified[0].path,
    400,
    300,
    marks.points,
    marks.ends,
  );
  expect(w.native.edit).not.toHaveBeenCalled();
  expect(w.modified[0].rect).toEqual(RECT);
  expect(await runEdit('undo', w.deps)).toMatchObject({kind: 'edited'});
  expect(w.modified[1].rect).toEqual(RECT);
});

test('Erase without its marks fails before anything is read or written (#134)', async () => {
  const w = world();
  expect(await runEdit('erase', w.deps)).toEqual({kind: 'failed', why: 'Erase has no marks'});
  expect(w.deps.preview).not.toHaveBeenCalled();
  expect(w.modified).toEqual([]);
});

test('Enhance scales a picture wider than the page down to its width', async () => {
  const w = world();
  w.element.picture.rect = {left: 0, top: 0, right: 3000, bottom: 1500};
  await runEdit('enhance', w.deps);
  expect(w.modified[0].rect).toEqual({left: 0, top: 0, right: 1920, bottom: 960});
});

test('a lasso that is not one picture changes nothing', async () => {
  const w = world();
  (w.deps.lassoElements as jest.Mock).mockResolvedValueOnce(ok([{type: 0}]));
  expect(await runEdit('enhance', w.deps)).toMatchObject({kind: 'nothing'});
  (w.deps.lassoElements as jest.Mock).mockResolvedValueOnce(ok([w.element, w.element]));
  expect(await runEdit('enhance', w.deps)).toMatchObject({kind: 'nothing'});
  expect(w.modified).toEqual([]);
  expect(w.files.size).toBe(0);
});

test('a failed edit or replace leaves the page and the history as they were', async () => {
  const w = world();
  (w.native.edit as jest.Mock).mockResolvedValueOnce(fail(MODULE_CODE, 'too large', 'TOO_LARGE'));
  expect(await runEdit('enhance', w.deps)).toMatchObject({kind: 'failed'});
  (w.deps.modify as jest.Mock).mockResolvedValueOnce(fail(THROWN_CODE, 'refused'));
  expect(await runEdit('darker', w.deps)).toMatchObject({kind: 'failed'});
  expect(w.modified).toEqual([]);
  expect(w.files.has(HISTORY_PATH)).toBe(false);
  expect(w.pngs()).toEqual([]);
});

test('a delete the host refuses is logged and the edit still lands (#182)', async () => {
  const w = world();
  const lines: string[] = [];
  w.deps.log = line => lines.push(line);
  (w.native.deleteFile as jest.Mock).mockResolvedValue(
    fail(MODULE_CODE, 'IO: java.lang.SecurityException: has no DELETE permission', 'IO'),
  );
  expect(await runEdit('enhance', w.deps)).toMatchObject({kind: 'edited'});
  expect(lines).toContainEqual(
    expect.stringMatching(/^delete .*\/preview-\d+\.png: .*no DELETE permission$/),
  );
});

test('a history file that is not Retouch\'s is never written over', async () => {
  const w = world();
  w.files.set(HISTORY_PATH, 'not json');
  expect(await runEdit('enhance', w.deps)).toMatchObject({kind: 'failed'});
  expect(w.files.get(HISTORY_PATH)).toBe('not json');
  expect(w.modified).toEqual([]);
});

test('Rotate puts the turned picture at the same top left, and Undo turns it back (#131)', async () => {
  const w = world();
  (w.native.edit as jest.Mock).mockImplementationOnce(
    async (_edit, _src, before, dest, width, height) => {
      w.files.set(before, 'png');
      w.files.set(dest, 'png');
      return ok({width: height, height: width, left: 0, top: 0, ms: 5});
    },
  );
  expect(await runEdit('rotate', w.deps)).toMatchObject({kind: 'edited'});
  expect((w.native.edit as jest.Mock).mock.calls[0][0]).toBe('rotate');
  expect(w.modified[0].path).toMatch(/-rotate\.png$/);
  expect(w.modified[0].rect).toEqual({left: 100, top: 200, right: 400, bottom: 600});
  expect(await runEdit('undo', w.deps)).toMatchObject({kind: 'edited'});
  expect(w.modified[1].rect).toEqual(RECT);
});

test('Trim keeps the picture where it was on the page, less its margin (#132)', async () => {
  const w = world();
  (w.native.edit as jest.Mock).mockImplementationOnce(
    async (_edit, _src, before, dest) => {
      w.files.set(before, 'png');
      w.files.set(dest, 'png');
      return ok({width: 300, height: 200, left: 40, top: 30, ms: 5});
    },
  );
  expect(await runEdit('trim', w.deps)).toMatchObject({kind: 'edited'});
  expect(w.modified[0].rect).toEqual({
    left: 140,
    top: 230,
    right: 440,
    bottom: 430,
  });
  const [original, trimmed] = w.history().entries[0].states;
  expect(trimmed).toEqual({
    path: w.modified[0].path,
    width: 300,
    height: 200,
    left: 140,
    top: 230,
  });
  expect(original).toMatchObject({
    left: 100,
    top: 200,
    width: 400,
    height: 300,
  });
  // Undo puts the untrimmed picture back where it was, not at the trimmed top left.
  expect(await runEdit('undo', w.deps)).toMatchObject({kind: 'edited'});
  expect(w.modified[1].rect).toEqual(RECT);
});

test('Document runs as a pixel edit and is recorded in the history (#137)', async () => {
  const w = world();
  (w.native.edit as jest.Mock).mockImplementationOnce(
    async (_edit, _src, before, dest) => {
      w.files.set(before, 'png');
      w.files.set(dest, 'png');
      // The warp straightens the page to a smaller upright rectangle.
      return ok({width: 320, height: 240, left: 0, top: 0, ms: 5, quad: '12,9 380,4 391,290 8,296'});
    },
  );
  const lines: string[] = [];
  w.deps.log = line => lines.push(line);
  const done = await runEdit('document', w.deps);
  expect(done).toMatchObject({kind: 'edited', edit: 'document'});
  // The page quad the Java side found is logged, so a device round can check it (#137).
  expect(lines).toEqual([expect.stringMatching(/^document: done in \d+ ms; page quad 12,9 380,4 391,290 8,296$/)]);
  expect(w.native.edit).toHaveBeenCalledWith(
    'document',
    expect.stringContaining('/preview-'),
    expect.stringMatching(/-original\.png$/),
    expect.stringMatching(/-document\.png$/),
    400,
    300,
    1920,
    false,
    false,
  );
  const [, straightened] = w.history().entries[0].states;
  expect(straightened).toMatchObject({width: 320, height: 240});
});

test('A style passes its options to the Java side and is recorded as an edit (#133)', async () => {
  const w = world();
  const done = await runEdit('line_art', w.deps, {transparent: true, thick: true});
  expect(done).toMatchObject({kind: 'edited', edit: 'line_art'});
  expect(w.native.edit).toHaveBeenCalledWith(
    'line_art',
    expect.stringContaining('/preview-'),
    expect.stringMatching(/-original\.png$/),
    expect.stringMatching(/-line_art\.png$/),
    400,
    300,
    1920,
    true,
    true,
  );
  expect(await runEdit('undo', w.deps)).toMatchObject({kind: 'edited'});
});

// The SDK's own check of modifyPageElements' elements (sn-plugin-lib 0.2.3 VerifyUtils), which
// refused the lassoed picture's pageNum below 0 with 107 on beta 7 (#170). Required, not imported,
// so tsc never type-checks the SDK's own source; its element model needs the tablet's module.
jest.mock('../node_modules/sn-plugin-lib/src/module/NativePluginAPI', () => ({}));
const {ElementSchema, verifyParams} =
  require('../node_modules/sn-plugin-lib/src/sdk/utils/VerifyUtils') as {
    ElementSchema: object;
    verifyParams(schema: object, params: unknown, options: object): void;
  };

test.each(['enhance', 'undo'] as const)(
  '%s writes the page it read into pageNum, so the SDK takes a lassoed pageNum below 0 (#170)',
  async edit => {
    const w = world();
    (w.element as {pageNum?: number}).pageNum = -1;
    w.deps.pageNum = async () => ok(9);
    const pages: number[] = [];
    const modify = w.deps.modify;
    w.deps.modify = jest.fn(async (elements, page, layer) => {
      verifyParams({elements: {type: 'array', required: true, items: ElementSchema}}, {elements}, {
        allowUnknown: true,
        rootName: 'modifyPageElements',
      });
      pages.push((elements[0] as {pageNum: number}).pageNum);
      return modify(elements, page, layer);
    });
    if (edit === 'undo') {
      expect((await runEdit('enhance', w.deps)).kind).toBe('edited');
      (w.element as {pageNum?: number}).pageNum = -1;
    }
    expect((await runEdit(edit, w.deps)).kind).toBe('edited');
    expect(pages.every(page => page === 9)).toBe(true);
  },
);
