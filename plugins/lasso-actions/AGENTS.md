# Lasso Actions — agent guidance

Scoped guidance for `plugins/lasso-actions/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Modules

Lasso Actions is Word Lookup renamed ([#306](https://github.com/martonpaulo/ink-tools/issues/306)): it keeps the `pluginID` `t2obvupqt3edmnrr` and the
`pluginKey` `Lookup` (also `package.json` and `app.json` `name`, the log prefix and `MyStyle/Lookup`),
so the tablet updates it in place and its private folder keeps its `settings.json`. `src/modules.ts`
is the module table; a module that is off registers no button (`moduleStates`, `activeLookup` for
Lookup's own switches). Lookup, Convert to Text, Headings and Collection are built, each in its own folder under `src/` (`src/convert/`, `src/headings/`, `src/collection/`), with button ids of its own (Headings from 2000, then Collection, then Convert to Text).
The settings file is `{version: 2, modules, lookup, collection}` (`src/settings.ts`); Word Lookup's file, with no `modules` key, is read whole as `lookup` and written once in the new shape at start-up; a module switch a newer build wrote is kept.

## Convert to Text

«Convert to Text» ([#250](https://github.com/martonpaulo/ink-tools/issues/250), from Smart Pen by [#306](https://github.com/martonpaulo/ink-tools/issues/306)): `src/convert/lasso.ts` makes the whole lasso one text box in one recognition and one page change, sized by ink-core's conversion entry; `src/convert/run.ts` toasts or holds the Error state. Smart Pen's «Undo Conversion» cannot undo it yet ([#525](https://github.com/martonpaulo/ink-tools/issues/525)).

## Headings

«Heading 1» to «Heading 4» ([#252](https://github.com/martonpaulo/ink-tools/issues/252)), no-view lasso buttons: `src/headings/levels.ts` maps each level
to a native title style (1 black, 2 shadow, 3 dark grey, 4 light grey) and places the heading on
its own line at the leading margin (`HEADING_MARGIN`, inferred until the device probe, Task 1 of
[#252](https://github.com/martonpaulo/ink-tools/issues/252), measures it), at the size Settings › «Heading Size» names, saved as
`headings.size` and read at each press (owner D90): «Own Size», the default, keeps the
handwriting's width; «Full Width» spans the writing width. `resizeLassoRect` scales the strokes to
the rect it gets, and a title's box is its strokes' box (device round 7), so «Full Width» stretches
the handwriting. `src/headings/run.ts` reads the lasso and the page size together, sets the title through
sn-adapter's `setLassoTitle`, lassoes its strokes again, then moves them with `resizeLassoRect`: a
move sent before the title in the same press was lost (device round 9). A failed title changes
nothing; a failed move keeps the title and says so.

## Collection

«Add to Collection» and «Cut to Collection» ([#249](https://github.com/martonpaulo/ink-tools/issues/249)), no-view lasso rows, write the lasso with
sn-adapter's `saveStickerByLasso` as one host sticker file in the private plugin folder, named
`collection-<seq>_<left>_<top>_<width>_<height>.sticker` (`src/collection/collection.ts`), so the
collection survives a restart with no index file; a cut deletes the lassoed ink only after the
write. «Paste Collection», a NOTE toolbar button, opens `src/ui/CollectionScreen.tsx`: the count,
Paste, Clear and «Keep After Paste» (saved as `collection.keepAfterPaste`, default off). Paste
(`src/collection/run.ts`) closes the plugin view, inserts each piece with `insertSticker` and moves
it with `resizeLassoRect` to its place, asked again at once, up to twice the slowest wait measured, while NOTE has not
lassoed the piece yet (904; a timer never fired with the view closed, device round 9), sends the move again while NOTE may not have readied the piece (it ignores an early one), then saves the note, which lays the piece on the page before the next paste could drop it, the group shifted onto the page as one, lassoes
the union with `lassoElements`, then empties the collection unless kept, and keeps it whole when
the union lasso fails, the one check that the pieces are on the page (device round 9 lost the
first of two pieces); a failed piece stops the
paste, keeps the collection and logs the call that failed. With the view in front no lasso call
reached a pasted piece (device rounds 6 and 7). The host behaviours it rests on (a second paste, the union lasso taking ink already
there) are Task 1 of [#249](https://github.com/martonpaulo/ink-tools/issues/249); its device round is open.

## Lookup

**Lasso buttons** over a Settings view ([#110](https://github.com/martonpaulo/supernote-tools/issues/110), [#111](https://github.com/martonpaulo/supernote-tools/issues/111), [#115](https://github.com/martonpaulo/supernote-tools/issues/115)), built to `Lookup.snplg`
with its native `app.npk`; the device round of the picture buttons is still open. The picture
search, pixel measures, file store, settings store and «Insert best picture» flow are
`../../packages/picture-search` ([#125](https://github.com/martonpaulo/supernote-tools/issues/125), [#142](https://github.com/martonpaulo/supernote-tools/issues/142)); the retired plugin's library and picks
were not carried over (D40 B). Its search lab is `lab/` ([#63](https://github.com/martonpaulo/ink-tools/issues/63), [#288](https://github.com/martonpaulo/ink-tools/issues/288)).
Button names follow the wording of Supernote's own lasso menu, a verb and a noun in title case
(owner, [#167](https://github.com/martonpaulo/supernote-tools/issues/167)). `src/modes.ts` owns the two picture modes, «Insert Sticker» (illustration) and «Insert Image» (photo): button ids from
1000, Settings keys and search style, with the measured split `keepMode` in the shared package
([#111](https://github.com/martonpaulo/supernote-tools/issues/111)). `src/pictures.ts` runs each as a no-view press over picture-search's shared
«Insert best picture» flow, with the mode's sources and style; only the mode's measured tiles stay,
and a press that inserts nothing writes its sentence below the word. A written line searches the longest trailing word group that is a Wikipedia article, else its last word (picture-search's `resolvePhrase`, one request), and the picture goes below those words, their share of the lasso by characters (`wordsRect`, [#18](https://github.com/martonpaulo/ink-tools/issues/18)). Pictures go to
`pictures/` of the private plugin folder, out of Supernote file sync, and are reused from there
through `pictures.json` (`src/library.ts`, [#23](https://github.com/martonpaulo/ink-tools/issues/23)); a failed insert from there is tried once from
`MyStyle/Lookup/pictures`, and Settings names the old synced folders still holding files, never one
that holds a picture `pictures.json` lists ([#219](https://github.com/martonpaulo/ink-tools/issues/219)). They
go in at the owner's one small size, 200 px, below the word; Settings
keeps only Picture sources and Data saver for pictures, which `modeSearchSettings` reads
([#105](https://github.com/martonpaulo/ink-tools/issues/105)).
«Insert Sticker» pastes a sticker made of pen strokes, since the tablet refuses a picture as a
sticker (error 205, owner D62 A, [#35](https://github.com/martonpaulo/ink-tools/issues/35)): picture-search's `insert/strokes.ts` takes the
outlines of a Commons SVG original, else traces the prepared picture's ink mask (`readInkMask`),
within a 600-point budget, and `insert/sticker.ts` writes them through `convertElement2Sticker`
and `insertSticker`; a failure inserts the picture. Its device round is open.
«Insert Definition» ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)), moved here from the retired picture plugin: `src/definition.ts` reads the lasso,
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
Each button follows its Settings switch (`src/buttons.ts`); the switches live in `settings.json`
in the private plugin folder, moved once from `MyStyle/Lookup/` or its newest `_CONFLICT_` copy
([#22](https://github.com/martonpaulo/ink-tools/issues/22), picture-search's settings store) (`src/settings.ts`) with the `directions` map, the picture modes on
by default, the definition off, the summary on, ES→PT, ZH→PT and PT→ZH on, PT→ES off. `src/profile.ts`
is Lookup's entry into picture-search's file store and insert tier ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)): folder
`MyStyle/Lookup`, native modules `LookupFiles` and `LookupImage`, registered by
`native/com/lookup/files/LookupFilesPackage.java`, which `scripts/native-build.cjs` compiles with the
package's Java into `app.npk`.
The page read for the free band stops at its 1.5 s budget: on a 540-stroke page beta 24 read 68 of
540 elements and inserted at today's place; on a page of 24 elements the read took 395 ms and the
insert went in the free band (measured, 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214), [#221](https://github.com/martonpaulo/ink-tools/issues/221)).

## What it is

Write a word, lasso it, insert a picture, a photo, a short definition or a translation. It is the evolution of
the retired picture plugin and the planned definition mode. Scope and pains: `../../docs/plugin-scope.md`
(section `lookup`). Layers: `../../docs/architecture.md`.

## Rules

- `lookup` is a new plugin with its own `pluginID`, never the retired picture plugin renamed (owner
  D40, [#110](https://github.com/martonpaulo/supernote-tools/issues/110), `../../docs/decisions.md`).
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
  directions with no change here except its two icons.
- Each lasso button registers its own icon, distinct in silhouette ([#107](https://github.com/martonpaulo/ink-tools/issues/107)): `assets/<name>.svg`
  and its 96 x 96 PNG (owner D43 A) are written by `python3 scripts/icons.py` from
  `design/icons/icons.json` in the Supernote's native outline style ([#271](https://github.com/martonpaulo/ink-tools/issues/271)); each file is named once
  in `src/icons.ts`; `__tests__/icons.test.ts` fails for a button with no icon, such as a new direction's.
  `design/icons/sheet.png` shows every Ink Tools icon side by side.
- Permissions: `plugin.permission.INTERNET` for the dictionary and the picture sources,
  `plugin.permission.FILE:READ` for the lasso calls ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)) and `plugin.permission.FILE:WRITE`
  for the settings file and the prepared pictures ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)); add another only with its first call
  ([#83](https://github.com/martonpaulo/supernote-tools/issues/83) is the same rule for Bridge).
- Every file, settings and insert call goes through `src/profile.ts`, which sets Lookup's
  PluginProfile first; never import `@ink-tools/picture-search/storage` or `/insert` elsewhere.
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../../docs/research/plugin-brief/brief.md`.

## Reuse

Scaffold copied from `../lingo`, which took it from `../account-sync` and the first plugin (same runtime,
build and release shape).
