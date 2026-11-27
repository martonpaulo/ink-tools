#!/usr/bin/env node
/**
 * Times the pinned seeds of `__tests__/determinism.test.ts` (#380) with the digest of each, so a
 * run shows both speed and sameness. Run it under `--jitless`, the nearest Node gets to Hermes on
 * the tablet, which has no JIT:
 *
 *   npx tsc -p packages/puzzle-core --outDir OUT --module commonjs --noEmit false
 *   node --jitless packages/puzzle-core/scripts/profile.cjs OUT/src [runs]
 *
 * `sweep` times every nonogram shape and band instead (#434): each width and height from 5 to 25,
 * SEEDS seeds each (default 12), printed as shape, band, median and slowest ms of CPU. WIDTHS
 * (`20-25` or `5,9`) keeps some widths, so parallel runs can split the sweep:
 *
 *   node --jitless packages/puzzle-core/scripts/profile.cjs OUT/src sweep
 */
const { builtCore } = require('./built-core.cjs');

const {
  core,
  rest: [runsText],
} = builtCore('profile.cjs BUILT_SRC_DIR [runs | sweep]');
/** The seeds per shape and band of a sweep, as #434 measures them. */
const SWEEP_SEEDS = 12;

/** CPU time of one call in ms, not wall time, so other work on the machine does not skew it. */
function cpuMs(make) {
  const start = process.cpuUsage();
  const made = make();
  const used = process.cpuUsage(start);
  return [(used.user + used.system) / MICROSECONDS_PER_MS, made];
}

function widthsOf(text) {
  const out = new Set();
  for (const part of text.split(',')) {
    const [from, to = from] = part.split('-').map(Number);
    for (let w = from; w <= to; w++) out.add(w);
  }
  return out;
}

function sweep() {
  const seeds = Number(process.env.SEEDS || SWEEP_SEEDS);
  const widths = process.env.WIDTHS ? widthsOf(process.env.WIDTHS) : null;
  for (let width = core.NONOGRAM_MIN_SIDE; width <= core.NONOGRAM_MAX_SIDE; width++) {
    if (widths && !widths.has(width)) continue;
    for (let height = core.NONOGRAM_MIN_SIDE; height <= core.NONOGRAM_MAX_SIDE; height++) {
      for (const band of core.NONOGRAM_BANDS) {
        const times = [];
        for (let seed = 1; seed <= seeds; seed++) times.push(cpuMs(() => core.generateNonogram(`S${seed}`, { width, height }, band))[0]);
        times.sort((a, b) => a - b);
        const median = (times[(seeds - 1) >> 1] + times[seeds >> 1]) / 2;
        console.log(`${width}x${height}\t${band}\t${median.toFixed(0)}\t${times[seeds - 1].toFixed(0)}`);
      }
    }
  }
}

const MICROSECONDS_PER_MS = 1000;
if (runsText === 'sweep') {
  sweep();
  process.exit(0);
}
const runs = Number(runsText || 1);
const WORDS = ['GATO', 'CACHORRO', 'LEAO', 'URSO', 'SAPO', 'PATO', 'CABRA', 'PEIXE'];
const CASES = [
  ['sudoku 4 x 4 easy', () => core.generateSudoku('P1', 4, 'easy')],
  ['sudoku 9 x 9 hard', () => core.generateSudoku('P1', 9, 'hard')],
  ['sudoku 16 x 16 medium', () => core.generateSudoku('P1', 16, 'medium')],
  ['nonogram 15 x 10 medium', () => core.generateNonogram('P1', { width: 15, height: 10 }, 'medium')],
  ['maze 20 x 27 hard', () => core.generateMaze('P1', { shape: 'rectangle', width: 20, height: 27 }, 'hard')],
  ['maze 12 rings medium', () => core.generateMaze('P1', { shape: 'circle', rings: 12 }, 'medium')],
  ['word search 12 hard', () => core.generateWordSearch('P1', 12, 'hard', WORDS)],
  ['slitherlink 7 x 7 easy', () => core.generateSlitherlink('P1', { width: 7, height: 7 }, 'easy')],
  ['slitherlink 10 x 10 hard', () => core.generateSlitherlink('P1', { width: 10, height: 10 }, 'hard')],
  ['futoshiki 5 x 5 medium', () => core.generateFutoshiki('P1', 5, 'medium')],
  ['futoshiki 7 x 7 hard', () => core.generateFutoshiki('P1', 7, 'hard')],
  ['binairo 10 x 10 hard', () => core.generateBinairo('P1', 10, 'hard')],
  ['star battle 8 x 8 one star easy', () => core.generateStarBattle('P1', { side: 8, stars: 1 }, 'easy')],
  ['star battle 10 x 10 one star hard', () => core.generateStarBattle('P1', { side: 10, stars: 1 }, 'hard')],
  ['star battle 10 x 10 two stars hard', () => core.generateStarBattle('P1', { side: 10, stars: 2 }, 'hard')],
];
const only = process.env.ONLY;
for (const [name, make] of CASES) {
  if (only && !name.includes(only)) continue;
  const times = [];
  let found = '';
  for (let i = 0; i < runs; i++) {
    const [ms, made] = cpuMs(make);
    found = core.digest(made);
    times.push(ms);
  }
  console.log(`${name}\t${found}\t${times.map(t => t.toFixed(0)).join(' / ')} ms CPU`);
}
