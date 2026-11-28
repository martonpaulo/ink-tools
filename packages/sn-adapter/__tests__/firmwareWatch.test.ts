/** The start-up watch (#492): a feature is broken when its kill switch is on or its probe fails. */
import {brokenFeatures, type RegistryItem} from '../src';

const item = (id: string, off: string | null): RegistryItem => ({
  id,
  level: 5,
  impact: 'user',
  owner: 'sn-adapter',
  probe: null,
  unprobed: 'synthetic',
  active: 'synthetic',
  off,
});
const ITEMS = [item('a.on', null), item('b.off', 'a tablet update changed it, reviewed until 2026-12-31'), item('c.on', null)];

describe('brokenFeatures', () => {
  it('names nothing when every item is on and every probe passes', async () => {
    const watch = [{item: 'a.on', feature: 'Alpha'}, {item: 'c.on', feature: 'Gamma', probe: async () => true}];
    expect(await brokenFeatures(watch, ITEMS)).toEqual([]);
  });

  it('names a feature whose kill switch is on, without running its probe', async () => {
    const probe = jest.fn(async () => true);
    expect(await brokenFeatures([{item: 'b.off', feature: 'Beta', probe}], ITEMS)).toEqual(['Beta']);
    expect(probe).not.toHaveBeenCalled();
  });

  it('names a feature whose probe fails or throws, and logs the throw with its item', async () => {
    const log = jest.fn();
    const watch = [
      {item: 'a.on', feature: 'Alpha', probe: async () => false},
      {item: 'c.on', feature: 'Gamma', probe: async () => Promise.reject(new Error('no answer'))},
    ];
    expect(await brokenFeatures(watch, ITEMS, log)).toEqual(['Alpha', 'Gamma']);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('c.on'));
  });

  it('names a feature once when two items break it', async () => {
    const watch = [{item: 'b.off', feature: 'Beta'}, {item: 'a.on', feature: 'Beta', probe: async () => false}];
    expect(await brokenFeatures(watch, ITEMS)).toEqual(['Beta']);
  });

  it('throws for an id the registry does not hold', async () => {
    await expect(brokenFeatures([{item: 'x.none', feature: 'X'}], ITEMS)).rejects.toThrow('no registry item x.none');
  });
});
