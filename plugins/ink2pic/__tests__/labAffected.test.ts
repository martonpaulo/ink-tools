/**
 * The lab's «affected» mode (#108): `lab/affected.mjs` picks the cases a change can move from the
 * base run's results. The lab runs in Node on its own, outside Jest, so it is asked through a
 * child process, as in labOrder.test.ts.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const RUN = `test-affected-${process.pid}`;
const RUN_DIR = path.join(ROOT, 'lab', 'out', RUN);
const PLUGIN = 'plugins/ink2pic/';
const CORE = 'packages/picture-search/src/';

const tile = (source: string, canonical = false) => ({source, canonical});

beforeAll(() => {
  fs.mkdirSync(RUN_DIR, {recursive: true});
  fs.writeFileSync(
    path.join(RUN_DIR, 'results.json'),
    JSON.stringify({
      cases: [
        {id: 'chair', page1: [tile('openmoji')], page2: []},
        {id: 'house', page1: [tile('commons', true)], page2: []},
      ],
    }),
  );
});

afterAll(() => fs.rmSync(RUN_DIR, {recursive: true, force: true}));

const affected = (...paths: string[]) =>
  execFileSync('node', ['lab/affected.mjs', RUN, ...paths], {cwd: ROOT})
    .toString()
    .trim();

test('a source adapter picks only the cases that show the source', () => {
  expect(affected(`${CORE}adapters/openmoji.ts`)).toBe(
    'chair',
  );
  expect(affected(`${CORE}adapters/wikidata.ts`)).toBe(
    'house',
  );
});

test('a file the lab loads picks every case', () => {
  const all = affected(`${CORE}rank.ts`).split(',');
  expect(all.length).toBeGreaterThan(2);
  expect(all).toEqual(expect.arrayContaining(['chair', 'house']));
  expect(affected(`${PLUGIN}src/config.ts`).split(',')).toEqual(all);
  expect(affected('plugins/lookup/src/pictureLanguages.ts').split(',')).toEqual(all);
  expect(
    affected('packages/picture-search/native/com/ink2pic/files/Contour.java').split(','),
  ).toEqual(all);
});

// Run settle-warm-108 picked all 105 cases: any path under packages/ or the plugin's src/ did.
test('a file the lab never loads picks none (#108)', () => {
  expect(affected(`${PLUGIN}docs/brief.md`, 'README.md')).toBe('');
  expect(affected(`${PLUGIN}src/flow/search.ts`)).toBe('');
  expect(affected(`${CORE}storage/settings.ts`, `${CORE}insert/place.ts`)).toBe('');
  expect(affected('packages/sync-core/src/index.ts', 'packages/ink-core/x.ts')).toBe('');
  expect(affected(`${PLUGIN}__tests__/wikidata.test.ts`)).toBe('');
  // With a loaded file among them, every case again.
  expect(affected(`${PLUGIN}src/flow/search.ts`, `${CORE}rank.ts`)).not.toBe('');
});
