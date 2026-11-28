/** Every Lasso Actions settings key has its row in `docs/feature-defaults.md` (#547). */
import {keyPaths, keysWithNoRow} from '@ink-tools/ui-kit/featureDefaultsTest';
import {defaultLassoSettings} from '../src/settings';

test('every settings key has a row (#547)', () => {
  // `otherModules` keeps a newer build's switches and `oldShape` marks an old file: no person sets them.
  const keys = keyPaths(defaultLassoSettings()).filter(key => key !== 'otherModules' && key !== 'oldShape');
  expect(keysWithNoRow('Lasso Actions', keys)).toEqual([]);
});
