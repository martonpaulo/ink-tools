/**
 * The lab's file paths across machines (#104): a run made in the lab workflow's base worktree
 * recorded that folder's path into the shared cache, so `metrics.mjs` measured 5 of its 630
 * page-1 tiles. The lab runs in Node on its own, outside Jest, so it is asked through a child
 * process, as in labAffected.test.ts.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'lab', 'out', '.cache');
const NAME = `test-local-${process.pid}.png`;

const localFile = (file: string) =>
  execFileSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `import {localFile} from './lab/lib.mjs'; console.log(localFile(${JSON.stringify(file)}));`,
    ],
    {cwd: ROOT},
  )
    .toString()
    .trim();

beforeAll(() => {
  fs.mkdirSync(path.join(CACHE, 'thumbs'), {recursive: true});
  fs.writeFileSync(path.join(CACHE, 'thumbs', NAME), '');
});

afterAll(() => fs.rmSync(path.join(CACHE, 'thumbs', NAME), {force: true}));

test('a file recorded in another folder is read from this cache', () => {
  expect(
    localFile(`/home/runner/work/_temp/base/plugins/ink2pic/lab/out/.cache/thumbs/${NAME}`),
  ).toBe(path.join(CACHE, 'thumbs', NAME));
});

test('a file that exists, or one outside a cache, stays as recorded', () => {
  const here = path.join(CACHE, 'thumbs', NAME);
  expect(localFile(here)).toBe(here);
  expect(localFile('/elsewhere/x.png')).toBe('/elsewhere/x.png');
});
