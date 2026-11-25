/**
 * Tests of plugin-version.cjs's identity, pin and versionCode checks (#295), over fixture trees:
 * each fails once and passes once. The version and tag rules are tested in each plugin's
 * __tests__/version.test.ts.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {identityProblems, pinProblems, codeProblems, allIdentityProblems} = require('./plugin-version.cjs');

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

test('the repository passes', () => {
  assert.deepEqual(allIdentityProblems(path.join(__dirname, '..')), []);
});
