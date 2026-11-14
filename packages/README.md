# Shared packages

Provider-agnostic building blocks the plugins share (layers in [docs/architecture.md](../docs/architecture.md)).

| Package | Owns |
| :--- | :--- |
| `sn-adapter` | Supernote internals as an updatable descriptor, plus the adapt-on/off probe |
| `sync-core` | Diff, recurrence expansion, mapping and module orchestration |
| `ink-core` | Handwrite, recognise, lasso, insert on the page; the shared `DictionaryProvider` interface and Lingo's language-pair Settings model |
| `ui-kit` | The Settings look every plugin shares: tokens, shared styles, the `Button`, and the size rule for tests ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)) |

Run `npm install && npm run validate` here for `sn-adapter`, `sync-core` and `ink-core`.

`ui-kit` is React Native code, so it is not a workspace here. A plugin imports it as
`@supernote-tools/ui-kit`, mapped by `ui-kit/plugin-config.js` in its Metro and Jest configs and by
`paths` in its `tsconfig.json`; Metro bundles it into the plugin's `.snplg` with the plugin's own
React. Its tests and lint run in the Bridge gate, and the Ink2Pic and Lingo gates type-check it ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)).
