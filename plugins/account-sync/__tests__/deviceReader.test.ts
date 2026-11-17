/** Bridge's device reader (#43): each call goes to the Java module with the descriptor's URI and columns. */
import {NativeModules} from 'react-native';
import {deviceReader, PROVIDERS_MODULE} from '../src/deviceReader';

afterEach(() => {
  delete NativeModules[PROVIDERS_MODULE];
});

test('the test write is the module update with its selection, never an insert (#43)', async () => {
  const calls: string[] = [];
  const insert = jest.fn();
  NativeModules[PROVIDERS_MODULE] = {
    columnsOf: async (uri: string) => {
      calls.push(`columns ${uri}`);
      return ['id', 'title'];
    },
    update: async (uri: string, where: Record<string, unknown>, row: Record<string, unknown>) => {
      calls.push(`update ${uri} ${JSON.stringify(where)} ${JSON.stringify(row)}`);
      return 0;
    },
    insert,
    dryInsert: insert,
  };
  const reader = deviceReader();
  await expect(reader.columnsOf('content://example.test/rows')).resolves.toEqual(['id', 'title']);
  await expect(reader.testWrite('content://example.test/rows', {id: -1}, {status: 'cancelled'})).resolves.toBe(0);
  expect(calls).toEqual([
    'columns content://example.test/rows',
    'update content://example.test/rows {"id":-1} {"status":"cancelled"}',
  ]);
  expect(insert).not.toHaveBeenCalled();
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

test('a refused update (a SecurityException) reaches the probe as a rejection', async () => {
  NativeModules[PROVIDERS_MODULE] = {
    columnsOf: async () => [],
    update: async () => {
      throw Object.assign(new Error('java.lang.SecurityException: Permission Denial'), {code: 'update_refused'});
    },
  };
  await expect(deviceReader().testWrite('content://example.test/rows', {id: -1}, {})).rejects.toThrow(
    'Permission Denial',
  );
});

test('the Java module has no dry insert left, so no build can insert a test row (#43)', () => {
  const java = require('fs').readFileSync(
    require('path').join(__dirname, '../native/com/bridge/providers/BridgeProvidersModule.java'),
    'utf8',
  );
  expect(java).not.toMatch(/dryInsert|DryInsertRevert|MARKER/);
});
