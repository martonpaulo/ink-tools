/** Bridge's Settings view: the saved switches survive a restart (#40) and each module says its status (#88). */
import React from 'react';
import {NativeModules, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import {fail, ok, THROWN_CODE} from '@supernote-tools/sn-adapter/official';
import {BUNDLED_DESCRIPTOR as D, contentUri, DeviceReader} from '@supernote-tools/sn-adapter';
import App, {startupProbe} from '../App';
import {copy} from '../src/copy';

const DIR = '/data/plugins/bridge';
const folder = async () => ok(DIR);
let files: Record<string, string>;
let refuseWrites: boolean;

beforeEach(() => {
  files = {};
  refuseWrites = false;
  NativeModules.BridgeFiles = {
    readText: async (p: string) => files[p] ?? null,
    writeText: async (p: string, t: string) => {
      if (refuseWrites) {
        throw new Error('disk full');
      }
      files[p] = t;
      return null;
    },
  };
});

async function mount(
  props: {
    folder?: () => Promise<
      ReturnType<typeof ok<string>> | ReturnType<typeof fail>
    >;
  } = {folder},
) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App folder={props.folder as never} />);
  });
  return tree;
}
const toggle = (tree: ReactTestRenderer, label: string) =>
  tree.root.findByProps({
    accessibilityRole: 'button',
    accessibilityLabel: label,
  });
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(n => n.props.children);

test('a change is saved and is still there after a restart (#40)', async () => {
  const first = await mount();
  await act(async () => toggle(first, 'Calendar').props.onPress());
  expect(JSON.parse(files[`${DIR}/settings.json`]).modules.calendar).toBe(true);
  act(() => first.unmount());
  const second = await mount();
  expect(toggle(second, 'Calendar').props.accessibilityState.selected).toBe(
    true,
  );
  expect(screenBreaks(second.root)).toEqual([]);
});

test('each module says whether it is off or why it does not run (#88)', async () => {
  const tree = await mount();
  expect(texts(tree)).toEqual(
    expect.arrayContaining([copy['module.calendar'], copy['status.off']]),
  );
  await act(async () => toggle(tree, 'Calendar').props.onPress());
  // No BridgeProviders module in this test, so the start-up probe blocks Calendar with that reason (#43).
  expect(
    texts(tree).some(
      t =>
        typeof t === 'string' &&
        t.startsWith('On, but not running: ') &&
        t.includes('the BridgeProviders module is not loaded'),
    ),
  ).toBe(true);
});

test('a device that matches the descriptor clears the probe, so Calendar waits for its sync (#43)', async () => {
  const marked: string[] = [];
  const reader: DeviceReader = {
    columnsOf: async uri => {
      for (const module of [D.calendar, D.todo, D.digest]) {
        for (const [name, table] of Object.entries(module.tables)) {
          if (contentUri(module, name) === uri) {
            return table.columns;
          }
        }
      }
      throw new Error(`unknown ${uri}`);
    },
    dryInsert: async (uri, markerColumn) => {
      marked.push(`${uri} ${markerColumn}`);
    },
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App folder={folder as never} reader={reader} />);
  });
  await act(async () => toggle(tree, 'Calendar').props.onPress());
  expect(texts(tree)).toContain(copy['status.waiting']);
  expect(marked).toContain(`${contentUri(D.calendar, 'events')} title`);
});

test('a probe that throws blocks every module with its reason, never a silent pass (#43)', async () => {
  const broken = {
    columnsOf: () => {
      throw new Error('host crashed');
    },
  } as unknown as DeviceReader;
  const problems = await startupProbe(broken);
  expect(Object.keys(problems).sort()).toEqual(['calendar', 'digest', 'todo']);
  expect(problems.calendar?.[0]).toMatch(/host crashed/);
});

test('a failed save is said on the screen; a failed load offers a retry', async () => {
  const tree = await mount();
  refuseWrites = true;
  await act(async () => toggle(tree, 'To-Do').props.onPress());
  expect(
    tree.root.findAllByProps({accessibilityRole: 'alert'})[0].props.children,
  ).toMatch(/not saved.*disk full/);
  const broken = await mount({
    folder: async () => fail(THROWN_CODE, 'getPluginDirPath returned nothing'),
  });
  expect(texts(broken)).toContain(
    'The settings did not load: getPluginDirPath returned nothing',
  );
});
