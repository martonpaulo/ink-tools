import fs from 'fs';
import path from 'path';
import config from '../PluginConfig.json';

test('plugin config declares a generated id', () => {
  expect(config.pluginID).toMatch(/^[0-9a-z]{16}$/);
});

test('every declared permission names its user in AGENTS.md, and only those are declared (#83)', () => {
  const guidance = fs.readFileSync(
    path.join(__dirname, '../AGENTS.md'),
    'utf8',
  );
  const section = guidance.slice(
    guidance.indexOf('- **Permissions**'),
    guidance.indexOf('- **Settings storage**'),
  );
  const justified = [
    ...section.matchAll(/^ {2}- `(plugin\.permission\.[A-Z:_]+)`: \S/gm),
  ].map(m => m[1]);
  expect(justified.length).toBeGreaterThan(0);
  expect([...config['uses-permissions']].sort()).toEqual(justified.sort());
});
