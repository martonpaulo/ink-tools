# Shared packages

Provider-agnostic building blocks the plugins share (layers in [docs/architecture.md](../docs/architecture.md)).

| Package | Owns |
| :--- | :--- |
| `sn-adapter` | Every Supernote call, in two tiers: the official `sn-plugin-lib` wrappers, and the internals as an updatable descriptor with the adapt-on/off probe ([#101](https://github.com/martonpaulo/supernote-tools/issues/101)), and in `native/` the Java that Account Sync and the Probe compile, the Probe's revert of a dry insert by row id and the rule for whether an insert wrote a row, with its JVM tests in `native-tests/` ([#213](https://github.com/martonpaulo/ink-tools/issues/213), [#217](https://github.com/martonpaulo/ink-tools/issues/217)) |
| `sync-core` | Diff, recurrence expansion, mapping and module orchestration |
| `ink-core` | Handwrite, recognise, the lasso query and the placement on the page; the shared `DictionaryProvider` interface with its first source, Wiktionary definitions ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)), Lingo's language-pair Settings model, and the ZH input reader with its offline CC-CEDICT pinyin index ([#129](https://github.com/martonpaulo/supernote-tools/issues/129), [notice](ink-core/NOTICE.md)) |
| `picture-search` | Ink2Pic's picture search core (the sources, the ranking, the measured order, `chooseLook`) its pure-Java pixel measures and the native file module in `native/`, with their JVM tests in `native-tests/`, the file store, the settings store and the «Insert best picture» flow, shared by Ink2Pic and Lookup ([#125](https://github.com/martonpaulo/supernote-tools/issues/125), [#142](https://github.com/martonpaulo/supernote-tools/issues/142)) |
| `ui-kit` | The Settings look every plugin shares: tokens, shared styles, the `Button`, the size rule for tests ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)), the «Loading…» strip of a no-view action ([#103](https://github.com/martonpaulo/ink-tools/issues/103)), and the Back key hook of a full view ([#204](https://github.com/martonpaulo/ink-tools/issues/204)) |

Run `npm install && npm run validate` here for `sn-adapter`'s internals tier, `sync-core` and `ink-core`.

A plugin imports `ink-core` as `@ink-tools/ink-core`, mapped by `ink-core/plugin-config.js` in
its Metro and Jest configs and by `paths` in its `tsconfig.json`; the package holds no React Native
code and never imports `sn-plugin-lib`: the plugin passes its SDK calls in as a host port ([#109](https://github.com/martonpaulo/supernote-tools/issues/109)).

`sn-adapter` has two entries ([#101](https://github.com/martonpaulo/supernote-tools/issues/101)). `@ink-tools/sn-adapter` is the internals
tier (`src/internals/`): content providers, their tables and columns, all read from
`descriptor.json`, whose `fields` map our names to the device's columns, so a renamed column is a
descriptor update. `@ink-tools/sn-adapter/official` is the official tier (`src/official/`):
the only code that imports `sn-plugin-lib`, each call returning a `Result`. A plugin maps both with
`sn-adapter/plugin-config.js`; the official tier's `sn-plugin-lib` resolves from the plugin's
`node_modules`, so this folder leaves it out of its type check, and the Ink2Pic gate lints, types and
tests it. `scripts/boundaries.py` keeps every other folder off the SDK and the providers.

`picture-search` is wired the same way by `picture-search/plugin-config.js`, which also maps a deep
path (`@ink-tools/picture-search/rank`) for tests. Its Java keeps the package name
`com.ink2pic.files` and is compiled by each plugin's `scripts/native-build.cjs` (Ink2Pic's and
Lookup's); it holds the React Native file module too, whose `Ink2PicFilesPackage` registers
Ink2Pic's module names and takes another plugin's two names in a subclass, as Lookup's
`LookupFilesPackage` does ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)), and Bridge's `BridgeFilesPackage`, which reads and
writes only its Settings file ([#40](https://github.com/martonpaulo/ink-tools/issues/40)). Its TypeScript and JVM tests run in the Ink2Pic gate, beside the
mocks they share, and Lookup's gate type-checks it and tests its own bindings. Its insert tier
(`/insert`) holds «Insert best picture»: the cached search, the stored thumbnails, the measured
order, the insert and the no-view press guard; each plugin binds it to its own settings, copy and
stores, and Ink2Pic hands in its library, picks and OpenMoji symbols, which stay in Ink2Pic.

`ui-kit` is React Native code, so it is not a workspace here. A plugin imports it as
`@ink-tools/ui-kit`, mapped by `ui-kit/plugin-config.js` in its Metro and Jest configs and by
`paths` in its `tsconfig.json`; Metro bundles it into the plugin's `.snplg` with the plugin's own
React. Its tests and lint run in the Bridge gate, and the other plugin gates type-check it ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)).

`ink-core`'s pinyin index (3.4 MB) is not exported from `index.ts`, so a plugin bundles it only
when it imports `src/pinyin-data.ts` itself. `ink-core/scripts/build-pinyin-index.cjs` rebuilds it;
`--check` fails when the committed file differs ([#129](https://github.com/martonpaulo/supernote-tools/issues/129)).
