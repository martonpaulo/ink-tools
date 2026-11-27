#!/usr/bin/env node
/**
 * Writes `src/sudoku-bank.ts`, the dug sudokus `generateSudoku` shows (#380): for each offered size
 * and band, ENTRIES puzzles from `digSudoku` with the seeds `bank/<size>/<band>/<i>`, so the bank
 * is the same on every run. Digging a hard 16 x 16 takes seconds on the tablet; here it runs once.
 *
 *   npx tsc -p packages/puzzle-core --outDir OUT --module commonjs --noEmit false
 *   node packages/puzzle-core/scripts/sudoku-bank.cjs OUT/src > packages/puzzle-core/src/sudoku-bank.ts
 */
const { bankEntry, builtCore } = require('./built-core.cjs');

const ENTRIES = 16;
const { core } = builtCore('sudoku-bank.cjs BUILT_SRC_DIR > src/sudoku-bank.ts');
const lines = [];
for (const [size, offered] of Object.entries(core.SUDOKU_SIZES)) {
  for (const band of offered.bands) {
    const seen = new Set();
    for (let i = 0; seen.size < ENTRIES; i++) {
      seen.add(core.encodeSudoku(core.digSudoku(`bank/${size}/${band}/${i}`, Number(size), band).givens));
    }
    lines.push(bankEntry(`'${size}:${band}'`, seen));
  }
}
process.stdout.write(`/**
 * Dug sudokus, ${ENTRIES} per offered size and band, one base-36 digit per cell (0 empty), row by row.
 * Written by \`scripts/sudoku-bank.cjs\`; do not edit by hand (#380).
 */
export const SUDOKU_BANK: Readonly<Record<string, readonly string[]>> = {
${lines.join('\n')}
};
`);
