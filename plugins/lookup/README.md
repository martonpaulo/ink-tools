# Lookup

A Supernote plugin: write a word by hand, lasso it, and insert a picture, a photo, a short
definition or a translation for it. It replaces Ink2Pic, which is retired and uninstalled from the
tablet ([#45](https://github.com/martonpaulo/supernote-tools/issues/45)), and it takes over translation from the retiring Lingo plugin ([#159](https://github.com/martonpaulo/supernote-tools/issues/159)).

**Status: beta, on test on the tablet.** Five lasso buttons, each with its switch in Settings:
«Insert illustration», «Insert photo», «Choose picture», «Insert definition» and «Insert
translation» ([#110](https://github.com/martonpaulo/supernote-tools/issues/110), [#158](https://github.com/martonpaulo/supernote-tools/issues/158)).

Versions follow SemVer with a numbered beta: a test build tagged `0.2.0-beta.3` on GitHub reads
`0.2.0 beta 3` on the tablet ([#155](https://github.com/martonpaulo/supernote-tools/issues/155)).

## What it does

- Give each mode its own lasso button: insert illustration, insert photo, insert definition, insert
  translation, and «Choose picture», which opens the results with Illustrations and Photos tabs to
  pick one ([#156](https://github.com/martonpaulo/supernote-tools/issues/156)). Still to come: insert text, a short summary or a three-line bio ([#114](https://github.com/martonpaulo/supernote-tools/issues/114)).
- Rank pictures so real cases work. Still to come: remember the picture you chose for a word
  ([#34](https://github.com/martonpaulo/supernote-tools/issues/34)).
- Insert a short definition from keyless, open sources.
- Translate a lassoed word for each language pair you turn on in Settings: Spanish – Portuguese
  and Chinese – Portuguese, from Wiktionary and Apertium.

## Built on

React Native + `sn-plugin-lib`, like `../bridge`. The pure logic lives in `../../packages/ink-core`
and `../../packages/picture-search`.
