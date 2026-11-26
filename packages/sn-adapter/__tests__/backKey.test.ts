/** The shared Back key module's call (#300). */
import {listenBackKey} from '../src/official/backKey';

test('arms the plugin\'s own Back key module on the view\'s root', async () => {
  const listen = jest.fn(async () => true);
  await expect(listenBackKey('DeviceLinkBack', 11, {DeviceLinkBack: {listenBackKey: listen}})).resolves.toEqual({
    ok: true,
    value: true,
  });
  expect(listen).toHaveBeenCalledWith(11);
});

test('says the module is missing, and keeps a rejection\'s code', async () => {
  const missing = await listenBackKey('DeviceLinkBack', 11, {});
  expect(missing.ok).toBe(false);
  const refused = await listenBackKey('DeviceLinkBack', 11, {
    DeviceLinkBack: {
      listenBackKey: async () => {
        throw Object.assign(new Error('no view has the root tag 11'), {code: 'NOT_FOUND'});
      },
    },
  });
  expect(refused).toMatchObject({ok: false, moduleCode: 'NOT_FOUND'});
});
