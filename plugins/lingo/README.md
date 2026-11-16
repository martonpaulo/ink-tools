# Lingo

A Supernote plugin: write a word by hand, lasso it, and insert its translation. Each language
pair is opt in; Portuguese with Spanish and Portuguese with Chinese come first.

**Status: retiring.** Translation is now Lookup's «Insert translation» lasso button, with the
language pairs in Lookup's Settings ([#158](https://github.com/martonpaulo/supernote-tools/issues/158)). This plugin gets no new work. It is
uninstalled from the tablet, and this folder removed, once Lookup's translation passes on the
device ([#159](https://github.com/martonpaulo/supernote-tools/issues/159)). The name Lingo now belongs to the sideloaded app that switches the
handwriting language ([#160](https://github.com/martonpaulo/supernote-tools/issues/160)).

## What it will do

- Translate a lassoed word and insert the result on the page, with the same gesture as Ink2Pic.
- Use keyless, open sources: offline for common words, online when a word is missing.
- Let you turn each language pair on or off in the plugin's Settings.

## Built on

React Native + `sn-plugin-lib`, like `../bridge` and `../ink2pic`. The pure logic lives in
`../../packages/ink-core`.
