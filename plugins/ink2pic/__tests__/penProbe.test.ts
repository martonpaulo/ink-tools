import {NativeModules} from 'react-native';
import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {
  probeArmed,
  probeIdle,
  runProbe,
  stopPenProbe,
} from '../src/flow/penProbe';
import {logLines, startLog} from '../src/log/memory';
import {getPenInfo, strokePoints} from '@supernote-tools/sn-adapter/official';

const mocked = (fn: unknown) => fn as jest.Mock;

// The probe reads the settings file: the plugin's file module finds none, so the defaults hold
// (#112). Plain functions, so the resetAllMocks below keeps them.
NativeModules.Ink2PicFiles = {readText: async () => null};
const success = (result: unknown) => ({success: true, result});

type Point = {x: number; y: number};

/** An element as the SDK hands it over, with its points behind an accessor. */
function strokeElement(points: Point[], numInPage = 1) {
  return {
    uuid: 'u',
    type: 0,
    numInPage,
    stroke: {
      points: {
        size: async () => points.length,
        getRange: async (start: number, count: number) =>
          points.slice(start, start + count),
      },
    },
    recycle: jest.fn(async () => {}),
  };
}

function zigzag(left: number): Point[] {
  return Array.from({length: 11}, (_, i) => ({
    x: left + i * 4,
    y: 100 + (i % 2) * 40,
  }));
}

function circle(): Point[] {
  return Array.from({length: 40}, (_, i) => {
    const angle = (2 * Math.PI * i) / 39;
    return {x: 175 + 140 * Math.cos(angle), y: 120 + 60 * Math.sin(angle)};
  });
}

let penUp: (msg: unknown) => void = () => {};
let life: (msg: unknown) => void = () => {};
const removed: string[] = [];

beforeEach(() => {
  jest.resetAllMocks();
  stopPenProbe();
  startLog();
  mocked(PluginManager.registerEventListener).mockImplementation(
    (_event: string, _order: number, listener: {onMsg: typeof penUp}) => {
      penUp = listener.onMsg;
      return {remove: jest.fn(() => removed.push('pen-up'))};
    },
  );
  mocked(PluginManager.registerMotionListener).mockReturnValue({
    remove: jest.fn(() => removed.push('motion')),
  });
  mocked(PluginManager.registerPluginLifeListener).mockImplementation(
    (listener: {onMsg: typeof life}) => {
      life = listener.onMsg;
      return {remove: jest.fn(() => removed.push('life'))};
    },
  );
  removed.length = 0;
  mocked(PluginCommAPI.getCurrentFilePath).mockResolvedValue(
    success('/Note/a.note'),
  );
  mocked(PluginCommAPI.getCurrentPageNum).mockResolvedValue(success(0));
  mocked(PluginFileAPI.getPageSize).mockResolvedValue(
    success({width: 1920, height: 2560}),
  );
  mocked(PluginCommAPI.getPenInfo).mockResolvedValue(
    success({type: 10, color: 0, width: 200}),
  );
  mocked(PluginCommAPI.lassoElements).mockResolvedValue(success(true));
  mocked(PluginCommAPI.getLassoRect).mockResolvedValue(success({left: 0}));
  mocked(PluginCommAPI.getLassoElements).mockResolvedValue(success([]));
  mocked(PluginManager.closePluginView).mockResolvedValue(true);
});

afterEach(() => stopPenProbe());

async function write(points: Point[], numInPage = 1) {
  mocked(PluginFileAPI.getLastElement).mockResolvedValueOnce(
    success(strokeElement(points, numInPage)),
  );
  penUp([{type: 0, numInPage: 1, uuid: 'u'}]);
  await probeIdle();
}

it('lassoes the strokes inside a circle the person draws, with the view closed', async () => {
  mocked(PluginFileAPI.getElements).mockResolvedValue(success([]));
  await runProbe();
  mocked(PluginCommAPI.lassoElements).mockClear();
  const letters = [
    strokeElement(zigzag(100), 1),
    strokeElement(zigzag(150), 2),
  ];
  mocked(PluginFileAPI.getElements).mockResolvedValue(success(letters));
  await write(zigzag(100), 1);
  await write(zigzag(150), 2);
  expect(PluginCommAPI.lassoElements).not.toHaveBeenCalled();
  await write(circle(), 3);
  // The two letters, 40 px high, padded by a quarter of that and grown to 2.5 letter heights high.
  expect(PluginCommAPI.lassoElements).toHaveBeenCalledWith({
    left: 90,
    top: 70,
    right: 200,
    bottom: 170,
  });
  expect(logLines().join('\n')).toMatch(/probe word: rule circle, 2 stroke/);
  expect(logLines().join('\n')).toMatch(/getPenInfo \(after the lasso\) -> ok/);
});

it('logs a lassoed picture’s fields and closes the view after the lasso', async () => {
  const picture = {
    uuid: 'p',
    type: 200,
    numInPage: 3,
    picture: {
      picturePath: '/MyStyle/Ink2Pic/a.png',
      rect: {left: 1, top: 2, right: 3, bottom: 4},
    },
  };
  mocked(PluginFileAPI.getElements).mockResolvedValue(success([picture]));
  mocked(PluginCommAPI.getLassoElements).mockResolvedValue(success([picture]));
  await runProbe();
  expect(PluginCommAPI.lassoElements).toHaveBeenCalledWith(
    picture.picture.rect,
  );
  const text = logLines().join('\n');
  expect(text).toMatch(
    /probe lasso picture: keys .*picture.*\/MyStyle\/Ink2Pic\/a\.png/,
  );
  const order = mocked(PluginCommAPI.lassoElements).mock.invocationCallOrder[0];
  expect(
    mocked(PluginManager.closePluginView).mock.invocationCallOrder[0],
  ).toBeGreaterThan(order);
});

it('reads a bare PenInfo as well as an APIResponse', async () => {
  mocked(PluginCommAPI.getPenInfo).mockResolvedValueOnce({
    type: 16,
    color: 0,
    width: 100,
  });
  expect(await getPenInfo()).toEqual({
    ok: true,
    value: {type: 16, color: 0, width: 100},
  });
});

it('reads a stroke’s points in parts and none for another element', async () => {
  const points = zigzag(0);
  expect(await strokePoints(strokeElement(points))).toEqual({
    ok: true,
    value: points,
  });
  expect(await strokePoints({type: 200})).toEqual({ok: true, value: []});
});

it('reads the page again at each pen-up, so a page change is followed (#75)', async () => {
  mocked(PluginFileAPI.getElements).mockResolvedValue(success([]));
  await runProbe();
  mocked(PluginCommAPI.getCurrentPageNum).mockClear();
  await write(zigzag(100), 1);
  mocked(PluginCommAPI.getCurrentPageNum).mockResolvedValue(success(4));
  await write(zigzag(150), 2);
  expect(PluginCommAPI.getCurrentPageNum).toHaveBeenCalledTimes(2);
  expect(PluginFileAPI.getPageSize).toHaveBeenLastCalledWith('/Note/a.note', 4);
});

it('removes the pen and motion listeners when the view closes (lifecycle 3, #75)', async () => {
  mocked(PluginFileAPI.getElements).mockResolvedValue(success([]));
  await runProbe();
  expect(probeArmed()).toBe(true);
  life({state: 2});
  expect(probeArmed()).toBe(true);
  life({state: 3});
  expect(probeArmed()).toBe(false);
  expect(removed.sort()).toEqual(['life', 'motion', 'pen-up']);
  expect(logLines().join('\n')).toMatch(/probe: listeners off/);
});
