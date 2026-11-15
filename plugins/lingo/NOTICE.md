# Notice

Lingo is MIT-licensed ([LICENSE](LICENSE)). It ships third-party data:

| Project | License | What Lingo uses | Details |
| --- | --- | --- | --- |
| [CC-CEDICT](https://cc-cedict.org/wiki/) of 2026-01-04, from the npm tarball `cc-cedict` 1.1.1 | CC-BY-SA-4.0 | Simplified words and their pinyin, in the pinyin index the ZH buttons read | [ink-core's notice](../../packages/ink-core/NOTICE.md#cc-cedict) |

The pinyin index, `packages/ink-core/src/data/pinyin-index.json`, is bundled into `Lingo.snplg`
through `@supernote-tools/ink-core/pinyin-data` ([#128](https://github.com/martonpaulo/supernote-tools/issues/128),
[#129](https://github.com/martonpaulo/supernote-tools/issues/129)). As an adaptation of CC-CEDICT
by MDBG and the CC-CEDICT contributors, it is under CC BY-SA 4.0
(<https://creativecommons.org/licenses/by-sa/4.0/>); ink-core's notice says what was taken and
changed.

Translations come from Wiktionary and Apertium at lookup time and are not shipped. A text box ends
with the source that answered, `(Wiktionary)` or `(Apertium)`: Wiktionary's text is CC BY-SA.
