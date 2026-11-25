# Shared packages

Provider-agnostic building blocks the plugins share (layers in [docs/architecture.md](../docs/architecture.md)).

| Package | Owns |
| :--- | :--- |
| `sn-adapter` | Every Supernote call, in two tiers: the official `sn-plugin-lib` wrappers, and the internals as an updatable descriptor with the adapt-on/off probe ([#101](https://github.com/martonpaulo/supernote-tools/issues/101)), and in `native/` the Java that Account Sync and the Probe compile, the Probe's revert of a dry insert by row id and the rule for whether an insert wrote a row, with its JVM tests in `native-tests/`, run in the packages gate ([#254](https://github.com/martonpaulo/ink-tools/issues/254), [#213](https://github.com/martonpaulo/ink-tools/issues/213), [#217](https://github.com/martonpaulo/ink-tools/issues/217)) |
| `sync-core` | Diff, recurrence expansion, mapping and module orchestration |
| `ink-core` | Handwrite, recognise, the lasso query and the placement on the page; the shared `DictionaryProvider` interface with its first source, Wiktionary definitions ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)), Lingo's language-pair Settings model, and the ZH input reader with its offline CC-CEDICT pinyin index ([#129](https://github.com/martonpaulo/supernote-tools/issues/129), [notice](ink-core/NOTICE.md)) |
| `picture-search` | The picture search core (the sources, the ranking, the measured order, `chooseLook`) its pure-Java pixel measures and the native file module in `native/`, with their JVM tests in `native-tests/`, the file store, the settings store and the «Insert best picture» flow, used by Lookup, with the OpenMoji index and its build script ([notice](picture-search/NOTICE.md)) ([#125](https://github.com/martonpaulo/supernote-tools/issues/125), [#142](https://github.com/martonpaulo/supernote-tools/issues/142)) |
| `native-build` | The light native build every plugin with native code shares: javac, D8 and aapt2 into `app.npk`, added to the plugin's `.snplg`; each plugin's `scripts/native-build.cjs` names its package class, its Java folders and its JVM tests ([#231](https://github.com/martonpaulo/ink-tools/issues/231)); the one JDK locator, `host-tools.cjs`, which each plugin's copy re-exports, and `package-tests.cjs`, which runs the shared packages' JVM tests in the packages gate (`npm run test:native`, [#254](https://github.com/martonpaulo/ink-tools/issues/254)) |
| `ui-kit` | The Settings look every plugin shares: tokens (set in `src/tokens.json` alone, which the Android apps read as Java through `android-tokens.cjs`, [#275](https://github.com/martonpaulo/ink-tools/issues/275)), shared styles, the `Button`, the size rule for tests ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)), the «Loading…» strip of a no-view action ([#103](https://github.com/martonpaulo/ink-tools/issues/103)), and the Back key hook of a full view ([#204](https://github.com/martonpaulo/ink-tools/issues/204)) |

Run `npm install && npm run validate` here for `sn-adapter`'s internals tier, `sync-core` and `ink-core`.

A plugin imports `ink-core` as `@ink-tools/ink-core`, mapped by `ink-core/plugin-config.js` in
its Metro and Jest configs and by `paths` in its `tsconfig.json`; the package holds no React Native
code and never imports `sn-plugin-lib`: the plugin passes its SDK calls in as a host port ([#109](https://github.com/martonpaulo/supernote-tools/issues/109)).

`sn-adapter` has two entries ([#101](https://github.com/martonpaulo/supernote-tools/issues/101)). `@ink-tools/sn-adapter` is the internals
tier (`src/internals/`): content providers, their tables and columns, all read from
`descriptor.json`, whose `fields` map our names to the device's columns, so a renamed column is a
descriptor update. `descriptor.json` is written from the registry of internals (`registry/items/`,
[#294](https://github.com/martonpaulo/ink-tools/issues/294)) by `scripts/registry.py --write`; never edit it by hand. `@ink-tools/sn-adapter/official` is the official tier (`src/official/`):
the only code that imports `sn-plugin-lib`, each call returning a `Result`. A plugin maps both with
`sn-adapter/plugin-config.js`; the official tier's `sn-plugin-lib` resolves from the plugin's
`node_modules`, so the plugin gates type-check it against the real SDK. Its own tests run in the
packages gate against `sn-adapter/testing/`: the SDK's Jest mock, a loose type stand-in and the
native module registry, which `packages/jest.config.js` and `tsconfig.base.json` map, and which
the renders' Jest maps too ([#142](https://github.com/martonpaulo/ink-tools/issues/142), [#288](https://github.com/martonpaulo/ink-tools/issues/288)). `scripts/boundaries.py` keeps every other folder off the SDK and the providers.

`picture-search` is wired the same way by `picture-search/plugin-config.js`, which also maps a deep
path (`@ink-tools/picture-search/rank`) for tests. Its Java keeps the package name
`com.inktools.files`, from the retired plugin it was written for, and is compiled by each plugin's
`scripts/native-build.cjs` that uses it; it holds the React Native file module too, whose
`Ink2PicFilesPackage` takes a plugin's two module names in a subclass, as Lookup's
`LookupFilesPackage` does ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)), and Bridge's `BridgeFilesPackage`, which reads and
writes only its Settings file ([#40](https://github.com/martonpaulo/ink-tools/issues/40)). Its search tests (the sources, the ranking, the cache, with their recorded answers in
`picture-search/__tests__/fixtures/`) and its device tier's file store, image module and memory log
run in the packages gate, type-checked with Node's types, the last with the test profile of
`picture-search/testing/profile.ts`
([#142](https://github.com/martonpaulo/ink-tools/issues/142), owner D63 A); the measures run there too, and so do «Insert best picture», the
device search, the stored thumbnails, the picks rule, the settings store and the Java and
TypeScript twins and the insert, with the test copy and the in-memory picture store of
`picture-search/testing/insert.ts` and the test codec of `picture-search/testing/settings.ts`. The
JVM tests run there as well ([#254](https://github.com/martonpaulo/ink-tools/issues/254)), with the tests that keep the core portable and each
tier on its own imports, and the package's DRY ratchet ([#288](https://github.com/martonpaulo/ink-tools/issues/288)); the plugin gates that use the
package type-check it and test their own bindings. Its insert tier
(`/insert`) holds «Insert best picture»: the cached search, the stored thumbnails, the measured
order, the insert and the no-view press guard; each plugin binds it to its own settings, copy and
stores.

`ui-kit` is React Native code, so it is not a workspace here. A plugin imports it as
`@ink-tools/ui-kit`, mapped by `ui-kit/plugin-config.js` in its Metro and Jest configs and by
`paths` in its `tsconfig.json`; Metro bundles it into the plugin's `.snplg` with the plugin's own
React. Its tests and lint run in the Account Sync gate, and the other plugin gates type-check it ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)).
`ui-kit/renders/` holds the renders: every plugin's Settings and the kit's own views drawn as the
Manta shows them and checked against the e-ink rules, run with
`npm -C plugins/account-sync run renders` from Account Sync's `node_modules`
([#80](https://github.com/martonpaulo/ink-tools/issues/80), [#288](https://github.com/martonpaulo/ink-tools/issues/288)); `RENDER_EVIDENCE=<dir>` also writes the evidence
an interface change lands with, and `renders:windows` adds the Nomad's window and the Manta turned.

`ink-core`'s pinyin index (3.4 MB) is not exported from `index.ts`, so a plugin bundles it only
when it imports `src/pinyin-data.ts` itself. `ink-core/scripts/build-pinyin-index.cjs` rebuilds it;
`--check` fails when the committed file differs ([#129](https://github.com/martonpaulo/supernote-tools/issues/129)).

Which gates run each package is written once, in the `rules` of [`gates.json`](../gates.json): the
package's folder maps to its gates there, and this page only says where its tests live.
