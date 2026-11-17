# Lookup — agent guidance

Scoped guidance for `plugins/lookup/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Lasso buttons** over a Settings view ([#110](https://github.com/martonpaulo/supernote-tools/issues/110), [#111](https://github.com/martonpaulo/supernote-tools/issues/111), [#115](https://github.com/martonpaulo/supernote-tools/issues/115)), built to `Lookup.snplg`
with its native `app.npk`; the device round of the picture buttons is still open. Ink2Pic's picture
search, pixel measures, file store, settings store and «Insert best picture» flow are
`../../packages/picture-search`, shared with Ink2Pic ([#125](https://github.com/martonpaulo/supernote-tools/issues/125), [#142](https://github.com/martonpaulo/supernote-tools/issues/142)); Ink2Pic's library and picks
stay in Ink2Pic (D40 B), which is retired later (owner D45).
Button names follow the wording of Supernote's own lasso menu, a verb and a noun in title case
(owner, [#167](https://github.com/martonpaulo/supernote-tools/issues/167)). `src/modes.ts` owns the two picture modes, «Insert Sticker» (illustration) and «Insert Image» (photo): button ids from
1000, Settings keys and search style, with the measured split `keepMode` in the shared package
([#111](https://github.com/martonpaulo/supernote-tools/issues/111)). `src/pictures.ts` runs each as a no-view press over picture-search's shared
«Insert best picture» flow, with the mode's sources and style; only the mode's measured tiles stay,
and a press that inserts nothing writes its sentence below the word. Pictures go to
`pictures/` of the private plugin folder, out of Supernote file sync, and are reused from there
through `pictures.json` (`src/library.ts`, [#23](https://github.com/martonpaulo/ink-tools/issues/23)); a failed insert from there is tried once from
`MyStyle/Lookup/pictures`, and Settings names the old synced folders still holding files. They
go in at the owner's one small size, 200 px, below the word; Settings
keeps only Picture sources and Data saver for pictures, which `modeSearchSettings` reads
([#105](https://github.com/martonpaulo/ink-tools/issues/105)).
«Insert Definition» ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)), moved here from Ink2Pic: `src/definition.ts` reads the lasso,
defines it in pt then es through `src/dictionaries.ts` and inserts a 640 px text box below the word,
with no view. «Insert Summary» ([#114](https://github.com/martonpaulo/ink-tools/issues/114)): `src/summary.ts` reads the lasso, asks ink-core's
Wikipedia extract (`summarizeFirst`, pt then es, 3 sentences) through `src/dictionaries.ts` and
inserts the article title, the summary and «(Wikipedia)» in the same box; on by default, its id
`FIRST_BUTTON_ID + 100`, clear of the translation ids; its device round is open. «Choose Image» ([#156](https://github.com/martonpaulo/supernote-tools/issues/156), owner D19 A): `src/choose.ts` reads the lasso, keeps the
word and its place, and opens the view on `src/ui/ChooseScreen.tsx`, which lists one mode at a
time («Illustrations», «Photos») through the same `modeDeps` flow and inserts the tapped tile at
the kept place; its device round is open. One «Translate ES→PT» button per direction
([#174](https://github.com/martonpaulo/supernote-tools/issues/174), moved here from the retiring Lingo plugin by [#158](https://github.com/martonpaulo/supernote-tools/issues/158)): `src/modes.ts`'s `TRANSLATIONS`
gives each direction of ink-core's `ALL_DIRECTIONS` its id after «Choose Image»; `src/translation.ts`
reads the lasso, translates it in that one direction through ink-core's shared flow (`translateAll`:
Wiktionary, then Apertium for PT-ES; a ZH input through the pinyin index) and inserts the line in
the same 640 px box below the word as the definition (`src/textBox.ts`); its device round is open.
Each button follows its Settings switch (`src/buttons.ts`); the switches live in
`MyStyle/Lookup/settings.json` (`src/settings.ts`) with the `directions` map, the picture modes on
by default, the definition off, the summary on, ES→PT, ZH→PT and PT→ZH on, PT→ES off. `src/profile.ts`
is Lookup's entry into picture-search's file store and insert tier ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)): folder
`MyStyle/Lookup`, native modules `LookupFiles` and `LookupImage`, registered by
`native/com/lookup/files/LookupFilesPackage.java`, which `scripts/native-build.cjs` compiles with the
package's Java into `app.npk`.

## What it is

Write a word, lasso it, insert a picture, a photo, a short definition or a translation. It is the evolution of
`../ink2pic` and the planned definition mode. Scope and pains: `../../docs/plugin-scope.md`
(section `lookup`). Layers: `../../docs/architecture.md`.

## Rules

- `lookup` is a new plugin beside Ink2Pic, with its own `pluginID`, never Ink2Pic renamed: both stay
  installed until Ink2Pic is retired (owner D40, [#110](https://github.com/martonpaulo/supernote-tools/issues/110), `../../docs/decisions.md`).
  `__tests__/pluginConfig.test.ts` fails if the two ids are the same.
- Each direct insert mode (illustration, photo, text) is its own lasso button, chosen before the
  search, never a toggle after it. The «Choose Image» screen is the one exception: behind its one
  button it may switch between its Illustrations and Photos tabs (owner, [#156](https://github.com/martonpaulo/supernote-tools/issues/156)).
- An insert goes into free space, never over the writing below the word ([#152](https://github.com/martonpaulo/supernote-tools/issues/152)). After a
  picture insert, the picture stays lassoed so the person picks the next step from the lasso
  menu: «Choose Image» to change it, or Image Editing to edit it; Lookup never opens Image Editing
  by itself. It lassoes only when no other element crosses the picture's rect, since the rect
  lasso also takes the ink under it ([#168](https://github.com/martonpaulo/supernote-tools/issues/168), owner, `../../docs/decisions.md`).
- Every no-view button runs under the shared «Loading…» strip (`src/working.ts`, index.js,
  [#103](https://github.com/martonpaulo/ink-tools/issues/103)); a press that opens Lookup's own view calls `showOwnView`, which hands the view over.
- Every button uses a lasso read only through ink-core's `checkLookup`: the recognized words, and
  a rect on the page. A pasted selection's local rect places nothing and shows a toast ([#165](https://github.com/martonpaulo/ink-tools/issues/165));
  a recognition with no letter searches nothing and writes that the handwriting could not be read
  ([#166](https://github.com/martonpaulo/ink-tools/issues/166)).
- The definition and translation back-end is the shared `DictionaryProvider` in `ink-core`, built
  only in `src/dictionaries.ts`. Feature code never names a concrete source.
- Translation has no automatic direction: one button per direction, each with its own switch
  (owner, [#174](https://github.com/martonpaulo/supernote-tools/issues/174)); a new pair is one row of ink-core's `PAIRS`, which adds its two
  directions with no change here.
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
