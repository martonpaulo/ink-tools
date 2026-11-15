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
  const lower = /^src\/(log|storage|sources|search|search-core|library)\//;
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
  const callers = [...sources(join(ROOT, 'src')), 'App.tsx', 'index.js']
    .map(path => readFileSync(join(ROOT, path), 'utf8'))
    .join('\n');
  // result.ts is the Result type every wrapper returns; register.ts and storage.ts serve Bridge
  // and Lingo too, whose own tests call them.
  const shared = new Set([
    'result.ts',
    'register.ts',
    'storage.ts',
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

it('keeps the search core portable: it imports nothing outside src/search-core/ (#65)', () => {
  const core = join(ROOT, 'src', 'search-core');
  const files = sources(core);
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
          ),
      )
      .map(target => `${path} imports ${target}`);
  });
  expect(offenders).toEqual([]);
});
