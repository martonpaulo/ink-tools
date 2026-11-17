/** Bridge's device reader (#43): each call goes to the Java module with the descriptor's URI and columns. */
import {NativeModules} from 'react-native';
import {deviceReader, PROVIDERS_MODULE} from '../src/deviceReader';

afterEach(() => {
  delete NativeModules[PROVIDERS_MODULE];
});

test('the test write is the module update, so the probe never inserts a row (#43)', async () => {
  const calls: string[] = [];
  NativeModules[PROVIDERS_MODULE] = {
    columnsOf: async (uri: string) => {
      calls.push(`columns ${uri}`);
      return ['id', 'title'];
    },
    update: async (uri: string, where: Record<string, unknown>, row: Record<string, unknown>) => {
      calls.push(`update ${uri} ${JSON.stringify(where)} ${JSON.stringify(row)}`);
      return 0;
    },
    insert: async () => {
      throw new Error('the probe must not insert');
    },
  };
  const reader = deviceReader();
  await expect(reader.columnsOf('content://example.test/rows')).resolves.toEqual(['id', 'title']);
  await expect(reader.testWrite('content://example.test/rows', {id: -1}, {title: 'x'})).resolves.toBe(0);
  expect(calls).toEqual(['columns content://example.test/rows', 'update content://example.test/rows {"id":-1} {"title":"x"}']);
});

test('a missing module rejects with its name, never an empty column list', async () => {
  const reader = deviceReader();
  await expect(reader.columnsOf('content://example.test/rows')).rejects.toThrow(
    'the BridgeProviders module is not loaded',
  );
  await expect(reader.testWrite('content://example.test/rows', {id: -1}, {})).rejects.toThrow(
    'the BridgeProviders module is not loaded',
  );
});

test('a refused write reaches the probe as a rejection', async () => {
  NativeModules[PROVIDERS_MODULE] = {
    columnsOf: async () => [],
    update: async () => {
      throw new Error('Permission Denial');
    },
  };
  await expect(deviceReader().testWrite('content://example.test/rows', {id: -1}, {title: 'x'})).rejects.toThrow(
    'Permission Denial',
  );
});

test('the Java module has no insert-based test write left (#43)', () => {
  const java = require('fs').readFileSync(
    require('path').join(__dirname, '../native/com/bridge/providers/BridgeProvidersModule.java'),
    'utf8',
  );
  expect(java).not.toMatch(/dryInsert|MARKER/);
});
