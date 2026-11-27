#!/usr/bin/env node
/**
 * Writes a game's seed bank (#552), `src/<game>-bank.ts`: for each size and band in the game's
 * PAIRS, ENTRIES puzzles its live generator makes from the seeds B0, B1, B2 and on, each kept with
 * its seed, so a banked puzzle is the one its code names and the bank is the same on every run. A
 * seed whose attempts run out is passed over. PAIRS are the sizes and bands whose slowest of 12
 * seeds took over 0.1 s of CPU under `node --jitless` in a Mac sweep on 2026-11-28 (recorded on
 * #552), the line `nonogram-bank.cjs` draws: the tablet ran 5 to 15 times the Mac's time.
 *
 *   npx tsc -p packages/puzzle-core --outDir OUT --module commonjs --noEmit false
 *   node packages/puzzle-core/scripts/seed-bank.cjs OUT/src kakuro > packages/puzzle-core/src/kakuro-bank.ts
 */
const { bankEntry, builtCore } = require('./built-core.cjs');

const ENTRIES = 24;
/** A seed bank's seeds: B and a counter in the code's alphabet, short enough to type back. */
const SEED_PREFIX = 'B';
const GAMES = {
  kakuro: {
    constant: 'KAKURO_BANK',
    pairs: ['6:medium', '6:hard', '8:medium', '8:hard', '10:easy', '10:medium', '10:hard', '12:easy', '12:medium', '12:hard'],
    make: (core, seed, size, band) => core.encodeKakuro(core.generateKakuro(seed, Number(size), band)),
  },
  slitherlink: {
    constant: 'SLITHERLINK_BANK',
    pairs: ['7x7:hard', '10x10:easy', '10x10:medium', '10x10:hard'],
    make: (core, seed, size, band) => core.encodeSlitherlink(core.generateSlitherlink(seed, sizeOf(size), band)),
  },
  bridges: {
    constant: 'BRIDGES_BANK',
    pairs: ['7x7:hard', '10x10:medium', '10x10:hard', '13x13:easy', '13x13:medium', '13x13:hard'],
    make: (core, seed, size, band) => core.encodeBridges(core.generateBridges(seed, sizeOf(size), band)),
  },
  binairo: {
    constant: 'BINAIRO_BANK',
    pairs: ['6:hard', '8:hard', '10:hard', '12:medium', '12:hard'],
    make: (core, seed, size, band) => core.encodeBinairo(core.generateBinairo(seed, Number(size), band)),
  },
  'star-battle': {
    constant: 'STAR_BATTLE_BANK',
    pairs: [
      '5S1:hard', '6S1:medium', '6S1:hard', '7S1:medium', '7S1:hard', '8S1:easy', '8S1:medium', '8S1:hard', '8S2:medium',
      '8S2:hard', '9S1:easy', '9S1:medium', '9S1:hard', '9S2:hard', '10S1:easy', '10S1:medium', '10S1:hard', '10S2:hard',
    ],
    make: (core, seed, size, band) => {
      const [side, stars] = size.split('S').map(Number);
      return core.encodeStarBattle(core.generateStarBattle(seed, { side, stars }, band));
    },
  },
};

function sizeOf(text) {
  const [width, height] = text.split('x').map(Number);
  return { width, height };
}

const {
  core,
  rest: [game],
} = builtCore(`seed-bank.cjs BUILT_SRC_DIR ${Object.keys(GAMES).join('|')} > src/GAME-bank.ts`);
const spec = GAMES[game];
if (!spec) {
  console.error(`seed-bank.cjs: no game «${game}»; one of ${Object.keys(GAMES).join(', ')}`);
  process.exit(2);
}
const lines = [];
for (const pair of spec.pairs) {
  const [size, band] = pair.split(':');
  const texts = new Set();
  const entries = [];
  for (let i = 0; entries.length < ENTRIES; i++) {
    const seed = SEED_PREFIX + core.seedFromNumber(i);
    let text;
    try {
      text = spec.make(core, seed, size, band);
    } catch (error) {
      // Only a seed whose attempts ran out is passed over; a wrong size or band stops the run.
      if (/^no .* attempts$/.test(error.message)) continue;
      throw error;
    }
    if (texts.has(text)) continue;
    texts.add(text);
    entries.push(`${seed}/${text}`);
  }
  lines.push(bankEntry(`'${pair}'`, entries));
}
process.stdout.write(`/**
 * The ${game} seed bank (#552): ${ENTRIES} puzzles per size and band, each \`SEED/TEXT\`, the very puzzle the
 * live generator makes from that seed. Written by \`scripts/seed-bank.cjs\`; do not edit by hand.
 */
import type { SeedBank } from './seed-bank';

export const ${spec.constant}: SeedBank = {
${lines.join('\n')}
};
`);
