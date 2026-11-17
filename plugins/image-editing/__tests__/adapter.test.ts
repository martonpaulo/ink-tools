/** sn-adapter's `modifyPageElements`, which Retouch is the first to call (#136). */
import {PluginCommAPI} from 'sn-plugin-lib';
import {modifyPageElements} from '@supernote-tools/sn-adapter/official';

const modify = PluginCommAPI.modifyPageElements as jest.Mock;

test('answers the changed indices and passes the page and layer', async () => {
  modify.mockResolvedValueOnce({success: true, result: [3]});
  expect(await modifyPageElements([{type: 200}], 0, 1)).toEqual({ok: true, value: [3]});
  expect(modify).toHaveBeenCalledWith([{type: 200}], 0, 1);
});

test('a missing answer or an error is a failure, never a success', async () => {
  modify.mockResolvedValueOnce({success: true, result: null});
  expect((await modifyPageElements([], 0)).ok).toBe(false);
  modify.mockResolvedValueOnce({success: false, error: {code: 7, message: 'no'}});
  expect(await modifyPageElements([], 0)).toMatchObject({ok: false, code: 7});
  modify.mockRejectedValueOnce(new Error('gone'));
  expect(await modifyPageElements([], 0)).toMatchObject({ok: false, message: 'gone'});
});
