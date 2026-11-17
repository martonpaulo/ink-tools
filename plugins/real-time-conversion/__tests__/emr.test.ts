/**
 * Pen-up points in EMR units (#206): on the tablet every word was kept as «large», as its letters
 * read 8 times their page size. The letters here are the bounds Probe read back from the owner's
 * «casa» on a 1920 x 2560 page, turned into EMR with the SDK's inverse formula.
 */
import {emrToPage, offPage} from '@ink-tools/sn-adapter/official';
import {Converter} from '../src/convert';
import {wordKept} from '../src/shapes';
import {lastConversion, setLastConversion} from '../src/undo';
import {DEFAULT_WORD_OPTIONS, Point, rectOf} from '../src/words';
import {fakeTablet} from '../test-support/host';

const PAGE = {width: 1920, height: 2560};
const RANGE = {maxX: 21632, maxY: 16224};

/** `PointUtils.androidPoint2Emr` of sn-plugin-lib 0.2.3, to write the synthetic EMR strokes. */
function toEmr({x, y}: Point): Point {
  return {
    x: y * (RANGE.maxX / (PAGE.height - 1)),
    y: (PAGE.width - 1 - x) * (RANGE.maxY / (PAGE.width - 1)),
  };
}

/** The «casa» letters' page bounds, read with getElements through Probe on the tablet. */
const CASA = [
  [512, 1297, 559, 1356],
  [578, 1304, 630, 1352],
  [647, 1304, 691, 1353],
  [700, 1305, 751, 1357],
];

function zigzag([left, top, right, bottom]: number[]): Point[] {
  return [0, 1, 2, 3, 4].map(i => ({
    x: left + ((right - left) * i) / 4,
    y: i % 2 ? top : bottom,
  }));
}

beforeEach(() => setLastConversion(null));

test('EMR points become the page pixels getElements reads', () => {
  const emr = zigzag(CASA[0]).map(toEmr);
  expect(offPage(emr, PAGE)).toBe(true);
  const rect = rectOf(emrToPage(emr, PAGE, RANGE));
  expect(rect?.left).toBeCloseTo(512, 6);
  expect(rect?.top).toBeCloseTo(1297, 6);
  expect(rect?.right).toBeCloseTo(559, 6);
  expect(rect?.bottom).toBeCloseTo(1356, 6);
});

test('page pixels are never taken for EMR', () => {
  expect(offPage(zigzag(CASA[0]), PAGE)).toBe(false);
});

test('a word at the owner size in page pixels goes on', () => {
  const strokes = CASA.map((box, index) => {
    const points = emrToPage(zigzag(box).map(toEmr), PAGE, RANGE);
    return {id: `c${index}`, rect: rectOf(points)!, points};
  });
  const rect = rectOf(strokes.flatMap(each => each.points))!;
  expect(wordKept({strokes, rect, letterHeight: 52})).toBeNull();
});

test('a word written with EMR pen-up points converts, and undo keeps page pixels', async () => {
  const tablet = fakeTablet('casa');
  tablet.host.getPageSize = jest.fn(async () => ({ok: true as const, value: PAGE}));
  tablet.host.emrRange = jest.fn(() => ({ok: true as const, value: RANGE}));
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  converter.start();
  CASA.forEach((box, index) => {
    const points = zigzag(box).map(toEmr);
    // The page keeps page pixels; only the pen-up element carries EMR units (#206).
    tablet.penUp({id: `e${index}`, rect: rectOf(points)!, points}, index * 200, zigzag(box));
  });
  await tablet.advance(800 + DEFAULT_WORD_OPTIONS.idleMs);
  await converter.idle();
  // The page read gives the strokes uuids of its own, as the tablet did (#206): they are found by
  // their bounds; before, this logged «kept: 4 of 4 strokes of the word are not in the page read».
  expect(tablet.logs.filter(line => line.startsWith('kept'))).toEqual([]);
  expect(tablet.logs.filter(line => line.startsWith('match:'))).toEqual([
    expect.stringMatching(
      /^match: pen-up .*, 5 points, first \d+,\d+ EMR; page .*numInPage 0, .*5 points, first 512,1356 page px; same uuid false$/,
    ),
  ]);
  expect(tablet.host.batchUpdatePageElements).toHaveBeenCalledTimes(1);
  expect(tablet.logs.filter(line => line.startsWith('pen-up unit:'))).toEqual([
    expect.stringMatching(/^pen-up unit: EMR, 5 points, .* page 512,1297 to 559,1356, page size 1920 x 2560$/),
  ]);
  const saved = rectOf(lastConversion()!.strokes[0].points)!;
  expect(saved.left).toBeCloseTo(512, 6);
  expect(saved.bottom).toBeCloseTo(1356, 6);
});
