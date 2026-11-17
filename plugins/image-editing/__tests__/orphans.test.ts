/** The once-per-session sweep of the PNGs earlier builds left (#182). */
import {fail, MODULE_CODE, ok} from '@ink-tools/sn-adapter/official';
import {historyPath} from '../src/edit';
import {LEGACY_DIR, orphansIn, resetSweep, stampOf, sweepOrphans, SweepDeps} from '../src/orphans';

const WORK = '/data/user/0/com.ratta.supernote.pluginhost/files/plugins/retouch/work';
/** When the test session began, in ms. */
const SINCE = 1794870000000;

/** The eight files lane 35 found in MyStyle/Retouch (#182), with the two files that must stay. */
const LEGACY = [
  '1794868233664-enhance.png',
  '1794868233664-original.png',
  '1794868417815-lighter.png',
  '1794868486338-darker.png',
  'preview-1794868233664.png',
  'preview-1794868417815.png',
  'preview-1794868486338.png',
  '1794869742697-original.png',
  '1794869742697-line_art.png',
  'style-photo.png',
  'history.json',
  'styles.json',
  'my-drawing.png',
];

function world(history: string | null) {
  const folders = new Map<string, Set<string>>([
    [LEGACY_DIR, new Set(LEGACY)],
    [
      WORK,
      new Set([
        'history.json',
        `${SINCE - 50}-original.png`,
        `${SINCE - 50}-enhance.png`,
        `${SINCE - 90}-darker.png`,
        `preview-${SINCE - 90}.png`,
        `style-source-${SINCE - 90}.png`,
        `style-${SINCE - 90}-dither.png`,
        `${SINCE + 10}-lighter.png`,
        `preview-${SINCE + 10}.png`,
      ]),
    ],
  ]);
  const lines: string[] = [];
  const split = (path: string) => {
    const at = path.lastIndexOf('/');
    return [path.slice(0, at), path.slice(at + 1)] as const;
  };
  const deps: SweepDeps = {
    native: {
      listDir: jest.fn(async path => ok(folders.has(path) ? [...folders.get(path)!] : null)),
      readText: jest.fn(async path => ok(path === historyPath(WORK) ? history : null)),
      deleteFile: jest.fn(async path => {
        const [folder, name] = split(path);
        folders.get(folder)?.delete(name);
        return ok(true);
      }),
    },
    workDir: async () => ok(WORK),
    log: line => lines.push(line),
  };
  return {folders, lines, deps};
}

const HISTORY = JSON.stringify({
  version: 1,
  entries: [
    {
      note: '/Note/a.note',
      page: 0,
      rect: {left: 0, top: 0, right: 10, bottom: 10},
      states: [
        {path: `${WORK}/${SINCE - 50}-original.png`, width: 10, height: 10},
        {path: `${WORK}/${SINCE - 50}-enhance.png`, width: 10, height: 10},
      ],
      used: SINCE - 50,
    },
  ],
});

beforeEach(resetSweep);

test('only Retouch-named PNGs carry a stamp', () => {
  expect(stampOf('preview-12.png')).toBe(12);
  expect(stampOf('12-line_art.png')).toBe(12);
  expect(stampOf('style-source-12.png')).toBe(12);
  expect(stampOf('style-12-dither.png')).toBe(12);
  expect(stampOf('style-photo.png')).toBe(0);
  for (const other of ['history.json', 'styles.json', 'my-drawing.png', 'preview-12.jpg', '12-a.png.bak']) {
    expect(stampOf(other)).toBeNull();
  }
});

test('orphansIn keeps named files, newer files and every other name', () => {
  expect(
    orphansIn(['1-enhance.png', '2-original.png', '9-darker.png', 'notes.txt'], new Set(['2-original.png']), 5),
  ).toEqual(['1-enhance.png']);
});

test('the sweep empties MyStyle/Retouch of Retouch PNGs and the working folder of unnamed older ones', async () => {
  const {folders, lines, deps} = world(HISTORY);
  await sweepOrphans(deps, SINCE);
  expect([...folders.get(LEGACY_DIR)!].sort()).toEqual(['history.json', 'my-drawing.png', 'styles.json']);
  expect([...folders.get(WORK)!].sort()).toEqual(
    [
      'history.json',
      `${SINCE - 50}-enhance.png`,
      `${SINCE - 50}-original.png`,
      `${SINCE + 10}-lighter.png`,
      `preview-${SINCE + 10}.png`,
    ].sort(),
  );
  expect(lines[0]).toMatch(/MyStyle\/Retouch: removed 10 \[/);
  expect(lines[1]).toMatch(/work: removed 4 \[/);
});

test('the sweep runs once per session', async () => {
  const {deps} = world(HISTORY);
  await sweepOrphans(deps, SINCE);
  await sweepOrphans(deps, SINCE);
  expect(deps.native.listDir).toHaveBeenCalledTimes(2);
});

test('an unreadable history keeps every file of the working folder', async () => {
  const {folders, lines, deps} = world('not json');
  const before = [...folders.get(WORK)!];
  await sweepOrphans(deps, SINCE);
  expect([...folders.get(WORK)!]).toEqual(before);
  expect(lines.join('\n')).toMatch(/unreadable; working folder kept/);
});

test('a missing legacy folder or a failed listing is logged and the press goes on', async () => {
  const {lines, deps} = world(HISTORY);
  deps.native.listDir = jest.fn(async () => fail(MODULE_CODE, 'IO: denied', 'IO'));
  await expect(sweepOrphans(deps, SINCE)).resolves.toBeUndefined();
  expect(lines.join('\n')).toMatch(/sweep: list .*MyStyle\/Retouch/);
});
