import {runProbe} from '../src/probe';

test('the default probe logs the runtime keys, the native probe result and ends with done', async () => {
  const sunk: string[] = [];
  const lines = await runProbe({b: 1, a: 2}, l => sunk.push(l));
  expect(lines[0]).toBe('runtime keys: a,b');
  expect(lines[1]).toContain('has no startListener');
  expect(lines[lines.length - 1]).toBe('probe done');
  expect(sunk).toEqual(lines);
});
