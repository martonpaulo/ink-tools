import {PluginManager} from 'sn-plugin-lib';
import {COMMAND_BUTTON, registerProbe} from '../src/register';

const lib = PluginManager as unknown as Record<string, jest.Mock>;

beforeEach(() => jest.resetAllMocks());

function ready() {
  lib.init.mockResolvedValue(true);
  lib.registerConfigButton.mockResolvedValue(true);
  lib.registerButton.mockResolvedValue(true);
}

test('registers the Settings entry and the one «Run Command» note button, with no view', async () => {
  ready();
  const click = jest.fn();
  await registerProbe(click, jest.fn(), 'icon.png');
  expect(lib.registerConfigButton).toHaveBeenCalledTimes(1);
  expect(lib.registerButton).toHaveBeenCalledTimes(1);
  expect(lib.registerButton).toHaveBeenCalledWith(1, ['NOTE'], {id: 300, name: 'Run Command', icon: 'icon.png', showType: 0});
  lib.registerConfigButtonListener.mock.calls[0][0].onClick();
  expect(click).toHaveBeenCalled();
});

test('a press of «Run Command» runs the command, and another button id does not', async () => {
  ready();
  const command = jest.fn();
  await registerProbe(jest.fn(), command, 'icon.png');
  const listener = lib.registerButtonListener.mock.calls[0][0];
  listener.onButtonPress({id: COMMAND_BUTTON.id + 1});
  expect(command).not.toHaveBeenCalled();
  listener.onButtonPress({id: COMMAND_BUTTON.id});
  expect(command).toHaveBeenCalledTimes(1);
});

test('a refused Settings registration is an error, not a success', async () => {
  lib.init.mockResolvedValue(true);
  lib.registerConfigButton.mockResolvedValue(false);
  await expect(registerProbe(jest.fn(), jest.fn(), 'icon.png')).rejects.toThrow('registerConfigButton answered false');
});

test('a refused button registration is an error, not a success', async () => {
  ready();
  lib.registerButton.mockResolvedValue(false);
  await expect(registerProbe(jest.fn(), jest.fn(), 'icon.png')).rejects.toThrow('registerButton(Run Command) answered false');
});
