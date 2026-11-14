# Lingo — agent guidance

Scoped guidance for `plugins/lingo/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Scaffolded** ([#46](https://github.com/martonpaulo/supernote-tools/issues/46)): plugin shell with a Settings entry and no note button, build to
`Lingo.snplg`, `npm run validate` green. The pure parts live in `../../packages/ink-core`: the shared
`DictionaryProvider` interface (`src/dictionary.ts`) and the language-pair Settings model
(`src/pairs.ts`). Still to come, each waiting on its own choice or issue: the first translation
provider (options on [#46](https://github.com/martonpaulo/supernote-tools/issues/46)), the lasso flow over `ink-core` (lasso-only, as
[#32](https://github.com/martonpaulo/supernote-tools/issues/32) settled for Ink2Pic), the Settings screen, and the offline word list.

## What it is

Write a word, lasso it, insert its **translation**. Scope and real uses:
`../../docs/plugin-scope.md` (sections `lingo` and the shared dictionary engine). Layers:
`../../docs/architecture.md`.

## Rules

- Each language pair is one Settings toggle for both directions, off by default. A new pair is one
  row of `PAIRS` in `ink-core`; the plugin code does not change.
- The translation back-end is a `DictionaryProvider`. Feature code never names a concrete source.
- Permissions: none yet. Add `plugin.permission.INTERNET` with the first online provider, and a
  file permission only with the first file call ([#83](https://github.com/martonpaulo/supernote-tools/issues/83) is the same rule for Bridge).
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../ink2pic/docs/brief.md`.

## Reuse

Scaffold and patterns come from `../bridge`, which took them from `../ink2pic` (same runtime, build
and release shape).
