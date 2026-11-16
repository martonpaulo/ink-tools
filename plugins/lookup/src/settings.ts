/**
 * Lookup's Settings (#111, #142): one switch per lasso button, kept in `MyStyle/Lookup/settings.json`
 * by picture-search's settings store, so a switch survives a restart. The picture modes start on,
 * as the #111 Plan says, and «Choose Image» with them (#156); «Insert Definition» starts off, as
 * before (#115). Each translation direction has its own switch and button (#174, owner 2026-11-16:
 * no automatic direction); the owner's three directions start on, every other one off.
 */
import {ALL_DIRECTIONS, directionId} from '@supernote-tools/ink-core';
import {DEFAULT_ADAPTERS} from '@supernote-tools/picture-search';
import type {SettingsCodec} from './profile';

export const SETTINGS_VERSION = 1;

/** One switch per lasso button: the definition's, each picture mode's `settingKey`, and Choose's. */
export type LookupSettings = {
  definition: boolean;
  /** «Insert Summary», a 3-sentence bio or topic summary (#114). */
  summary: boolean;
  illustration: boolean;
  photo: boolean;
  /** «Choose Image», the button that opens the result list (#156, owner D19 A). */
  choose: boolean;
  /**
   * One «Translate ES→PT» button per direction of ink-core's `ALL_DIRECTIONS`, by its
   * `directionId`; every id has a key (#174). It replaces #158's `translation` switch and `pairs`
   * map, which are no longer read.
   */
  directions: Record<string, boolean>;
  /**
   * The picture sources turned off, by adapter name; a source not listed is on, so a new one is
   * on (#105, as Ink2Pic's `sourcesOff`). The last source on cannot be turned off.
   */
  sourcesOff: string[];
  /** Fewer and smaller pictures per search (#105, as Ink2Pic's data saver). */
  dataSaver: boolean;
};

/** The lasso buttons' switches: every key but the translation directions and the picture options. */
export type SwitchKey = Exclude<
  keyof LookupSettings,
  'directions' | 'sourcesOff' | 'dataSaver'
>;

/** Every picture source a Lookup search can ask, in the registry's order. */
export const SOURCE_NAMES: readonly string[] = DEFAULT_ADAPTERS.map(
  adapter => adapter.name,
);

export const sourceOn = (settings: LookupSettings, name: string): boolean =>
  !settings.sourcesOff.includes(name);

/**
 * The settings with `name` on or off. Turning off the last source on changes nothing: a search
 * with no source would only ever say «no picture found».
 */
export function withSource(
  settings: LookupSettings,
  name: string,
  on: boolean,
): LookupSettings {
  if (on) {
    return {
      ...settings,
      sourcesOff: settings.sourcesOff.filter(each => each !== name),
    };
  }
  const left = SOURCE_NAMES.filter(
    each => each !== name && sourceOn(settings, each),
  );
  return left.length === 0 || !sourceOn(settings, name)
    ? settings
    : {...settings, sourcesOff: [...settings.sourcesOff, name]};
}

export const SWITCH_KEYS: readonly SwitchKey[] = [
  'illustration',
  'photo',
  'choose',
  'definition',
  'summary',
];

/** The owner's directions, on in a new install (owner, 2026-11-16, #174). */
const DIRECTIONS_ON: readonly string[] = ['es-pt', 'zh-pt', 'pt-zh'];

export const defaultSettings: LookupSettings = {
  definition: false,
  // On: the owner wants the text insert more than a one-word definition (docs/plugin-scope.md).
  summary: true,
  illustration: true,
  photo: true,
  choose: true,
  directions: Object.fromEntries(
    ALL_DIRECTIONS.map(direction => {
      const id = directionId(direction);
      return [id, DIRECTIONS_ON.includes(id)];
    }),
  ),
  sourcesOff: [],
  dataSaver: false,
};

/** A copy with its own direction map, so a change never reaches the defaults. */
const fresh = (): LookupSettings => ({
  ...defaultSettings,
  directions: {...defaultSettings.directions},
  sourcesOff: [],
});

export function serializeSettings(settings: LookupSettings): string {
  return `${JSON.stringify(
    {version: SETTINGS_VERSION, ...settings},
    null,
    2,
  )}\n`;
}

/**
 * The settings in `text`: each switch that is missing or not a boolean takes its default, and
 * each such problem is named for the log. A missing file gives the defaults with no problem.
 */
export function parseSettings(text: string | null): {
  settings: LookupSettings;
  problems: string[];
} {
  if (text === null) {
    return {settings: fresh(), problems: []};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      settings: fresh(),
      problems: ['settings: the file is not JSON; the defaults are used'],
    };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      settings: fresh(),
      problems: [
        'settings: the file is not a JSON object; the defaults are used',
      ],
    };
  }
  const values = raw as Record<string, unknown>;
  const settings = fresh();
  const problems: string[] = [];
  for (const key of SWITCH_KEYS) {
    const value = values[key];
    if (typeof value === 'boolean') {
      settings[key] = value;
    } else if (value !== undefined) {
      problems.push(
        `settings: ${key} is not true or false; the default is used`,
      );
    }
  }
  const directions = values.directions;
  if (
    directions !== null &&
    typeof directions === 'object' &&
    !Array.isArray(directions)
  ) {
    for (const id of Object.keys(settings.directions)) {
      const value = (directions as Record<string, unknown>)[id];
      if (typeof value === 'boolean') {
        settings.directions[id] = value;
      } else if (value !== undefined) {
        problems.push(
          `settings: directions.${id} is not true or false; the default is used`,
        );
      }
    }
  } else if (directions !== undefined) {
    problems.push(
      'settings: directions is not an object; the defaults are used',
    );
  }
  readPictureOptions(values, settings, problems);
  return {settings, problems};
}

/** `sourcesOff` and `dataSaver`, each wrong value named and replaced by its default (#105). */
function readPictureOptions(
  values: Record<string, unknown>,
  settings: LookupSettings,
  problems: string[],
): void {
  const off = values.sourcesOff;
  if (Array.isArray(off)) {
    const known = off.filter(
      (name): name is string =>
        typeof name === 'string' && SOURCE_NAMES.includes(name),
    );
    if (known.length !== off.length) {
      problems.push(
        'settings: sourcesOff names an unknown source; it is left out',
      );
    }
    const unique = [...new Set(known)];
    if (unique.length >= SOURCE_NAMES.length) {
      problems.push(
        'settings: sourcesOff turns every source off; every source is on',
      );
    } else {
      settings.sourcesOff = unique;
    }
  } else if (off !== undefined) {
    problems.push('settings: sourcesOff is not a list; every source is on');
  }
  if (typeof values.dataSaver === 'boolean') {
    settings.dataSaver = values.dataSaver;
  } else if (values.dataSaver !== undefined) {
    problems.push(
      'settings: dataSaver is not true or false; the default is used',
    );
  }
}

export const LOOKUP_SETTINGS: SettingsCodec<LookupSettings> = {
  parse: text => parseSettings(text),
  serialize: serializeSettings,
  describe: settings =>
    [
      ...SWITCH_KEYS.map(key => `${key} ${settings[key] ? 'on' : 'off'}`),
      ...Object.entries(settings.directions).map(
        ([id, on]) => `${id} ${on ? 'on' : 'off'}`,
      ),
      `sources off [${settings.sourcesOff.join(' ')}]`,
      `data saver ${settings.dataSaver ? 'on' : 'off'}`,
    ].join(', '),
};
