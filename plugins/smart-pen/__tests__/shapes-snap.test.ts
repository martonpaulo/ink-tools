/** The replace over a fake page (#253): hold, lasso route, number route, failures. */
import {fail, ok, type PenPoint} from '@ink-tools/sn-adapter/official';
import {HoldTracker} from '../src/modules/shapes/hold';
import {createRunner} from '../src/modules/shapes/run';
import {
  DEFAULT_SETTINGS,
  HOLD_MS,
  setSettings,
} from '../src/modules/shapes/settings';
import {
  handleStroke,
  type PenState,
  type SnapHost,
} from '../src/modules/shapes/snap';
import {arc, hand} from '../test-support/strokes';

const CIRCLE: PenPoint[] = hand(arc(500, 500, 200, 200, 1.05), 6);
const INK_PEN = 10;

function strokeOf(points: PenPoint[], numInPage = 0) {
  return {stroke: {penType: INK_PEN, penColor: 0}, numInPage, points};
}
type FakeElement = ReturnType<typeof strokeOf>;

/**
 * A page holding `others` beside the stroke inside the lasso. The stroke is the page's last element
 * until a delete takes it; `lassoLeaves` is a lasso delete that answers true and leaves it, as the
 * tablet does for a stroke a plugin inserted (#477).
 */
function fakeHost(others = 0, lassoLeaves = false) {
  const stroke = strokeOf(CIRCLE, 7);
  const before = strokeOf([{x: 9, y: 9}], 6);
  let onPage = true;
  const host = {
    strokePoints: jest.fn(async (e: object) => ok((e as FakeElement).points)),
    saveStroke: jest.fn(async () =>
      ok({
        points: CIRCLE,
        pressures: [],
        penType: INK_PEN,
        penColor: 0,
        thickness: 0,
      }),
    ),
    restoreStroke: jest.fn(async () => ok(true)),
    getCurrentFilePath: jest.fn(async () => ok('/Note/Tests/a.note')),
    getCurrentPageNum: jest.fn(async () => ok(0)),
    getPageSize: jest.fn(async () => ok({width: 1404, height: 1872})),
    offPage: jest.fn(() => false),
    readEmrRange: jest.fn(),
    emrToPage: jest.fn(),
    getPenInfo: jest.fn(async () => ok({type: INK_PEN, color: 0, width: 500})),
    getLassoRect: jest.fn(
      (): ReturnType<SnapHost['getLassoRect']> =>
        Promise.resolve(fail(904, 'no lasso')),
    ),
    lassoElements: jest.fn(async () => ok(true)),
    getLassoElements: jest.fn(async () =>
      ok([
        stroke,
        ...Array.from({length: others}, () => strokeOf([{x: 1, y: 1}])),
      ]),
    ),
    deleteLassoElements: jest.fn(async () => {
      onPage = onPage && lassoLeaves;
      return ok(true);
    }),
    clearLasso: jest.fn(async () => ok(true)),
    getLastElement: jest.fn(async () => ok(onPage ? stroke : before)),
    deletePageElements: jest.fn(async () => {
      onPage = false;
      return ok(true);
    }),
    insertGeometry: jest.fn(async () => ok(true)),
    ensureAccess: jest.fn(async () => true),
    recycleElement: jest.fn(async () => ok(true as const)),
    log: jest.fn(),
  };
  return host satisfies SnapHost;
}

const held: PenState = {stillMs: HOLD_MS + 50, whenUp: async () => undefined};
const quick: PenState = {stillMs: 40, whenUp: async () => undefined};

beforeEach(() => setSettings(DEFAULT_SETTINGS));

test('a held circle becomes a circle, deleted through the lasso so the undo history stays', async () => {
  const host = fakeHost();
  expect(await handleStroke(host, strokeOf(CIRCLE), held)).toBe(
    'circle (lasso)',
  );
  expect(host.deleteLassoElements).toHaveBeenCalledTimes(1);
  expect(host.deletePageElements).not.toHaveBeenCalled();
  expect(host.recycleElement).toHaveBeenCalledWith(
    expect.objectContaining({numInPage: 6}),
  );
  expect(host.insertGeometry).toHaveBeenCalledWith(
    expect.objectContaining({type: 'GEO_circle', penWidth: 500}),
  );
});

test('a lasso delete that leaves the stroke is followed by a delete by its number (#477)', async () => {
  const host = fakeHost(0, true);
  expect(await handleStroke(host, strokeOf(CIRCLE), held)).toBe(
    'circle (number)',
  );
  expect(host.deleteLassoElements).toHaveBeenCalledTimes(1);
  expect(host.deletePageElements).toHaveBeenCalledWith([7], 0);
  expect(host.getLastElement).toHaveBeenCalledTimes(1);
  expect(host.insertGeometry).toHaveBeenCalledTimes(1);
});

test('a refused delete by number keeps the stroke as ink, with no shape over it', async () => {
  const host = fakeHost(0, true);
  host.deletePageElements.mockResolvedValue(ok(false));
  expect(await handleStroke(host, strokeOf(CIRCLE), held)).toBe('failed');
  expect(host.insertGeometry).not.toHaveBeenCalled();
});

test('the same circle not held stays ink', async () => {
  const host = fakeHost();
  expect(await handleStroke(host, strokeOf(CIRCLE), quick)).toBe('no hold');
  expect(
    await handleStroke(host, strokeOf(CIRCLE), {...held, stillMs: null}),
  ).toBe('no hold');
  expect(host.insertGeometry).not.toHaveBeenCalled();
});

test('a circle drawn around words never deletes the words: the stroke goes by its number', async () => {
  const host = fakeHost(3);
  expect(await handleStroke(host, strokeOf(CIRCLE), held)).toBe(
    'circle (number)',
  );
  expect(host.deleteLassoElements).not.toHaveBeenCalled();
  expect(host.clearLasso).toHaveBeenCalledTimes(1);
  expect(host.deletePageElements).toHaveBeenCalledWith([7], 0);
});

test('when the stroke is found nowhere, nothing changes', async () => {
  const host = fakeHost(3);
  host.getLastElement.mockResolvedValue(ok(strokeOf([{x: 9, y: 9}], 8)));
  expect(await handleStroke(host, strokeOf(CIRCLE), held)).toBe('failed');
  expect(host.deletePageElements).not.toHaveBeenCalled();
  expect(host.insertGeometry).not.toHaveBeenCalled();
});

test('a failed insert writes the stroke back', async () => {
  const host = fakeHost();
  host.insertGeometry.mockResolvedValue(fail(1501, 'refused'));
  expect(await handleStroke(host, strokeOf(CIRCLE), held)).toBe('failed');
  expect(host.restoreStroke).toHaveBeenCalledWith(
    expect.objectContaining({points: CIRCLE}),
    0,
  );
});

test('an open lasso, a lasso path or refused access change nothing', async () => {
  const host = fakeHost();
  setSettings(DEFAULT_SETTINGS);
  expect(
    await handleStroke(host, {...strokeOf(CIRCLE), stroke: {penType: 4}}, held),
  ).toBe('not ink');
  host.getLassoRect.mockResolvedValueOnce(
    ok({left: 0, top: 0, right: 1, bottom: 1}),
  );
  expect(await handleStroke(host, strokeOf(CIRCLE), held)).toBe('lasso active');
  host.ensureAccess.mockResolvedValueOnce(false);
  expect(await handleStroke(host, strokeOf(CIRCLE), held)).toBe('failed');
  expect(host.lassoElements).not.toHaveBeenCalled();
  expect(host.insertGeometry).not.toHaveBeenCalled();
});

test('EMR points from the pen-up event are turned into page pixels first', async () => {
  const host = fakeHost();
  host.offPage.mockReturnValue(true);
  host.readEmrRange.mockResolvedValue(
    ok({maxX: 1, maxY: 1, display: {width: 1920, height: 2560}}),
  );
  host.emrToPage.mockReturnValue(CIRCLE);
  expect(await handleStroke(host, strokeOf(CIRCLE), held)).toBe(
    'circle (lasso)',
  );
  expect(host.emrToPage).toHaveBeenCalledTimes(1);
});

test('the runner reads the hold from the motion listener, even when the lift comes after the pen-up', async () => {
  const host = fakeHost();
  let now = 0;
  const runner = createRunner(host, new HoldTracker(() => 12), {
    now: () => now,
    sleep: () => new Promise(() => undefined),
  });
  const pen = (action: number, x: number, t: number) => ({
    action,
    x,
    y: 500,
    eventTime: t,
    downTime: 1,
    toolType: 2,
  });
  runner.motion(pen(0, 300, 0));
  runner.motion(pen(2, 700, 100));
  const outcome = runner.penUp([strokeOf(CIRCLE)]);
  now = 600;
  runner.motion(pen(1, 702, 600));
  expect(await outcome).toBe('circle (lasso)');
  expect(host.recycleElement).toHaveBeenCalled();
});
