import config from '../PluginConfig.json';
import lingo from '../../lingo/PluginConfig.json';

test('plugin config declares its own generated id and the file permissions only', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  expect(config.pluginID).not.toBe(lingo.pluginID);
  // The picture states live in shared storage (src/edit.ts); no network (#136).
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
  ]);
});
