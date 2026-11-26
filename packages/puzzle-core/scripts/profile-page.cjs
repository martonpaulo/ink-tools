#!/usr/bin/env node
/**
 * Times the renderer's sample pages (`testing/pages.ts`, #379): drawing, then PNG encoding, in CPU
 * time, with each PNG's length. Run it under `--jitless`, the nearest Node gets to the tablet's
 * engine, which has no JIT; device round 11 measured the tablet at about 5 times these figures:
 *
 *   npx tsc -p packages/puzzle-core --outDir OUT --module commonjs --noEmit false
 *   node --jitless packages/puzzle-core/scripts/profile-page.cjs OUT [runs]
 */
const path = require('path');

const [, , built, runsText] = process.argv;
if (!built) {
  console.error('usage: profile-page.cjs BUILT_DIR [runs]');
  process.exit(2);
}
const { encodePng } = require(path.resolve(built, 'src', 'index.js'));
const { SAMPLE_PAGES } = require(path.resolve(built, 'testing', 'pages.js'));
const runs = Number(runsText || 1);
const MICROSECONDS_PER_MS = 1000;
const cpuMs = (start) => {
  const used = process.cpuUsage(start);
  return (used.user + used.system) / MICROSECONDS_PER_MS;
};
for (let run = 1; run <= runs; run++) {
  for (const [name, draw] of SAMPLE_PAGES) {
    const start = process.cpuUsage();
    const raster = draw();
    const drawn = cpuMs(start);
    const png = encodePng(raster);
    const total = cpuMs(start);
    console.log(`${name}\tdraw ${drawn.toFixed(0)} ms\tencode ${(total - drawn).toFixed(0)} ms\ttotal ${total.toFixed(0)} ms\t${png.length} bytes`);
  }
}
