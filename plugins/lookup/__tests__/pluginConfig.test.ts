import config from '../PluginConfig.json';
import ink2pic from '../../ink2pic/PluginConfig.json';

test('plugin config declares its own generated id and no permission yet', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  // lookup is a new plugin beside Ink2Pic, never Ink2Pic renamed (owner D40, #110).
  expect(config.pluginID).not.toBe(ink2pic.pluginID);
  // INTERNET joins with the first online provider, as Bridge's FILE:WRITE waits for a writer (#83).
  expect(config['uses-permissions']).toEqual([]);
});
