#!/usr/bin/env node
/**
 * Writes `src/nonogram-bank.ts`, the drawn pictures `generateNonogram` shows (#434): for each
 * shape and band in PAIRS, ENTRIES pictures from `drawNonogram` with the seeds
 * `bank/<w>x<h>/<band>/<i>`, so the bank is the same on every run. PAIRS are the shapes and bands
 * whose slowest of 12 seeds took over 0.2 s of CPU under `node --jitless` in the sweep of
 * `profile.cjs` (recorded on #434), a margin under the 0.3 s target; drawing them takes seconds
 * on the tablet, here it runs once.
 *
 *   npx tsc -p packages/puzzle-core --outDir OUT --module commonjs --noEmit false
 *   node packages/puzzle-core/scripts/nonogram-bank.cjs OUT/src > packages/puzzle-core/src/nonogram-bank.ts
 */
const { builtCore } = require('./built-core.cjs');

const ENTRIES = 16;
const PAIRS = [
  '6x19:hard', '8x8:hard', '8x21:hard', '8x25:hard', '9x25:hard', '11x24:hard', '11x25:hard',
  '13x20:hard', '13x22:hard', '13x25:hard', '14x6:hard', '14x20:hard', '14x21:hard', '14x22:hard',
  '14x23:hard', '14x24:hard', '14x25:hard', '15x17:hard', '15x19:hard', '15x22:hard', '15x23:hard',
  '15x24:hard', '15x25:hard', '16x23:hard', '16x25:hard', '17x11:hard', '17x16:hard', '17x17:hard',
  '17x18:hard', '17x19:hard', '17x23:hard', '17x24:hard', '17x25:hard', '18x14:hard', '18x15:hard',
  '18x17:hard', '18x18:hard', '18x19:hard', '18x20:hard', '18x21:hard', '18x22:hard', '18x23:hard',
  '18x24:hard', '18x25:hard', '19x16:hard', '19x17:hard', '19x19:hard', '19x20:hard', '19x21:hard',
  '19x22:hard', '19x23:hard', '19x24:hard', '19x25:hard', '20x16:hard', '20x17:hard', '20x18:hard',
  '20x19:hard', '20x20:hard', '20x21:hard', '20x22:hard', '20x23:hard', '20x24:hard', '20x25:hard',
  '21x18:hard', '21x19:hard', '21x20:hard', '21x21:hard', '21x22:hard', '21x23:hard', '21x24:hard',
  '21x25:medium', '21x25:hard', '22x12:hard', '22x13:hard', '22x14:hard', '22x15:hard',
  '22x16:hard', '22x17:hard', '22x18:hard', '22x19:hard', '22x20:medium', '22x20:hard',
  '22x21:hard', '22x22:hard', '22x23:hard', '22x24:hard', '22x25:medium', '22x25:hard',
  '23x13:hard', '23x16:hard', '23x17:hard', '23x18:hard', '23x19:hard', '23x20:hard', '23x21:hard',
  '23x22:medium', '23x22:hard', '23x23:medium', '23x23:hard', '23x24:medium', '23x24:hard',
  '23x25:medium', '23x25:hard', '24x10:hard', '24x11:hard', '24x12:hard', '24x13:hard',
  '24x14:hard', '24x15:hard', '24x16:hard', '24x17:medium', '24x17:hard', '24x18:hard',
  '24x19:hard', '24x20:hard', '24x21:hard', '24x22:hard', '24x23:hard', '24x24:medium',
  '24x24:hard', '24x25:hard', '25x11:hard', '25x13:hard', '25x15:hard', '25x16:hard', '25x17:hard',
  '25x18:hard', '25x19:hard', '25x20:hard', '25x21:medium', '25x21:hard', '25x22:hard',
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
