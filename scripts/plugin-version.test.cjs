/**
 * Tests of plugin-version.cjs over fixture trees: the version (#155), tag and icon rules, and the identity,
 * pin, versionCode (#295) and reuse (#410) checks; each fails once and passes once. One root suite
 * replaces the plugins' copied __tests__/version.test.ts (#302).
 */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  versionName,
  allVersionProblems,
  workflowProblems,
  allWorkflowProblems,
  iconProblems,
  identityProblems,
  pinProblems,
  codeProblems,
  allIdentityProblems,
  allReuseProblems,
} = require('./plugin-version.cjs');

const roots = [];
test.after(() => roots.forEach(root => fs.rmSync(root, {recursive: true, force: true})));

/** A fixture tree with one plugin folder per entry of `plugins`: {name: {file: object or text}}. */
function tree(plugins) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-'));
  roots.push(root);
  for (const [name, files] of Object.entries(plugins)) {
    for (const [file, content] of Object.entries(files)) {
      const target = path.join(root, 'plugins', name, file);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
    }
  }
  return root;
}

function plugin({key = 'Lookup', title = 'Word Lookup', displayName = title, react = '19.0.0'} = {}) {
  return {
    'PluginConfig.json': {name: 'Word Lookup', pluginKey: 'Lookup', versionName: '0.1.0', versionCode: '1'},
    'package.json': {name: key, dependencies: {react, 'react-native': '0.79.2', 'sn-plugin-lib': '0.2.3'}},
    'app.json': {name: 'Lookup', displayName},
    'src/copy.ts': `export const copy = {\n  title: '${title}',\n};\n`,
  };
}

test('a plugin whose code names and display names agree passes', () => {
  assert.deepEqual(identityProblems(tree({a: plugin()}), new Set()), []);
});

test('a package.json name, displayName or copy title that drifts fails', () => {
  const root = tree({a: plugin({key: 'Lookups', title: 'Word Look-up', displayName: 'Lookup'})});
  assert.deepEqual(identityProblems(root, new Set()), [
    'plugins/a: package.json name is "Lookups"; PluginConfig.json pluginKey is "Lookup"',
    'plugins/a: app.json displayName is "Lookup"; PluginConfig.json name is "Word Lookup"',
    'plugins/a: copy title is "Word Look-up"; PluginConfig.json name is "Word Lookup"',
  ]);
});

test('a pending field may differ, and fails once it agrees, so the list only shrinks', () => {
  const root = tree({a: plugin({displayName: 'Lookup'})});
  assert.deepEqual(identityProblems(root, new Set(['a: app.json displayName'])), []);
  assert.deepEqual(identityProblems(tree({a: plugin()}), new Set(['a: app.json displayName'])), [
    'a: app.json displayName agrees now; remove it from PENDING_IDENTITY',
  ]);
});

test('react, react-native and sn-plugin-lib pins agree across plugins', () => {
  assert.deepEqual(pinProblems(tree({a: plugin(), b: plugin()})), []);
  assert.deepEqual(pinProblems(tree({a: plugin(), b: plugin({react: '19.1.0'})})), [
    'react is pinned to more than one version: 19.0.0 in a; 19.1.0 in b',
  ]);
});

test('versionCode never falls, and rises with every versionName', () => {
  const at = (versionName, versionCode, commit) => ({at: commit, versionName, versionCode});
  assert.deepEqual(codeProblems([at('0.1.0 beta 1', '1', 'a1'), at('0.1.0 beta 2', '2', 'b2'), at('0.1.0 beta 2', '3', 'c3')]), []);
  assert.deepEqual(codeProblems([at('0.1.0 beta 1', '4', 'a1'), at('0.1.0 beta 2', '4', 'b2'), at('0.1.0 beta 3', '3', 'c3')]), [
    'versionName moves to "0.1.0 beta 2" at b2, but versionCode stays 4',
    'versionCode falls from 4 to 3 at c3',
  ]);
});

/** A Git fixture: plugins/old at 0.1.0 beta 2, tagged old-v0.1.0-beta.2, then renamed to plugins/new. */
function renamedHistory() {
  const root = tree({old: {'PluginConfig.json': {pluginID: 'fixture00plugin1', versionName: '0.1.0 beta 2', versionCode: '3'}}});
  // The fixture never signs: a Mac whose global config signs tags would make `git tag` ask for a message.
  const fixture = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false'];
  const git = (...args) => execFileSync('git', ['-C', root, ...fixture, ...args], {stdio: 'ignore'});
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'old');
  git('tag', 'old-v0.1.0-beta.2');
  git('mv', 'plugins/old', 'plugins/new');
  git('commit', '-q', '-m', 'rename');
  return {root, git};
}

test('a renamed plugin may not reuse a version published under its earlier folder (#410)', () => {
  const {root} = renamedHistory();
  assert.deepEqual(allReuseProblems(root), [
    'plugins/new: versionName "0.1.0 beta 2" of pluginID fixture00plugin1 was already published as old-v0.1.0-beta.2 under plugins/old; raise the version',
    'plugins/new: versionCode "3" of pluginID fixture00plugin1 was already published as old-v0.1.0-beta.2 under plugins/old; raise the version',
  ]);
  const config = path.join(root, 'plugins', 'new', 'PluginConfig.json');
  fs.writeFileSync(config, JSON.stringify({pluginID: 'fixture00plugin1', versionName: '0.1.0 beta 3', versionCode: '4'}));
  assert.deepEqual(allReuseProblems(root), []);
});

test('an unpublished version of the earlier folder is found in the history, without tags (#410)', () => {
  const {root, git} = renamedHistory();
  git('tag', '-d', 'old-v0.1.0-beta.2');
  const [first] = allReuseProblems(root);
  assert.match(first, /^plugins\/new: versionName "0\.1\.0 beta 2" .* was already used at [0-9a-f]+ under plugins\/old;/);
});

test('a shallow clone fails, since its history cannot show every earlier version (#410)', () => {
  const {root} = renamedHistory();
  const shallow = fs.mkdtempSync(path.join(os.tmpdir(), 'shallow-'));
  roots.push(shallow);
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${root}`, shallow], {stdio: 'ignore'});
  assert.deepEqual(allReuseProblems(shallow), [
    `${shallow} is a shallow clone; run git fetch --unshallow --tags to read every earlier version`,
  ]);
});

test('a numbered beta reads «0.2.0 beta 3» on the tablet, a release «0.2.0» (#155)', () => {
  assert.equal(versionName('0.2.0-beta.3'), '0.2.0 beta 3');
  assert.equal(versionName('0.2.0'), '0.2.0');
  assert.equal(versionName('0.2.1'), '0.2.1');
});

test('any other version form is refused: no -dev.N, no unnumbered beta (#155)', () => {
  for (const version of ['0.1.0-dev.19', '0.2.0-beta', '0.2', '0.2.0-beta.0']) {
    assert.throws(() => versionName(version));
  }
});

test("every plugin's PluginConfig.json versionName follows its package.json version (#155, #302)", () => {
  const drifted = plugin();
  drifted['package.json'] = {...drifted['package.json'], version: '0.2.0-beta.3'};
  drifted['PluginConfig.json'] = {...drifted['PluginConfig.json'], versionName: '0.2.0 beta 2'};
  const kept = plugin();
  kept['package.json'] = {...kept['package.json'], version: '0.1.0'};
  assert.deepEqual(allVersionProblems(tree({a: drifted, b: kept})), [
    'plugins/a: PluginConfig.json versionName is "0.2.0 beta 2"; package.json 0.2.0-beta.3 gives "0.2.0 beta 3"',
  ]);
});

test('a prerelease tag carries its plugin name (#155)', () => {
  const good = "on:\n  push:\n    tags: ['other-v*-dev.*']\n          tag=\"lookup-v$version\"\n";
  assert.deepEqual(workflowProblems('lookup', good.replace('other-v*-dev.*', 'lookup-v*')), []);
  assert.deepEqual(workflowProblems('lookup', good), ['tag trigger "other-v*-dev.*" does not start with lookup-v']);
  assert.deepEqual(workflowProblems('relay', '          tag="v$version"\n'), [
    'computed tag v$version does not start with relay-v',
  ]);
  assert.equal(workflowProblems('relay', 'on: push\n').length, 1);
});

test('a hyphenated plugin name is checked too, such as ink-tools-helper (#215)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'versions-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.github', 'workflows'), {recursive: true});
  fs.writeFileSync(path.join(root, '.github', 'workflows', 'prerelease-ink-tools-helper.yml'), '          tag="v$version"\n');
  assert.deepEqual(allWorkflowProblems(root), [
    'prerelease-ink-tools-helper.yml: computed tag v$version does not start with ink-tools-helper-v',
  ]);
});

test('an empty or missing iconPath is a problem (#248)', () => {
  const root = tree({
    empty: {'PluginConfig.json': {iconPath: ''}},
    missing: {'PluginConfig.json': {iconPath: 'assets/icon.png'}},
    present: {'PluginConfig.json': {iconPath: 'icon.png'}, 'icon.png': 'png'},
  });
  assert.deepEqual(iconProblems(root), [
    'plugins/empty/PluginConfig.json: iconPath is empty',
    'plugins/missing/PluginConfig.json: iconPath assets/icon.png is not a file',
  ]);
});

test('the repository passes', () => {
  assert.deepEqual(allIdentityProblems(path.join(__dirname, '..')), []);
});
