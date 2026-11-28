import config from '../PluginConfig.json';
import bridge from '../../account-sync/PluginConfig.json';
import lookup from '../../lasso-actions/PluginConfig.json';
import probe from '../../ink-tools-probe/PluginConfig.json';

const others = [bridge, lookup, probe].map(c => c.pluginID);

test('plugin config declares its own generated id', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  // relay is a new plugin, never another one renamed (#98).
  expect(others).not.toContain(config.pluginID);
});

test('plugin config declares the network and the three file permissions', () => {
  // INTERNET for LocalSend; FILE:WRITE for the PNG it renders, FILE:READ to send it (#98); FILE:DELETE to
  // remove the text copy it saved beside the note, which the host refuses without it (#593).
  expect([...config['uses-permissions']].sort()).toEqual([
    'plugin.permission.FILE:DELETE',
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
    'plugin.permission.INTERNET',
  ]);
});
