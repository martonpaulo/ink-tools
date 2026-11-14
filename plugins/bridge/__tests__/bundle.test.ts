/**
 * @jest-environment node
 *
 * Metro bundles the shared ui-kit package from ../../packages into Bridge, with this plugin's
 * one copy of React, and leaves the test-only size rule out (#93). The .snplg holds this bundle.
 */
import {execFileSync} from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.join(__dirname, '..');
/** A development bundle keeps each module's path, so the test can name what went in. */
function bundle(): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-bundle-'));
  try {
    const file = path.join(out, 'Bridge.bundle');
    execFileSync(
      'npx',
      [
        'react-native',
        'bundle',
        '--entry-file',
        'index.js',
        '--platform',
        'android',
        '--dev',
        'true',
        '--bundle-output',
        file,
        '--assets-dest',
        out,
      ],
      {cwd: ROOT, env: {...process.env, CI: '1'}, stdio: 'pipe'},
    );
    return fs.readFileSync(file, 'utf8');
  } finally {
    fs.rmSync(out, {recursive: true, force: true});
  }
}

/** A cold Metro run takes about 10 s on a laptop; CI runners are slower. */
const BUNDLE_TIMEOUT_MS = 180000;

test(
  'the bundle holds the ui-kit package and one React',
  () => {
    const text = bundle();
    for (const file of ['index.ts', 'metrics.ts', 'styles.ts', 'Button.tsx']) {
      expect(text).toContain(`packages/ui-kit/src/${file}`);
    }
    expect(text).not.toContain('packages/ui-kit/src/screenBreaks');
    expect(text.match(/node_modules\/react\/index\.js/g)).toHaveLength(1);
  },
  BUNDLE_TIMEOUT_MS,
);
