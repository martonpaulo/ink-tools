/** Bridge's device reader (#43): each call goes to the Java module with the descriptor's URI and marker column. */
import {NativeModules} from 'react-native';
import {deviceReader, PROVIDERS_MODULE} from '../src/deviceReader';

afterEach(() => {
  delete NativeModules[PROVIDERS_MODULE];
});

test('the reader passes the URI and the marker column to BridgeProviders', async () => {
  const calls: string[] = [];
  NativeModules[PROVIDERS_MODULE] = {
    columnsOf: async (uri: string) => {
      calls.push(`columns ${uri}`);
      return ['id', 'title'];
    },
    dryInsert: async (uri: string, column: string) => {
      calls.push(`insert ${uri} ${column}`);
      return null;
    },
  };
  const reader = deviceReader();
  await expect(reader.columnsOf('content://example.test/rows')).resolves.toEqual(['id', 'title']);
  await expect(reader.dryInsert('content://example.test/rows', 'title')).resolves.toBeUndefined();
  expect(calls).toEqual(['columns content://example.test/rows', 'insert content://example.test/rows title']);
});

test('a missing module rejects with its name, never an empty column list', async () => {
  const reader = deviceReader();
  await expect(reader.columnsOf('content://example.test/rows')).rejects.toThrow(
    'the BridgeProviders module is not loaded',
  );
  await expect(reader.dryInsert('content://example.test/rows', 'title')).rejects.toThrow(
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
  await expect(deviceReader().dryInsert('content://example.test/rows', 'title')).rejects.toThrow('Permission Denial');
});
