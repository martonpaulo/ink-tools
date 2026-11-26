import {NeedError, probe, runProbe} from '../src/probe';

test('without the native module the default probe logs the runtime keys and ends with what it needs (#257)', async () => {
  const sunk: string[] = [];
  const outcome = await probe({b: 1, a: 2}, l => sunk.push(l));
  expect(outcome.lines[0]).toBe('runtime keys: a,b');
  expect(outcome.status).toBe('needs');
  expect(outcome.lines[outcome.lines.length - 1]).toContain('probe needs: The native module ProbeProviders is missing');
  expect(sunk).toEqual(outcome.lines);
  expect(await runProbe({b: 1, a: 2}, () => undefined)).toEqual(outcome.lines);
});

test('a probe that ends ends with done', async () => {
  const outcome = await probe({}, () => undefined, async log => log('found it'));
  expect(outcome).toEqual({lines: ['found it', 'probe done'], status: 'done'});
});

test('a thrown error is a failed outcome with its reason, never a crash', async () => {
  const outcome = await probe({}, () => undefined, async () => {
    throw new Error('digest query DENIED');
  });
  expect(outcome).toEqual({lines: ['probe failed: digest query DENIED'], status: 'failed', reason: 'digest query DENIED'});
});

test('a NeedError is a needs outcome with its fix', async () => {
  const need = {what: 'A lasso', reason: 'The probe reads the lassoed strokes.', steps: ['Lasso a stroke.']};
  const outcome = await probe({}, () => undefined, async () => {
    throw new NeedError(need);
  });
  expect(outcome).toEqual({lines: ['probe needs: A lasso: The probe reads the lassoed strokes.'], status: 'needs', need});
});
