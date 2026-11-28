/**
 * Test support for a plugin's start-up firmware notice (#492): the two results every plugin owes,
 * a feature turned off and nothing turned off, over fake registry items. Kept out of the entry.
 */
import type {Working} from './working';

type Watched = {item: string; feature: string};

/** Fake registry items for each watched id, all with the kill switch `off`. */
function itemsFor(watch: readonly Watched[], off: string | null) {
  return watch.map(entry => ({
    id: entry.item,
    level: 1,
    impact: 'user' as const,
    owner: 'sn-adapter',
    probe: null,
    unprobed: 'synthetic',
    active: 'synthetic',
    off,
  }));
}

/** Registers the two tests; `check` is the plugin's `checkFirmware`, `working` the view it holds the notice on. */
export function firmwareNoticeTests<Items>(options: {
  check: (items: Items) => Promise<boolean>;
  watch: readonly Watched[];
  stillWorks: string;
  working: Working;
}): void {
  const {check, watch, stillWorks, working} = options;
  const items = (off: string | null) => itemsFor(watch, off) as unknown as Items;
  describe('the firmware notice', () => {
    afterEach(() => working.dismiss());

    it('holds a plain Needs notice naming the feature when a registry item is off', async () => {
      expect(await check(items('reviewed until 2026-12-31'))).toBe(true);
      expect(working.heldState()).toBe('needs');
      expect(working.problem()?.what).toContain(watch[0].feature);
      expect(working.problem()?.reason).toContain(stillWorks);
    });

    it('shows nothing when every item is on', async () => {
      expect(await check(items(null))).toBe(false);
      expect(working.problem()).toBeNull();
    });
  });
}
