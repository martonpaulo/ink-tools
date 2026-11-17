# Search core

The picture search with no platform in it: no React Native, no `sn-plugin-lib`, no file or
network API of its own. Everything it needs comes in through its options, so the same code runs on
the Supernote, in Node (the search lab, [#63](https://github.com/martonpaulo/ink2pic/issues/63)) and in another project. A test in
`plugins/ink2pic/__tests__/sdk-boundary.test.ts` fails when a file here imports anything outside this folder.

The device tier is the exception, kept apart in `storage/` and `log/` ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)): the plugin's native file and image
modules, its settings file, its session log and the run log. It imports only `react-native` and
`@ink-tools/sn-adapter/official`, the core never imports it, and a plugin reaches it through
`@ink-tools/picture-search/storage` from its own profile module, which calls
`setPluginProfile({name, folder, filesModule, imageModule, userAgent})` first
(`plugins/ink2pic/src/profile.ts`). `createSettingsStore(codec)` gives a plugin its settings store
over its own settings model. The insert tier, `insert/`, holds what a lasso button runs on the
page: `readLassoQuery` and `placeAtLasso`, ink-core's lasso read and placement over the official
SDK wrappers, and «Insert best picture» ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)): `searchCached` over a plugin's `SearchSettings`,
the stored thumbnails, `measureFirstPages`, `insertPicture` over a plugin's `PictureStore`,
`insertBest`, the failure sentences from a plugin's copy, and `createPressGuard`, one no-view press
at a time. It imports the core, the device tier, ink-core and the official tier; it is reached
through `@ink-tools/picture-search/insert` and re-exported by the plugin's profile module.

## Contents

- [Public API](#public-api)
- [Parts](#parts)
- [Adding a source](#adding-a-source)
- [Adding a ranking signal](#adding-a-ranking-signal)

## Public API

Import from `@ink-tools/picture-search` (its `index.ts`) only ([#125](https://github.com/martonpaulo/supernote-tools/issues/125)).

| Name | What it does |
| :--- | :--- |
| `createContext({fetch, userAgent, clock?, log?, timeoutMs?})` | The context adapters search with: one fetcher, the User-Agent and the log |
| `searchAll(query, adapters, {ctx, clock?, timeoutMs?})` | Searches every adapter in parallel, merges and ranks; never throws |
| `DEFAULT_ADAPTERS` | Openclipart, Commons, Wikidata and OpenMoji, in that order; each has a `name` to switch it off by |
| `cachedSearch(query, run, {storage, path, clock?})` | A fresh cached outcome, or `run`'s outcome stored when worth keeping |
| `searchState(outcome)` | The one state a finished search is in, for the screen to name |
| `rankForEink(lists, query, scorers?)`, `DEFAULT_SCORERS`, `Scorer` | The ranking as an ordered list of signals |
| `fullUrl(result, width)`, `insertUrl(result)` | The image of a result at a width, or for an insert |
| `pageOf`, `pageCount`, `PAGE_SIZE` | Six results per page |
| `keepMode(ordered, measures, mode)`, `fitsMode`, `PictureMode` | A lasso mode's measured tiles only: photos and dark paintings for `photo`, the rest for `illustration` ([#111](https://github.com/martonpaulo/supernote-tools/issues/111)) |
| `picksFirst(results, ids)`, `addPick`, `parsePicks`, `serializePicks` | «Remember my pick»: the person's picks for a word lead its results ([#34](https://github.com/martonpaulo/ink2pic/issues/34)); moved from Ink2Pic for the measured order ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)) |

Every failure is a `Failure` with a typed `kind` (`network`, `timeout`, `http`, `throttled`,
`parse`); its `message` is for the log only.

## Parts

- `adapter.ts`: the `SourceAdapter` interface and the `SourceContext` it searches with.
- `adapters/`: one file per source, each with its URL builders and parsers.
- `adapters/openmoji.ts` and `data/openmoji-index.json`: symbols for abstract words, matched on
  the device with no request ([#67](https://github.com/martonpaulo/ink2pic/issues/67)). Rebuild the index with
  `node scripts/build-openmoji-index.cjs`; `--check` fails when the committed file differs.
- `registry.ts`: the default adapters and the picture host of each source that owns results.
- `fetcher.ts`: the only network path, with the User-Agent and the per-request timeout.
- `clock.ts`: the injected clock and log.
- `query.ts`: the query pipeline stages.
- `phrase.ts`: the words of a written line to search, by one Wikipedia titles check; the Wikidata lookup reuses its article ([#87](https://github.com/martonpaulo/ink2pic/issues/87)).
- `filters/adult.ts`: the adult filter, always on: whole-word lists over titles and Commons categories ([#69](https://github.com/martonpaulo/ink2pic/issues/69)).
- `rank.ts`: the scorers and the ranker.
- `search.ts`: the parallel search with its per-source budget.
- `cache.ts`: the cache over an injected text store.
- `state.ts`: the `SearchState` union.

## Adding a source

Write `adapters/<name>.ts` exporting a `SourceAdapter`: `name`, `search(query, ctx)` that reaches
the network only through `ctx.fetch` and returns a `SourceOutcome`: `{ok: true, value: {results}}` or a `Failure`, and
`requests` when it makes more than one request in a row. A source whose results it owns adds a
`PictureHost` and a `SourceName`. List it in `registry.ts`.

## Adding a ranking signal

Write a `Scorer`, `(result, intent) => number`, on the integer scale of `rank.ts`, and pass
`[...DEFAULT_SCORERS, yourScorer]` to `rankForEink`, or add it to `DEFAULT_SCORERS` when every
search should read it.
