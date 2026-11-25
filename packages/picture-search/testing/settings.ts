/**
 * A settings codec for the package's own tests of the settings store (#142, D63 A): one switch,
 * read as a plugin's codec reads its keys, so a test checks the store with no plugin's settings.
 */
import type {SettingsCodec} from '../src/storage';

const SIZES = ['small', 'medium', 'large'] as const;
export type TestSettings = {size: (typeof SIZES)[number]};

export const defaultTestSettings = (): TestSettings => ({size: 'medium'});

export const TEST_SETTINGS: SettingsCodec<TestSettings> = {
  parse: text => {
    const settings = defaultTestSettings();
    if (text === null) {
      return {settings, problems: []};
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return {settings, problems: ['settings: the file is not JSON']};
    }
    const size = (raw as {size?: unknown} | null)?.size;
    if (size === undefined) {
      return {settings, problems: []};
    }
    if (SIZES.includes(size as TestSettings['size'])) {
      return {settings: {size: size as TestSettings['size']}, problems: []};
    }
    return {settings, problems: [`settings: size ${JSON.stringify(size)} is ignored`]};
  },
  serialize: settings => JSON.stringify(settings),
  describe: settings => `size ${settings.size}`,
};
