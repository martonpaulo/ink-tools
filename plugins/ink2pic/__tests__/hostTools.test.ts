/**
 * The host tool search of the native tests and the search lab (#74): a stub `java` that does not
 * run counts as missing, and a missing tool is one message naming what to install.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  jdkBin,
  pythonWithPillow,
  JDK_MISSING,
  PILLOW_MISSING,
} = require('../scripts/host-tools.cjs');

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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ink2pic-host-tools-'));
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

describe('jdkBin', () => {
  it('passes over a stub java on the PATH to a JDK that runs (#74)', () => {
    const stub = tools('stub', 1, ['java', 'javac']);
    const jdk = tools('jdk', 0, ['java', 'javac']);
    expect(jdkBin({env: {PATH: stub}, candidates: [jdk]})).toBe(jdk);
  });

  it('takes JAVA_HOME first, and the PATH when its JDK runs', () => {
    const home = path.dirname(tools('home/bin', 0, ['java', 'javac']));
    const jdk = tools('jdk', 0, ['java', 'javac']);
    expect(jdkBin({env: {PATH: jdk, JAVA_HOME: home}, candidates: []})).toBe(
      path.join(home, 'bin'),
    );
    expect(jdkBin({env: {PATH: jdk}, candidates: []})).toBe('');
  });

  it('names what to install when no JDK runs', () => {
    const stub = tools('stub', 1, ['java', 'javac']);
    expect(() => jdkBin({env: {PATH: stub}, candidates: [stub]})).toThrow(
      JDK_MISSING,
    );
  });
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
