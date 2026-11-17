/** Bridge's device reader (#43): each call goes to the Java module with the descriptor's URI and marker column. */
import {NativeModules} from 'react-native';
import {deviceReader, PROVIDERS_MODULE} from '../src/deviceReader';

afterEach(() => {
  delete NativeModules[PROVIDERS_MODULE];
});

test('the reader passes the URI, the marker column and the row id column to BridgeProviders (#43)', async () => {
  const calls: string[] = [];
  NativeModules[PROVIDERS_MODULE] = {
    columnsOf: async (uri: string) => {
      calls.push(`columns ${uri}`);
      return ['id', 'title'];
    },
    dryInsert: async (uri: string, column: string, idColumn: string, values: Record<string, unknown>) => {
      calls.push(`insert ${uri} ${column} ${idColumn} ${JSON.stringify(values)}`);
      return null;
    },
  };
  const reader = deviceReader();
  await expect(reader.columnsOf('content://example.test/rows')).resolves.toEqual(['id', 'title']);
  await expect(reader.dryInsert('content://example.test/rows', 'title', {tag: 'task'})).resolves.toBeUndefined();
  expect(calls).toEqual(['columns content://example.test/rows', 'insert content://example.test/rows title id {"tag":"task"}']);
});

test('a missing module rejects with its name, never an empty column list', async () => {
  const reader = deviceReader();
  await expect(reader.columnsOf('content://example.test/rows')).rejects.toThrow(
    'the BridgeProviders module is not loaded',
  );
  await expect(reader.dryInsert('content://example.test/rows', 'title', {})).rejects.toThrow(
    'the BridgeProviders module is not loaded',
  );
});

test('a refused write reaches the probe as a rejection', async () => {
  NativeModules[PROVIDERS_MODULE] = {
    columnsOf: async () => [],
    dryInsert: async () => {
      throw new Error('Permission Denial');
    },
  };
  await expect(deviceReader().dryInsert('content://example.test/rows', 'title', {})).rejects.toThrow('Permission Denial');
});

test('a refused insert says no row was written, never that one may remain (#43)', async () => {
  NativeModules[PROVIDERS_MODULE] = {
    columnsOf: async () => [],
    dryInsert: async () => {
      throw Object.assign(new Error('NOT NULL constraint failed: data_info.tag'), {code: 'insert_refused'});
    },
  };
  const refused = deviceReader().dryInsert('content://example.test/rows', 'title', {});
  await expect(refused).rejects.toThrow('no test row was written: NOT NULL constraint failed: data_info.tag');
  await expect(refused).rejects.not.toThrow(/may remain/);
});

test('a written row the delete missed keeps its «may remain» message', async () => {
  NativeModules[PROVIDERS_MODULE] = {
    columnsOf: async () => [],
    dryInsert: async () => {
      throw Object.assign(new Error("a test row may remain where title is 'Account Sync dry insert'"), {
        code: 'revert_failed',
      });
    },
  };
  await expect(deviceReader().dryInsert('content://example.test/rows', 'title', {})).rejects.toThrow(/may remain/);
});

test('the Java module writes the marker the probe fills as the test event, so the cleanup finds it (#43)', () => {
  const java = require('fs').readFileSync(
    require('path').join(__dirname, '../native/com/bridge/providers/BridgeProvidersModule.java'),
    'utf8',
  );
  const {DRY_INSERT_MARKER} = require('@ink-tools/sn-adapter');
  expect(java).toContain(`static final String MARKER = "${DRY_INSERT_MARKER}";`);
});
