import {readFileSync} from 'fs';
import {join} from 'path';
import config from '../PluginConfig.json';
import {PLUGIN_REQUIREMENTS} from '../src/requirements';
import {copy} from '../src/copy';
import {BACK_MODULE} from '../src/PuzzlesView';
import {createRandom} from '@ink-tools/puzzle-core';

test('Puzzles has its own identity and its three file permissions (#453, #541)', () => {
  expect(config.name).toBe('Puzzles');
  expect(config.pluginKey).toBe('Puzzles');
  expect(config.pluginID).toMatch(/^[a-z0-9]{16}$/);
  // READ and WRITE: every game writes its page background and inserts the page (#377, #379);
  // DELETE: the page picture is deleted once the page is in the note (#541).
  expect(config['uses-permissions']).toEqual([
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
    'plugin.permission.FILE:DELETE',
  ]);
});

test('every declared permission has its Settings name, so Needs never shows a raw key (#541)', () => {
  for (const permission of config['uses-permissions']) {
    expect(copy.permissionNames[permission]).toBeDefined();
  }
});

test('the view checks exactly the permissions PluginConfig.json declares', () => {
  expect(PLUGIN_REQUIREMENTS.map(need => need.permission)).toEqual(config['uses-permissions']);
});

test('the Back key module has one name in Java and TypeScript', () => {
  const java = readFileSync(join(__dirname, '../native/com/puzzles/view/PuzzlesPackage.java'), 'utf8');
  expect(java).toContain(`BACK_MODULE = "${BACK_MODULE}"`);
});

test('the plugin resolves @ink-tools/puzzle-core, where the games live', () => {
  expect(createRandom('G1').int(1000)).toBe(createRandom('G1').int(1000));
});
