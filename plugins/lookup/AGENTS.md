# Lookup — agent guidance

Scoped guidance for `plugins/lookup/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Scaffolded** ([#110](https://github.com/martonpaulo/supernote-tools/issues/110)): plugin shell with a Settings entry and no note button, build to
`Lookup.snplg`, `npm run validate` green. Still to come, each with its own issue: the three lasso
buttons (insert illustration, insert photo, insert text) over `../../packages/ink-core`. Ink2Pic's
picture search and pixel measures are `../../packages/picture-search`, mapped here
([#125](https://github.com/martonpaulo/supernote-tools/issues/125)); its insert flow, stored measures and library move in with the first
button that needs them, and Ink2Pic is then retired (owner D45).

## What it is

Write a word, lasso it, insert a picture, a photo or a short definition. It is the evolution of
`../ink2pic` and the planned definition mode. Scope and pains: `../../docs/plugin-scope.md`
(section `lookup`). Layers: `../../docs/architecture.md`.

## Rules

- `lookup` is a new plugin beside Ink2Pic, with its own `pluginID`, never Ink2Pic renamed: both stay
  installed until Ink2Pic is retired (owner D40, [#110](https://github.com/martonpaulo/supernote-tools/issues/110), `../../docs/decisions.md`).
  `__tests__/pluginConfig.test.ts` fails if the two ids are the same.
- Each mode is its own lasso button, chosen before the search, never a toggle after it.
- The definition back-end is the shared `DictionaryProvider` in `ink-core`. Feature code never
  names a concrete source.
- Permissions: none yet. Add `plugin.permission.INTERNET` with the first online search, and a file
  permission only with the first file call ([#83](https://github.com/martonpaulo/supernote-tools/issues/83) is the same rule for Bridge).
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../ink2pic/docs/brief.md`.

## Reuse

Scaffold copied from `../lingo`, which took it from `../bridge` and `../ink2pic` (same runtime,
build and release shape).
