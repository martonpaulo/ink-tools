/**
 * EMR points to page pixels through the screen's size (#269): the pen follows the screen, and a
 * page made for another Supernote model is scaled to fill it.
 */
import {PluginCommAPI} from 'sn-plugin-lib';
import {emrToPage, getDisplaySize, THROWN_CODE} from '../src/official';
import type {EmrRange, PenPoint, Size} from '../src/official';

const MANTA: Size = {width: 1920, height: 2560};
/** An A6X or A5X page, as the older tablets make it. */
const A6X: Size = {width: 1404, height: 1872};
const MANTA_RANGE: EmrRange = {maxX: 21632, maxY: 16224, display: MANTA};

/** `PointUtils.androidPoint2Emr` of sn-plugin-lib 0.2.3: a screen pixel as the pen reports it. */
function toEmr({x, y}: PenPoint, range: EmrRange): PenPoint {
  const {display} = range;
  return {
    x: y * (range.maxX / (display.height - 1)),
    y: (display.width - 1 - x) * (range.maxY / (display.width - 1)),
  };
}

const mocked = (fn: unknown) => fn as jest.Mock;

beforeEach(() => jest.resetAllMocks());

test('a page of the screen size gives the screen pixel, as before', () => {
  const [point] = emrToPage([toEmr({x: 512, y: 1297}, MANTA_RANGE)], MANTA, MANTA_RANGE);
  expect(point.x).toBeCloseTo(512, 6);
  expect(point.y).toBeCloseTo(1297, 6);
});

test('an A6X page on a Manta screen gives the page pixel under the pen', () => {
  // The screen's centre is the page's centre; a point near the leading edge stays near it.
  const [centre, edge] = emrToPage(
    [toEmr({x: 960, y: 1280}, MANTA_RANGE), toEmr({x: 192, y: 256}, MANTA_RANGE)],
    A6X,
    MANTA_RANGE,
  );
  expect(centre.x).toBeCloseTo(702, 6);
  expect(centre.y).toBeCloseTo(936, 6);
  expect(edge.x).toBeCloseTo(140.4, 6);
  expect(edge.y).toBeCloseTo(187.2, 6);
});

describe('getDisplaySize', () => {
  it('returns the screen size', async () => {
    mocked(PluginCommAPI.getPageDisplaySize).mockResolvedValue({success: true, result: MANTA});
    expect(await getDisplaySize()).toEqual({ok: true, value: MANTA});
  });

  it.each([null, {width: 0, height: 2560}, {width: 1920}, {width: 1920.5, height: 2560}])(
    'refuses %j rather than guess a size',
    async result => {
      mocked(PluginCommAPI.getPageDisplaySize).mockResolvedValue({success: true, result});
      const answer = await getDisplaySize();
      expect(answer).toMatchObject({ok: false, code: THROWN_CODE});
    },
  );

  it('keeps the SDK error', async () => {
    mocked(PluginCommAPI.getPageDisplaySize).mockResolvedValue({success: false, error: {code: 7, message: 'no page'}});
    expect(await getDisplaySize()).toEqual({ok: false, code: 7, message: 'no page'});
  });
});
