import {agentLog, causeChain, internalFailure, userSentence} from '../src';

/** The adapter's failure value: a sentence for the person, every detail for the agent (#294). */
const environment = {firmware: 'test/fingerprint:11/1', apps: {calendar: '1.00.532', task: '1.00.466'}};
/** An Error with a cause, set by hand: the packages' TypeScript lib predates ES2022's Error options. */
const withCause = (message: string, cause: unknown): Error => Object.assign(new Error(message), {cause});
const copy = {calendarBroken: 'The Calendar changed after an update, so sync is off. Update Ink Tools.'};

describe('internal failure', () => {
  it('logs the registry item, method, firmware, app versions and the whole cause chain', () => {
    const root = new TypeError('column startTime missing');
    const outer = withCause('query refused', root);
    const failure = internalFailure('calendar.provider', 'query', 'calendarBroken', environment, outer);
    const log = agentLog(failure);
    const header = log.split('\n')[0];
    const fields = ['registry=calendar.provider', 'level=2', 'method=query', 'firmware=test/fingerprint:11/1'];
    expect(fields.filter(field => !header.includes(field))).toEqual([]);
    expect(header).toContain('apps=calendar@1.00.532,task@1.00.466');
    expect(log).toContain('cause Error: query refused');
    expect(log).toContain('cause TypeError: column startTime missing');
    expect(log.indexOf('query refused')).toBeLessThan(log.indexOf('column startTime missing'));
  });

  it('shows the person the copy sentence, never a class name', () => {
    const failure = internalFailure('calendar.provider', 'query', 'calendarBroken', environment, new Error('x'));
    expect(userSentence(failure, copy)).toBe(copy.calendarBroken);
    expect(() => userSentence({...failure, copyKey: 'missing'}, copy)).toThrow('no copy for missing');
  });

  it('refuses an id the registry does not hold', () => {
    expect(() => internalFailure('calendar.nothing', 'query', 'calendarBroken', environment, null)).toThrow(
      'no registry item calendar.nothing',
    );
  });

  it('ends a cause chain that loops or holds a plain value', () => {
    const a = new Error('a');
    const b = withCause('b', a);
    (a as {cause?: unknown}).cause = b;
    expect(causeChain(b)).toHaveLength(2);
    expect(causeChain('refused')).toEqual(['string: refused']);
    expect(causeChain(undefined)).toEqual([]);
  });
});
