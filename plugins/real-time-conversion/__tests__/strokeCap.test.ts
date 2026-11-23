/**
 * A stroke over MAX_STROKE_POINTS is a failed read, never a cut stroke reported whole, so a word
 * holding one is kept on the page and Undo Conversion never gives back shorter ink (#229).
 */
import {
  MAX_STROKE_POINTS,
  saveStroke,
  strokePoints,
} from '@ink-tools/sn-adapter/official';
import {Converter} from '../src/convert';
import {DEFAULT_WORD_OPTIONS, type Point} from '../src/words';
import {fakeTablet, type FakeElement} from '../test-support/host';
import {letter} from '../test-support/ink';

/** A stroke element as the SDK hands it over: its points behind a native accessor. */
function sdkStroke(points: Point[]) {
  return {
    type: 0,
    stroke: {
      points: {
        size: async () => points.length,
        getRange: async (start: number, count: number) => points.slice(start, start + count),
      },
      pressures: {
        size: async () => points.length,
        getRange: async (start: number, count: number) =>
          points.slice(start, start + count).map(() => 2000),
      },
    },
  };
}

const line = (count: number): Point[] =>
  Array.from({length: count}, (_, i) => ({x: 100 + (i % 20), y: 100 + (i % 40)}));

test('a stroke over the cap is a failed read, in strokePoints and in saveStroke', async () => {
  const long = sdkStroke(line(MAX_STROKE_POINTS + 1));
  const read = await strokePoints(long);
  const saved = await saveStroke(long);
  expect(read.ok).toBe(false);
  expect(saved.ok).toBe(false);
  expect(read.ok ? '' : read.message).toContain(`${MAX_STROKE_POINTS + 1} points`);
});

test('a stroke of exactly the cap is read whole', async () => {
  const points = line(MAX_STROKE_POINTS);
  const read = await strokePoints(sdkStroke(points));
  expect(read).toEqual({ok: true, value: points});
});

test('a word holding a stroke over the cap is kept on the page and the log says why', async () => {
  const tablet = fakeTablet('não');
  // The fake page's strokes are read through the adapter, the middle letter with too many points.
  const middle = letter(30);
  (tablet.host.strokePoints as jest.Mock).mockImplementation(async element => {
    const points = (element as FakeElement).points ?? [];
    return strokePoints(
      sdkStroke(points === middle.points ? line(MAX_STROKE_POINTS + 1) : points),
    );
  });
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  converter.start();
  [letter(0), middle, letter(60)].forEach((stroke, index) => tablet.penUp(stroke, index * 200));
  await tablet.advance(400 + DEFAULT_WORD_OPTIONS.idleMs);
  await converter.idle();
  expect(tablet.host.recognizeElements).not.toHaveBeenCalled();
  expect(tablet.host.batchUpdatePageElements).not.toHaveBeenCalled();
  expect(tablet.page.map(element => element.type)).toEqual([0, 0, 0]);
  expect(tablet.logs).toContain(
    `kept: the stroke has ${MAX_STROKE_POINTS + 1} points, more than the ${MAX_STROKE_POINTS} a read takes, 2 strokes left as written`,
  );
});

test('a word written after the idle time that follows an unread stroke is converted', async () => {
  const tablet = fakeTablet('não');
  const long = letter(400);
  (tablet.host.strokePoints as jest.Mock).mockImplementation(async element => {
    const points = (element as FakeElement).points ?? [];
    return strokePoints(sdkStroke(points === long.points ? line(MAX_STROKE_POINTS + 1) : points));
  });
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  converter.start();
  tablet.penUp(long, 0);
  const start = DEFAULT_WORD_OPTIONS.idleMs + 100;
  [0, 30, 60].forEach((left, index) => tablet.penUp(letter(left), start + index * 200));
  await tablet.advance(start + 400 + DEFAULT_WORD_OPTIONS.idleMs);
  await converter.idle();
  expect(tablet.host.batchUpdatePageElements).toHaveBeenCalled();
});
