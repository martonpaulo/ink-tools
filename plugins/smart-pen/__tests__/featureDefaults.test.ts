/** Every Smart Pen settings key has its row in `docs/feature-defaults.md` (#547). */
import {keyPaths, keysWithNoRow} from '@ink-tools/ui-kit/featureDefaultsTest';
import {DEFAULT_PEN_SETTINGS} from '../src/settings';

test('every settings key has a row (#547)', () => {
  // `otherModules` only keeps a newer build's switches: no person sets it.
  const keys = keyPaths(DEFAULT_PEN_SETTINGS).filter(key => key !== 'otherModules');
  expect(keysWithNoRow('Smart Pen', keys)).toEqual([]);
});
