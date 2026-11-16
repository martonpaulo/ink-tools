# Lookup

A Supernote plugin: write a word by hand, lasso it, and insert a picture, a photo or a short
definition for it. It is the next step of Ink2Pic, installed beside it.

**Status: scaffolded.** A plugin shell with a Settings entry only; the work is tracked in
[#110](https://github.com/martonpaulo/supernote-tools/issues/110).

## What it will do

- Give each mode its own lasso button: insert illustration, insert photo, insert text, and «Choose
  picture», which opens the illustration and photo results to pick one.
- Rank pictures so real cases work, and remember the picture you chose for a word.
- Insert a short definition, a three-line bio or a topic summary from keyless, open sources.

## Built on

React Native + `sn-plugin-lib`, like `../lingo`, `../bridge` and `../ink2pic`. The pure logic lives in
`../../packages/ink-core`.
