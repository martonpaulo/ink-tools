import {NativeModules} from 'react-native';
import {
  downloadToFile,
  libraryDir,
  logsDir,
  oldSymbolsDir,
  picksPath,
  settingsPath,
  symbolsDir,
} from '../src/profile';

// The file store itself is tested in packages/picture-search (#142); these are Ink2Pic's own
// folders and User-Agent, set by its profile.
describe("Ink2Pic's profile (#11, #142)", () => {
  const ROOT = '/storage/emulated/0';

  it('downloads with the Ink2Pic User-Agent', async () => {
    const native = {downloadToFile: jest.fn().mockResolvedValue(1)};
    NativeModules.Ink2PicFiles = native;
    await downloadToFile('https://x.test/a.png', '/s/a.png');
    expect(native.downloadToFile.mock.calls[0][2]['User-Agent']).toMatch(
      /^Ink2Pic\//,
    );
    delete NativeModules.Ink2PicFiles;
  });

  it('builds the library folder under MyStyle', () => {
    expect(libraryDir(`${ROOT}/`)).toBe(`${ROOT}/MyStyle/Ink2Pic/library`);
  });

  it("keeps Ink2Pic's files where they were before the move", () => {
    expect(settingsPath(ROOT)).toBe(`${ROOT}/MyStyle/Ink2Pic/settings.json`);
    expect(logsDir(ROOT)).toBe(`${ROOT}/MyStyle/Ink2Pic/logs`);
    expect(picksPath(ROOT)).toBe(`${ROOT}/MyStyle/Ink2Pic/picks.json`);
    expect(oldSymbolsDir(ROOT)).toBe(`${ROOT}/MyStyle/Ink2Pic/symbols`);
    // The private folder: PluginHost refuses a hidden shared folder (#23).
    expect(symbolsDir('/data/plugin')).toBe('/data/plugin/symbols');
  });
});
