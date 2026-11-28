/** Every Device Link settings key has its row in `docs/feature-defaults.md` (#547). */
import {keysWithNoRow} from '@ink-tools/ui-kit/featureDefaultsTest';
import type {Settings} from '../src/settings/device';

/** Every key of `Settings`: the type fails to compile when a key is added and not listed here. */
const KEYS: Record<keyof Settings, true> = {fingerprint: true, pins: true, last: true, background: true};

test('every settings key has a row (#547)', () => {
  expect(keysWithNoRow('Device Link', Object.keys(KEYS))).toEqual([]);
});
