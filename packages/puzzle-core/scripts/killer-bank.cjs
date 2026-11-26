#!/usr/bin/env node
/**
 * Writes `src/killer-bank.ts`, the dug killer sudokus `generateKiller` shows (#387): for each band,
 * ENTRIES puzzles from `digKiller` with the seeds `bank/<band>/<i>`, so the bank is the same on
 * every run. Digging an expert one takes seconds on the Mac and far more on the tablet; here it
 * runs once.
 *
 *   npx tsc -p packages/puzzle-core --outDir OUT --module commonjs --noEmit false
 *   node packages/puzzle-core/scripts/killer-bank.cjs OUT/src > packages/puzzle-core/src/killer-bank.ts
 */
const path = require('path');

const ENTRIES = 24;
const USAGE = 'usage: killer-bank.cjs BUILT_SRC_DIR > src/killer-bank.ts';
const built = process.argv.slice(2).shift();
if (!built) {
  console.error(USAGE);
  process.exit(2);
}
const core = require(path.resolve(built, 'index.js'));
const lines = [];
for (const band of core.DIFFICULTIES) {
  const seen = new Set();
  for (let i = 0; seen.size < ENTRIES; i++) seen.add(core.encodeKiller(core.digKiller(`bank/${band}/${i}`, band)));
  lines.push(`  ${band}: [\n${[...seen].map(text => `    '${text}',`).join('\n')}\n  ],`);
}
process.stdout.write(`/**
 * Dug killer sudokus, ${ENTRIES} per band: the solution, each cell's cage id and the givens, 81
 * characters each, joined by «/». Written by \`scripts/killer-bank.cjs\`; do not edit by hand (#387).
 */
export const KILLER_BANK: Readonly<Record<string, readonly string[]>> = {
${lines.join('\n')}
};
`);
