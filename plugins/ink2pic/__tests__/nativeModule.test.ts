/**
 * The native file module lives in packages/picture-search (#142): Ink2Pic keeps no second copy,
 * and the package's no-argument constructor, the one PluginHost calls, registers the two module
 * names this plugin's storage calls.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const PACKAGE = path.join(
  ROOT,
  '../../packages/picture-search/native/com/ink2pic/files/Ink2PicFilesPackage.java',
);

describe('the native file module (#142)', () => {
  it('has no copy left in the plugin', () => {
    expect(fs.existsSync(path.join(ROOT, 'native'))).toBe(false);
  });

  it('registers the module names the storage calls by default', () => {
    const java = fs.readFileSync(PACKAGE, 'utf8');
    expect(java).toContain('this("Ink2PicFiles", "Ink2PicImage");');
    const storage = ['files.ts', 'measures.ts'].map(file =>
      fs.readFileSync(path.join(ROOT, 'src/storage', file), 'utf8'),
    );
    expect(storage[0]).toContain("callModule('Ink2PicFiles'");
    expect(storage[1]).toContain("'Ink2PicImage'");
  });
});
