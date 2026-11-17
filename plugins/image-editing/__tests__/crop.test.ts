/** Crop with the pen (#132): the box the rectangle draws, and the press around it. */
import {
  fail,
  ok,
  PICTURE_TYPE,
  STROKE_TYPE,
  THROWN_CODE,
} from '@ink-tools/sn-adapter/official';
import {
  cropBox,
  CropDeps,
  GUIDE_OUTSIDE,
  MIN_CROP_PX,
  NO_GUIDE,
  NOT_PICTURE_AND_GUIDE,
  runCrop,
  splitLasso,
} from '../src/crop';
import {pagePoints} from '../src/guide';

const PAGE = {width: 1920, height: 2560};
/** The picture of the device round (#132): 200 x 200 at 1216, 1152. */
const RECT = {left: 1216, top: 1152, right: 1416, bottom: 1352};
/** The closed rectangle drawn over it, 1250, 1180 to 1380, 1320, as page pixels. */
const RECTANGLE = [
  {x: 1250, y: 1180},
  {x: 1380, y: 1181},
  {x: 1379.4, y: 1320},
  {x: 1251, y: 1319.2},
  {x: 1250, y: 1180},
];

const picture = () => ({type: PICTURE_TYPE, numInPage: 4, picture: {rect: {...RECT}}});
const stroke = (numInPage: number) => ({type: STROKE_TYPE, numInPage});

test('the rectangle maps into the picture by its top left, rounded outwards', () => {
  expect(cropBox(RECT, RECTANGLE)).toEqual({left: 34, top: 28, width: 130, height: 140});
});

test('a rectangle past the picture is cut to it, and a slip of the pen is no box', () => {
  const past = [
    {x: 1100, y: 1100},
    {x: 1300, y: 1500},
  ];
  expect(cropBox(RECT, past)).toEqual({left: 0, top: 0, width: 84, height: 200});
  const beside = [
    {x: 1500, y: 1200},
    {x: 1600, y: 1300},
  ];
  expect(cropBox(RECT, beside)).toBeNull();
  const slip = [
    {x: 1300, y: 1200},
    {x: 1300 + MIN_CROP_PX - 1, y: 1300},
  ];
  expect(cropBox(RECT, slip)).toBeNull();
  expect(cropBox(RECT, [])).toBeNull();
});

test('the lasso must be one picture and at least one stroke, nothing else', () => {
  expect(splitLasso([picture()])).toBe(NO_GUIDE);
  expect(splitLasso([stroke(5)])).toBe(NOT_PICTURE_AND_GUIDE);
  expect(splitLasso([picture(), picture(), stroke(5)])).toBe(NOT_PICTURE_AND_GUIDE);
  expect(splitLasso([picture(), stroke(5), {type: 500}])).toBe(NOT_PICTURE_AND_GUIDE);
  const split = splitLasso([stroke(5), picture(), stroke(6)]);
  expect(split).toEqual({picture: RECT, guides: [stroke(5), stroke(6)]});
});

test('page pixels stay as they are; points off the page are taken as EMR', () => {
  const range = jest.fn(() => ok({maxX: 21632, maxY: 16224}));
  expect(pagePoints(RECTANGLE, PAGE, range)).toEqual(
    ok({points: RECTANGLE, emr: false}),
  );
  expect(range).not.toHaveBeenCalled();
  const emr = pagePoints([{x: 10816, y: 8112}], PAGE, range);
  expect(emr.ok && emr.value.emr).toBe(true);
  const [point] = emr.ok ? emr.value.points : [];
  expect(Math.round(point.x)).toBe(960);
  expect(Math.round(point.y)).toBe(1280);
});

/** A lasso of the picture and the rectangle, and a page that records each write. */
function world(lassoed: object[] = [picture(), stroke(5)]) {
  const calls: string[] = [];
  const deps: CropDeps = {
    lassoed: async () => ok(lassoed),
    notePath: async () => ok('/Note/a.note'),
    pageNum: async () => ok(0),
    pageSize: async () => ok(PAGE),
    points: async () => ok(RECTANGLE),
    range: () => ok({maxX: 21632, maxY: 16224}),
    remove: jest.fn(async (nums: number[]) => {
      calls.push(`delete ${nums.join(',')}`);
      return ok(true);
    }),
    recycle: jest.fn(async () => undefined),
    lasso: jest.fn(async () => {
      calls.push('lasso');
      return ok(true);
    }),
    crop: jest.fn(async box => {
      calls.push(`crop ${box.left},${box.top},${box.width},${box.height}`);
      return {kind: 'edited' as const, edit: 'crop' as const, ms: 0};
    }),
    log: () => undefined,
  };
  return {deps, calls};
}

test('Crop deletes the guide, lassoes the picture alone and cuts it to the box', async () => {
  const w = world();
  expect(await runCrop(w.deps)).toMatchObject({kind: 'edited'});
  expect(w.calls).toEqual(['delete 5', 'lasso', 'crop 34,28,130,140']);
  expect(w.deps.lasso).toHaveBeenCalledWith(RECT);
  expect(w.deps.recycle).toHaveBeenCalledTimes(2);
});

test('with no stroke in the lasso the press says what to draw and changes nothing', async () => {
  const w = world([picture()]);
  expect(await runCrop(w.deps)).toEqual({kind: 'nothing', why: NO_GUIDE});
  expect(w.calls).toEqual([]);
});

test('a rectangle beside the picture changes nothing', async () => {
  const w = world();
  w.deps.points = async () => ok([{x: 10, y: 10}, {x: 200, y: 200}]);
  expect(await runCrop(w.deps)).toEqual({kind: 'nothing', why: GUIDE_OUTSIDE});
  expect(w.calls).toEqual([]);
});

test('a guide that cannot be deleted stops the press before the picture changes', async () => {
  const w = world();
  w.deps.remove = async () => fail(THROWN_CODE, 'refused');
  expect(await runCrop(w.deps)).toEqual({
    kind: 'failed',
    why: `delete the guide: ${THROWN_CODE} refused`,
  });
  expect(w.calls).toEqual([]);
});

test('a guide without its place on the page is never deleted', async () => {
  const w = world([picture(), {type: STROKE_TYPE}]);
  expect(await runCrop(w.deps)).toMatchObject({kind: 'failed'});
  expect(w.calls).toEqual([]);
});
