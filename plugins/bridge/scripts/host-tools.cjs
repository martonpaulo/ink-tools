/**
 * Finds a JDK that really runs for the native build (#40), copied from Lookup (#142), which copied Probe (#78), as Ink2Pic's
 * `scripts/host-tools.cjs` does (#74). On macOS `/usr/bin/java` is a stub that fails when no JDK
 * is registered, even with Homebrew's openjdk installed. Finds only; never installs.
 */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

/** Where Homebrew keeps openjdk and the JDK 21 keg, on Apple silicon and on Intel. */
const HOMEBREW_JDKS = ['openjdk', 'openjdk@21'].flatMap(keg => [
  `/opt/homebrew/opt/${keg}/bin`,
  `/usr/local/opt/${keg}/bin`,
]);
const PROBE_TIMEOUT_MS = 20000;

const JDK_MISSING =
  'No working JDK: install one (`brew install openjdk`) or set JAVA_HOME to it.';

function runs(command, args, env) {
  const result = spawnSync(command, args, {stdio: 'ignore', env, timeout: PROBE_TIMEOUT_MS});
  return result.status === 0;
}

/**
 * The folder whose `java` and `javac` run, or '' for the PATH's own; throws JDK_MISSING.
 * `candidates` and `env` are for tests.
 */
function jdkBin({env = process.env, candidates = HOMEBREW_JDKS} = {}) {
  const folders = [env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin') : null, '', ...candidates];
  for (const folder of folders) {
    if (folder === null || (folder !== '' && !fs.existsSync(path.join(folder, 'javac')))) {
      continue;
    }
    const tool = name => (folder === '' ? name : path.join(folder, name));
    if (runs(tool('java'), ['-version'], env) && runs(tool('javac'), ['-version'], env)) {
      return folder;
    }
  }
  throw Error(JDK_MISSING);
}

let foundJdk;

/** The command for a JDK tool (`java`, `javac`, `jar`), found once per process. */
function jdkTool(name) {
  if (foundJdk === undefined) {
    foundJdk = jdkBin();
  }
  return foundJdk === '' ? name : path.join(foundJdk, name);
}

module.exports = {jdkBin, jdkTool, JDK_MISSING};
