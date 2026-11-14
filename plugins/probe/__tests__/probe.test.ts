import {runProbe} from '../src/probe';

test('the default probe logs the runtime keys and ends with done', async () => {
  const sunk: string[] = [];
  const lines = await runProbe({b: 1, a: 2}, l => sunk.push(l));
  expect(lines).toEqual(['runtime keys: a,b', 'probe done']);
  expect(sunk).toEqual(lines);
});
