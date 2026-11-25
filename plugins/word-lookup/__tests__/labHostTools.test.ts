/**
 * The search lab's Python search (#74): the first Python 3 that imports Pillow, and one message
 * naming what to install when none does. The JDK search is the shared one, tested with Plugin
 * Diagnostics (#254).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {pythonWithPillow, PILLOW_MISSING} = require('../lab/host-tools.cjs');

let root: string;

/** A folder of fake tools that each exit with `status`. */
function tools(name: string, status: number, names: string[]): string {
  const folder = path.join(root, name);
  fs.mkdirSync(folder, {recursive: true});
  for (const tool of names) {
    const file = path.join(folder, tool);
    fs.writeFileSync(file, `#!/bin/sh\nexit ${status}\n`);
    fs.chmodSync(file, 0o755);
  }
  return folder;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-host-tools-'));
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

describe('pythonWithPillow', () => {
  it('takes the first Python that imports Pillow (#74)', () => {
    const without = path.join(tools('without', 1, ['python3']), 'python3');
    const withPillow = path.join(tools('with', 0, ['python3']), 'python3');
    expect(
      pythonWithPillow({env: {}, candidates: [without, withPillow]}),
    ).toBe(withPillow);
  });

  it('names what to install when none has Pillow', () => {
    const without = path.join(tools('without', 1, ['python3']), 'python3');
    expect(() => pythonWithPillow({env: {}, candidates: [without]})).toThrow(
      PILLOW_MISSING,
    );
  });
});
