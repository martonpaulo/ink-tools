/**
 * Recognition over generated hand-drawn strokes (#253): the five shapes are recognized, and a
 * figure under the minimum size, such as a «T», an «A» or an «O» at handwriting size, stays ink.
 * Whether the pen was held is checked before recognition (snap.test.ts).
 */
import {recognize, squareOf, type P, type RecognizeOptions} from '../src/recognize';
import {DEFAULT_SETTINGS, minSizePx, SNAP_DEGREES, TOLERANCE} from '../src/settings';
import {arc, arrow, hand, polyline, rect, rotateAll} from '../test-support/strokes';

const opts: RecognizeOptions = {
  tolerance: TOLERANCE,
  minSize: minSizePx(DEFAULT_SETTINGS),
  shapes: DEFAULT_SETTINGS.shapes,
  arrowSnapDegrees: SNAP_DEGREES,
  rectSnapDegrees: SNAP_DEGREES,
};
const kind = (pts: P[], o = opts) => recognize(pts, o).shape?.kind ?? null;
const triangle = (a: P, b: P, c: P) => polyline([a, b, c, {x: a.x + 4, y: a.y - 4}]);

describe('the five shapes', () => {
  test('a wobbly rectangle', () => expect(kind(hand(rect(100, 100, 700, 400), 8))).toBe('rect'));
  test('a square is drawn as a square of equal sides', () => {
    const {shape} = recognize(hand(rect(200, 200, 580, 600), 8), opts);
    if (shape?.kind !== 'square') {
      throw new Error(`expected a square, got ${shape?.kind}`);
    }
    const [a, b, , d] = shape.corners;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(Math.hypot(d.x - a.x, d.y - a.y), 5);
  });
  test('a wobbly circle', () => expect(kind(hand(arc(500, 500, 200, 200, 1.05), 6))).toBe('circle'));
  test('an upright triangle', () =>
    expect(kind(hand(triangle({x: 200, y: 700}, {x: 500, y: 200}, {x: 800, y: 700}), 5))).toBe('triangle'));
  test('a right triangle, tilted', () =>
    expect(
      kind(hand(rotateAll(triangle({x: 200, y: 200}, {x: 200, y: 700}, {x: 700, y: 700}), 20, {x: 450, y: 450}), 4)),
    ).toBe('triangle'));
  test('an arrow', () =>
    expect(kind(hand(arrow({x: 100, y: 300}, {x: 800, y: 330}, 60, 'barb-tip-barb'), 3))).toBe('arrow'));
});

describe('what stays ink', () => {
  // About 4 mm tall, the size of a handwritten capital (the owner's x-height is 35 to 40 px).
  test('a «T» at handwriting size', () =>
    expect(recognize(polyline([{x: 100, y: 100}, {x: 140, y: 100}, {x: 120, y: 100}, {x: 120, y: 150}]), opts).reason).toMatch(/too small/));
  test('an «A» at handwriting size', () =>
    expect(recognize(polyline([{x: 100, y: 150}, {x: 120, y: 100}, {x: 140, y: 150}, {x: 130, y: 125}, {x: 110, y: 125}]), opts).reason).toMatch(/too small/));
  test('an «O» at handwriting size', () => expect(recognize(arc(120, 120, 20, 25, 1.05), opts).reason).toMatch(/too small/));
  test('a small arrow under the minimum size', () =>
    expect(kind(hand(arrow({x: 100, y: 300}, {x: 160, y: 300}, 15, 'barb-tip-barb'), 1))).toBeNull());
  test('a straight line, the native Smart Straight Line', () =>
    expect(kind(polyline([{x: 100, y: 100}, {x: 800, y: 120}]))).toBeNull());
  test('a very flat ellipse', () => expect(kind(arc(500, 500, 400, 110, 1.02))).toBeNull());
  test('a shape turned off', () =>
    expect(kind(hand(arc(500, 500, 200, 200, 1.05), 6), {...opts, shapes: {...opts.shapes, circle: false}})).toBeNull());
  test('a square with Square off is a rectangle', () =>
    expect(kind(hand(rect(200, 200, 580, 600), 8), {...opts, shapes: {...opts.shapes, square: false}})).toBe('rect'));
});

test('squareOf keeps the centre and the tilt', () => {
  const corners = squareOf([
    {x: 0, y: 0},
    {x: 100, y: 0},
    {x: 100, y: 80},
    {x: 0, y: 80},
  ]);
  expect(corners[0]).toEqual({x: 5, y: -5});
  expect(corners[2]).toEqual({x: 95, y: 85});
});
