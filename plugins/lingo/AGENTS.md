# Lingo — agent guidance

Scoped guidance for `plugins/lingo/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Translates on the note** ([#128](https://github.com/martonpaulo/supernote-tools/issues/128)): each direction of a pair switched on in Settings
has its own lasso button (`ES→PT`, `PT→ES`, …, `src/buttons.ts`), run with no view: the lassoed word
is recognized, a ZH input read through the CC-CEDICT pinyin index ([#129](https://github.com/martonpaulo/supernote-tools/issues/129)), translated through
`src/dictionaries.ts` (Wiktionary, then Apertium) and inserted as a text box beside the word
(`src/translate.ts`); a word with no translation says so on the note. The pure parts live in
`../../packages/ink-core`. Still to come: Settings that survive a restart (in memory until
[#40](https://github.com/martonpaulo/supernote-tools/issues/40)'s storage), the offline word list, and the device round of
[#128](https://github.com/martonpaulo/supernote-tools/issues/128) (one button per pair, the text box, tone marks from recognition).

## What it is

Write a word, lasso it, insert its **translation**. Scope and real uses:
`../../docs/plugin-scope.md` (sections `lingo` and the shared dictionary engine). Layers:
`../../docs/architecture.md`.

## Rules

- Each language pair is one Settings toggle for both directions, off by default. A new pair is one
  row of `PAIRS` in `ink-core`; the plugin code does not change.
- The translation back-end is a `DictionaryProvider`. Feature code never names a concrete source.
- Permissions: `plugin.permission.INTERNET` for the online dictionaries, asked in Settings when a
  pair turns on; a file permission only with the first file call ([#83](https://github.com/martonpaulo/supernote-tools/issues/83) is the same rule for Bridge).
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../ink2pic/docs/brief.md`.

## Reuse

Scaffold and patterns come from `../bridge`, which took them from `../ink2pic` (same runtime, build
and release shape).
