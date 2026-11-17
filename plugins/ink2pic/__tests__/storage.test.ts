import {NativeModules} from 'react-native';
import {MODULE_CODE} from '@ink-tools/sn-adapter/official';
import {
  downloadToFile,
  readText,
  writeText,
  libraryDir,
  safeFileName,
  INK2PIC_PROFILE,
  logsDir,
  oldSymbolsDir,
  picksPath,
  setPluginProfile,
  settingsPath,
  symbolsDir,
} from '../src/profile';

const native = {
  downloadToFile: jest.fn(),
  writeText: jest.fn(),
  readText: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  NativeModules.Ink2PicFiles = native;
});

describe('files (#11)', () => {
  it('downloads with the User-Agent and returns the byte count', async () => {
    native.downloadToFile.mockResolvedValue(24197);
    expect(await downloadToFile('https://x.test/a.png', '/s/a.png')).toEqual({
      ok: true,
      value: 24197,
    });
    expect(native.downloadToFile.mock.calls[0][2]['User-Agent']).toMatch(
      /^Ink2Pic\//,
    );
  });

  it('keeps the module rejection code', async () => {
    native.downloadToFile.mockRejectedValue(
      Object.assign(new Error('HTTP 429 for https://x.test/'), {
        code: 'HTTP_429',
      }),
    );
    const result = await downloadToFile('https://x.test/', '/s/a');
    expect(result).toEqual({
      ok: false,
      code: MODULE_CODE,
      message: 'HTTP_429: HTTP 429 for https://x.test/',
      moduleCode: 'HTTP_429',
    });
  });

  it('reads a missing file as null and writes text', async () => {
    native.readText.mockResolvedValue(null);
    expect(await readText('/p/a.json')).toEqual({ok: true, value: null});
    native.writeText.mockResolvedValue(null);
    expect((await writeText('/p/a.json', '{}')).ok).toBe(true);
  });

  it('fails clearly when the module is not loaded', async () => {
    delete NativeModules.Ink2PicFiles;
    const result = await readText('/p/a.json');
    expect(result.ok === false && result.message).toMatch(
      /^MISSING: .*reactPackages/,
    );
  });
});

describe('paths (#11)', () => {
  it('builds the library folder under MyStyle', () => {
    expect(libraryDir('/storage/emulated/0/')).toBe(
      '/storage/emulated/0/MyStyle/Ink2Pic/library',
    );
  });

  it('makes file names safe', () => {
    expect(safeFileName('openclipart:340609 soup?.png')).toBe(
      'openclipart-340609-soup-.png',
    );
    expect(safeFileName('///')).toBe('file');
  });
});

describe('the plugin profile (#142)', () => {
  const ROOT = '/storage/emulated/0';

  afterEach(() => setPluginProfile(INK2PIC_PROFILE));

  it("keeps Ink2Pic's files where they were before the move", () => {
    expect(settingsPath(ROOT)).toBe(`${ROOT}/MyStyle/Ink2Pic/settings.json`);
    expect(logsDir(ROOT)).toBe(`${ROOT}/MyStyle/Ink2Pic/logs`);
    expect(picksPath(ROOT)).toBe(`${ROOT}/MyStyle/Ink2Pic/picks.json`);
    expect(oldSymbolsDir(ROOT)).toBe(`${ROOT}/MyStyle/Ink2Pic/symbols`);
    // The private folder: PluginHost refuses a hidden shared folder (#23).
    expect(symbolsDir('/data/plugin')).toBe('/data/plugin/symbols');
  });

  it("calls a second plugin's folder, modules and User-Agent", async () => {
    const lookupFiles = {readText: jest.fn().mockResolvedValue('{}')};
    NativeModules.LookupFiles = lookupFiles;
    setPluginProfile({
      name: 'Lookup',
      folder: 'MyStyle/Lookup',
      filesModule: 'LookupFiles',
      imageModule: 'LookupImage',
      userAgent: 'Lookup/0',
      build: '1',
    });
    expect(settingsPath(ROOT)).toBe(`${ROOT}/MyStyle/Lookup/settings.json`);
    expect(await readText('/x')).toEqual({ok: true, value: '{}'});
    expect(lookupFiles.readText).toHaveBeenCalledWith('/x');
    expect(native.readText).not.toHaveBeenCalled();
    delete NativeModules.LookupFiles;
  });
});
