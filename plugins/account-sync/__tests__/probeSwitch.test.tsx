/**
 * The adapt-on/off switch end to end (#101): a descriptor that no longer matches the device turns
 * that module off, with the reason in Settings, and leaves the other modules on.
 */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {
  BUNDLED_DESCRIPTOR,
  contentUri,
  DeviceReader,
  probeAll,
} from '@ink-tools/sn-adapter';
import {
  defaultSettings,
  moduleStatus,
  setModule,
} from '@ink-tools/sync-core';
import {probeProblems} from '../src/probe';
import {ModuleRow, SettingsShell} from '../src/SettingsShell';

const D = BUNDLED_DESCRIPTOR;

/**
 * Every table answers with its descriptor's columns, except the ones `change` rewrites, and takes a
 * test write, except the ones in `refuse` (#67).
 */
function device(
  change: Record<string, string[] | Error> = {},
  refuse: string[] = [],
): DeviceReader {
  return {
    testWrite: async uri => {
      if (refuse.includes(uri)) {
        throw new Error('Permission Denial');
      }
      return 0;
    },
    columnsOf: async uri => {
      const changed = change[uri];
      if (changed instanceof Error) {
        throw changed;
      }
      if (changed) {
        return changed;
      }
      for (const module of [D.calendar, D.todo, D.digest]) {
        for (const [name, table] of Object.entries(module.tables)) {
          if (contentUri(module, name) === uri) {
            return table.columns;
          }
        }
      }
      throw new Error(`unknown ${uri}`);
    },
  };
}

const tasksUri = contentUri(D.todo, 'tasks');
const settings = setModule(
  setModule(defaultSettings(), 'todo', true),
  'calendar',
  true,
);

async function rows(reader: DeviceReader): Promise<ModuleRow[]> {
  const problems = probeProblems(await probeAll(D, reader));
  return (['todo', 'calendar'] as const).map(id => ({
    id,
    name: id,
    status: moduleStatus(id, settings, problems, {}),
  }));
}

test('a To-Do table without dueTime turns To-Do off with its reason, and Calendar stays on', async () => {
  const columns = D.todo.tables.tasks.columns.filter(c => c !== 'dueTime');
  const modules = await rows(device({[tasksUri]: columns}));
  expect(modules.map(m => m.status.state)).toEqual(['blocked', 'waiting']);
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SettingsShell state={{kind: 'ready', modules}} onClose={() => {}} />);
  });
  const texts = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts).toContain(
    `On, but not running: ${tasksUri} lacks columns: dueTime`,
  );
});

test('a provider that does not answer turns its module off, never throws past the probe', async () => {
  const modules = await rows(device({[tasksUri]: new Error('no provider')}));
  expect(modules[0].status).toEqual({
    state: 'blocked',
    reasons: [`${tasksUri} did not answer: no provider`],
  });
  expect(modules[1].status.state).toBe('waiting');
});

test('a To-Do table that reads but refuses writes turns To-Do off (#67)', async () => {
  const modules = await rows(device({}, [tasksUri]));
  expect(modules[0].status).toEqual({
    state: 'blocked',
    reasons: [`${tasksUri} refused a test write: Permission Denial`],
  });
  expect(modules[1].status.state).toBe('waiting');
});

test('a device that matches the descriptor leaves every module on', async () => {
  const modules = await rows(device());
  expect(modules.map(m => m.status.state)).toEqual(['waiting', 'waiting']);
});
