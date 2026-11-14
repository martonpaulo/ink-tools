# Shared packages

Provider-agnostic building blocks the plugins share (layers in [docs/architecture.md](../docs/architecture.md)).

| Package | Owns |
| :--- | :--- |
| `sn-adapter` | Supernote internals as an updatable descriptor, plus the adapt-on/off probe |
| `sync-core` | Diff, recurrence expansion, mapping and module orchestration |
| `ink-core` | Handwrite, recognise, lasso, insert on the page; the shared `DictionaryProvider` interface and Lingo's language-pair Settings model |

Run `npm install && npm run validate` here.
