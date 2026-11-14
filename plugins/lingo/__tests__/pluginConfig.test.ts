import config from '../PluginConfig.json';

test('plugin config declares a generated id and no permission yet', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  // INTERNET joins with the first online provider, as Bridge's FILE:WRITE waits for a writer (#83).
  expect(config['uses-permissions']).toEqual([]);
});
