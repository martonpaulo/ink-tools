/** The Styles grid (#133): order, the remembered style, the toggles and the cleanup. */
import {ok, PICTURE_TYPE} from '@ink-tools/sn-adapter/official';
import {EditDeps} from '../src/edit';
import {
  changedBy,
  closeStyles,
  gridState,
  openStyles,
  orderStyles,
  parseMemory,
  pickStyle,
  stylesPath,
  toggleOption,
} from '../src/styles';
import {STYLE_ORDER} from '../src/edits';
import {RetouchNative} from '../src/native';

const RETOUCH_DIR = '/data/user/0/com.ratta.supernote.pluginhost/files/plugins/retouch/work';
const STYLES_PATH = stylesPath(RETOUCH_DIR);

const RECT = {left: 100, top: 200, right: 500, bottom: 500};

/** One lassoed picture, a file store and a Java module that writes each requested PNG. */
function world(stored: Record<string, string> = {}, failing: string[] = []) {
  const files = new Map<string, string>(Object.entries(stored));
  const element = {type: PICTURE_TYPE, layerNum: 1, picture: {rect: {...RECT}}};
  let clock = 1000;
  const native: RetouchNative = {
    edit: jest.fn(async (style, _src, _before, dest) => {
      if (failing.includes(style)) {
        return {ok: false as const, code: -1, message: 'broken'};
      }
      files.set(dest, 'png');
      return ok({width: 400, height: 300, left: 0, top: 0, ms: 5});
    }),
    crop: jest.fn(),
    erase: jest.fn(),
    setDebugFolder: jest.fn(async () => ok(true)),
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
    modify: jest.fn(async () => ok([3])),
    native,
    now: () => (clock += 10),
    log: jest.fn(),
  };
  const pngs = () =>
    [...files.keys()].filter(k => k.endsWith('.png') && k.includes('style'));
  return {files, deps, native, pngs};
}

const styleOf = () => {
  const state = gridState();
  return state.phase === 'ready' ? state.tiles.map(tile => tile.style) : [];
};

afterEach(async () => {
  await closeStyles(() => {}, world().deps);
});

test('the last style chosen leads, when it is still switched on', () => {
  expect(orderStyles(STYLE_ORDER, 'dither')).toEqual([
    'dither',
    'photo',
    'line_art',
    'black_white',
    'atkinson',
  ]);
  expect(orderStyles(['photo', 'line_art'], 'dither')).toEqual([
    'photo',
    'line_art',
  ]);
  expect(orderStyles(STYLE_ORDER, null)[0]).toBe('photo');
});

test('a missing, bad or unknown styles.json is a fresh start, never a crash', () => {
  expect(parseMemory(null)).toEqual({
    last: null,
    transparent: false,
    thick: false,
  });
  expect(parseMemory('{oops')).toBeNull();
  expect(parseMemory('{"last":"sepia","thick":true}')).toEqual({
    last: null,
    transparent: false,
    thick: true,
  });
});

test('Thicker lines changes only Line art; White to transparent changes every tile', () => {
  expect(changedBy('thick', STYLE_ORDER)).toEqual(['line_art']);
  expect(changedBy('transparent', STYLE_ORDER)).toEqual([...STYLE_ORDER]);
});

test('the grid renders every enabled style once, the remembered one first, with its options', async () => {
  const w = world({[STYLES_PATH]: '{"last":"black_white","transparent":true}'});
  await openStyles(['photo', 'line_art', 'black_white'], w.deps);
  expect(styleOf()).toEqual(['black_white', 'photo', 'line_art']);
  expect(w.deps.preview).toHaveBeenCalledTimes(1);
  const calls = (w.native.edit as jest.Mock).mock.calls;
  expect(calls).toHaveLength(3);
  // A preview keeps no «before» file and passes the remembered options.
  expect(calls[0].slice(2, 3)).toEqual(['']);
  expect(calls[0].slice(7)).toEqual([true, false]);
  expect(
    calls.every(call => String(call[3]).startsWith(`${RETOUCH_DIR}/style-`)),
  ).toBe(true);
});

test('a style whose preview fails leaves its tile out; none at all is a failure', async () => {
  const w = world({}, ['dither']);
  await openStyles(['photo', 'dither'], w.deps);
  expect(styleOf()).toEqual(['photo']);
  await closeStyles(() => {}, w.deps);
  const none = world({}, ['photo']);
  await openStyles(['photo'], none.deps);
  expect(gridState().phase).toBe('failed');
  expect(none.files.size).toBe(0);
});

test('a lasso that is not one picture makes no file and fails', async () => {
  const w = world();
  w.deps.lassoElements = jest.fn(async () => ok([]));
  await openStyles(STYLE_ORDER, w.deps);
  expect(gridState().phase).toBe('failed');
  expect(w.native.edit).not.toHaveBeenCalled();
});

test('Thicker lines renders Line art again, in its place, and drops its old file', async () => {
  const w = world();
  await openStyles(['photo', 'line_art', 'dither'], w.deps);
  const before = w.pngs();
  (w.native.edit as jest.Mock).mockClear();
  await toggleOption('thick', w.deps);
  const calls = (w.native.edit as jest.Mock).mock.calls;
  expect(calls.map(call => call[0])).toEqual(['line_art']);
  expect(calls[0].slice(7)).toEqual([false, true]);
  expect(styleOf()).toEqual(['photo', 'line_art', 'dither']);
  expect(w.pngs()).toHaveLength(before.length);
  const state = gridState();
  expect(state.phase === 'ready' && state.options.thick).toBe(true);
});

test('a tap runs the style on the page, remembers it, then deletes every preview', async () => {
  const w = world();
  await openStyles(['photo', 'dither'], w.deps);
  await toggleOption('transparent', w.deps);
  const close = jest.fn();
  const done = await pickStyle('dither', close, w.deps);
  expect(done?.kind).toBe('edited');
  expect(w.deps.modify).toHaveBeenCalledTimes(1);
  expect(JSON.parse(w.files.get(STYLES_PATH)!)).toEqual({
    last: 'dither',
    transparent: true,
    thick: false,
  });
  expect(w.pngs()).toEqual([]);
  expect(close).toHaveBeenCalled();
  expect(gridState().phase).toBe('idle');
});

test('Close changes nothing on the page and deletes the previews', async () => {
  const w = world();
  await openStyles(STYLE_ORDER, w.deps);
  expect(w.pngs().length).toBe(STYLE_ORDER.length + 1);
  const close = jest.fn();
  await closeStyles(close, w.deps);
  expect(w.deps.modify).not.toHaveBeenCalled();
  expect(w.files.has(STYLES_PATH)).toBe(false);
  expect(w.pngs()).toEqual([]);
  expect(close).toHaveBeenCalled();
});
