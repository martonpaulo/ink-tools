/**
 * The apksigner key of a sideloaded Android app (#223, #494): the stable key from the environment
 * when its variable is set, else the app's local debug key. The prerelease workflow sets
 * `<keystoreEnv>` to a decoded keystore path and `<keystoreEnv>_PASSWORD` from repository secrets, so
 * every published build updates the last one on the tablet. The password reaches apksigner by
 * variable name (`env:`), never on a command line. A keystore without its password, or a path that
 * does not exist, fails: a half-set key must never fall back to a key the tablet cannot update from.
 *
 *   key: {keystoreEnv, stableAlias, debugAlias, debugPass, debugStore: () => path}
 *   signingArgs(key, env) -> {stable, args}
 */
const fs = require('node:fs');

function passwordEnv(key) {
  return `${key.keystoreEnv}_PASSWORD`;
}

function signingArgs(key, env = process.env) {
  const store = env[key.keystoreEnv];
  if (!store) {
    const debug = key.debugStore();
    const pass = `pass:${key.debugPass}`;
    return {stable: false, args: ['--ks', debug, '--ks-key-alias', key.debugAlias, '--ks-pass', pass, '--key-pass', pass]};
  }
  if (!env[passwordEnv(key)]) {
    throw Error(`${key.keystoreEnv} is set but ${passwordEnv(key)} is empty`);
  }
  if (!fs.existsSync(store)) {
    throw Error(`${key.keystoreEnv} names a missing file: ${store}`);
  }
  const pass = `env:${passwordEnv(key)}`;
  return {stable: true, args: ['--ks', store, '--ks-key-alias', key.stableAlias, '--ks-pass', pass, '--key-pass', pass]};
}

module.exports = {passwordEnv, signingArgs};
