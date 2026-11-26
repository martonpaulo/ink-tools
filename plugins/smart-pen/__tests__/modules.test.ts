/** The module table (#305): an off module is never started, and a switch starts or stops only its module. */
import {
  applyModules,
  MODULE_IDS,
  MODULES,
  type ModuleHost,
} from '../src/modules';

const fakeHost = () => {
  const calls: string[] = [];
  const host: ModuleHost = {
    startText: async () => {
      calls.push('start text');
    },
    stopText: async () => {
      calls.push('stop text');
    },
    startShapes: () => calls.push('start shapes'),
    stopShapes: () => calls.push('stop shapes'),
  };
  return {host, calls};
};

test('every module id has one row', () => {
  expect(MODULES.map(row => row.id)).toEqual([...MODULE_IDS]);
});

test('with both modules off nothing starts', async () => {
  const {host, calls} = fakeHost();
  await applyModules(host, null, {text: false, shapes: false});
  expect(calls).toEqual([]);
});

test('at start-up each module on starts once', async () => {
  const {host, calls} = fakeHost();
  await applyModules(host, null, {text: true, shapes: true});
  expect(calls).toEqual(['start text', 'start shapes']);
});

test('a switch starts or stops its own module only', async () => {
  const {host, calls} = fakeHost();
  await applyModules(
    host,
    {text: true, shapes: true},
    {text: true, shapes: false},
  );
  await applyModules(
    host,
    {text: true, shapes: false},
    {text: false, shapes: false},
  );
  await applyModules(
    host,
    {text: false, shapes: false},
    {text: false, shapes: true},
  );
  expect(calls).toEqual(['stop shapes', 'stop text', 'start shapes']);
});
