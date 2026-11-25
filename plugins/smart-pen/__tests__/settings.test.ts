/** Smart Pen's settings file (#305): defaults, a round trip, a newer build's module, a broken file, and a restart. */
import {
  createSettingsStore,
  type SettingsPlace,
} from '@ink-tools/picture-search/storage';
import {ok} from '@ink-tools/sn-adapter/official';
// Sets Smart Pen's profile, which the storage tier reads (#142).
import '../src/profile';
import {
  DEFAULT_PEN_SETTINGS,
  parsePenSettings,
  PEN_SETTINGS,
  serializePenSettings,
} from '../src/settings';

test('no file gives the defaults: every module on', () => {
  expect(parsePenSettings(null)).toEqual({
    settings: DEFAULT_PEN_SETTINGS,
    problems: [],
  });
  expect(DEFAULT_PEN_SETTINGS.modules).toEqual({text: true, shapes: true});
});

test('a written file reads back the same', () => {
  const settings = {
    ...DEFAULT_PEN_SETTINGS,
    modules: {text: false, shapes: true},
    text: {startOn: true, spacing: 'wide' as const, wait: 'long' as const},
    shapes: {...DEFAULT_PEN_SETTINGS.shapes, minSizeMm: 24},
  };
  expect(parsePenSettings(serializePenSettings(settings))).toEqual({
    settings,
    problems: [],
  });
});

test("a newer build's module is kept and written back, and ignored here", () => {
  const text = JSON.stringify({modules: {text: false, gestures: true}});
  const {settings, problems} = parsePenSettings(text);
  expect(problems).toEqual([]);
  expect(settings.modules).toEqual({text: false, shapes: true});
  expect(JSON.parse(serializePenSettings(settings)).modules).toEqual({
    gestures: true,
    text: false,
    shapes: true,
  });
});

test('a wrong value is a problem and keeps its default, never the whole file', () => {
  const text = JSON.stringify({
    modules: {text: 'yes', shapes: false},
    text: {spacing: 'huge'},
    shapes: {minSizeMm: 7, shapes: {arrow: false}},
  });
  const {settings, problems} = parsePenSettings(text);
  expect(settings.modules).toEqual({text: true, shapes: false});
  expect(settings.text.spacing).toBe('normal');
  expect(settings.shapes.minSizeMm).toBe(DEFAULT_PEN_SETTINGS.shapes.minSizeMm);
  expect(settings.shapes.shapes.arrow).toBe(false);
  expect(problems).toHaveLength(3);
});

test('a broken file gives the defaults and says so', () => {
  const {settings, problems} = parsePenSettings('not json');
  expect(settings).toEqual(DEFAULT_PEN_SETTINGS);
  expect(problems).toHaveLength(1);
});

test('a module switch survives a restart', async () => {
  const files = new Map<string, string>();
  const place: SettingsPlace = {
    storage: {
      readText: async path => files.get(path) ?? null,
      writeText: async (path, text) => {
        files.set(path, text);
      },
    },
    privateDir: async () => ok('/private/SmartPen'),
    listDir: async () => ok(null),
    sharedRoot: '/shared',
  };
  const before = createSettingsStore(PEN_SETTINGS, place);
  const first = await before.getSettings();
  await before.saveSettings({...first, modules: {text: true, shapes: false}});
  // A new runtime: a new store over the same files.
  const after = createSettingsStore(PEN_SETTINGS, place);
  expect((await after.getSettings()).modules).toEqual({
    text: true,
    shapes: false,
  });
});
