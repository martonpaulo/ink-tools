/**
 * The version rule (#155, root AGENTS.md › Product versioning): the tablet's versionName is derived
 * from the package.json version, so the two never drift.
 */
import {join} from 'path';

const {
  versionName,
  problems,
  workflowProblems,
  allWorkflowProblems,
  iconProblems,
} = require('../../../scripts/plugin-version.cjs');

test('a numbered beta reads «0.2.0 beta 3» on the tablet, a release «0.2.0»', () => {
  expect(versionName('0.2.0-beta.3')).toBe('0.2.0 beta 3');
  expect(versionName('0.2.0')).toBe('0.2.0');
  expect(versionName('0.2.1')).toBe('0.2.1');
});

test('any other form is refused: no -dev.N, no unnumbered beta', () => {
  for (const version of ['0.1.0-dev.19', '0.2.0-beta', '0.2', '0.2.0-beta.0']) {
    expect(() => versionName(version)).toThrow();
  }
});

test("Lookup's PluginConfig.json matches its package.json", () => {
  expect(problems(join(__dirname, '..'))).toEqual([]);
});

test('a prerelease tag carries its plugin name (#155)', () => {
  const good =
    'on:\n  push:\n    tags: [\'other-v*-dev.*\']\n          tag="lookup-v$version"\n';
  expect(
    workflowProblems('lookup', good.replace('other-v*-dev.*', 'lookup-v*')),
  ).toEqual([]);
  expect(workflowProblems('lookup', good)).toEqual([
    'tag trigger "other-v*-dev.*" does not start with lookup-v',
  ]);
  expect(workflowProblems('relay', '          tag="v$version"\n')).toEqual([
    'computed tag v$version does not start with relay-v',
  ]);
  expect(workflowProblems('relay', 'on: push\n')).toHaveLength(1);
  expect(allWorkflowProblems(join(__dirname, '..', '..', '..'))).toEqual([]);
});

test('a hyphenated name is checked too, such as inktools-bridge (#215)', () => {
  const {mkdtempSync, mkdirSync, writeFileSync} = require('fs');
  const {tmpdir} = require('os');
  const root = mkdtempSync(join(tmpdir(), 'versions-'));
  mkdirSync(join(root, '.github', 'workflows'), {recursive: true});
  writeFileSync(join(root, '.github', 'workflows', 'prerelease-inktools-bridge.yml'), '          tag="v$version"\n');
  expect(allWorkflowProblems(root)).toEqual([
    'prerelease-inktools-bridge.yml: computed tag v$version does not start with inktools-bridge-v',
  ]);
});

test('every plugin names an icon that is in its folder (#248)', () => {
  expect(iconProblems(join(__dirname, '..', '..', '..'))).toEqual([]);
});

test('an empty or missing iconPath is a problem (#248)', () => {
  const fs = require('fs');
  const os = require('os');
  const root = fs.mkdtempSync(join(os.tmpdir(), 'icons-'));
  const plugin = (name: string, iconPath: string) => {
    fs.mkdirSync(join(root, 'plugins', name), {recursive: true});
    fs.writeFileSync(join(root, 'plugins', name, 'PluginConfig.json'), JSON.stringify({iconPath}));
  };
  plugin('empty', '');
  plugin('missing', 'assets/icon.png');
  plugin('present', 'icon.png');
  fs.writeFileSync(join(root, 'plugins', 'present', 'icon.png'), 'png');
  try {
    expect(iconProblems(root)).toEqual([
      'plugins/empty/PluginConfig.json: iconPath is empty',
      'plugins/missing/PluginConfig.json: iconPath assets/icon.png is not a file',
    ]);
  } finally {
    fs.rmSync(root, {recursive: true});
  }
});
