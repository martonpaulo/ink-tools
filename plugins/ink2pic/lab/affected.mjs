#!/usr/bin/env node
/**
 * Prints, as one comma list, the ids of the cases a change can move (#108), from the base run's
 * `results.json` and the paths the change touches (relative to the repository root):
 *
 * - a source adapter, `src/search-core/adapters/<source>.ts`: the cases whose base pages 1 and 2
 *   show that source; Wikidata's results are Commons files, so its cases are the canonical tiles;
 * - `lab/cases.json`: the cases that are new or changed against `--base-cases <file>`;
 * - any other path under the plugin's `src/` or `native/`, or under `packages/`: every case;
 * - anything else: none.
 *
 *   node lab/affected.mjs <base run> [--base-cases <file>] <path>...
 */
import {readCases, readJson, readResults} from './lib.mjs';

const PLUGIN = 'plugins/ink2pic/';
const ADAPTER = /^src\/search-core\/adapters\/(\w+)\.ts$/;

function showsSource(item, source) {
  return [...item.page1, ...item.page2].some(tile =>
    source === 'wikidata' ? tile.canonical : tile.source === source,
  );
}

function affected(cases, baseCases, base, paths) {
  const ids = new Set();
  for (const full of paths) {
    if (full.startsWith('packages/')) {
      return cases.map(c => c.id);
    }
    if (!full.startsWith(PLUGIN)) {
      continue;
    }
    const file = full.slice(PLUGIN.length);
    const adapter = ADAPTER.exec(file);
    if (adapter) {
      base
        .filter(item => showsSource(item, adapter[1]))
        .forEach(item => ids.add(item.id));
    } else if (file === 'lab/cases.json') {
      const before = new Map(baseCases.map(c => [c.id, JSON.stringify(c)]));
      cases
        .filter(c => before.get(c.id) !== JSON.stringify(c))
        .forEach(c => ids.add(c.id));
    } else if (file.startsWith('src/') || file.startsWith('native/')) {
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
