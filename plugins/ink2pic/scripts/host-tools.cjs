/**
 * Finds the host tools the native tests and the search lab call (#74): a JDK that really runs and
 * a Python 3 that imports Pillow. On macOS `/usr/bin/java` is a stub that fails when no JDK is
 * registered, even with Homebrew's openjdk installed, and the first `python3` may lack Pillow
 * while another Python has it. Finds only; never installs.
 */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

/** Where Homebrew keeps openjdk and the JDK 21 keg, on Apple silicon and on Intel. */
const HOMEBREW_JDKS = ['openjdk', 'openjdk@21'].flatMap(keg => [
  `/opt/homebrew/opt/${keg}/bin`,
  `/usr/local/opt/${keg}/bin`,
]);
/** Homebrew's Pythons, newest first, after the one on the PATH. */
const HOMEBREW_PYTHONS = ['3.14', '3.13', '3.12'].flatMap(version => [
  `/opt/homebrew/bin/python${version}`,
  `/usr/local/bin/python${version}`,
]);
const PROBE_TIMEOUT_MS = 20000;

const JDK_MISSING =
  'No working JDK: install one (`brew install openjdk`) or set JAVA_HOME to it.';
const PILLOW_MISSING =
  'No Python 3 with Pillow: install it (`python3 -m pip install Pillow`).';

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

/** The first Python 3 that imports Pillow; throws PILLOW_MISSING. */
function pythonWithPillow({env = process.env, candidates = ['python3', ...HOMEBREW_PYTHONS]} = {}) {
  const found = candidates.find(python => runs(python, ['-c', 'import PIL'], env));
  if (!found) {
    throw Error(PILLOW_MISSING);
  }
  return found;
}

module.exports = {jdkBin, jdkTool, pythonWithPillow, JDK_MISSING, PILLOW_MISSING};
