/** Erase with the pen (#134): the marks drawn on the picture, and the press around them. */
import {
  fail,
  ok,
  PICTURE_TYPE,
  STROKE_TYPE,
  THROWN_CODE,
} from '@ink-tools/sn-adapter/official';
import {
  EraseDeps,
  eraseMarks,
  MARKS_OUTSIDE,
  NO_MARKS,
  NOT_PICTURE_AND_MARKS,
  runErase,
} from '../src/erase';

const PAGE = {width: 1920, height: 2560};
/** The picture of the device round (#132): 200 x 200 at 1216, 1152. */
const RECT = {left: 1216, top: 1152, right: 1416, bottom: 1352};
/** A scribble over the picture's middle, and a short mark at its top left, in page pixels. */
const SCRIBBLE = [
  {x: 1300, y: 1240},
  {x: 1330.5, y: 1260},
  {x: 1310, y: 1280},
];
const DOT = [{x: 1220, y: 1160}];

const picture = () => ({type: PICTURE_TYPE, numInPage: 4, picture: {rect: {...RECT}}});
const stroke = (numInPage: number) => ({type: STROKE_TYPE, numInPage});

test('the marks map into the picture by its top left, one end per mark', () => {
  expect(eraseMarks(RECT, [SCRIBBLE, DOT])).toEqual({
    points: [84, 88, 114.5, 108, 94, 128, 4, 8],
    ends: [3, 4],
  });
});

test('marks off the picture are none, and an empty stroke is skipped', () => {
  expect(eraseMarks(RECT, [[{x: 10, y: 10}, {x: 200, y: 200}]])).toBeNull();
  expect(eraseMarks(RECT, [])).toBeNull();
  expect(eraseMarks(RECT, [[], DOT])).toEqual({points: [4, 8], ends: [1]});
  // A mark that only starts on the picture still counts, and keeps its points outside.
  expect(eraseMarks(RECT, [[{x: 1216, y: 1152}, {x: 1100, y: 1100}]])).toEqual({
    points: [0, 0, -116, -52],
    ends: [2],
  });
});

/** A lasso of the picture and two marks, and a page that records each write. */
function world(lassoed: object[] = [picture(), stroke(5), stroke(6)]) {
  const calls: string[] = [];
  const strokes = new Map<object, typeof SCRIBBLE>([
    [lassoed[1], SCRIBBLE],
    [lassoed[2], DOT],
  ]);
  const deps: EraseDeps = {
    lassoed: async () => ok(lassoed),
    notePath: async () => ok('/Note/a.note'),
    pageNum: async () => ok(0),
    pageSize: async () => ok(PAGE),
    points: async element => ok(strokes.get(element) ?? SCRIBBLE),
    range: async () => ok({maxX: 21632, maxY: 16224, display: {width: 1920, height: 2560}}),
    remove: jest.fn(async (nums: number[]) => {
      calls.push(`delete ${nums.join(',')}`);
      return ok(true);
    }),
    recycle: jest.fn(async () => undefined),
    lasso: jest.fn(async () => {
      calls.push('lasso');
      return ok(true);
    }),
    erase: jest.fn(async marks => {
      calls.push(`erase ${marks.ends.join(',')}`);
      return {kind: 'edited' as const, edit: 'erase' as const, ms: 0};
    }),
    log: () => undefined,
  };
  return {deps, calls};
}

test('Erase deletes the marks, lassoes the picture alone and erases what they cover', async () => {
  const w = world();
  expect(await runErase(w.deps)).toMatchObject({kind: 'edited'});
  expect(w.calls).toEqual(['delete 5,6', 'lasso', 'erase 3,4']);
  expect(w.deps.lasso).toHaveBeenCalledWith(RECT);
  expect(w.deps.erase).toHaveBeenCalledWith(eraseMarks(RECT, [SCRIBBLE, DOT]));
  expect(w.deps.recycle).toHaveBeenCalledTimes(3);
});

test('a lasso without marks, or with more than the picture, says what to do', async () => {
  const bare = world([picture()]);
  expect(await runErase(bare.deps)).toEqual({kind: 'nothing', why: NO_MARKS});
  expect(bare.calls).toEqual([]);
  const mixed = world([picture(), stroke(5), {type: 500}]);
  expect(await runErase(mixed.deps)).toEqual({kind: 'nothing', why: NOT_PICTURE_AND_MARKS});
  expect(mixed.calls).toEqual([]);
});

test('marks beside the picture change nothing and stay on the page', async () => {
  const w = world();
  w.deps.points = async () => ok([{x: 10, y: 10}]);
  expect(await runErase(w.deps)).toEqual({kind: 'nothing', why: MARKS_OUTSIDE});
  expect(w.calls).toEqual([]);
});

test('marks that cannot be deleted stop the press before the picture changes', async () => {
  const w = world();
  w.deps.remove = async () => fail(THROWN_CODE, 'refused');
  expect(await runErase(w.deps)).toEqual({
    kind: 'failed',
    why: `delete the guide: ${THROWN_CODE} refused`,
  });
  expect(w.calls).toEqual([]);
});
