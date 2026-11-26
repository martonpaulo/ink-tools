/** Lasso Actions' module table and settings file (#306): old shape, new shape, corrupt file, and an off module. */
import {activeLookup, MODULE_IDS, MODULES} from '../src/modules';
import {
  defaultSettings,
  LASSO_SETTINGS_VERSION,
  parseLassoSettings,
  serializeLassoSettings,
  serializeSettings,
} from '../src/settings';
import {isOn} from '../src/buttons';

test('every module id has one row', () => {
  expect(MODULES.map(row => row.id)).toEqual([...MODULE_IDS]);
});

test("Word Lookup's file is read whole as Lookup's settings, every module on, to be written once in the new shape", () => {
  const old = serializeSettings({
    ...defaultSettings,
    definition: true,
    sourcesOff: ['openmoji'],
  });
  const {settings, problems} = parseLassoSettings(old);
  expect(problems).toEqual([]);
  expect(settings.oldShape).toBe(true);
  expect(settings.modules).toEqual({lookup: true});
  expect(settings.lookup).toEqual({
    ...defaultSettings,
    definition: true,
    sourcesOff: ['openmoji'],
  });
  const written = JSON.parse(
    serializeLassoSettings({...settings, oldShape: false}),
  );
  expect(written.version).toBe(LASSO_SETTINGS_VERSION);
  expect(written.lookup.definition).toBe(true);
  expect(written.lookup.version).toBeUndefined();
});

test('a file already in the new shape is read as it is, not marked for a rewrite', () => {
  const settings = {
    ...parseLassoSettings(null).settings,
    modules: {lookup: false},
    otherModules: {convert: true},
  };
  const again = parseLassoSettings(serializeLassoSettings(settings));
  expect(again.problems).toEqual([]);
  expect(again.settings).toEqual({...settings, oldShape: false});
  expect(JSON.parse(serializeLassoSettings(again.settings)).modules).toEqual({
    convert: true,
    lookup: false,
  });
});

test('a corrupt or missing file gives the defaults, every module on, and throws nothing', () => {
  for (const text of [null, '{', '[1]', 'null']) {
    const {settings} = parseLassoSettings(text);
    expect(settings.modules).toEqual({lookup: true});
    expect(settings.lookup).toEqual(defaultSettings);
  }
  const bad = parseLassoSettings(
    JSON.stringify({modules: {lookup: 'no'}, lookup: 3}),
  );
  expect(bad.settings.modules).toEqual({lookup: true});
  expect(bad.problems).toHaveLength(1);
});

test('with the Lookup module off no Lookup button is on, and on again its switches come back', () => {
  const lookup = {...defaultSettings, definition: true};
  const off = activeLookup({lookup: false}, lookup);
  expect(MODULES[0].buttons.filter(button => isOn(off, button))).toEqual([]);
  expect(activeLookup({lookup: true}, lookup)).toBe(lookup);
});
