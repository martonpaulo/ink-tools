/**
 * One search as a plugin runs it (#142, moved from Ink2Pic): the cached search (#16) and the
 * stored thumbnails (#46) at the same time; only the newest search is kept (#33). A plugin that
 * keeps OpenMoji symbols (#91) or picks (#34) hands them in as `SearchRunDeps`.
 */
import {log} from '../log/memory';
import type {SourceAdapter} from '../adapter';
import {picksFirst} from '../picks';
import type {SearchOutcome} from '../search';
import type {SearchState, SearchStateKind} from '../state';

export type SearchRun = {
  /** Null when a newer search started meanwhile: this answer is ignored. */
  outcome: SearchOutcome | null;
  /** The plugin folder with its thumbnails listed, or null (see `prepareThumbs`). */
  thumbDir: string | null;
};

export type SearchRunOptions = {
  /** Search the word as typed: no corrected spelling, no cached answer (#65). */
  exact?: boolean;
  /** No wait on a JS timer, for the no-view insert: timers may stop with no view (#93). */
  noTimerWait?: boolean;
};

export type SearchRunDeps = {
  /** The cached search over the plugin's settings (`searchCached`). */
  search: (
    word: string,
    sources: readonly SourceAdapter[],
    options: SearchRunOptions,
  ) => Promise<SearchOutcome>;
  /** The stored thumbnails listed (`prepareThumbs`). */
  thumbs: () => Promise<string | null>;
  /** Marks the saved OpenMoji symbols; with no network, only those show (#91). */
  markSaved?: (outcome: SearchOutcome) => Promise<SearchOutcome>;
  /** The person's earlier picks for the word, newest first (#34). */
  picked?: (word: string) => Promise<readonly string[]>;
};

export async function runSearch(
  word: string,
  sources: readonly SourceAdapter[],
  deps: SearchRunDeps,
  isNewest: () => boolean = () => true,
  {exact = false, noTimerWait = false}: SearchRunOptions = {},
): Promise<SearchRun> {
  log(`search "${word}"${exact ? ' exactly' : ''}`);
  // The stored thumbnails are listed while the search runs, so the grid knows them at once.
  const [found, thumbDir] = await Promise.all([
    deps.search(word, sources, {exact, noTimerWait}),
    deps.thumbs(),
  ]);
  const marked = deps.markSaved ? await deps.markSaved(found) : found;
  // The person's earlier picks for the word lead (#34), so the early download starts on one.
  const picked = deps.picked ? await deps.picked(word) : [];
  const outcome = {...marked, results: picksFirst(marked.results, picked)};
  if (!isNewest()) {
    log(`search "${word}" ended after a newer one: ignored`);
    return {outcome: null, thumbDir};
  }
  for (const [name, status] of Object.entries(outcome.statuses)) {
    log(`source ${name}: ${JSON.stringify(status)}`);
  }
  return {outcome, thumbDir};
}

/** The sentences of the search states; each plugin's copy holds them. */
export type SearchCopyKey =
  | 'search.running'
  | 'search.corrected'
  | 'search.stale'
  | 'error.sourceDown'
  | 'search.empty'
  | 'error.offline'
  | 'error.sourcesDown';
export type SearchCopy = Readonly<Record<SearchCopyKey, string>>;

/** The one sentence of each search state; null when the results speak for themselves. */
const STATE_COPY: Record<SearchStateKind, SearchCopyKey | null> = {
  searching: 'search.running',
  ready: null,
  corrected: 'search.corrected',
  stale: 'search.stale',
  partial: 'error.sourceDown',
  empty: 'search.empty',
  offline: 'error.offline',
  failed: 'error.sourcesDown',
};

/** The state's sentence, with the corrected spelling at `{query}`; null when there is none. */
export function stateText(state: SearchState, copy: SearchCopy): string | null {
  const key = STATE_COPY[state.kind];
  if (!key) {
    return null;
  }
  return state.kind === 'corrected'
    ? copy[key].replace('{query}', state.query)
    : copy[key];
}
