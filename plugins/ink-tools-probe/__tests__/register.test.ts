import {PluginManager} from 'sn-plugin-lib';
import {COMMAND_BUTTON, LASSO_COMMAND_BUTTON, registerProbe} from '../src/register';

const lib = PluginManager as unknown as Record<string, jest.Mock>;

beforeEach(() => jest.resetAllMocks());

function ready() {
  lib.init.mockResolvedValue(true);
  lib.registerConfigButton.mockResolvedValue(true);
  lib.registerButton.mockResolvedValue(true);
}

test('registers the Settings entry and «Run Command» in the sidebar and the lasso menu, with no view', async () => {
  ready();
  const click = jest.fn();
  await registerProbe(click, jest.fn(), 'icon.png');
  expect(lib.registerConfigButton).toHaveBeenCalledTimes(1);
  expect(lib.registerButton).toHaveBeenCalledTimes(2);
  expect(lib.registerButton).toHaveBeenCalledWith(1, ['NOTE'], {id: 300, name: 'Run Command', icon: 'icon.png', showType: 0});
  expect(lib.registerButton).toHaveBeenCalledWith(2, ['NOTE'], {
    id: 301,
    name: 'Run Command',
    icon: 'icon.png',
    editDataTypes: [0, 1, 2, 3, 4, 5],
    showType: 0,
  });
  lib.registerConfigButtonListener.mock.calls[0][0].onClick();
  expect(click).toHaveBeenCalled();
});

test('a press of either «Run Command» runs the command, and another button id does not', async () => {
  ready();
  const command = jest.fn();
  await registerProbe(jest.fn(), command, 'icon.png');
  const listener = lib.registerButtonListener.mock.calls[0][0];
  listener.onButtonPress({id: LASSO_COMMAND_BUTTON.id + 1});
  expect(command).not.toHaveBeenCalled();
  listener.onButtonPress({id: COMMAND_BUTTON.id});
  listener.onButtonPress({id: LASSO_COMMAND_BUTTON.id});
  expect(command).toHaveBeenCalledTimes(2);
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

test('a refused lasso button registration is an error, not a success (#249)', async () => {
  ready();
  lib.registerButton.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(registerProbe(jest.fn(), jest.fn(), 'icon.png')).rejects.toThrow('registerButton(lasso Run Command) answered false');
});
