/**
 * The version rule (#155, root AGENTS.md › Product versioning): the tablet's versionName is derived
 * from the package.json version, so the two never drift.
 */
import {join} from 'path';

const {versionName, problems} = require('../../../scripts/plugin-version.cjs');

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
