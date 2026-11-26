import config from '../PluginConfig.json';

test('plugin config declares a generated id and no extra permission', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.INTERNET',
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
    // Removes the files older builds left in MyStyle/Probe at start (#148, docs/supernote.md › Plugins).
    'plugin.permission.FILE:DELETE',
  ]);
});
