/**
 * The search core bound to the device (#16) moved to picture-search's insert tier (#142); this
 * binds it to Ink2Pic's settings: the query languages (#68), the style and the data saver (#70).
 */
import {
  deviceContext as sharedContext,
  getSettings,
  searchCached as sharedSearch,
  type SearchSettings,
} from '../profile';
import type {
  FetchLike,
  SearchOutcome,
  SourceAdapter,
  SourceContext,
} from '@supernote-tools/picture-search';
import {DEFAULT_ADAPTERS} from '@supernote-tools/picture-search';
import {Settings, sourceOn, styleFlags} from '../settings/settings';

export {searchVariant} from '../profile';

/** What Ink2Pic's settings say about a search. */
export function searchSettings(settings: Settings): SearchSettings {
  return {
    languages: settings.languages,
    photos: styleFlags(settings).photos,
    dataSaver: settings.dataSaver,
    sourceOn: name => sourceOn(settings, name),
  };
}

export function deviceContext(
  settings: Settings,
  fetch: FetchLike = globalThis.fetch,
  noTimerWait = false,
): SourceContext {
  return sharedContext(searchSettings(settings), fetch, noTimerWait);
}

export function searchCached(
  query: string,
  sources: readonly SourceAdapter[] = DEFAULT_ADAPTERS,
  context?: SourceContext,
  options: {exact?: boolean; noTimerWait?: boolean} = {},
): Promise<SearchOutcome> {
  return sharedSearch(
    query,
    async () => searchSettings(await getSettings()),
    sources,
    context,
    options,
  );
}
