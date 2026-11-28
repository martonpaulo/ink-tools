/** Each game's view opens on its last size and difficulty, also after a restart (#569). */
import {NativeModules} from 'react-native';
import {pressables} from '@ink-tools/ui-kit/problemTest';
import {BINAIRO} from '../src/games/binairo';
import {FUTOSHIKI} from '../src/games/futoshiki';
import {playCopy} from '../src/play/copy';
import {CHOICES_FILE, deviceKept, parseKept} from '../src/play/kept';
import {PAGE_FILE_MODULE} from '../src/play/pages';
import {recalled} from '../src/play/puzzle';
import {fakeKept, fakePages, mount, press} from '../testing/gameView';

/** The option's choice the view shows as picked. */
const picked = (tree: Awaited<ReturnType<typeof mount>>, option: string, label: string) =>
  pressables(tree.root, `${option}: ${label}`)[0]?.props.accessibilityState?.checked;

/** The page file module's text methods over one in-memory file, as the device keeps it. */
function deviceFile(start: string | null = null) {
  const disk: {text: string | null} = {text: start};
  const modules = {
    [PAGE_FILE_MODULE]: {
      readText: async (path: string) => (path === CHOICES_FILE ? disk.text : null),
      writeText: async (path: string, text: string) => {
        expect(path).toBe(CHOICES_FILE);
        disk.text = text;
        return true;
      },
    },
  };
  return {disk, modules};
}

describe('the last choices of a game (#569)', () => {
  test('after an Add Page at 12 x 12 Hard, the view opens on 12 x 12 Hard again', async () => {
    const kept = fakeKept();
    const first = await mount(BINAIRO, fakePages().pages, () => {}, kept);
    await press(first, `${playCopy.size}: ${playCopy.sizeLabel(12)}`);
    await press(first, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    await press(first, playCopy['new.add']);
    expect(kept.file.binairo).toEqual({size: '12', band: 'hard'});

    const again = await mount(BINAIRO, fakePages().pages, () => {}, kept);
    expect(picked(again, playCopy.size, playCopy.sizeLabel(12))).toBe(true);
    expect(picked(again, playCopy.difficulty, playCopy.bands.hard)).toBe(true);
  });

  test('a restart reads them from the file the device kept', async () => {
    const {disk, modules} = deviceFile();
    const before = await mount(BINAIRO, fakePages().pages, () => {}, deviceKept(modules));
    await press(before, `${playCopy.size}: ${playCopy.sizeLabel(12)}`);
    await press(before, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    await press(before, playCopy['new.add']);
    expect(JSON.parse(disk.text!)).toEqual({binairo: {size: '12', band: 'hard'}});

    // A new runtime: a new store over the same file.
    const after = await mount(BINAIRO, fakePages().pages, () => {}, deviceKept(modules));
    expect(picked(after, playCopy.size, playCopy.sizeLabel(12))).toBe(true);
    expect(picked(after, playCopy.difficulty, playCopy.bands.hard)).toBe(true);
  });

  test('a game never used opens on its defaults, and keeping one game keeps the others', async () => {
    const {disk, modules} = deviceFile(JSON.stringify({binairo: {size: '12', band: 'hard'}}));
    const tree = await mount(FUTOSHIKI, fakePages().pages, () => {}, deviceKept(modules));
    expect(picked(tree, playCopy.difficulty, playCopy.bands.easy)).toBe(true);
    await press(tree, playCopy['new.add']);
    const file = JSON.parse(disk.text!);
    expect(file.binairo).toEqual({size: '12', band: 'hard'});
    expect(Object.keys(file)).toEqual(['binairo', 'futoshiki']);
  });

  test('a file that cannot be read shows the defaults and is never written over', async () => {
    const {disk, modules} = deviceFile('not json');
    const tree = await mount(BINAIRO, fakePages().pages, () => {}, deviceKept(modules));
    expect(picked(tree, playCopy.size, playCopy.sizeLabel(6))).toBe(true);
    await press(tree, playCopy['new.add']);
    expect(disk.text).toBe('not json');
  });

  test('without the native module the view still opens on its defaults and adds the page', async () => {
    expect(NativeModules[PAGE_FILE_MODULE]).toBeUndefined();
    const fake = fakePages();
    const tree = await mount(BINAIRO, fake.pages, () => {}, deviceKept());
    expect(picked(tree, playCopy.size, playCopy.sizeLabel(6))).toBe(true);
    await press(tree, playCopy['new.add']);
    expect(fake.inserted).toHaveLength(1);
  });

  test('a kept value the game no longer offers falls back to its initial one', () => {
    expect(recalled(BINAIRO.options, {size: '14', band: 'hard'})).toEqual({size: '6', band: 'hard'});
    expect(recalled(BINAIRO.options, null)).toEqual({size: '6', band: 'easy'});
    expect(parseKept('{"binairo": {"size": 12}}')).toEqual({ok: true, value: {}});
  });
});
