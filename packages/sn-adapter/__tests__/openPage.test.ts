/**
 * Every write on the open page saves the note first and changes nothing when the save fails
 * (#524): an insert from the host's page data brought back what the person had erased, pasted or
 * deleted on the tablet.
 */
import {PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {
  batchUpdatePageElements,
  deletePageElements,
  insertPageElements,
  modifyPageElements,
  ok,
  onSavedPage,
  UNSAVED_CODE,
  UNSAVED_REFUSAL,
} from '../src/official';

const mocked = (fn: unknown) => fn as jest.Mock;
const saved = (result: boolean) => ({success: true, result});

beforeEach(() => jest.resetAllMocks());

/** Each open-page write, its SDK call and the answer that call gives on success. */
const writes: [string, jest.Mock, () => Promise<unknown>, unknown][] = [
  ['insertPageElements', mocked(PluginCommAPI.insertPageElements), () => insertPageElements([{}], 0), true],
  ['modifyPageElements', mocked(PluginCommAPI.modifyPageElements), () => modifyPageElements([{}], 0), [1]],
  ['deletePageElements', mocked(PluginCommAPI.deletePageElements), () => deletePageElements([1], 0), true],
  [
    'batchUpdatePageElements',
    mocked(PluginCommAPI.batchUpdatePageElements),
    () => batchUpdatePageElements([1], [{}], 0),
    true,
  ],
];

describe.each(writes)('%s on the open page', (_name, sdkCall, write, value) => {
  it('saves the note before it writes', async () => {
    mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue(saved(true));
    sdkCall.mockResolvedValue({success: true, result: value});
    expect(await write()).toEqual(ok(value));
    expect(mocked(PluginNoteAPI.saveCurrentNote).mock.invocationCallOrder[0]).toBeLessThan(
      sdkCall.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ['answers false', () => mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue(saved(false)), 'answered false'],
    [
      'fails',
      () => mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue({success: false, error: {code: 118, message: 'no note'}}),
      '118 no note',
    ],
    ['throws', () => mocked(PluginNoteAPI.saveCurrentNote).mockRejectedValue(new Error('bridge down')), '-1 bridge down'],
  ])('changes nothing when the save %s', async (_how, arrange, why) => {
    arrange();
    expect(await write()).toEqual({
      ok: false,
      code: UNSAVED_CODE,
      message: `${UNSAVED_REFUSAL} (saveCurrentNote ${why})`,
    });
    expect(sdkCall).not.toHaveBeenCalled();
  });
});

describe('onSavedPage', () => {
  it("hands back the write's own failure once the note saved", async () => {
    const failure = {ok: false, code: 302, message: 'Invalid pen type'} as const;
    expect(await onSavedPage(async () => failure, async () => ok(true))).toEqual(failure);
  });
});
