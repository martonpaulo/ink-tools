/**
 * The insert flow lives once, in picture-search's insert tier (#142): Ink2Pic's flow files bind it
 * to Ink2Pic's settings, library, symbols and copy, and never hold a second copy of its steps.
 */
import {readFileSync} from 'fs';
import {join} from 'path';

/** One step of each moved file, as the shared copy names it. */
const MOVED: Record<string, RegExp> = {
  'src/flow/quickInsert.ts': /function halted\(/,
  'src/flow/insertPicture.ts': /function noteChanged\(|function lassoPlaced\(/,
  'src/flow/measure.ts': /function measureFile\(/,
  'src/flow/failure.ts': /NO_FILE_ACCESS|function osErrorKeys\(/,
  'src/flow/search.ts': /STATE_COPY|Promise\.all\(/,
  'src/search/device.ts': /createBreaker\(|cachedSearch\(/,
  'src/search/thumbs.ts': /function makeRoom\(/,
  'src/picks/picks.ts': /function picksFirst\(/,
  'src/flow/headlessInsert.ts': /let runningSince/,
};

test.each(Object.entries(MOVED))(
  '%s binds the shared code, never copies it',
  (file, step) => {
    expect(readFileSync(join(__dirname, '..', file), 'utf8')).not.toMatch(step);
  },
);
