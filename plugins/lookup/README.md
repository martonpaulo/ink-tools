# Word Lookup

On the tablet this plugin is called **Word Lookup**; `lookup` stays its folder and internal name ([#176](https://github.com/martonpaulo/ink-tools/issues/176)).

A Supernote plugin: write a word by hand, lasso it, and insert a picture, a photo, a short
definition or a translation for it. It replaces Ink2Pic, which is retired and uninstalled from the
tablet ([#45](https://github.com/martonpaulo/supernote-tools/issues/45)), and it takes over translation from the retiring Lingo plugin ([#159](https://github.com/martonpaulo/supernote-tools/issues/159)).

**Status: beta, on test on the tablet.** Lasso buttons, each with its switch in Settings:
«Insert Sticker», «Insert Image», «Choose Image», «Insert Definition» and one «Translate ES→PT»
button per language direction ([#110](https://github.com/martonpaulo/supernote-tools/issues/110), [#167](https://github.com/martonpaulo/supernote-tools/issues/167), [#174](https://github.com/martonpaulo/supernote-tools/issues/174)).

Versions follow SemVer with a numbered beta: a test build tagged `0.2.0-beta.3` on GitHub reads
`0.2.0 beta 3` on the tablet ([#155](https://github.com/martonpaulo/supernote-tools/issues/155)).

## What it does

- Give each mode its own lasso button: «Insert Sticker» (a drawing), «Insert Image» (a photo),
  «Insert Definition», «Translate ES→PT» and its siblings, and «Choose Image», which opens the results with Illustrations and Photos tabs to
  pick one ([#156](https://github.com/martonpaulo/supernote-tools/issues/156)). Still to come: insert text, a short summary or a three-line bio ([#114](https://github.com/martonpaulo/supernote-tools/issues/114)).
- Rank pictures so real cases work. Still to come: remember the picture you chose for a word
  ([#34](https://github.com/martonpaulo/supernote-tools/issues/34)).
- Insert a short definition from keyless, open sources.
- Translate a lassoed word in the direction of the button you press, from Wiktionary and Apertium.
  Settings has one switch per direction (ES→PT, PT→ES, ZH→PT, PT→ZH); ES→PT, ZH→PT and PT→ZH
  start on.

## Built on

React Native + `sn-plugin-lib`, like `../bridge`. The pure logic lives in `../../packages/ink-core`
and `../../packages/picture-search`.
