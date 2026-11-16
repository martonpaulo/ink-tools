/**
 * @jest-environment node
 *
 * Metro bundles the shared ui-kit package from ../../packages into Bridge, with this plugin's
 * one copy of React, and leaves the test-only size rule out (#93). The .snplg holds this bundle.
 *
 * Metro resolves imports by its own rules, not Jest's: it picks `descriptor.json` over
 * `descriptor.ts` for `./descriptor`, so a test of the source alone passed while the bundle's
 * `service.ts` threw as it loaded and Settings crashed on `bridgeSync` of undefined (#201). The
 * second test runs the bundle's own module graph.
 */
import {execFileSync} from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.join(__dirname, '..');
/** A development bundle keeps each module's path, so the test can name what went in. */
function bundle(): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-bundle-'));
  try {
    const file = path.join(out, 'Bridge.bundle');
    execFileSync(
      'npx',
      [
        'react-native',
        'bundle',
        '--entry-file',
        'index.js',
        '--platform',
        'android',
        '--dev',
        'true',
        '--bundle-output',
        file,
        '--assets-dest',
        out,
      ],
      {cwd: ROOT, env: {...process.env, CI: '1'}, stdio: 'pipe'},
    );
    return fs.readFileSync(file, 'utf8');
  } finally {
    fs.rmSync(out, {recursive: true, force: true});
  }
}

/** A cold Metro run takes about 10 s on a laptop; CI runners are slower. */
const BUNDLE_TIMEOUT_MS = 180000;

let built: string | undefined;
/** One Metro run serves every test of this file. */
const textOf = (): string => (built ??= bundle());

test(
  "the bundle holds ui-kit, sn-adapter's official tier, one React and one sn-plugin-lib",
  () => {
    const text = textOf();
    for (const file of ['index.ts', 'metrics.ts', 'styles.ts', 'Button.tsx']) {
      expect(text).toContain(`packages/ui-kit/src/${file}`);
    }
    expect(text).not.toContain('packages/ui-kit/src/screenBreaks');
    expect(text.match(/node_modules\/react\/index\.js/g)).toHaveLength(1);
    // The registration goes through sn-adapter (#101), whose SDK import resolves from this plugin.
    expect(text).toContain('packages/sn-adapter/src/official/register.ts');
    // The start-up probe runs the internals tier's adapt-on/off check (#43).
    expect(text).toContain('packages/sn-adapter/src/internals/probe.ts');
    const sdk =
      text.match(/"[^"]*sn-plugin-lib\/lib\/module\/index\.js"/g) ?? [];
    expect(new Set(sdk)).toEqual(
      new Set(['"node_modules/sn-plugin-lib/lib/module/index.js"']),
    );
  },
  BUNDLE_TIMEOUT_MS,
);

type Factory = (...args: unknown[]) => void;
type Defined = {factory: Factory; deps: unknown; name: string};

/** What the tablet provides and Node does not: React Native and the plugin SDK, as no-op stand-ins. */
const NATIVE = /node_modules\/(react-native|@react-native|sn-plugin-lib)\//;

/** Any property read, call or `new` of it gives another stand-in, so a module can load on it. */
function standIn(): unknown {
  return new Proxy(function () {}, {
    get: (_target, key) =>
      key === '__esModule' || key === 'then' ? undefined : standIn(),
    apply: () => standIn(),
    construct: () => standIn() as object,
  });
}

/**
 * Loads the bundle's modules the way Metro's require does, one graph and one cache, with each
 * native module replaced by a stand-in, and returns the exports of the module at `modulePath`. A module
 * that throws as it loads fails here with its own error, which PluginHost only reported as a later
 * `undefined` import (#201).
 */
function loadFromBundle(source: string, modulePath: string): Record<string, unknown> {
  const defined = new Map<number, Defined>();
  const loaded = new Map<number, {exports: unknown}>();
  const define = (factory: Factory, id: number, deps: unknown, name: string) =>
    defined.set(id, {factory, deps, name});
  const require = (id: number): unknown => {
    const done = loaded.get(id);
    if (done) {
      return done.exports;
    }
    const module = defined.get(id);
    if (!module) {
      throw new Error(`the bundle has no module ${id}`);
    }
    if (NATIVE.test(module.name)) {
      const exports = standIn();
      loaded.set(id, {exports});
      return exports;
    }
    const record = {exports: {} as unknown};
    loaded.set(id, record);
    const importDefault = (dep: number) => {
      const exports = require(dep) as {__esModule?: boolean; default?: unknown};
      return exports?.__esModule ? exports.default : exports;
    };
    module.factory(
      globalThis,
      require,
      importDefault,
      require,
      record,
      record.exports,
      module.deps,
    );
    return record.exports;
  };
  const body = source.slice(source.indexOf('__d(function'), source.lastIndexOf('__r('));
  // eslint-disable-next-line no-new-func
  new Function('__d', '__r', body)(define, () => undefined);
  const entry = [...defined].find(([, module]) => module.name === modulePath);
  if (!entry) {
    throw new Error(`the bundle has no ${modulePath}`);
  }
  return require(entry[0]) as Record<string, unknown>;
}

test(
  "the bundle's own module graph loads index.js, App.tsx and the sync runner without a throw",
  () => {
    const source = textOf();
    jest.useFakeTimers();
    // The start-up pass logs that the stand-in folder holds no settings; that is expected here.
    const quiet = [
      jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    try {
      expect(loadFromBundle(source, 'src/service.ts').bridgeSync).toBeDefined();
      expect(typeof loadFromBundle(source, 'App.tsx').default).toBe('function');
      expect(() => loadFromBundle(source, 'index.js')).not.toThrow();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
      quiet.forEach(spy => spy.mockRestore());
    }
  },
  BUNDLE_TIMEOUT_MS,
);

/** Every file under `dir`, without node_modules. */
function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : filesUnder(full);
    }
    return [full];
  });
}

test('no shared package or Bridge source has a .json file beside a module of the same name', () => {
  // Metro takes `name.json` for `./name` where Jest and tsc take `name.ts` (#201).
  const roots = [path.join(ROOT, '../../packages'), path.join(ROOT, 'src')];
  const all = new Set(roots.flatMap(filesUnder));
  const twins = [...all].filter(
    file =>
      file.endsWith('.json') &&
      ['.ts', '.tsx', '.js'].some(ext => all.has(file.replace(/\.json$/, ext))),
  );
  expect(twins.map(file => path.relative(ROOT, file))).toEqual([]);
});
