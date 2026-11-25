import config from '../PluginConfig.json';

test('plugin config declares its own generated id and the permissions its presses need', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  // Internet for Wiktionary and the picture sources, file read for the lasso calls (#115, #128),
  // file write for the settings file and the prepared pictures in MyStyle/Lookup (#142).
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.INTERNET',
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
  ]);
});
