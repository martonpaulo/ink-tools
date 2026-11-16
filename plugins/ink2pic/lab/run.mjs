#!/usr/bin/env node
/**
 * Runs every case of `cases.json` through the product search (#63) and writes
 * `out/<run>/results.json` with pages 1 and 2 of each. `--fault` replaces a source's fetch with a
 * fault (`down`, `slow`, `throttled` or 429, `broken` or 500, `malformed`); see `runner.mjs`.
 *
 * `--cases` keeps only the cases whose id or category is in its comma list (#108). A run named
 * `lookup` or `lookup-…` searches with Word Lookup's query languages, any other with Ink2Pic's
 * (#183); `results.json` records them.
 *
 *   node lab/run.mjs <run> [--fault <source>=<kind>[,...]] [--cases <id or category>[,...]]
 */
import path from 'node:path';
import {
  checkProxy,
  product,
  readCases,
  ROOT_DIR,
  runDir,
  selectCases,
  writeJson,
} from './lib.mjs';
import {commit, languagesFor, parseFaults, runCases} from './runner.mjs';

const [name, ...rest] = process.argv.slice(2);
const dir = runDir(name);
const options = {};
for (let at = 0; at < rest.length; at += 2) {
  if (
    !['--fault', '--cases'].includes(rest[at]) ||
    rest[at + 1] === undefined
  ) {
    throw new Error(
      `unknown option ${rest[at]}; usage: run.mjs <run> [--fault <spec>] [--cases <list>]`,
    );
  }
  options[rest[at]] = rest[at + 1];
}
const faults = parseFaults(options['--fault']);
const chosen = selectCases(readCases(), options['--cases']);
checkProxy();
const {config, core} = product();
const measured = commit();
const languages = languagesFor(name);
console.log(`query languages: ${languages.join(', ')}`);
const save = cases =>
  writeJson(path.join(dir, 'results.json'), {
    run: name,
    commit: measured,
    faults,
    languages,
    userAgent: config.USER_AGENT,
    pageSize: core.PAGE_SIZE,
    cases,
  });
// Saved after each query, so the sheets and the numbers can start before the run ends.
const cases = await runCases(chosen, faults, console.log, save, languages);
const failed = cases.filter(c =>
  Object.entries(c.statuses).some(
    ([source, s]) => s.state === 'failed' && !faults[source],
  ),
);
console.log(
  `wrote ${path.relative(ROOT_DIR, dir)}/results.json; ${
    failed.length
  } queries with a failed source` +
    (failed.length
      ? `: run it again to ask only for those (${failed
          .map(c => c.id)
          .join(', ')})`
      : ''),
);
