#!/usr/bin/env node
/**
 * Writes `src/nonogram-bank.ts`, the drawn pictures `generateNonogram` shows (#434): for each
 * shape and band in PAIRS, ENTRIES pictures from `drawNonogram` with the seeds
 * `bank/<w>x<h>/<band>/<i>`, so the bank is the same on every run. PAIRS are the shapes and bands
 * whose slowest of 12 seeds took over 0.1 s of CPU under `node --jitless` in a Mac sweep of
 * `profile.cjs` (recorded on #434): the tablet ran 10 to 12 times the Mac's time, and its line is
 * 2 s; drawing them takes seconds on the tablet, here it runs once.
 *
 *   npx tsc -p packages/puzzle-core --outDir OUT --module commonjs --noEmit false
 *   node packages/puzzle-core/scripts/nonogram-bank.cjs OUT/src > packages/puzzle-core/src/nonogram-bank.ts
 */
const { builtCore } = require('./built-core.cjs');

const ENTRIES = 16;
const PAIRS = [
  '6x18:hard', '6x19:hard', '7x5:hard', '8x8:hard', '8x16:hard', '8x19:hard', '8x21:hard',
  '8x22:hard', '8x23:hard', '8x24:hard', '8x25:hard', '9x25:hard', '10x6:hard', '10x8:hard',
  '10x22:hard', '10x24:hard', '10x25:hard', '11x9:hard', '11x15:hard', '11x18:hard', '11x19:hard',
  '11x20:hard', '11x21:hard', '11x22:hard', '11x23:hard', '11x24:hard', '11x25:hard', '12x18:hard',
  '12x23:hard', '13x11:hard', '13x19:hard', '13x20:hard', '13x21:hard', '13x22:hard', '13x23:hard',
  '13x24:hard', '13x25:hard', '14x6:hard', '14x17:hard', '14x18:hard', '14x19:hard', '14x20:hard',
  '14x21:hard', '14x22:hard', '14x23:hard', '14x24:hard', '14x25:hard', '15x14:hard', '15x16:hard',
  '15x17:hard', '15x19:hard', '15x20:hard', '15x22:hard', '15x23:hard', '15x24:hard', '15x25:hard',
  '16x16:hard', '16x19:hard', '16x20:hard', '16x21:hard', '16x22:hard', '16x23:hard', '16x24:hard',
  '16x25:hard', '17x11:hard', '17x14:hard', '17x16:hard', '17x17:hard', '17x18:hard', '17x19:hard',
  '17x20:medium', '17x20:hard', '17x21:medium', '17x21:hard', '17x22:medium', '17x22:hard',
  '17x23:medium', '17x23:hard', '17x24:hard', '17x25:hard', '18x10:hard', '18x11:hard',
  '18x12:hard', '18x13:hard', '18x14:hard', '18x15:hard', '18x16:hard', '18x17:medium',
  '18x17:hard', '18x18:hard', '18x19:hard', '18x20:hard', '18x21:hard', '18x22:medium',
  '18x22:hard', '18x23:medium', '18x23:hard', '18x24:medium', '18x24:hard', '18x25:hard',
  '19x5:hard', '19x6:hard', '19x9:hard', '19x12:hard', '19x13:hard', '19x14:hard', '19x15:hard',
  '19x16:hard', '19x17:hard', '19x18:medium', '19x18:hard', '19x19:medium', '19x19:hard',
  '19x20:hard', '19x21:medium', '19x21:hard', '19x22:medium', '19x22:hard', '19x23:medium',
  '19x23:hard', '19x24:medium', '19x24:hard', '19x25:medium', '19x25:hard', '20x5:hard',
  '20x7:hard', '20x8:hard', '20x9:hard', '20x12:hard', '20x13:hard', '20x14:hard', '20x15:hard',
  '20x16:hard', '20x17:medium', '20x17:hard', '20x18:medium', '20x18:hard', '20x19:medium',
  '20x19:hard', '20x20:medium', '20x20:hard', '20x21:medium', '20x21:hard', '20x22:medium',
  '20x22:hard', '20x23:medium', '20x23:hard', '20x24:medium', '20x24:hard', '20x25:medium',
  '20x25:hard', '21x6:hard', '21x8:hard', '21x9:hard', '21x10:hard', '21x11:hard', '21x12:hard',
  '21x13:hard', '21x14:hard', '21x15:hard', '21x16:hard', '21x17:hard', '21x18:medium',
  '21x18:hard', '21x19:medium', '21x19:hard', '21x20:hard', '21x21:medium', '21x21:hard',
  '21x22:medium', '21x22:hard', '21x23:medium', '21x23:hard', '21x24:medium', '21x24:hard',
  '21x25:medium', '21x25:hard', '22x5:hard', '22x6:hard', '22x7:hard', '22x8:hard', '22x9:hard',
  '22x11:hard', '22x12:hard', '22x13:hard', '22x14:hard', '22x15:medium', '22x15:hard',
  '22x16:medium', '22x16:hard', '22x17:medium', '22x17:hard', '22x18:hard', '22x19:medium',
  '22x19:hard', '22x20:medium', '22x20:hard', '22x21:medium', '22x21:hard', '22x22:medium',
  '22x22:hard', '22x23:medium', '22x23:hard', '22x24:medium', '22x24:hard', '22x25:medium',
  '22x25:hard', '23x5:hard', '23x7:hard', '23x9:hard', '23x10:hard', '23x11:hard', '23x12:hard',
  '23x13:hard', '23x16:hard', '23x17:medium', '23x17:hard', '23x18:medium', '23x18:hard',
  '23x19:medium', '23x19:hard', '23x20:hard', '23x21:medium', '23x21:hard', '23x22:medium',
  '23x22:hard', '23x23:medium', '23x23:hard', '23x24:medium', '23x24:hard', '23x25:medium',
  '23x25:hard', '24x8:hard', '24x9:hard', '24x10:hard', '24x11:hard', '24x12:hard', '24x13:hard',
  '24x14:hard', '24x15:hard', '24x16:hard', '24x17:medium', '24x17:hard', '24x18:hard',
  '24x19:medium', '24x19:hard', '24x20:hard', '24x21:medium', '24x21:hard', '24x22:hard',
  '24x23:medium', '24x23:hard', '24x24:medium', '24x24:hard', '24x25:medium', '24x25:hard',
  '25x6:hard', '25x7:hard', '25x8:hard', '25x9:hard', '25x11:hard', '25x13:hard', '25x14:hard',
  '25x15:hard', '25x16:hard', '25x17:medium', '25x17:hard', '25x18:hard', '25x19:hard',
  '25x20:medium', '25x20:hard', '25x21:medium', '25x21:hard', '25x22:medium', '25x22:hard',
  '25x23:medium', '25x23:hard', '25x24:medium', '25x24:hard', '25x25:medium', '25x25:hard',
];
const { core } = builtCore('nonogram-bank.cjs BUILT_SRC_DIR > src/nonogram-bank.ts');
const lines = [];
for (const pair of PAIRS) {
  const [shape, band] = pair.split(':');
  const [width, height] = shape.split('x').map(Number);
  const seen = new Set();
  for (let i = 0; seen.size < ENTRIES; i++) {
    seen.add(core.encodePicture(core.drawNonogram(`bank/${shape}/${band}/${i}`, { width, height }, band).solution));
  }
  lines.push(`  '${pair}': [\n${[...seen].map(text => `    '${text}',`).join('\n')}\n  ],`);
}
process.stdout.write(`/**
 * Drawn nonogram pictures, ${ENTRIES} per shape and band in the bank, five cells per base-32 digit,
 * row by row. Written by \`scripts/nonogram-bank.cjs\`; do not edit by hand (#434).
 */
export const NONOGRAM_BANK: Readonly<Record<string, readonly string[]>> = {
${lines.join('\n')}
};
`);
