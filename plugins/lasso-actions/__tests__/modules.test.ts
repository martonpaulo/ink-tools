/** Lasso Actions' module table and settings file (#306): old shape, new shape, corrupt file, and an off module. */
import {ok} from '@ink-tools/sn-adapter/official';
import {
  activeLookup,
  MODULE_IDS,
  MODULES,
  moduleStates,
  syncModules,
} from '../src/modules';
import {HEADING_BUTTONS} from '../src/headings/buttons';
import {COLLECTION_BUTTONS} from '../src/collection/buttons';
import {
  defaultSettings,
  LASSO_SETTINGS_VERSION,
  parseLassoSettings,
  serializeLassoSettings,
  serializeSettings,
} from '../src/settings';
import {
  BUTTON_TYPE_LASSO,
  BUTTON_TYPE_SIDEBAR,
  EDIT_DATA_STROKES,
  SHOW_FULL_VIEW,
  SHOW_NO_VIEW,
  ButtonDeps,
  isOn,
  LassoButton,
  resetButtonsForTests,
} from '../src/buttons';

const ALL_ON = {lookup: true, headings: true, collection: true};

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
  expect(settings.modules).toEqual(ALL_ON);
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
    modules: {lookup: false, headings: true, collection: true},
    otherModules: {convert: true},
  };
  const again = parseLassoSettings(serializeLassoSettings(settings));
  expect(again.problems).toEqual([]);
  expect(again.settings).toEqual({...settings, oldShape: false});
  expect(JSON.parse(serializeLassoSettings(again.settings)).modules).toEqual({
    convert: true,
    lookup: false,
    headings: true,
    collection: true,
  });
});

test('a corrupt or missing file gives the defaults, every module on, and throws nothing', () => {
  for (const text of [null, '{', '[1]', 'null']) {
    const {settings} = parseLassoSettings(text);
    expect(settings.modules).toEqual(ALL_ON);
    expect(settings.lookup).toEqual(defaultSettings);
  }
  const bad = parseLassoSettings(
    JSON.stringify({modules: {lookup: 'no'}, lookup: 3}),
  );
  expect(bad.settings.modules).toEqual(ALL_ON);
  expect(bad.problems).toHaveLength(1);
});

test('with the Lookup module off no Lookup button is on, and on again its switches come back', () => {
  const lookup = {...defaultSettings, definition: true};
  const off = activeLookup({...ALL_ON, lookup: false}, lookup);
  const lookupButtons = MODULES[0].buttons as readonly LassoButton[];
  expect(lookupButtons.filter(button => isOn(off, button))).toEqual([]);
  expect(activeLookup(ALL_ON, lookup)).toBe(lookup);
});

test('Headings registers its four lasso buttons while it is on, and none while it is off (#252)', async () => {
  const on = (modules: typeof ALL_ON) =>
    moduleStates({...parseLassoSettings(null).settings, modules})
      .filter(state => state.on)
      .map(state => state.button.id);
  const ids = HEADING_BUTTONS.map(button => button.id);
  expect(on(ALL_ON)).toEqual(expect.arrayContaining(ids));
  expect(on({...ALL_ON, headings: false})).not.toEqual(
    expect.arrayContaining([ids[0]]),
  );
  // Turning Lookup off leaves the Headings buttons on.
  expect(on({lookup: false, headings: true, collection: false})).toEqual(ids);

  resetButtonsForTests();
  const deps = {
    register: jest.fn(async () => ok(true as const)),
    unregister: jest.fn(async (_id: number) => ok(true as const)),
    hasPermission: jest.fn(async () => ok(true)),
    requestPermission: jest.fn(async () => ok(2)),
    log: () => {},
  } satisfies ButtonDeps;
  const settings = parseLassoSettings(null).settings;
  await syncModules(settings, deps);
  const calls = deps.register.mock.calls as unknown as [
    number,
    string[],
    {id: number; name: string},
  ][];
  const heading = calls.filter(([, , config]) => ids.includes(config.id));
  expect(heading.map(([type, , config]) => [type, config.name])).toEqual([
    [BUTTON_TYPE_LASSO, 'Heading 1'],
    [BUTTON_TYPE_LASSO, 'Heading 2'],
    [BUTTON_TYPE_LASSO, 'Heading 3'],
    [BUTTON_TYPE_LASSO, 'Heading 4'],
  ]);
  await syncModules(
    {...settings, modules: {...settings.modules, headings: false}},
    deps,
  );
  expect(deps.unregister.mock.calls.map(([id]) => id)).toEqual(ids);
  resetButtonsForTests();
});

test('Collection registers two lasso rows and one toolbar button with a view, and keeps its setting (#249)', async () => {
  resetButtonsForTests();
  const deps = {
    register: jest.fn(async () => ok(true as const)),
    unregister: jest.fn(async (_id: number) => ok(true as const)),
    hasPermission: jest.fn(async () => ok(true)),
    requestPermission: jest.fn(async () => ok(2)),
    log: () => {},
  } satisfies ButtonDeps;
  await syncModules(parseLassoSettings(null).settings, deps);
  const calls = deps.register.mock.calls as unknown as [
    number,
    string[],
    {id: number; name: string; showType: number; editDataTypes?: number[]},
  ][];
  const ids = COLLECTION_BUTTONS.map(button => button.id);
  expect(
    calls
      .filter(([, , config]) => ids.includes(config.id))
      .map(([type, , config]) => [
        type,
        config.name,
        config.showType,
        config.editDataTypes,
      ]),
  ).toEqual([
    [BUTTON_TYPE_LASSO, 'Add to Collection', SHOW_NO_VIEW, [EDIT_DATA_STROKES]],
    [BUTTON_TYPE_LASSO, 'Cut to Collection', SHOW_NO_VIEW, [EDIT_DATA_STROKES]],
    [BUTTON_TYPE_SIDEBAR, 'Paste Collection', SHOW_FULL_VIEW, undefined],
  ]);
  resetButtonsForTests();

  const defaults = parseLassoSettings(null).settings;
  expect(defaults.collection).toEqual({keepAfterPaste: false});
  const kept = parseLassoSettings(
    serializeLassoSettings({...defaults, collection: {keepAfterPaste: true}}),
  );
  expect(kept.problems).toEqual([]);
  expect(kept.settings.collection).toEqual({keepAfterPaste: true});
  const wrong = parseLassoSettings(
    JSON.stringify({modules: {}, collection: {keepAfterPaste: 'yes'}}),
  );
  expect(wrong.settings.collection).toEqual({keepAfterPaste: false});
  expect(wrong.problems).toHaveLength(1);
});

test('Heading Size is saved, own size by default, and a wrong value falls back to it (owner D90)', () => {
  const defaults = parseLassoSettings(null).settings;
  expect(defaults.headings).toEqual({size: 'own'});
  const full = parseLassoSettings(serializeLassoSettings({...defaults, headings: {size: 'full'}}));
  expect(full.problems).toEqual([]);
  expect(full.settings.headings).toEqual({size: 'full'});
  const wrong = parseLassoSettings(JSON.stringify({modules: {}, headings: {size: 'wide'}}));
  expect(wrong.settings.headings).toEqual({size: 'own'});
  expect(wrong.problems).toEqual(['settings: headings.size is not own or full; own size is used']);
});
