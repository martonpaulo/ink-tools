import fs from 'node:fs';
import path from 'node:path';

/**
 * Every JVM the lab or the native tests start runs headless: without the flag, ImageIO opens a
 * Java app in the macOS Dock on every run, on the owner's screen.
 */
const FILES = [
  'lab/pixelorder.mjs',
  'lab/timing.mjs',
  'scripts/native-build.cjs',
];
const HEADLESS = '-Djava.awt.headless=true';
/** The D8 dexer reads no image: it is the one JVM that may start without the flag. */
const EXEMPT = 'com.android.tools.r8.D8';

describe('the JVMs the scripts start', () => {
  it.each(FILES)('%s starts each one headless', file => {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const calls = text.split(/(?:execFileSync|run)\(\s*'java',/).slice(1);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const args = call.slice(0, call.indexOf(']'));
      if (!args.includes(EXEMPT)) {
        expect(args).toContain(HEADLESS);
      }
    }
  });
});
