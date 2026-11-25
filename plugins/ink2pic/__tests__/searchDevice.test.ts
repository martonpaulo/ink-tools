/**
 * Ink2Pic's settings bound to the shared device search (#68, #70). The cached search itself runs
 * in the packages gate, packages/picture-search/__tests__/searchDevice.test.ts (#142, D63 A).
 */
import {NativeModules} from 'react-native';
import {FileUtils, PluginManager} from 'sn-plugin-lib';
import {
  resetSessionForTests,
  closeLogFileForTests,
  settingsPath,
  resetSettingsForTests,
  saveSettings,
} from '../src/profile';
import {
  deviceContext,
  searchCached,
  searchSettings,
  searchVariant,
} from '../src/search/device';
import type {SourceAdapter} from '@ink-tools/picture-search';
import {defaultSettings} from '../src/settings/settings';

const files: Record<string, string> = {};
const native = {
  downloadToFile: jest.fn(),
  readText: jest.fn(async (path: string) => files[path] ?? null),
  writeText: jest.fn(async (path: string, text: string) => {
    files[path] = text;
    return null;
  }),
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  NativeModules.Ink2PicFiles = native;
  resetSessionForTests();
  resetSettingsForTests();
  closeLogFileForTests();
  (FileUtils.getExternalDirPath as jest.Mock).mockResolvedValue([
    '/storage/emulated/0',
  ]);
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue(
    '/data/plugin',
  );
});


describe('the search languages (#68)', () => {
  it('looks the word up in the saved order, and a new order is a new search', async () => {
    files[settingsPath()] = JSON.stringify({languages: ['pt', 'en']});
    const seen: string[][] = [];
    const search = jest.fn(async (_query: string, ctx) => {
      seen.push([...ctx.languages]);
      return {
        ok: true as const,
        value: {
          results: [
            {
              id: 'commons:Gato.png',
              source: 'commons' as const,
              title: 'Gato',
              thumbUrl: 'https://upload.wikimedia.org/gato.png',
              license: 'CC0',
              attribution: 'Wikimedia Commons',
            },
          ],
        },
      };
    });
    const sources: SourceAdapter[] = [{name: 'commons', search}];
    await searchCached('gato', sources);
    expect(seen).toEqual([['pt', 'en']]);
    await saveSettings({...defaultSettings(null), languages: ['en', 'pt']});
    await searchCached('gato', sources);
    expect(seen).toEqual([
      ['pt', 'en'],
      ['en', 'pt'],
    ]);
  });
});

describe('the search settings (#70)', () => {
  it('maps the sources left off, the style and the data saver', () => {
    const mapped = searchSettings({
      ...defaultSettings(null),
      languages: ['pt', 'en'],
      sourcesOff: ['openclipart'],
      style: 'photos',
      dataSaver: true,
    });
    expect(mapped).toMatchObject({
      languages: ['pt', 'en'],
      photos: true,
      dataSaver: true,
    });
    expect(mapped.sourceOn('openclipart')).toBe(false);
    expect(mapped.sourceOn('commons')).toBe(true);
    expect(searchSettings(defaultSettings(null)).photos).toBe(false);
  });

  it('keys the cache by the context and the sources the search runs with (#99)', () => {
    const sources: SourceAdapter[] = [
      {name: 'openclipart', search: jest.fn()},
      {name: 'commons', search: jest.fn()},
    ];
    const settings = {
      ...defaultSettings(null),
      languages: ['pt', 'en'] as const,
      style: 'photos' as const,
      dataSaver: true,
    };
    expect(searchVariant(deviceContext(settings), sources)).toBe(
      'pt,en|sources:openclipart,commons|photos|saver',
    );
    // «All as contour» changes the insert, not what the search finds: the same entry.
    expect(
      searchVariant(
        deviceContext({...settings, style: 'contour', dataSaver: false}),
        sources.slice(1),
      ),
    ).toBe('pt,en|sources:commons');
  });
});
