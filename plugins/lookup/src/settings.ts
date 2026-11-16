/**
 * Lookup's Settings (#111, #142): one switch per lasso button, kept in `MyStyle/Lookup/settings.json`
 * by picture-search's settings store, so a switch survives a restart. The picture modes start on,
 * as the #111 Plan says, and «Choose picture» with them (#156); «Insert definition» starts off, as
 * before (#115).
 */
import type {SettingsCodec} from './profile';

export const SETTINGS_VERSION = 1;

/** One switch per lasso button: the definition's, each picture mode's `settingKey`, and Choose's. */
export type LookupSettings = {
  definition: boolean;
  illustration: boolean;
  photo: boolean;
  /** «Choose picture», the button that opens the result list (#156, owner D19 A). */
  choose: boolean;
};

export type SwitchKey = keyof LookupSettings;

export const SWITCH_KEYS: readonly SwitchKey[] = [
  'illustration',
  'photo',
  'choose',
  'definition',
];

export const defaultSettings: LookupSettings = {
  definition: false,
  illustration: true,
  photo: true,
  choose: true,
};

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
    return {settings: {...defaultSettings}, problems: []};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      settings: {...defaultSettings},
      problems: ['settings: the file is not JSON; the defaults are used'],
    };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      settings: {...defaultSettings},
      problems: [
        'settings: the file is not a JSON object; the defaults are used',
      ],
    };
  }
  const values = raw as Record<string, unknown>;
  const settings = {...defaultSettings};
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
  return {settings, problems};
}

export const LOOKUP_SETTINGS: SettingsCodec<LookupSettings> = {
  parse: text => parseSettings(text),
  serialize: serializeSettings,
  describe: settings =>
    SWITCH_KEYS.map(key => `${key} ${settings[key] ? 'on' : 'off'}`).join(', '),
};
