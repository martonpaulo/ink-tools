#!/usr/bin/env node
/**
 * Times the pinned seeds of `__tests__/determinism.test.ts` (#380) with the digest of each, so a
 * run shows both speed and sameness. Run it under `--jitless`, the nearest Node gets to Hermes on
 * the tablet, which has no JIT:
 *
 *   npx tsc -p packages/puzzle-core --outDir OUT --module commonjs --noEmit false
 *   node --jitless packages/puzzle-core/scripts/profile.cjs OUT/src [runs]
 */
const path = require('path');

const [, , built, runsText] = process.argv;
if (!built) {
  console.error('usage: profile.cjs BUILT_SRC_DIR [runs]');
  process.exit(2);
}
const core = require(path.resolve(built, 'index.js'));
const runs = Number(runsText || 1);
const MICROSECONDS_PER_MS = 1000;
const WORDS = ['GATO', 'CACHORRO', 'LEAO', 'URSO', 'SAPO', 'PATO', 'CABRA', 'PEIXE'];
const CASES = [
  ['sudoku 4 x 4 easy', () => core.generateSudoku('P1', 4, 'easy')],
  ['sudoku 9 x 9 hard', () => core.generateSudoku('P1', 9, 'hard')],
  ['sudoku 16 x 16 medium', () => core.generateSudoku('P1', 16, 'medium')],
  ['nonogram 15 x 10 medium', () => core.generateNonogram('P1', { width: 15, height: 10 }, 'medium')],
  ['maze 20 x 27 hard', () => core.generateMaze('P1', { shape: 'rectangle', width: 20, height: 27 }, 'hard')],
  ['maze 12 rings medium', () => core.generateMaze('P1', { shape: 'circle', rings: 12 }, 'medium')],
  ['word search 12 hard', () => core.generateWordSearch('P1', 12, 'hard', WORDS)],
  ['futoshiki 5 x 5 medium', () => core.generateFutoshiki('P1', 5, 'medium')],
  ['futoshiki 7 x 7 hard', () => core.generateFutoshiki('P1', 7, 'hard')],
];
const only = process.env.ONLY;
for (const [name, make] of CASES) {
  if (only && !name.includes(only)) continue;
  const times = [];
  let found = '';
  for (let i = 0; i < runs; i++) {
    // CPU time, not wall time, so other work on the machine does not skew the figure.
    const start = process.cpuUsage();
    found = core.digest(make());
    const used = process.cpuUsage(start);
    times.push((used.user + used.system) / MICROSECONDS_PER_MS);
  }
  console.log(`${name}\t${found}\t${times.map(t => t.toFixed(0)).join(' / ')} ms CPU`);
}
