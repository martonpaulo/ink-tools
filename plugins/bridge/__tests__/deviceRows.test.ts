/** The tablet's ContentRows over BridgeProviders' write calls (#28, #44). */
import {NativeModules} from 'react-native';
import {deviceRows, ProviderRows} from '../src/deviceRows';

afterEach(() => {
  delete NativeModules.BridgeProviders;
});

test('each call goes to the module PluginHost loaded, with its arguments', async () => {
  const module: ProviderRows = {
    query: jest.fn(async () => [{id: 1}]),
    insert: jest.fn(async () => '9'),
    update: jest.fn(async () => 1),
    remove: jest.fn(async () => 1),
  };
  NativeModules.BridgeProviders = module;
  const rows = deviceRows();
  expect(await rows.query('content://x/t', {tag: 'task'})).toEqual([{id: 1}]);
  expect(await rows.insert('content://x/t', {title: 'a'})).toBe('9');
  expect(await rows.update('content://x/t', {id: 9}, {title: 'b'})).toBe(1);
  expect(await rows.remove('content://x/t', {id: 9})).toBe(1);
  expect(module.update).toHaveBeenCalledWith(
    'content://x/t',
    {id: 9},
    {title: 'b'},
  );
});

test('a module without the write calls, or none, rejects with the reason', async () => {
  await expect(deviceRows().query('content://x/t', {})).rejects.toThrow(
    'the BridgeProviders module cannot write yet',
  );
  NativeModules.BridgeProviders = {
    columnsOf: async () => [],
    dryInsert: async () => null,
  };
  await expect(deviceRows().insert('content://x/t', {})).rejects.toThrow(
    'cannot write yet',
  );
});
