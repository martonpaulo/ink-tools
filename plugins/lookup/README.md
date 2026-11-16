# Lookup

A Supernote plugin: write a word by hand, lasso it, and insert a picture, a photo, a short
definition or a translation for it. It is the next step of Ink2Pic, installed beside it, and it
takes over translation from the Lingo plugin.

**Status: beta, on test on the tablet.** Five lasso buttons, each with its switch in Settings:
«Insert illustration», «Insert photo», «Choose picture», «Insert definition» and «Insert
translation» ([#110](https://github.com/martonpaulo/supernote-tools/issues/110), [#158](https://github.com/martonpaulo/supernote-tools/issues/158)).

## What it will do

- Give each mode its own lasso button: insert illustration, insert photo, insert text, and «Choose
  picture», which opens the illustration and photo results to pick one.
- Rank pictures so real cases work, and remember the picture you chose for a word.
- Insert a short definition, a three-line bio or a topic summary from keyless, open sources.
- Translate a lassoed word for each language pair you turn on in Settings: Spanish – Portuguese
  and Chinese – Portuguese, from Wiktionary and Apertium.

## Built on

React Native + `sn-plugin-lib`, like `../bridge` and `../ink2pic`. The pure logic lives in
`../../packages/ink-core`.
