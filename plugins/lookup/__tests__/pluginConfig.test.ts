import config from '../PluginConfig.json';
import ink2pic from '../../ink2pic/PluginConfig.json';

test('plugin config declares its own generated id and the definition press permissions', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  // lookup is a new plugin beside Ink2Pic, never Ink2Pic renamed (owner D40, #110).
  expect(config.pluginID).not.toBe(ink2pic.pluginID);
  // «Insert definition» (#115): Internet for Wiktionary, file read for the lasso calls (#128).
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.INTERNET',
    'plugin.permission.FILE:READ',
  ]);
});
