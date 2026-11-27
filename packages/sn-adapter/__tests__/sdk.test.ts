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

beforeEach(() => {
  jest.resetAllMocks();
  // A write on the open page saves the note first (#524); openPage.test.ts covers a failed save.
  mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue(success(true));
});

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
    'insertKeyWord by path (#346)',
    mocked(PluginFileAPI.insertKeyWord),
    () => page.insertKeyWord('/Note/a.note', 1, 'plan'),
    true,
  ],
  [
    'deleteKeyWord by path (#346)',
    mocked(PluginFileAPI.deleteKeyWord),
    () => page.deleteKeyWord('/Note/a.note', 1, 0),
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
    expect(await page.placeElement(picture, 0, rect)).toEqual({ok: true, value: {type: 200, pageNum: 0, picture: {rect}}});
    const text = {type: 500, textBox: {textRect: {left: 0, top: 0, right: 1, bottom: 1}}};
    expect(await page.placeElement(text, 0, rect)).toEqual({ok: true, value: {type: 500, pageNum: 0, textBox: {textRect: rect}}});
  });

  it("sets a text box's text and font size, and refuses any other element (#264)", () => {
    const text = {type: 500, textBox: {textRect: rect, textContentFull: 'old', fontSize: 40}};
    expect(page.retextElement(text, 'new\nline', 48)).toEqual({ok: true, value: {type: 500, textBox: {textRect: rect, textContentFull: 'new\nline', fontSize: 48}}});
    expect(page.retextElement({type: 0}, 'x', 40)).toMatchObject({ok: false, message: 'the element is not a text box'});
  });

  it("maps a stroke's points from their bounds to the rect, in one setRange", async () => {
    const setRange = jest.fn(async () => true);
    const points = [{x: 0, y: 0}, {x: 10, y: 20}];
    const stroke = {type: 0, stroke: {points: {size: async () => 2, getRange: async () => points, setRange}}};
    expect((await page.placeElement(stroke, 0, rect)).ok).toBe(true);
    expect(setRange).toHaveBeenCalledWith(0, 2, [{x: 100, y: 200}, {x: 300, y: 400}]);
  });

  it("moves a stroke's stored outline with its points, so the lasso finds it at its new place (#325)", async () => {
    const points = {size: async () => 2, getRange: async () => [{x: 0, y: 0}, {x: 10, y: 20}], setRange: jest.fn(async () => true)};
    const ring = [{x: 0.5, y: 0}, {x: 10, y: 20}];
    const setRange = jest.fn(async () => true);
    const stroke = {type: 0, contoursSrc: {size: async () => 1, getRange: async () => [ring], setRange}, stroke: {points}};
    expect((await page.placeElement(stroke, 0, rect)).ok).toBe(true);
    expect(setRange).toHaveBeenCalledWith(0, 1, [[{x: 110, y: 200}, {x: 300, y: 400}]]);
    setRange.mockResolvedValue(false);
    expect(await page.placeElement(stroke, 0, rect)).toMatchObject({ok: false, message: 'setRange did not write the outline'});
  });

  it("moves a stroke's stored box with its points, which a modify of the open note keeps as sent (#452)", async () => {
    const points = {size: async () => 2, getRange: async () => [{x: 0, y: 0}, {x: 10, y: 20}], setRange: jest.fn(async () => true)};
    const box = {up_left_point_x: -1, up_left_point_y: -1, down_right_point_x: 11, down_right_point_y: 21, predict_name: 'others'};
    const stroke = {type: 0, recognizeResult: box, stroke: {points}};
    expect((await page.placeElement(stroke, 0, rect)).ok).toBe(true);
    expect(stroke.recognizeResult).toEqual({up_left_point_x: 80, up_left_point_y: 190, down_right_point_x: 320, down_right_point_y: 410, predict_name: 'others'});
    const unboxed = {type: 0, recognizeResult: null, stroke: {points}};
    expect(await page.placeElement(unboxed, 0, rect)).toMatchObject({ok: true, value: {recognizeResult: null}});
  });

  it('refuses to place an element it cannot move, and a stroke whose write fails', async () => {
    expect((await page.placeElement({type: 700}, 0, rect)).ok).toBe(false);
    const stroke = {type: 0, stroke: {points: {size: async () => 1, getRange: async () => [{x: 1, y: 1}], setRange: async () => false}}};
    expect(await page.placeElement(stroke, 0, rect)).toMatchObject({ok: false, message: 'setRange did not write the points'});
  });

  it("transforms a stroke's points, outline and box through a matrix: a quarter turn (#326)", async () => {
    const setRange = jest.fn(async () => true);
    const points = {size: async () => 2, getRange: async () => [{x: 100, y: 200}, {x: 300, y: 200}], setRange};
    const outline = jest.fn(async () => true);
    const ring = [{x: 100.5, y: 200}];
    const box = {up_left_point_x: 100, up_left_point_y: 190, down_right_point_x: 300, down_right_point_y: 210};
    const stroke = {
      type: 0,
      pageNum: -1,
      contoursSrc: {size: async () => 1, getRange: async () => [ring], setRange: outline},
      recognizeResult: box,
      stroke: {points},
    };
    // A quarter turn clockwise on the page: (x, y) to (1000 - y, x).
    const turned = await page.transformElement(stroke, 3, [0, 1, -1, 0, 1000, 0], {width: 1920, height: 2560});
    expect(turned).toMatchObject({ok: true, value: {pageNum: 3}});
    expect(setRange).toHaveBeenCalledWith(0, 2, [{x: 800, y: 100}, {x: 800, y: 300}]);
    expect(outline).toHaveBeenCalledWith(0, 1, [[{x: 800, y: 100.5}]]);
    expect(stroke.recognizeResult).toEqual({up_left_point_x: 790, up_left_point_y: 100, down_right_point_x: 810, down_right_point_y: 300});
  });

  it('refuses a transform that takes a stroke off the page, before writing, and any element but a stroke (#326)', async () => {
    const setRange = jest.fn(async () => true);
    const stroke = {type: 0, stroke: {points: {size: async () => 1, getRange: async () => [{x: 10, y: 10}], setRange}}};
    const flipped = await page.transformElement(stroke, 0, [-1, 0, 0, 1, 0, 0], {width: 1920, height: 2560});
    expect(flipped).toMatchObject({ok: false, message: 'the transform takes the stroke off the page, to -10, 10'});
    expect(setRange).not.toHaveBeenCalled();
    expect((await page.transformElement({type: 200, picture: {}}, 0, [1, 0, 0, 1, 0, 0], {width: 1920, height: 2560})).ok).toBe(false);
  });

  it('sets pageNum to the page index, as a read answers -1 and a modify below 0 is refused (#312)', async () => {
    const text = {type: 500, pageNum: -1, textBox: {textRect: rect}};
    expect(await page.placeElement(text, 2, rect)).toMatchObject({ok: true, value: {pageNum: 2}});
  });

  it('builds a picture element with its file and rect', async () => {
    mocked(PluginCommAPI.createElement).mockResolvedValue(success({type: 200}));
    expect(await page.buildElement({kind: 'picture', file: '/x/p.png', rect})).toEqual({
      ok: true,
      value: {type: 200, picture: {picturePath: '/x/p.png', rect}},
    });
    expect(PluginCommAPI.createElement).toHaveBeenCalledWith(200);
  });

  it('builds a shape as a geometry element of type 700, with the Geometry fields (#463)', async () => {
    mocked(PluginCommAPI.createElement).mockResolvedValue(success({type: 700}));
    const points = [{x: 10, y: 20}, {x: 300, y: 20}];
    expect(await page.buildElement({kind: 'geometry', shape: 'straightLine', points, ellipse: null, penColor: 0, penWidth: 400})).toEqual({
      ok: true,
      value: {
        type: 700,
        geometry: {
          type: 'straightLine',
          penColor: 0,
          penType: 10,
          penWidth: 400,
          points,
          ellipseCenterPoint: null,
          ellipseMajorAxisRadius: 0,
          ellipseMinorAxisRadius: 0,
          ellipseAngle: 0,
          showLassoAfterInsert: false,
        },
      },
    });
    expect(PluginCommAPI.createElement).toHaveBeenCalledWith(700);
    const circle = {center: {x: 500, y: 600}, major: 100, minor: 100, angle: 0};
    expect(await page.buildElement({kind: 'geometry', shape: 'GEO_circle', points: [], ellipse: circle, penColor: 0x9d, penWidth: 200})).toMatchObject({
      ok: true,
      value: {geometry: {type: 'GEO_circle', points: [], ellipseCenterPoint: {x: 500, y: 600}, ellipseMajorAxisRadius: 100, ellipseMinorAxisRadius: 100}},
    });
  });

  it("places a shape's points and stored box, and a circle sized to a wide rect becomes an ellipse (#463)", async () => {
    const square = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}, {x: 0, y: 10}, {x: 0, y: 0}];
    const box = {up_left_point_x: 0, up_left_point_y: 0, down_right_point_x: 10, down_right_point_y: 10};
    const polygon = {type: 700, geometry: {type: 'GEO_polygon', points: square}, recognizeResult: box};
    expect(await page.placeElement(polygon, 0, rect)).toMatchObject({
      ok: true,
      value: {
        pageNum: 0,
        geometry: {points: [{x: 100, y: 200}, {x: 300, y: 200}, {x: 300, y: 400}, {x: 100, y: 400}, {x: 100, y: 200}]},
        recognizeResult: {up_left_point_x: 100, up_left_point_y: 200, down_right_point_x: 300, down_right_point_y: 400},
      },
    });
    const circle = {
      type: 700,
      geometry: {type: 'GEO_circle', points: [], ellipseCenterPoint: {x: 50, y: 50}, ellipseMajorAxisRadius: 50, ellipseMinorAxisRadius: 50, ellipseAngle: 0},
    };
    expect(await page.placeElement(circle, 0, {left: 100, top: 200, right: 500, bottom: 400})).toMatchObject({
      ok: true,
      value: {geometry: {type: 'GEO_ellipse', ellipseCenterPoint: {x: 300, y: 300}, ellipseMajorAxisRadius: 200, ellipseMinorAxisRadius: 100}},
    });
  });

  it('refuses a shape it cannot place: no points, no radii, or a turned ellipse (#463)', async () => {
    expect(await page.placeElement({type: 700, geometry: {type: 'straightLine', points: []}}, 0, rect)).toMatchObject({ok: false, message: 'the shape has no points'});
    expect(await page.placeElement({type: 700, geometry: {type: 'GEO_circle', ellipseCenterPoint: null}}, 0, rect)).toMatchObject({
      ok: false,
      message: 'the shape has no centre or radii',
    });
    const turned = {type: 'GEO_ellipse', ellipseCenterPoint: {x: 50, y: 50}, ellipseMajorAxisRadius: 50, ellipseMinorAxisRadius: 20, ellipseAngle: 30};
    expect(await page.placeElement({type: 700, geometry: turned}, 0, rect)).toMatchObject({
      ok: false,
      message: 'a turned ellipse cannot be moved yet (ellipseAngle 30)',
    });
    const readAsText = {...turned, ellipseAngle: '0'};
    expect((await page.placeElement({type: 700, geometry: readAsText}, 0, rect)).ok).toBe(true);
    expect(await page.placeElement({type: 700, geometry: {...turned, ellipseAngle: 91}}, 0, rect)).toMatchObject({ok: false});
  });

  it('moves a circle stored turned, as Smart Pen draws it, and writes it back at 0 (#459)', async () => {
    // A held circle Smart Pen drew on the Manta read back at this angle, and the move was refused.
    const circle = {type: 'GEO_circle', ellipseCenterPoint: {x: 50, y: 50}, ellipseMajorAxisRadius: 50, ellipseMinorAxisRadius: 50, ellipseAngle: 45.52582931518555};
    expect(await page.placeElement({type: 700, geometry: {...circle}}, 0, {left: 100, top: 200, right: 300, bottom: 400})).toMatchObject({
      ok: true,
      value: {geometry: {type: 'GEO_circle', ellipseCenterPoint: {x: 200, y: 300}, ellipseMajorAxisRadius: 100, ellipseMinorAxisRadius: 100, ellipseAngle: 0}},
    });
    expect(await page.placeElement({type: 700, geometry: {...circle}}, 0, {left: 100, top: 200, right: 500, bottom: 400})).toMatchObject({
      ok: true,
      value: {geometry: {type: 'GEO_ellipse', ellipseMajorAxisRadius: 200, ellipseMinorAxisRadius: 100, ellipseAngle: 0}},
    });
  });

  it('moves an ellipse the tablet stored at about 90 after an insert at 0, writing the angle in the insert convention (#463)', async () => {
    // The value the Manta answered for an ellipse inserted at angle 0 (#463, device round 2).
    const stored = 90.00273895263672;
    const ellipse = {type: 'GEO_ellipse', ellipseCenterPoint: {x: 50, y: 50}, ellipseMajorAxisRadius: 50, ellipseMinorAxisRadius: 20, ellipseAngle: stored};
    expect(await page.placeElement({type: 700, geometry: {...ellipse}}, 0, rect)).toMatchObject({
      ok: true,
      value: {geometry: {ellipseCenterPoint: {x: 200, y: 300}, ellipseMajorAxisRadius: 100, ellipseMinorAxisRadius: 100}},
    });
    // Round 3: writing the read 90.0027 back drew the ellipse turned by 90°; the modify takes the insert's 0.
    const moved = (await page.placeElement({type: 700, geometry: {...ellipse}}, 0, rect)) as {ok: true; value: {geometry: {ellipseAngle: number}}};
    expect(moved.value.geometry.ellipseAngle).toBeCloseTo(stored - 90, 10);
    const unturned = (await page.placeElement({type: 700, geometry: {...ellipse, ellipseAngle: 0}}, 0, rect)) as {ok: true; value: {geometry: {ellipseAngle: number}}};
    expect(unturned.value.geometry.ellipseAngle).toBe(0);
  });
});
