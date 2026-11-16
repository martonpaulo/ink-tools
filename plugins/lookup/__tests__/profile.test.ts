/**
 * Lookup's profile (#142): its own folder and native module names beside Ink2Pic's, the names its
 * Java package registers, and its settings file read with defaults and written back.
 */
import {readFileSync} from 'fs';
import {join} from 'path';
import {INK2PIC_PROFILE} from '../../ink2pic/src/profile';
import {LOOKUP_PROFILE, settingsPath} from '../src/profile';
import {
  defaultSettings,
  parseSettings,
  serializeSettings,
} from '../src/settings';

test('Lookup keeps its own folder and module names, never Ink2Pic’s', () => {
  expect(LOOKUP_PROFILE.folder).toBe('MyStyle/Lookup');
  expect(LOOKUP_PROFILE.folder).not.toBe(INK2PIC_PROFILE.folder);
  expect(LOOKUP_PROFILE.filesModule).not.toBe(INK2PIC_PROFILE.filesModule);
  expect(LOOKUP_PROFILE.imageModule).not.toBe(INK2PIC_PROFILE.imageModule);
  expect(LOOKUP_PROFILE.userAgent).toMatch(/^Lookup\/\S+ \(\+https:\/\//);
  expect(settingsPath('/sdcard')).toBe('/sdcard/MyStyle/Lookup/settings.json');
});

test('LookupFilesPackage registers the module names the profile calls', () => {
  const java = readFileSync(
    join(__dirname, '../native/com/lookup/files/LookupFilesPackage.java'),
    'utf8',
  );
  expect(java).toContain(
    `super("${LOOKUP_PROFILE.filesModule}", "${LOOKUP_PROFILE.imageModule}")`,
  );
  const build = readFileSync(
    join(__dirname, '../scripts/native-build.cjs'),
    'utf8',
  );
  expect(build).toContain("'com.lookup.files.LookupFilesPackage'");
});

describe('the settings file', () => {
  test('no file yet: the defaults, with no problem', () => {
    expect(parseSettings(null)).toEqual({
      settings: defaultSettings,
      problems: [],
    });
  });

  test('a saved file reads back as it was written', () => {
    const saved = {
      definition: true,
      illustration: false,
      photo: true,
      choose: false,
      translation: true,
      pairs: {'es-pt': true, 'zh-pt': false},
    };
    expect(parseSettings(serializeSettings(saved)).settings).toEqual(saved);
  });

  test('a file from before the translation button: translation and every pair off (#158)', () => {
    const parsed = parseSettings('{"version": 1, "definition": true}');
    expect(parsed.settings.translation).toBe(false);
    expect(parsed.settings.pairs).toEqual({'es-pt': false, 'zh-pt': false});
    expect(parsed.problems).toEqual([]);
  });

  test('a pair that is not true or false takes its default and is named; an unknown pair is dropped', () => {
    const parsed = parseSettings(
      '{"pairs": {"es-pt": "yes", "zh-pt": true, "en-pt": true}}',
    );
    expect(parsed.settings.pairs).toEqual({'es-pt': false, 'zh-pt': true});
    expect(parsed.problems).toEqual([
      'settings: pairs.es-pt is not true or false; the default is used',
    ]);
    expect(parseSettings('{"pairs": [true]}').problems).toEqual([
      'settings: pairs is not an object; the defaults are used',
    ]);
  });

  test('a parsed file never shares its pair map with the defaults', () => {
    const parsed = parseSettings(null).settings;
    parsed.pairs['es-pt'] = true;
    expect(defaultSettings.pairs['es-pt']).toBe(false);
  });

  test('a switch that is not true or false takes its default and is named', () => {
    const parsed = parseSettings('{"photo": "yes", "definition": true}');
    expect(parsed.settings).toEqual({...defaultSettings, definition: true});
    expect(parsed.problems).toEqual([
      'settings: photo is not true or false; the default is used',
    ]);
  });

  test('a file that is not a JSON object gives the defaults', () => {
    expect(parseSettings('[1]').settings).toEqual(defaultSettings);
    expect(parseSettings('{').settings).toEqual(defaultSettings);
  });
});
