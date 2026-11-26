/** The official calls #296 adopts: the host's dialogs, the save before an export, the reload and stroke times. */
import {NativeUIUtils, PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {REGISTRY} from '../src/registry.generated';
import {
  batchRedrawn,
  confirm,
  errorTip,
  ok,
  fail,
  reloadFile,
  saveBeforeExport,
  saveCurrentNote,
  strokeTimes,
  THROWN_CODE,
} from '../src/official';

const mocked = (fn: unknown) => fn as jest.Mock;

beforeEach(() => jest.resetAllMocks());

describe('confirm (showRattaDialog)', () => {
  it('puts Cancel on the left and the action on the right, as a question', async () => {
    mocked(NativeUIUtils.showRattaDialog).mockResolvedValue(true);
    expect(await confirm('Remove?', 'Remove', 'Cancel')).toEqual(ok(true));
    expect(NativeUIUtils.showRattaDialog).toHaveBeenCalledWith('Remove?', 'Cancel', 'Remove', false);
  });

  it('answers false for Cancel or Back', async () => {
    mocked(NativeUIUtils.showRattaDialog).mockResolvedValue(false);
    expect(await confirm('Remove?', 'Remove', 'Cancel')).toEqual(ok(false));
  });

  it('fails, never «no», on an answer that is not a boolean or a throw', async () => {
    mocked(NativeUIUtils.showRattaDialog).mockResolvedValue(undefined);
    expect(await confirm('q', 'a', 'c')).toMatchObject({ok: false, code: THROWN_CODE});
    mocked(NativeUIUtils.showRattaDialog).mockRejectedValue(new Error('no window'));
    expect(await confirm('q', 'a', 'c')).toEqual(fail(THROWN_CODE, 'no window'));
  });
});

describe('errorTip (showErrorTipDialog)', () => {
  it('shows the text, and turns a throw into a failure', () => {
    expect(errorTip('Could not start')).toEqual(ok(true));
    expect(NativeUIUtils.showErrorTipDialog).toHaveBeenCalledWith('Could not start');
    mocked(NativeUIUtils.showErrorTipDialog).mockImplementation(() => {
      throw new Error('no module');
    });
    expect(errorTip('x')).toEqual(fail(THROWN_CODE, 'no module'));
  });
});

describe('saveCurrentNote and the save before an export', () => {
  const clock = (...times: number[]) => () => times.shift() ?? 0;

  it('maps the SDK answer', async () => {
    mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue({success: true, result: true});
    expect(await saveCurrentNote()).toEqual(ok(true));
  });

  it('logs the save and its time', async () => {
    const log = jest.fn();
    await saveBeforeExport(log, async () => ok(true), clock(100, 140));
    expect(log).toHaveBeenCalledWith('save: the note saved in 40 ms');
  });

  it('logs a failed or false save and lets the export go on', async () => {
    const log = jest.fn();
    await expect(
      saveBeforeExport(log, async () => fail(904, 'busy'), clock(0, 5)),
    ).resolves.toBeUndefined();
    await saveBeforeExport(log, async () => ok(false), clock(0, 7));
    expect(log.mock.calls).toEqual([
      ['save: failed: 904 busy in 5 ms: the page is exported as the file holds it'],
      ['save: answered false in 7 ms: the page is exported as the file holds it'],
    ]);
  });
});

describe('reloadFile', () => {
  it('maps the SDK answer and its error', async () => {
    mocked(PluginCommAPI.reloadFile).mockResolvedValue({success: true, result: true});
    expect(await reloadFile()).toEqual(ok(true));
    mocked(PluginCommAPI.reloadFile).mockResolvedValue({success: false, error: {code: 7, message: 'no note'}});
    expect(await reloadFile()).toEqual(fail(7, 'no note'));
  });
});

describe('strokeTimes (Stroke.recognPoints)', () => {
  const stroke = (times: number[]) => {
    const points = times.map(timestamp => ({X: 1, Y: 2, Flag: 0, timestamp}));
    const getRange = jest.fn(async (start: number, count: number) => points.slice(start, start + count));
    return {element: {stroke: {recognPoints: {size: async () => points.length, getRange}}}, getRange};
  };

  it('reads the first and the last point only', async () => {
    const {element, getRange} = stroke([1000, 1010, 1020, 1090]);
    expect(await strokeTimes(element)).toEqual(ok({startedAt: 1000, endedAt: 1090}));
    expect(getRange.mock.calls).toEqual([[0, 1], [3, 1]]);
  });

  it('is null with no recognition points, none filled (-1), or no stroke', async () => {
    expect(await strokeTimes(stroke([]).element)).toEqual(ok(null));
    expect(await strokeTimes(stroke([-1, -1]).element)).toEqual(ok(null));
    expect(await strokeTimes({stroke: {}})).toEqual(ok(null));
    expect(await strokeTimes({})).toEqual(ok(null));
  });

  it('turns a failed read into a failure', async () => {
    const element = {stroke: {recognPoints: {size: async () => { throw new Error('freed'); }, getRange: jest.fn()}}};
    expect(await strokeTimes(element)).toEqual(fail(THROWN_CODE, 'freed'));
  });
});

describe('the registry carries the device facts these calls use (#296)', () => {
  it('reads a batch as redrawn only for the host redraw code', () => {
    expect(batchRedrawn(REGISTRY.pluginApiBatchNoRedraw.redrawCode)).toBe(true);
    expect(batchRedrawn(true)).toBe(false);
    expect(batchRedrawn(1)).toBe(false);
  });

  it('asks in the dialog style the registry names', async () => {
    mocked(NativeUIUtils.showRattaDialog).mockResolvedValue(true);
    await confirm('Delete?', 'Delete', 'Cancel');
    expect(mocked(NativeUIUtils.showRattaDialog)).toHaveBeenCalledWith(
      'Delete?',
      'Cancel',
      'Delete',
      REGISTRY.pluginhostHostDialogs.questionStyle,
    );
  });
});
