import {
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import * as lasso from '../src/official';
import * as note from '../src/official';
import * as page from '../src/official';
import * as plugin from '../src/official';
import {THROWN_CODE} from '../src/official';

const sdkFailure = {success: false, error: {code: 904, message: 'no lasso'}};
const success = (result: unknown) => ({success: true, result});
const mocked = (fn: unknown) => fn as jest.Mock;

beforeEach(() => jest.resetAllMocks());

/** Wrappers over calls that answer with the SDK's {success, result, error} shape. */
const responseCalls: [string, jest.Mock, () => Promise<unknown>, unknown][] = [
  [
    'getLassoElements',
    mocked(PluginCommAPI.getLassoElements),
    () => lasso.getLassoElements(),
    [],
  ],
  [
    'getLassoRect',
    mocked(PluginCommAPI.getLassoRect),
    () => lasso.getLassoRect(),
    {left: 1},
  ],
  [
    'setLassoBoxState',
    mocked(PluginCommAPI.setLassoBoxState),
    () => lasso.setLassoBoxState(lasso.LASSO_BOX.remove),
    true,
  ],
  [
    'insertGeometry',
    mocked(PluginCommAPI.insertGeometry),
    () => page.insertGeometry({type: 'GEO_circle'}),
    true,
  ],
  [
    'deletePageElements',
    mocked(PluginCommAPI.deletePageElements),
    () => page.deletePageElements([3], 0),
    true,
  ],
  [
    'setLassoTitle',
    mocked(PluginNoteAPI.setLassoTitle),
    () => note.setLassoTitle(note.TITLE_STYLE.shadow),
    true,
  ],
  [
    'resizeLassoRect',
    mocked(PluginCommAPI.resizeLassoRect),
    () => lasso.resizeLassoRect({left: 0, top: 10, right: 1404, bottom: 90}),
    true,
  ],
  [
    'saveStickerByLasso',
    mocked(PluginCommAPI.saveStickerByLasso),
    () => lasso.saveStickerByLasso('/plugin/collection-1.sticker'),
    true,
  ],
  [
    'recognizeElements',
    mocked(PluginCommAPI.recognizeElements),
    () => lasso.recognizeElements([], {width: 1, height: 1}),
    'soup',
  ],
  [
    'insertImage',
    mocked(PluginNoteAPI.insertImage),
    () => note.insertImage('/a.png'),
    true,
  ],
  [
    'insertText',
    mocked(PluginNoteAPI.insertText),
    () =>
      note.insertText({
        text: 'fruto',
        rect: {left: 1, top: 2, right: 3, bottom: 4},
        fontSize: 32,
      }),
    true,
  ],
  [
    'getCurrentFilePath',
    mocked(PluginCommAPI.getCurrentFilePath),
    () => page.getCurrentFilePath(),
    '/Note/a.note',
  ],
  [
    'getCurrentPageNum',
    mocked(PluginCommAPI.getCurrentPageNum),
    () => page.getCurrentPageNum(),
    0,
  ],
  [
    'getPageSize',
    mocked(PluginFileAPI.getPageSize),
    () => page.getPageSize('/Note/a.note', 0),
    {width: 1920, height: 2560},
  ],
  [
    'insertElements by path (#312)',
    mocked(PluginFileAPI.insertElements),
    () => page.insertElements('/Note/a.note', 1, []),
    true,
  ],
  [
    'modifyElements by path (#312)',
    mocked(PluginFileAPI.modifyElements),
    () => page.modifyElements('/Note/a.note', 1, []),
    [3],
  ],
  [
    'deleteElements by path (#312)',
    mocked(PluginFileAPI.deleteElements),
    () => page.deleteElements('/Note/a.note', 1, [3]),
    true,
  ],
  [
    'removeNotePage (#312)',
    mocked(PluginFileAPI.removeNotePage),
    () => page.removeNotePage('/Note/a.note', 1),
    true,
  ],
  [
    'getNoteTotalPageNum (#312)',
    mocked(PluginFileAPI.getNoteTotalPageNum),
    () => page.getNoteTotalPageNum('/Note/a.note'),
    3,
  ],
];

describe.each(responseCalls)('%s', (_name, sdkCall, wrapper, value) => {
  it('returns the value on success', async () => {
    sdkCall.mockResolvedValue(success(value));
    expect(await wrapper()).toEqual({ok: true, value});
  });

  it('keeps the SDK error code', async () => {
    sdkCall.mockResolvedValue(sdkFailure);
    expect(await wrapper()).toEqual({
      ok: false,
      code: 904,
      message: 'no lasso',
    });
  });

  it('turns a thrown error into a failure', async () => {
    sdkCall.mockRejectedValue(new Error('bridge down'));
    expect(await wrapper()).toEqual({
      ok: false,
      code: THROWN_CODE,
      message: 'bridge down',
    });
  });
});

describe('Headings calls (#252)', () => {
  it('passes the title style as the SDK params object', async () => {
    mocked(PluginNoteAPI.setLassoTitle).mockResolvedValue(success(true));
    await note.setLassoTitle(note.TITLE_STYLE.black);
    expect(PluginNoteAPI.setLassoTitle).toHaveBeenCalledWith({style: 1});
  });

  it('numbers the styles as the SDK does, 0 removing the title', () => {
    expect(note.TITLE_STYLE).toEqual({none: 0, black: 1, lightGrey: 2, darkGrey: 3, shadow: 4});
  });

  it('passes the page rect to resizeLassoRect unchanged', async () => {
    const rect = {left: 0, top: 10, right: 1404, bottom: 90};
    mocked(PluginCommAPI.resizeLassoRect).mockResolvedValue(success(true));
    await lasso.resizeLassoRect(rect);
    expect(PluginCommAPI.resizeLassoRect).toHaveBeenCalledWith(rect);
  });
});

describe('plain-value calls', () => {
  it('unregisters a button, and fails on a false answer or a throw (#115)', async () => {
    mocked(PluginManager.unregisterButton).mockResolvedValue(true);
    expect(await plugin.unregisterButton(400)).toEqual({ok: true, value: true});
    mocked(PluginManager.unregisterButton).mockResolvedValue(false);
    expect((await plugin.unregisterButton(400)).ok).toBe(false);
    mocked(PluginManager.unregisterButton).mockRejectedValue(new Error('gone'));
    expect((await plugin.unregisterButton(400)).ok).toBe(false);
  });

  it('reads permissions as granted or not', async () => {
    mocked(PluginManager.hasPermission).mockResolvedValue(1);
    expect(await plugin.hasPermission(plugin.PERMISSION_INTERNET)).toEqual({
      ok: true,
      value: true,
    });
    mocked(PluginManager.hasPermission).mockResolvedValue(0);
    expect(await plugin.hasPermission(plugin.PERMISSION_INTERNET)).toEqual({
      ok: true,
      value: false,
    });
  });

  it('reads the always-allowed answer 2 as granted (#34)', async () => {
    mocked(PluginManager.hasPermission).mockResolvedValue(2);
    expect(await plugin.hasPermission(plugin.PERMISSION_INTERNET)).toEqual({
      ok: true,
      value: true,
    });
  });

  it('passes the permission answer through', async () => {
    mocked(PluginManager.requestPermission).mockResolvedValue(2);
    expect(
      await plugin.requestPermission(plugin.PERMISSION_FILE_WRITE),
    ).toEqual({
      ok: true,
      value: 2,
    });
  });

  it('fails when the plugin directory is missing', async () => {
    mocked(PluginManager.getPluginDirPath).mockResolvedValue(null);
    expect((await plugin.getPluginDirPath()).ok).toBe(false);
    mocked(PluginManager.getPluginDirPath).mockResolvedValue('/data/plugins/x');
    expect(await plugin.getPluginDirPath()).toEqual({
      ok: true,
      value: '/data/plugins/x',
    });
  });

  it('reports a view that cannot close', async () => {
    mocked(PluginManager.closePluginView).mockRejectedValue(
      new Error('no view'),
    );
    expect((await plugin.closePluginView()).ok).toBe(false);
  });
});

describe('numeric answers (#23)', () => {
  it('fails instead of reporting NaN when the host answers nothing', async () => {
    mocked(PluginManager.requestPermission).mockResolvedValue(undefined);
    expect(
      (await plugin.requestPermission(plugin.PERMISSION_INTERNET)).ok,
    ).toBe(false);
    mocked(PluginManager.hasPermission).mockResolvedValue(null);
    expect((await plugin.hasPermission(plugin.PERMISSION_INTERNET)).ok).toBe(
      false,
    );
  });
});

describe('the editor helper calls (#312)', () => {
  const rect = {left: 100, top: 200, right: 300, bottom: 400};

  it('reads one element by its number, and an empty answer is a failure', async () => {
    mocked(PluginFileAPI.getElement).mockResolvedValue(success({type: 500}));
    expect(await page.getElement('/Note/a.note', 0, 4)).toEqual({ok: true, value: {type: 500}});
    expect(PluginFileAPI.getElement).toHaveBeenCalledWith('/Note/a.note', 0, 4);
    mocked(PluginFileAPI.getElement).mockResolvedValue(success(null));
    expect(await page.getElement('/Note/a.note', 0, 4)).toMatchObject({ok: false, message: 'page 0 has no element 4'});
  });

  it("places a picture's and a text box's rect", async () => {
    const picture = {type: 200, picture: {rect: {left: 0, top: 0, right: 1, bottom: 1}}};
    expect(await page.placeElement(picture, rect)).toEqual({ok: true, value: {type: 200, picture: {rect}}});
    const text = {type: 500, textBox: {textRect: {left: 0, top: 0, right: 1, bottom: 1}}};
    expect(await page.placeElement(text, rect)).toEqual({ok: true, value: {type: 500, textBox: {textRect: rect}}});
  });

  it("maps a stroke's points from their bounds to the rect, in one setRange", async () => {
    const setRange = jest.fn(async () => true);
    const points = [{x: 0, y: 0}, {x: 10, y: 20}];
    const stroke = {type: 0, stroke: {points: {size: async () => 2, getRange: async () => points, setRange}}};
    expect((await page.placeElement(stroke, rect)).ok).toBe(true);
    expect(setRange).toHaveBeenCalledWith(0, 2, [{x: 100, y: 200}, {x: 300, y: 400}]);
  });

  it('refuses to place an element it cannot move, and a stroke whose write fails', async () => {
    expect((await page.placeElement({type: 700}, rect)).ok).toBe(false);
    const stroke = {type: 0, stroke: {points: {size: async () => 1, getRange: async () => [{x: 1, y: 1}], setRange: async () => false}}};
    expect(await page.placeElement(stroke, rect)).toMatchObject({ok: false, message: 'setRange did not write the points'});
  });

  it('builds a picture element with its file and rect', async () => {
    mocked(PluginCommAPI.createElement).mockResolvedValue(success({type: 200}));
    expect(await page.buildElement({kind: 'picture', file: '/x/p.png', rect})).toEqual({
      ok: true,
      value: {type: 200, picture: {picturePath: '/x/p.png', rect}},
    });
    expect(PluginCommAPI.createElement).toHaveBeenCalledWith(200);
  });
});
