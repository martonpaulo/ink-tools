/**
 * What a plugin hands the insert tier, for the package's own tests (#142, D63 A): each sentence
 * of «Insert best picture» is its own key, so a test reads which sentence a flow chose without
 * a plugin's copy.
 */
import type {QuickInsertCopy} from '../src/insert';

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
