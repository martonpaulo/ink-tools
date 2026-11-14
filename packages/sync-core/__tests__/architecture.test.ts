// The package has no @types/node; these two declarations are all this test needs from it.
declare const __dirname: string;
declare function require(name: string): any;
const fs = require('node:fs');
const path = require('node:path');

/**
 * Layering guards (#85): a provider file imports no other provider's file, only the seams
 * (`calendar`, `tasks`, `http`); and sync-core never imports the device adapter.
 */
const SRC = path.join(__dirname, '..', 'src');
const PROVIDERS = ['google', 'todoist', 'ics', 'push'];
const SEAMS = ['calendar', 'tasks', 'http'];

const importsOf = (file: string): string[] =>
  [...fs.readFileSync(path.join(SRC, `${file}.ts`), 'utf8').matchAll(/from '([^']+)'/g)].map(m => m[1]);

describe('layering', () => {
  test.each(PROVIDERS)('%s imports only the seams', provider => {
    for (const target of importsOf(provider)) {
      expect(SEAMS.map(s => `./${s}`)).toContain(target);
    }
  });

  test('no source file of sync-core imports the device adapter', () => {
    for (const file of (fs.readdirSync(SRC) as string[]).filter(f => f.endsWith('.ts'))) {
      for (const target of importsOf(file.replace(/\.ts$/, ''))) expect(target).not.toMatch(/sn-adapter/);
    }
  });
});
