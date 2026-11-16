import config from '../PluginConfig.json';
import lookup from '../../lookup/PluginConfig.json';

test('plugin config declares its own generated id and the file permissions only', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  expect(config.pluginID).not.toBe(lookup.pluginID);
  // The picture states live in shared storage (src/edit.ts), and dropped ones are deleted
  // (#182); no network (#136).
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
    'plugin.permission.FILE:DELETE',
  ]);
});
