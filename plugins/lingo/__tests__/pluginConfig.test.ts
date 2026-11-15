import config from '../PluginConfig.json';

test('plugin config declares a generated id and Internet only', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  // INTERNET for the online dictionaries (#128); no file call, so no file permission (#83).
  expect(config['uses-permissions']).toEqual(['plugin.permission.INTERNET']);
});
