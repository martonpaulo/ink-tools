import config from '../PluginConfig.json';
import lookup from '../../word-lookup/PluginConfig.json';
import conversion from '../../real-time-conversion/PluginConfig.json';

test('plugin config declares its own generated id and both file permissions', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  expect([lookup.pluginID, conversion.pluginID]).not.toContain(config.pluginID);
  expect(config.name).toBe('Smart Shapes');
  // READ for the stroke and the lasso, WRITE to delete the stroke (#253).
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
  ]);
});
