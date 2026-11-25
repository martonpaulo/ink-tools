import config from '../PluginConfig.json';
import lookup from '../../lasso-actions/PluginConfig.json';

test('plugin config declares its own generated id and both file permissions', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  expect([lookup.pluginID]).not.toContain(config.pluginID);
  expect(config.name).toBe('Real-Time Conversion');
  // READ for the page size, WRITE for the page change (#148, #170).
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
  ]);
});
