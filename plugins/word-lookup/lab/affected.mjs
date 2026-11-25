#!/usr/bin/env node
/**
 * Prints, as one comma list, the ids of the cases a change can move (#108), from the base run's
 * `results.json` and the paths the change touches (relative to the repository root):
 *
 * - a source adapter, `packages/picture-search/src/adapters/<source>.ts`: the cases whose base pages 1 and 2
 *   show that source; Wikidata's results are Commons files, so its cases are the canonical tiles;
 * - `lab/cases.json`: the cases that are new or changed against `--base-cases <file>`;
 * - any other file the lab loads, read from Node's module cache after loading the product's
 *   modules as the lab does, and the pixel step's Java in `packages/picture-search/native/`:
 *   every case;
 * - anything else, such as a test, a document or plugin code the lab never loads: none. Before,
 *   any path under `packages/` or the plugin's `src/` picked all 105 cases.
 *
 *   node lab/affected.mjs <base run> [--base-cases <file>] <path>...
 */
import {createRequire} from 'node:module';
import path from 'node:path';
import {product, readCases, readJson, readResults, ROOT_DIR} from './lib.mjs';

const PLUGIN = 'plugins/word-lookup/';
const ADAPTER = /^packages\/picture-search\/src\/adapters\/(\w+)\.ts$/;
const NATIVE = 'packages/picture-search/native/';
const REPOSITORY = path.join(ROOT_DIR, '../..');

/** The repository's files the lab's search loads: the product's modules and Lookup's languages. */
function labFiles() {
  const require = createRequire(import.meta.url);
  product();
  require('../src/pictureLanguages.ts');
  require('../src/modes.ts');
  return new Set(
    Object.keys(require.cache)
      .filter(file => !file.split(path.sep).includes('node_modules'))
      .map(file => path.relative(REPOSITORY, file).split(path.sep).join('/')),
  );
}

function showsSource(item, source) {
  return [...item.page1, ...item.page2].some(tile =>
    source === 'wikidata' ? tile.canonical : tile.source === source,
  );
}

function affected(cases, baseCases, base, paths) {
  const ids = new Set();
  let loaded;
  for (const full of paths) {
    const adapter = ADAPTER.exec(full);
    if (adapter) {
      base
        .filter(item => showsSource(item, adapter[1]))
        .forEach(item => ids.add(item.id));
    } else if (full === `${PLUGIN}lab/cases.json`) {
      const before = new Map(baseCases.map(c => [c.id, JSON.stringify(c)]));
      cases
        .filter(c => before.get(c.id) !== JSON.stringify(c))
        .forEach(c => ids.add(c.id));
    } else if (full.startsWith(NATIVE) || (loaded ??= labFiles()).has(full)) {
      return cases.map(c => c.id);
    }
  }
  return cases.map(c => c.id).filter(id => ids.has(id));
}

const [run, ...rest] = process.argv.slice(2);
const at = rest.indexOf('--base-cases');
const baseCases = at === -1 ? readCases() : readJson(rest[at + 1]).cases;
const paths =
  at === -1 ? rest : rest.filter((_, i) => i !== at && i !== at + 1);
console.log(
  affected(readCases(), baseCases, readResults(run).cases, paths).join(','),
);
