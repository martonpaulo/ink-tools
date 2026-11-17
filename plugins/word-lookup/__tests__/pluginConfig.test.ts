import config from '../PluginConfig.json';
import ink2pic from '../../ink2pic/PluginConfig.json';

test('plugin config declares its own generated id and the permissions its presses need', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
  // lookup is a new plugin beside Ink2Pic, never Ink2Pic renamed (owner D40, #110).
  expect(config.pluginID).not.toBe(ink2pic.pluginID);
  // Internet for Wiktionary and the picture sources, file read for the lasso calls (#115, #128),
  // file write for the settings file and the prepared pictures in MyStyle/Lookup (#142).
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.INTERNET',
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
  ]);
});
