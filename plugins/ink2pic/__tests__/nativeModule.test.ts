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
    ];
    expect(moved.filter(file => fs.existsSync(path.join(ROOT, file)))).toEqual([]);
  });
});
