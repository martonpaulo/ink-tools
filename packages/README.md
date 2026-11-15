# Shared packages

Provider-agnostic building blocks the plugins share (layers in [docs/architecture.md](../docs/architecture.md)).

| Package | Owns |
| :--- | :--- |
| `sn-adapter` | Every Supernote call, in two tiers: the official `sn-plugin-lib` wrappers, and the internals as an updatable descriptor with the adapt-on/off probe ([#101](https://github.com/martonpaulo/supernote-tools/issues/101)) |
| `sync-core` | Diff, recurrence expansion, mapping and module orchestration |
| `ink-core` | Handwrite, recognise, the lasso query and the placement on the page; the shared `DictionaryProvider` interface and Lingo's language-pair Settings model |
| `ui-kit` | The Settings look every plugin shares: tokens, shared styles, the `Button`, and the size rule for tests ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)) |

Run `npm install && npm run validate` here for `sn-adapter`'s internals tier, `sync-core` and `ink-core`.

A plugin imports `ink-core` as `@supernote-tools/ink-core`, mapped by `ink-core/plugin-config.js` in
its Metro and Jest configs and by `paths` in its `tsconfig.json`; the package holds no React Native
code and never imports `sn-plugin-lib`: the plugin passes its SDK calls in as a host port ([#109](https://github.com/martonpaulo/supernote-tools/issues/109)).

`sn-adapter` has two entries ([#101](https://github.com/martonpaulo/supernote-tools/issues/101)). `@supernote-tools/sn-adapter` is the internals
tier (`src/internals/`): content providers, their tables and columns, all read from
`descriptor.json`, whose `fields` map our names to the device's columns, so a renamed column is a
descriptor update. `@supernote-tools/sn-adapter/official` is the official tier (`src/official/`):
the only code that imports `sn-plugin-lib`, each call returning a `Result`. A plugin maps both with
`sn-adapter/plugin-config.js`; the official tier's `sn-plugin-lib` resolves from the plugin's
`node_modules`, so this folder leaves it out of its type check, and the Ink2Pic gate lints, types and
tests it. `scripts/boundaries.py` keeps every other folder off the SDK and the providers.

`ui-kit` is React Native code, so it is not a workspace here. A plugin imports it as
`@supernote-tools/ui-kit`, mapped by `ui-kit/plugin-config.js` in its Metro and Jest configs and by
`paths` in its `tsconfig.json`; Metro bundles it into the plugin's `.snplg` with the plugin's own
React. Its tests and lint run in the Bridge gate, and the Ink2Pic and Lingo gates type-check it ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)).
