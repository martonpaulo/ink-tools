import config from '../PluginConfig.json';
import lookup from '../../lasso-actions/PluginConfig.json';

test('plugin config keeps Real-Time Conversion identity and both file permissions (#305)', () => {
  // The tablet updates Real-Time Conversion in place: the same pluginID and pluginKey.
  expect(config.pluginID).toBe('c4f1drtuzuh0f50a');
  expect(config.pluginKey).toBe('RealTimeConversion');
  expect([lookup.pluginID]).not.toContain(config.pluginID);
  expect(config.name).toBe('Smart Pen');
  // READ for the page size and the stroke, WRITE for the page change (#148, #170, #253).
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
  ]);
});
