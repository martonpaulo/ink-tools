/**
 * What a plugin hands the insert tier, for the package's own tests (#142, D63 A): its copy, where
 * each sentence of «Insert best picture» is its own key, so a test reads which sentence a flow
 * chose without a plugin's copy, and a picture store held in memory in place of a library.
 */
import type {
  InsertOptions,
  InsertRecord,
  KnownPicture,
  PictureStore,
  QuickInsertCopy,
} from '../src/insert';

export const TEST_COPY: QuickInsertCopy = {
  'error.permission.files': 'error.permission.files',
  'error.permission.settings': 'error.permission.settings',
  'error.permission.internet': 'error.permission.internet',
  'error.save': 'error.save',
  'error.downloadOffline': 'error.downloadOffline',
  'error.download': 'error.download',
  'error.emptyLasso': 'error.emptyLasso',
  'error.recognition': 'error.recognition',
  'error.placeSlow': 'error.placeSlow',
  'error.place': 'error.place',
  'error.offline': 'error.offline',
  'search.running': 'search.running',
  'search.corrected': 'search.corrected {query}',
  'search.stale': 'search.stale',
  'error.sourceDown': 'error.sourceDown',
  'search.empty': 'search.empty',
  'error.sourcesDown': 'error.sourcesDown',
  'error.unexpected': 'error.unexpected',
};

/** Where the test store keeps its prepared pictures: shared storage, as the note app reads only there. */
export const TEST_PICTURES_DIR = '/storage/emulated/0/MyStyle/Test/pictures';

/** A picture store held in memory: what a plugin's library would find and record. */
export type TestPictures = PictureStore & {
  /** Each picture recorded after its insert, in order. */
  records: InsertRecord[];
  /** The pictures the store already holds, by `<id>|<contour>`. */
  known: Map<string, KnownPicture>;
};

/** The test store's default prepared width, the width the image module mock answers. */
export const TEST_WIDTH = 640;

export const knownKey = (id: string, contour: boolean) => `${id}|${contour}`;

export function testPictures(options: Partial<InsertOptions> = {}): TestPictures {
  const records: InsertRecord[] = [];
  const known = new Map<string, KnownPicture>();
  return {
    records,
    known,
    dir: () => TEST_PICTURES_DIR,
    options: async () => ({width: TEST_WIDTH, placement: 'below', contour: false, ...options}),
    find: async (result, contour) => known.get(knownKey(result.id, contour)) ?? null,
    record: async item => {
      records.push(item);
    },
  };
}
