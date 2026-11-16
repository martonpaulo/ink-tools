import config from '../PluginConfig.json';

test('plugin config declares a generated id, Internet and file read', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  // INTERNET for the online dictionaries; FILE:READ because the host refuses the lasso calls
  // without it (error 1503, device round 2026-11-16, #128).
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.INTERNET',
    'plugin.permission.FILE:READ',
  ]);
});
