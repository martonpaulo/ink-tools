/**
 * Finds the host tools the native tests and the search lab call (#74): the shared JDK locator,
 * packages/native-build/host-tools.cjs (#254), and a Python 3 that imports Pillow. The first
 * `python3` may lack Pillow while another Python has it. Finds only; never installs.
 */
const {spawnSync} = require('node:child_process');
const {jdkBin, jdkTool, JDK_MISSING} = require('../../../packages/native-build/host-tools.cjs');

/** Homebrew's Pythons, newest first, after the one on the PATH. */
const HOMEBREW_PYTHONS = ['3.14', '3.13', '3.12'].flatMap(version => [
  `/opt/homebrew/bin/python${version}`,
  `/usr/local/bin/python${version}`,
]);
const PROBE_TIMEOUT_MS = 20000;

const PILLOW_MISSING =
  'No Python 3 with Pillow: install it (`python3 -m pip install Pillow`).';

/** The first Python 3 that imports Pillow; throws PILLOW_MISSING. */
function pythonWithPillow({env = process.env, candidates = ['python3', ...HOMEBREW_PYTHONS]} = {}) {
  const found = candidates.find(
    python =>
      spawnSync(python, ['-c', 'import PIL'], {stdio: 'ignore', env, timeout: PROBE_TIMEOUT_MS})
        .status === 0,
  );
  if (!found) {
    throw Error(PILLOW_MISSING);
  }
  return found;
}

module.exports = {jdkBin, jdkTool, pythonWithPillow, JDK_MISSING, PILLOW_MISSING};
