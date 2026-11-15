# Lingo

A Supernote plugin: write a word by hand, lasso it, and insert its translation. Each language
pair is opt in; Portuguese with Spanish and Portuguese with Chinese come first.

**Status: scaffolded.** A plugin shell whose Settings turn each language pair on or off
([#126](https://github.com/martonpaulo/supernote-tools/issues/126)); the rest is tracked in
[#46](https://github.com/martonpaulo/supernote-tools/issues/46).

## What it will do

- Translate a lassoed word and insert the result on the page, with the same gesture as Ink2Pic.
- Use keyless, open sources: offline for common words, online when a word is missing.
- Let you turn each language pair on or off in the plugin's Settings.

## Built on

React Native + `sn-plugin-lib`, like `../bridge` and `../ink2pic`. The pure logic lives in
`../../packages/ink-core`.
