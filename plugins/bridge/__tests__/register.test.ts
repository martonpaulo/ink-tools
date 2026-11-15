import {PluginManager} from 'sn-plugin-lib';
// sn-adapter's registerSettingsEntry, shared with Lingo, is tested here (#101).
import {registerSettingsEntry} from '@supernote-tools/sn-adapter/official';

const lib = PluginManager as unknown as Record<string, jest.Mock>;

beforeEach(() => jest.resetAllMocks());

test('registers only the Settings entry and never a note button', async () => {
  lib.init.mockResolvedValue(true);
  lib.registerConfigButton.mockResolvedValue(true);
  const click = jest.fn();
  await registerSettingsEntry(click);
  expect(lib.registerConfigButton).toHaveBeenCalledTimes(1);
  expect(lib.registerButton).not.toHaveBeenCalled();
  lib.registerConfigButtonListener.mock.calls[0][0].onClick();
  expect(click).toHaveBeenCalled();
});

test('a refused Settings registration is an error, not a success', async () => {
  lib.init.mockResolvedValue(true);
  lib.registerConfigButton.mockResolvedValue(false);
  await expect(registerSettingsEntry(jest.fn())).rejects.toThrow(
    'registerConfigButton answered false',
  );
});
