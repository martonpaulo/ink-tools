#!/usr/bin/env node
/**
 * A plugin's version, one rule for every plugin (#155, root AGENTS.md › Product versioning): the
 * `package.json` version is SemVer with a numbered beta (`0.2.0-beta.3`, a release `0.2.0`), the
 * Git tag and the GitHub prerelease; the tablet's `versionName` in `PluginConfig.json` is derived
 * from it (`0.2.0 beta 3`, `0.2.0`), and `versionCode` is a hidden integer that rises on every build.
 *
 *   node scripts/plugin-version.cjs plugins/<name>   prints the tag version, or fails on a mismatch
 */
const fs = require('node:fs');
const path = require('node:path');

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.([1-9]\d*))?$/;

/** The tablet's versionName for a package.json version; throws for any other form. */
function versionName(version) {
  const match = SEMVER.exec(version);
  if (!match) {
    throw Error(`${version} is not MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-beta.N`);
  }
  const [, major, minor, patch, beta] = match;
  return `${major}.${minor}.${patch}${beta ? ` beta ${beta}` : ''}`;
}

/** The problems with a plugin folder's two version fields; empty when they agree. */
function problems(folder) {
  const read = name => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
  const {version} = read('package.json');
  const config = read('PluginConfig.json');
  const found = [];
  let expected = null;
  try {
    expected = versionName(version);
  } catch (error) {
    found.push(`package.json: ${error.message}`);
  }
  if (expected !== null && config.versionName !== expected) {
    found.push(
      `PluginConfig.json versionName is "${config.versionName}"; package.json ${version} gives "${expected}"`,
    );
  }
  if (!/^[1-9]\d*$/.test(String(config.versionCode))) {
    found.push(`PluginConfig.json versionCode "${config.versionCode}" is not a positive integer`);
  }
  return found;
}

if (require.main === module) {
  const folder = process.argv[2];
  const found = problems(folder);
  if (found.length > 0) {
    found.forEach(line => console.error(`plugin-version: ${line}`));
    process.exit(1);
  }
  console.log(JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8')).version);
}

module.exports = {versionName, problems};
