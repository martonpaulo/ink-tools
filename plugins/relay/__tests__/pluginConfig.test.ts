import config from '../PluginConfig.json';
import bridge from '../../bridge/PluginConfig.json';
import ink2pic from '../../ink2pic/PluginConfig.json';
import lookup from '../../lookup/PluginConfig.json';
import probe from '../../probe/PluginConfig.json';

const others = [bridge, ink2pic, lookup, probe].map(c => c.pluginID);

test('plugin config declares its own generated id', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  // relay is a new plugin, never another one renamed (#98).
  expect(others).not.toContain(config.pluginID);
});

test('plugin config declares the network and the two file permissions', () => {
  // INTERNET for LocalSend; FILE:WRITE for the PNG it renders, FILE:READ to send it (#98).
  expect([...config['uses-permissions']].sort()).toEqual([
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
    'plugin.permission.INTERNET',
  ]);
});
