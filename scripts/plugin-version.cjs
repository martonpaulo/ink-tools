#!/usr/bin/env node
/**
 * A plugin's version, one rule for every plugin (#155, root AGENTS.md › Product versioning): the
 * `package.json` version is SemVer with a numbered beta (`0.2.0-beta.3`, a release `0.2.0`), the
 * Git tag and the GitHub prerelease; the tablet's `versionName` in `PluginConfig.json` is derived
 * from it (`0.2.0 beta 3`, `0.2.0`), and `versionCode` is a hidden integer that rises on every build.
 *
 *   node scripts/plugin-version.cjs plugins/<name>   prints the tag version, or fails on a mismatch
 *   node scripts/plugin-version.cjs --workflows .      fails when a prerelease tag lacks its plugin name
 *   node scripts/plugin-version.cjs --icons .          fails when a plugin's iconPath is empty or missing
 *   node scripts/plugin-version.cjs --identity .       fails when a plugin's names, versionCode or pins drift (#295)
 */
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * The plugin fields that still disagree with the identity rule (#295), as `<folder>: <field>`. Each
 * row is a finding once it agrees, so the list only shrinks; #295 decides whether `app.json`
 * `displayName` is the display name (Smart Pen) or the code name (the rest).
 */
const PENDING_IDENTITY = new Set([
  'account-sync: app.json displayName',
  'device-transfer: app.json displayName',
  'image-editing: app.json displayName',
  'plugin-diagnostics: app.json displayName',
]);
/** The dependencies every plugin pins to the same version: one host runtime, one SDK. */
const SHARED_PINS = ['react-native', 'react', 'sn-plugin-lib'];
/** The copy module's title line: `title: 'Word Lookup',`. */
const COPY_TITLE = /^\s*title:\s*'([^']+)'/m;

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
    .map(name => [name, /^prerelease-([a-z0-9-]+)\.yml$/.exec(name)])
    .filter(([, match]) => match)
    .flatMap(([name, match]) =>
      workflowProblems(match[1], fs.readFileSync(path.join(folder, name), 'utf8')).map(
        line => `${name}: ${line}`,
      ),
    );
}

/**
 * The plugins under `root` whose `PluginConfig.json` names no icon, or one that is not in the
 * plugin folder (#248): the plugin list then shows no icon, with no warning from the build.
 */
function iconProblems(root) {
  const plugins = path.join(root, 'plugins');
  return fs
    .readdirSync(plugins)
    .filter(name => fs.existsSync(path.join(plugins, name, 'PluginConfig.json')))
    .flatMap(name => {
      const config = path.join(plugins, name, 'PluginConfig.json');
      const {iconPath} = JSON.parse(fs.readFileSync(config, 'utf8'));
      if (!iconPath) {
        return [`plugins/${name}/PluginConfig.json: iconPath is empty`];
      }
      return fs.existsSync(path.join(plugins, name, iconPath))
        ? []
        : [`plugins/${name}/PluginConfig.json: iconPath ${iconPath} is not a file`];
    });
}

/** The plugin folders under `root` that hold a PluginConfig.json. */
function pluginFolders(root) {
  const plugins = path.join(root, 'plugins');
  return fs
    .readdirSync(plugins)
    .filter(name => fs.existsSync(path.join(plugins, name, 'PluginConfig.json')))
    .sort();
}

/** The values one plugin folder holds for each identity field; a missing one is undefined. */
function identity(folder) {
  const read = name => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
  const config = read('PluginConfig.json');
  const app = read('app.json');
  const copyFile = path.join(folder, 'src', 'copy.ts');
  const title = fs.existsSync(copyFile) ? COPY_TITLE.exec(fs.readFileSync(copyFile, 'utf8')) : null;
  return {
    code: {
      'PluginConfig.json pluginKey': config.pluginKey,
      'package.json name': read('package.json').name,
      'app.json name': app.name,
    },
    display: {
      'PluginConfig.json name': config.name,
      'app.json displayName': app.displayName,
      'copy title': title ? title[1] : undefined,
    },
  };
}

/**
 * The problems with every plugin's names (#295): its code name (`pluginKey`, `package.json` and
 * `app.json` `name`) is one value, and its display name (`PluginConfig.json` `name`, `app.json`
 * `displayName`, the copy module's `title`) is another. `pending` lists the fields allowed to differ.
 */
function identityProblems(root, pending = PENDING_IDENTITY) {
  const found = [];
  const seen = new Set();
  for (const name of pluginFolders(root)) {
    for (const fields of Object.values(identity(path.join(root, 'plugins', name)))) {
      const [[firstField, expected], ...rest] = Object.entries(fields);
      for (const [field, value] of rest) {
        const key = `${name}: ${field}`;
        if (value === expected) {
          continue;
        }
        seen.add(key);
        if (!pending.has(key)) {
          found.push(`plugins/${name}: ${field} is ${JSON.stringify(value)}; ${firstField} is ${JSON.stringify(expected)}`);
        }
      }
    }
  }
  for (const key of pending) {
    if (!seen.has(key)) {
      found.push(`${key} agrees now; remove it from PENDING_IDENTITY`);
    }
  }
  return found;
}

/** The problems with the pins every plugin shares (#295): one version of each across plugins. */
function pinProblems(root) {
  const found = [];
  const folders = pluginFolders(root);
  for (const dependency of SHARED_PINS) {
    const versions = new Map();
    for (const name of folders) {
      const {dependencies = {}} = JSON.parse(fs.readFileSync(path.join(root, 'plugins', name, 'package.json'), 'utf8'));
      const version = dependencies[dependency] ?? '(none)';
      versions.set(version, [...(versions.get(version) || []), name]);
    }
    if (versions.size > 1) {
      const list = [...versions].map(([version, names]) => `${version} in ${names.join(', ')}`).join('; ');
      found.push(`${dependency} is pinned to more than one version: ${list}`);
    }
  }
  return found;
}

/**
 * The problems with one PluginConfig.json's history, oldest first, as `[{at, versionName,
 * versionCode}]` (#295): `versionCode` never falls, and rises whenever `versionName` changes, so the
 * tablet always installs a new build over an old one.
 */
function codeProblems(history) {
  const found = [];
  for (let i = 1; i < history.length; i += 1) {
    const before = history[i - 1];
    const after = history[i];
    const [was, is] = [Number(before.versionCode), Number(after.versionCode)];
    if (is < was) {
      found.push(`versionCode falls from ${was} to ${is} at ${after.at}`);
    } else if (is === was && before.versionName !== after.versionName) {
      found.push(`versionName moves to "${after.versionName}" at ${after.at}, but versionCode stays ${is}`);
    }
  }
  return found;
}

/** One plugin's PluginConfig.json versions from Git, oldest first, then the working copy. */
function configHistory(root, name) {
  const file = `plugins/${name}/PluginConfig.json`;
  const git = args => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
  let commits = [];
  try {
    commits = git(['log', '--format=%h', '--', file]).split('\n').filter(Boolean).reverse();
  } catch {
    commits = []; // not a Git checkout, such as a fixture: only the working copy is read
  }
  const history = commits.map(commit => ({at: commit, ...JSON.parse(git(['show', `${commit}:${file}`]))}));
  return [...history, {at: 'the working copy', ...JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))}];
}

/** Every identity, pin and versionCode problem under `root`. */
function allIdentityProblems(root) {
  return [
    ...identityProblems(root),
    ...pinProblems(root),
    ...pluginFolders(root).flatMap(name =>
      codeProblems(configHistory(root, name)).map(line => `plugins/${name}/PluginConfig.json: ${line}`),
    ),
  ];
}

/** Prints each problem on its own line of the error stream. */
function report(found) {
  found.forEach(line => console.error(`plugin-version: ${line}`));
}

if (require.main === module && process.argv[2] === '--icons') {
  const found = iconProblems(process.argv[3] || '.');
  report(found);
  process.exit(found.length > 0 ? 1 : 0);
}

if (require.main === module && process.argv[2] === '--identity') {
  const found = allIdentityProblems(process.argv[3] || '.');
  report(found);
  process.exit(found.length > 0 ? 1 : 0);
}

if (require.main === module && process.argv[2] === '--workflows') {
  const found = allWorkflowProblems(process.argv[3] || '.');
  report(found);
  process.exit(found.length > 0 ? 1 : 0);
}

if (require.main === module) {
  const folder = process.argv[2];
  const found = problems(folder);
  if (found.length > 0) {
    report(found);
    process.exit(1);
  }
  console.log(JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8')).version);
}

module.exports = {
  versionName,
  problems,
  workflowProblems,
  allWorkflowProblems,
  iconProblems,
  identityProblems,
  pinProblems,
  codeProblems,
  allIdentityProblems,
};
