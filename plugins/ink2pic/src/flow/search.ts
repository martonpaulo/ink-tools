/**
 * One search as the screen runs it: the shared run of picture-search's insert tier (#142) over
 * Ink2Pic's cached search, stored thumbnails, saved symbols (#91) and picks (#34); after its
 * results show, an offline search opens the Library with its sentence, and any other answer is
 * recorded as a recent search.
 */
import {getLibrary, recordSearch} from '../library/device';
import type {Library} from '../library/types';
import {
  runSearch as sharedRun,
  stateText as sharedStateText,
  type SearchRun,
  type SearchRunOptions,
} from '../profile';
import {pickedFor} from '../picks/device';
import {
  DEFAULT_ADAPTERS,
  SearchOutcome,
  SearchState,
  searchState,
  SourceAdapter,
} from '@supernote-tools/picture-search';
import {searchCached} from '../search/device';
import {prepareThumbs} from '../search/thumbs';
import {markSavedSymbols} from '../symbols/store';
import {copy} from '../ui/copy';
import {offlineText} from './failure';

export type {SearchRun, SearchRunOptions} from '../profile';

/** What follows the shown results: the offline sentence, the updated library, or nothing. */
export type AfterSearch = {offline: string} | {library: Library} | null;

export function runSearch(
  word: string,
  sources: readonly SourceAdapter[] = DEFAULT_ADAPTERS,
  isNewest: () => boolean = () => true,
  options: SearchRunOptions = {},
): Promise<SearchRun> {
  return sharedRun(
    word,
    sources,
    {
      search: (query, from, {exact, noTimerWait}) =>
        searchCached(query, from, undefined, {exact, noTimerWait}),
      thumbs: () => prepareThumbs(),
      markSaved: outcome => markSavedSymbols(outcome),
      picked: query => pickedFor(query),
    },
    isNewest,
    options,
  );
}

/** Runs once the results show, so neither the permission check nor the library write delays them. */
export async function afterSearch(
  word: string,
  outcome: SearchOutcome,
): Promise<AfterSearch> {
  const state = searchState(outcome).kind;
  if (state === 'offline') {
    return {offline: await offlineText()};
  }
  if (state === 'failed') {
    return null;
  }
  await recordSearch(word);
  return {library: await getLibrary()};
}

/** The state's sentence, with the corrected spelling in it; null when there is none. */
export function stateText(state: SearchState): string | null {
  return sharedStateText(state, copy);
}

/** The action that searches the typed word as it is, after a corrected search. */
export function insteadLabel(word: string): string {
  return copy['search.instead'].replace('{query}', word);
}
