# Lookup — agent guidance

Scoped guidance for `plugins/lookup/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Four lasso buttons** over a Settings view ([#110](https://github.com/martonpaulo/supernote-tools/issues/110), [#111](https://github.com/martonpaulo/supernote-tools/issues/111), [#115](https://github.com/martonpaulo/supernote-tools/issues/115)), built to `Lookup.snplg`
with its native `app.npk`; the device round of the picture buttons is still open. Ink2Pic's picture
search, pixel measures, file store, settings store and «Insert best picture» flow are
`../../packages/picture-search`, shared with Ink2Pic ([#125](https://github.com/martonpaulo/supernote-tools/issues/125), [#142](https://github.com/martonpaulo/supernote-tools/issues/142)); Ink2Pic's library and picks
stay in Ink2Pic (D40 B), which is retired later (owner D45). Still to come: insert text ([#114](https://github.com/martonpaulo/supernote-tools/issues/114)).
`src/modes.ts` owns the two picture modes, «Insert illustration» and «Insert photo»: button ids from
1000, Settings keys and search style, with the measured split `keepMode` in the shared package
([#111](https://github.com/martonpaulo/supernote-tools/issues/111)). `src/pictures.ts` runs each as a no-view press over picture-search's shared
«Insert best picture» flow, with the mode's sources and style; only the mode's measured tiles stay,
and a press that inserts nothing writes its sentence below the word. Pictures go to
`MyStyle/Lookup/pictures`, at 640 px below the word, until [#105](https://github.com/martonpaulo/supernote-tools/issues/105) sets size and place per button.
«Insert definition» ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)), moved here from Ink2Pic: `src/definition.ts` reads the lasso,
defines it in pt then es through `src/dictionaries.ts` and inserts a 640 px text box below the word,
with no view. «Choose picture» ([#156](https://github.com/martonpaulo/supernote-tools/issues/156), owner D19 A): `src/choose.ts` reads the lasso, keeps the
word and its place, and opens the view on `src/ui/ChooseScreen.tsx`, which lists one mode at a
time («Illustrations», «Photos») through the same `modeDeps` flow and inserts the tapped tile at
the kept place; its device round is open. Each button follows its Settings switch (`src/buttons.ts`); the switches live in
`MyStyle/Lookup/settings.json` (`src/settings.ts`), the picture modes on by default. `src/profile.ts`
is Lookup's entry into picture-search's file store and insert tier ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)): folder
`MyStyle/Lookup`, native modules `LookupFiles` and `LookupImage`, registered by
`native/com/lookup/files/LookupFilesPackage.java`, which `scripts/native-build.cjs` compiles with the
package's Java into `app.npk`.

## What it is

Write a word, lasso it, insert a picture, a photo or a short definition. It is the evolution of
`../ink2pic` and the planned definition mode. Scope and pains: `../../docs/plugin-scope.md`
(section `lookup`). Layers: `../../docs/architecture.md`.

## Rules

- `lookup` is a new plugin beside Ink2Pic, with its own `pluginID`, never Ink2Pic renamed: both stay
  installed until Ink2Pic is retired (owner D40, [#110](https://github.com/martonpaulo/supernote-tools/issues/110), `../../docs/decisions.md`).
  `__tests__/pluginConfig.test.ts` fails if the two ids are the same.
- Each direct insert mode (illustration, photo, text) is its own lasso button, chosen before the
  search, never a toggle after it. The «Choose picture» screen is the one exception: behind its one
  button it may switch between its Illustrations and Photos tabs (owner, [#156](https://github.com/martonpaulo/supernote-tools/issues/156)).
- The definition back-end is the shared `DictionaryProvider` in `ink-core`. Feature code never
  names a concrete source.
- Permissions: `plugin.permission.INTERNET` for the dictionary and the picture sources,
  `plugin.permission.FILE:READ` for the lasso calls ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)) and `plugin.permission.FILE:WRITE`
  for the settings file and the prepared pictures ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)); add another only with its first call
  ([#83](https://github.com/martonpaulo/supernote-tools/issues/83) is the same rule for Bridge).
- Every file, settings and insert call goes through `src/profile.ts`, which sets Lookup's
  PluginProfile first; never import `@supernote-tools/picture-search/storage` or `/insert` elsewhere.
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../ink2pic/docs/brief.md`.

## Reuse

Scaffold copied from `../lingo`, which took it from `../bridge` and `../ink2pic` (same runtime,
build and release shape).
