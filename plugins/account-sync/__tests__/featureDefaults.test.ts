/** Every Account Sync settings key has its row in `docs/feature-defaults.md` (#547). */
import {keyPaths, keysWithNoRow} from '@ink-tools/ui-kit/featureDefaultsTest';
import {defaultSettings} from '@ink-tools/sync-core';

test('every settings key has a row (#547)', () => {
  // `schema` is the file's version and `firstLinked` a date the sync records: no person sets them.
  const keys = keyPaths(defaultSettings()).filter(key => key !== 'schema' && key !== 'firstLinked');
  // `defaultCalendarId` is absent until the person picks a calendar.
  expect(keysWithNoRow('Account Sync', [...keys, 'defaultCalendarId'])).toEqual([]);
});
