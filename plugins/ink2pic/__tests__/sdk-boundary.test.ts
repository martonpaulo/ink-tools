import {readdirSync, readFileSync, statSync} from 'fs';
import {dirname, join, relative, resolve} from 'path';

const ROOT = join(__dirname, '..');
const SKIP = new Set([
  'node_modules',
  'build',
  'android',
  '.git',
  '.scratch',
  '.claude',
  '__mocks__',
]);
/**
 * The wrappers live in sn-adapter's official tier (#101); only tests, which drive the SDK's mock,
 * import the SDK here. scripts/boundaries.py checks the same rule across the repository.
 */
const OFFICIAL = join(
  ROOT,
  '..',
  '..',
  'packages',
  'sn-adapter',
  'src',
  'official',
);
const ALLOWED = [/^__tests__\//];
/**
 * picture-search's device tier (#142): the file store, the settings, the logs, and the insert
 * tier, the lasso read and the placement over ink-core.
 */
const DEVICE_FOLDERS = ['storage', 'log', 'insert'];
const DEVICE_TIER = join(
  ROOT,
  '..',
  '..',
  'packages',
  'picture-search',
  'src',
  'storage',
);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (SKIP.has(name)) {
      return [];
    }
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return /\.(ts|tsx|js)$/.test(name) ? [relative(ROOT, path)] : [];
  });
}

it("imports sn-plugin-lib only in tests: the wrappers are sn-adapter's (#101)", () => {
  const offenders = sources(ROOT).filter(
    path =>
      !ALLOWED.some(rule => rule.test(path)) &&
      /from ['"]sn-plugin-lib['"]|require\(['"]sn-plugin-lib['"]\)/.test(
        readFileSync(join(ROOT, path), 'utf8'),
      ),
  );
  expect(offenders).toEqual([]);
});

it("defines no negative failure code: sn-adapter's official/result.ts owns them (#49, #54, #101)", () => {
  const offenders = sources(join(ROOT, 'src')).filter(path =>
    /fail\(\s*-\d|_CODE\s*=\s*-\d/.test(readFileSync(join(ROOT, path), 'utf8')),
  );
  expect(offenders).toEqual([]);
});

it('keeps the storage, search and library layers below the flow and the view (#54)', () => {
  const lower = /^src\/(log|storage|sources|search|library)\//;
  const offenders = sources(join(ROOT, 'src')).filter(
    path =>
      lower.test(path) &&
      /from ['"]\.\.\/(flow|onboarding|ui)\//.test(
        readFileSync(join(ROOT, path), 'utf8'),
      ),
  );
  expect(offenders).toEqual([]);
});

it('has no SDK wrapper that nothing calls (#54)', () => {
  // The device tier of picture-search calls the SDK for every plugin that imports it (#142).
  const callers = [
    ...sources(join(ROOT, 'src')),
    ...sources(DEVICE_TIER),
    ...sources(join(DEVICE_TIER, '..', 'insert')),
    'App.tsx',
    'index.js',
  ]
    .map(path => readFileSync(join(ROOT, path), 'utf8'))
    .join('\n');
  // result.ts is the Result type every wrapper returns; register.ts and storage.ts serve Bridge
  // and Lingo too, and image.ts serves Relay (#98) and Retouch (#136), whose own tests call them.
  const shared = new Set([
    'result.ts',
    'register.ts',
    'storage.ts',
    'image.ts',
    'index.ts',
  ]);
  const wrappers = readdirSync(OFFICIAL)
    .filter(name => !shared.has(name))
    .flatMap(name =>
      [
        ...readFileSync(join(OFFICIAL, name), 'utf8').matchAll(
          /export (?:async )?function (\w+)/g,
        ),
      ].map(match => match[1]),
    );
  expect(wrappers.length).toBeGreaterThan(0);
  expect(
    wrappers.filter(name => !new RegExp(`\\b${name}\\b`).test(callers)),
  ).toEqual([]);
});

it('keeps the search core portable: it imports nothing outside packages/picture-search/src/ (#65, #125)', () => {
  const core = join(ROOT, '..', '..', 'packages', 'picture-search', 'src');
  // The device tier (#142) is not the core: the core never imports it.
  const device = DEVICE_FOLDERS.map(name => join(core, name));
  const files = sources(core).filter(
    path => !device.some(folder => join(ROOT, path).startsWith(folder + '/')),
  );
  expect(files.length).toBeGreaterThan(0);
  const offenders = files.flatMap(path => {
    const text = readFileSync(join(ROOT, path), 'utf8');
    return [...text.matchAll(/(?:from|import|require\()\s*['"]([^'"]+)['"]/g)]
      .map(match => match[1])
      .filter(
        target =>
          !target.startsWith('.') ||
          relative(core, resolve(dirname(join(ROOT, path)), target)).startsWith(
            '..',
          ) ||
          device.some(folder =>
            resolve(dirname(join(ROOT, path)), target).startsWith(folder),
          ),
      )
      .map(target => `${path} imports ${target}`);
  });
  expect(offenders).toEqual([]);
});

it("keeps picture-search's insert tier on its package, ink-core and the official tier (#142)", () => {
  const core = join(DEVICE_TIER, '..');
  const insert = join(core, 'insert');
  const files = sources(insert);
  expect(files.length).toBeGreaterThan(0);
  const offenders = files.flatMap(path =>
    [
      ...readFileSync(join(ROOT, path), 'utf8').matchAll(
        /(?:from|import|require\()\s*['"]([^'"]+)['"]/g,
      ),
    ]
      .map(match => match[1])
      .filter(target =>
        target.startsWith('.')
          ? relative(core, resolve(dirname(join(ROOT, path)), target)).startsWith(
              '..',
            )
          : target !== '@supernote-tools/ink-core' &&
            target !== '@supernote-tools/sn-adapter/official',
      )
      .map(target => `${path} imports ${target}`),
  );
  expect(offenders).toEqual([]);
});

it("keeps picture-search's device tier on the platform's official tier: react-native and sn-adapter only (#142)", () => {
  const files = sources(DEVICE_TIER).concat(
    sources(join(DEVICE_TIER, '..', 'log')),
  );
  expect(files.length).toBeGreaterThan(0);
  const offenders = files.flatMap(path =>
    [
      ...readFileSync(join(ROOT, path), 'utf8').matchAll(
        /(?:from|import|require\()\s*['"]([^'"]+)['"]/g,
      ),
    ]
      .map(match => match[1])
      .filter(
        target =>
          !target.startsWith('.') &&
          target !== 'react-native' &&
          target !== '@supernote-tools/sn-adapter/official',
      )
      .map(target => `${path} imports ${target}`),
  );
  expect(offenders).toEqual([]);
});
