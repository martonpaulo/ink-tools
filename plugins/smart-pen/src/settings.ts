/**
 * Smart Pen's settings file (#305): each module's switch and each module's own settings, kept in the
 * private folder's `settings.json` by picture-search's settings store (#22), so a switch survives a
 * restart, and which action each finger gesture runs (#270). Real-Time Conversion and Smart Shapes kept their settings in memory only, so there is no
 * older file to migrate: a first start reads the defaults.
 *
 * A file from a newer build may name a module this build does not know: its switch is kept as it
 * is and written back, and ignored here. A value of the wrong type is a logged problem, and its
 * default is used.
 */
import type {SettingsCodec} from '@ink-tools/picture-search/storage';
import {MODULE_IDS, type ModuleId} from './modules';
import {
  DEFAULT_SETTINGS as TEXT_DEFAULTS,
  type Settings as TextSettings,
  type Spacing,
  type Wait,
  SPACING,
  WAIT_MS,
} from './modules/text/settings';
import {
  DEFAULT_SETTINGS as SHAPES_DEFAULTS,
  MIN_SIZE_CHOICES_MM,
  type Settings as ShapesSettings,
} from './modules/shapes/settings';
import type {ShapeKind} from './modules/shapes/recognize';
import {
  DEFAULT_SETTINGS as GESTURE_DEFAULTS,
  GESTURES,
  type Settings as GestureSettings,
  TOOL_ACTIONS,
} from './modules/gestures/settings';

export type PenSettings = {
  /** One switch per module; a module off registers no button and listens to no pen event. */
  modules: Record<ModuleId, boolean>;
  text: TextSettings;
  shapes: ShapesSettings;
  gestures: GestureSettings;
  /** The switches of modules a newer build added, kept so this build never drops them. */
  otherModules: Record<string, unknown>;
};

/**
 * Every module starts on: the two plugins it replaces each worked once installed, and Gestures
 * listen only once what they need is there (#270).
 */
export const DEFAULT_PEN_SETTINGS: PenSettings = {
  modules: {text: true, shapes: true, gestures: true},
  text: TEXT_DEFAULTS,
  shapes: SHAPES_DEFAULTS,
  gestures: GESTURE_DEFAULTS,
  otherModules: {},
};

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** `raw[key]` when `valid` says so; else the default, with a problem when the key was there. */
function pick<T>(
  raw: Raw,
  key: string,
  valid: (value: unknown) => value is T,
  fallback: T,
  where: string,
  problems: string[],
): T {
  if (!(key in raw)) {
    return fallback;
  }
  if (valid(raw[key])) {
    return raw[key] as T;
  }
  problems.push(`settings: ${where}.${key} is not valid; the default is used`);
  return fallback;
}

const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean';
const oneOf =
  <T extends string | number>(choices: readonly T[]) =>
  (value: unknown): value is T =>
    choices.includes(value as T);

function parseText(raw: unknown, problems: string[]): TextSettings {
  if (!isObject(raw)) {
    return TEXT_DEFAULTS;
  }
  const spacings = Object.keys(SPACING) as Spacing[];
  const waits = Object.keys(WAIT_MS) as Wait[];
  return {
    startOn: pick(
      raw,
      'startOn',
      isBoolean,
      TEXT_DEFAULTS.startOn,
      'text',
      problems,
    ),
    spacing: pick(
      raw,
      'spacing',
      oneOf(spacings),
      TEXT_DEFAULTS.spacing,
      'text',
      problems,
    ),
    wait: pick(raw, 'wait', oneOf(waits), TEXT_DEFAULTS.wait, 'text', problems),
  };
}

function parseShapes(raw: unknown, problems: string[]): ShapesSettings {
  if (!isObject(raw)) {
    return SHAPES_DEFAULTS;
  }
  const kinds = Object.keys(SHAPES_DEFAULTS.shapes) as ShapeKind[];
  const shapes = isObject(raw.shapes) ? raw.shapes : {};
  return {
    minSizeMm: pick(
      raw,
      'minSizeMm',
      oneOf<number>(MIN_SIZE_CHOICES_MM),
      SHAPES_DEFAULTS.minSizeMm,
      'shapes',
      problems,
    ),
    shapes: Object.fromEntries(
      kinds.map(kind => [
        kind,
        pick(
          shapes,
          kind,
          isBoolean,
          SHAPES_DEFAULTS.shapes[kind],
          'shapes.shapes',
          problems,
        ),
      ]),
    ) as Record<ShapeKind, boolean>,
  };
}

function parseGestures(raw: unknown, problems: string[]): GestureSettings {
  if (!isObject(raw)) {
    return GESTURE_DEFAULTS;
  }
  return Object.fromEntries(
    GESTURES.map(gesture => [
      gesture,
      pick(
        raw,
        gesture,
        oneOf(TOOL_ACTIONS),
        GESTURE_DEFAULTS[gesture],
        'gestures',
        problems,
      ),
    ]),
  ) as GestureSettings;
}

/** The settings in a file's text; the defaults for no file or one that is not a JSON object. */
export function parsePenSettings(text: string | null): {
  settings: PenSettings;
  problems: string[];
} {
  const problems: string[] = [];
  if (text === null) {
    return {settings: DEFAULT_PEN_SETTINGS, problems};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  if (!isObject(raw)) {
    problems.push(
      'settings: the file is not a JSON object; the defaults are used',
    );
    return {settings: DEFAULT_PEN_SETTINGS, problems};
  }
  const modules = isObject(raw.modules) ? raw.modules : {};
  const otherModules = Object.fromEntries(
    Object.entries(modules).filter(
      ([id]) => !MODULE_IDS.includes(id as ModuleId),
    ),
  );
  return {
    settings: {
      modules: Object.fromEntries(
        MODULE_IDS.map(id => [
          id,
          pick(
            modules,
            id,
            isBoolean,
            DEFAULT_PEN_SETTINGS.modules[id],
            'modules',
            problems,
          ),
        ]),
      ) as Record<ModuleId, boolean>,
      text: parseText(raw.text, problems),
      shapes: parseShapes(raw.shapes, problems),
      gestures: parseGestures(raw.gestures, problems),
      otherModules,
    },
    problems,
  };
}

export function serializePenSettings(settings: PenSettings): string {
  return JSON.stringify(
    {
      modules: {...settings.otherModules, ...settings.modules},
      text: settings.text,
      shapes: settings.shapes,
      gestures: settings.gestures,
    },
    null,
    2,
  );
}

export const PEN_SETTINGS: SettingsCodec<PenSettings> = {
  parse: text => parsePenSettings(text),
  serialize: serializePenSettings,
  describe: settings =>
    MODULE_IDS.map(id => `${id} ${settings.modules[id] ? 'on' : 'off'}`).join(
      ', ',
    ),
};
