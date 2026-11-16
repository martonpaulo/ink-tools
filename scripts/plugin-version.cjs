#!/usr/bin/env node
/**
 * A plugin's version, one rule for every plugin (#155, root AGENTS.md › Product versioning): the
 * `package.json` version is SemVer with a numbered beta (`0.2.0-beta.3`, a release `0.2.0`), the
 * Git tag and the GitHub prerelease; the tablet's `versionName` in `PluginConfig.json` is derived
 * from it (`0.2.0 beta 3`, `0.2.0`), and `versionCode` is a hidden integer that rises on every build.
 *
 *   node scripts/plugin-version.cjs plugins/<name>   prints the tag version, or fails on a mismatch
 *   node scripts/plugin-version.cjs --workflows .      fails when a prerelease tag lacks its plugin name
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

/**
 * The problems with one prerelease workflow's tags (#155): every tag and release carries the
 * plugin's name, so each `tags:` pattern and the line that computes the tag start with
 * `<plugin>-v`. `plugin` comes from the file name, `prerelease-<plugin>.yml`.
 */
function workflowProblems(plugin, text) {
  const prefix = `${plugin}-v`;
  const found = [];
  for (const [, list] of text.matchAll(/^\s*tags:\s*\[([^\]]*)\]/gm)) {
    for (const pattern of list.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, ''))) {
      if (pattern && !pattern.startsWith(prefix)) {
        found.push(`tag trigger "${pattern}" does not start with ${prefix}`);
      }
    }
  }
  const computed = [...text.matchAll(/^\s*(?:tag|expected)="(.*)"\s*$/gm)].map(match => match[1]);
  if (computed.length === 0) {
    found.push('no tag="…" or expected="…" line computes the tag');
  }
  for (const value of computed) {
    if (!value.startsWith(prefix) && !value.includes(`'${prefix}'`)) {
      found.push(`computed tag ${value} does not start with ${prefix}`);
    }
  }
  return found;
}

/** The problems with every prerelease workflow under `root`, each line naming its file. */
function allWorkflowProblems(root) {
  const folder = path.join(root, '.github', 'workflows');
  return fs
    .readdirSync(folder)
    .map(name => [name, /^prerelease-([a-z0-9]+)\.yml$/.exec(name)])
    .filter(([, match]) => match)
    .flatMap(([name, match]) =>
      workflowProblems(match[1], fs.readFileSync(path.join(folder, name), 'utf8')).map(
        line => `${name}: ${line}`,
      ),
    );
}

if (require.main === module && process.argv[2] === '--workflows') {
  const found = allWorkflowProblems(process.argv[3] || '.');
  found.forEach(line => console.error(`plugin-version: ${line}`));
  process.exit(found.length > 0 ? 1 : 0);
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

module.exports = {versionName, problems, workflowProblems, allWorkflowProblems};
