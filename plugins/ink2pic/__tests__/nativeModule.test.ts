/**
 * The native file module lives in packages/picture-search (#142): Ink2Pic keeps no second copy,
 * and the package's no-argument constructor, the one PluginHost calls, registers the two module
 * names Ink2Pic's profile names (src/profile.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import {INK2PIC_PROFILE} from '../src/profile';

const ROOT = path.join(__dirname, '..');
const PACKAGE = path.join(
  ROOT,
  '../../packages/picture-search/native/com/ink2pic/files/Ink2PicFilesPackage.java',
);

describe('the native file module (#142)', () => {
  it('has no copy left in the plugin', () => {
    expect(fs.existsSync(path.join(ROOT, 'native'))).toBe(false);
  });

  it('registers the module names the profile calls by default', () => {
    const java = fs.readFileSync(PACKAGE, 'utf8');
    expect(java).toContain('this("Ink2PicFiles", "Ink2PicImage");');
    expect(INK2PIC_PROFILE.filesModule).toBe('Ink2PicFiles');
    expect(INK2PIC_PROFILE.imageModule).toBe('Ink2PicImage');
  });

  it('keeps no copy of the file store or the run log in the plugin (#142)', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/storage'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'src/log'))).toBe(false);
  });

  it('keeps no copy of the lasso read or the placement in the plugin (#142)', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/flow/lassoQuery.ts'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'src/flow/place.ts'))).toBe(false);
  });

  it("keeps no copy of the packages' own tests or the SDK mock in the plugin (#142, D63 A)", () => {
    // They run in the packages gate, so the packages stay tested without Ink2Pic.
    const moved = [
      '__mocks__/sn-plugin-lib.ts',
      '__tests__/sdk.test.ts',
      '__tests__/result.test.ts',
      '__tests__/memory-log.test.ts',
      '__tests__/image.test.ts',
      '__tests__/measuresDevice.test.ts',
      '__tests__/measures.test.ts',
      '__tests__/quickInsert.test.ts',
    ];
    expect(moved.filter(file => fs.existsSync(path.join(ROOT, file)))).toEqual([]);
  });

  it('keeps no copy of the shared tests it split with the packages gate (#142, D63 A)', () => {
    // Each title is a describe or a test that now runs in packages/picture-search/__tests__/.
    const movedTitles = [
      "'the picks rule (#34)'",
      "'the measured order keeps a pick first (#34)'",
      "'thumbnail files (#16, #46)'",
      "'searchCached (#16)'",
      "'settings live in the private folder, out of MyStyle (#22)'",
      "'never writes the defaults over a file it could not read (#99)'",
      "'reads the same clean border and measure width'",
    ];
    const dir = path.join(ROOT, '__tests__');
    const copies = fs
      .readdirSync(dir)
      .filter(name => /\.test\.tsx?$/.test(name) && name !== 'nativeModule.test.ts')
      .flatMap(name => {
        const text = fs.readFileSync(path.join(dir, name), 'utf8');
        return movedTitles.filter(title => text.includes(title)).map(title => `${name}: ${title}`);
      });
    expect(copies).toEqual([]);
  });
});
