/**
 * picture-search's own layers (#65, #125, #142): the search core imports nothing outside its
 * folder, so it runs on the Supernote, in Node (the search lab) and in another project; the insert
 * tier reaches only its package, ink-core and the official tier; the device tier only React
 * Native and the official tier. Moved here from the retired plugin's suite (#288).
 */
import {readdirSync, readFileSync, statSync} from 'fs';
import {dirname, join, relative, resolve} from 'path';

const SRC = join(__dirname, '..', 'src');
/** The device tier (#142): the file store, the settings and the logs, and the insert tier. */
const DEVICE_FOLDERS = ['storage', 'log', 'insert'];
const IMPORT = /(?:from|import|require\()\s*['"]([^'"]+)['"]/g;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return /\.(ts|tsx|js)$/.test(name) ? [path] : [];
  });
}

const imports = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT)].map(match => match[1]);
const outside = (file: string, target: string, folder: string) =>
  relative(folder, resolve(dirname(file), target)).startsWith('..');

it('keeps the search core portable: it imports nothing outside src/ (#65, #125)', () => {
  const device = DEVICE_FOLDERS.map(name => join(SRC, name));
  const files = sources(SRC).filter(file => !device.some(folder => file.startsWith(folder + '/')));
  expect(files.length).toBeGreaterThan(0);
  const offenders = files.flatMap(file =>
    imports(file)
      .filter(
        target =>
          !target.startsWith('.') ||
          outside(file, target, SRC) ||
          device.some(folder => resolve(dirname(file), target).startsWith(folder)),
      )
      .map(target => `${relative(SRC, file)} imports ${target}`),
  );
  expect(offenders).toEqual([]);
});

it('keeps the insert tier on its package, ink-core and the official tier (#142)', () => {
  const files = sources(join(SRC, 'insert'));
  expect(files.length).toBeGreaterThan(0);
  const offenders = files.flatMap(file =>
    imports(file)
      .filter(target =>
        target.startsWith('.')
          ? outside(file, target, SRC)
          : target !== '@ink-tools/ink-core' && target !== '@ink-tools/sn-adapter/official',
      )
      .map(target => `${relative(SRC, file)} imports ${target}`),
  );
  expect(offenders).toEqual([]);
});

it('keeps the device tier on the platform: react-native and the official tier only (#142)', () => {
  const files = [...sources(join(SRC, 'storage')), ...sources(join(SRC, 'log'))];
  expect(files.length).toBeGreaterThan(0);
  const offenders = files.flatMap(file =>
    imports(file)
      .filter(
        target =>
          !target.startsWith('.') &&
          target !== 'react-native' &&
          target !== '@ink-tools/sn-adapter/official',
      )
      .map(target => `${relative(SRC, file)} imports ${target}`),
  );
  expect(offenders).toEqual([]);
});
