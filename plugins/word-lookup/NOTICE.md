# Notice

Lookup is MIT-licensed ([LICENSE](LICENSE)). It ships third-party data:

| Project | License | What Lookup uses | Details |
| --- | --- | --- | --- |
| [CC-CEDICT](https://cc-cedict.org/wiki/) of 2026-01-04, from the npm tarball `cc-cedict` 1.1.1 | CC-BY-SA-4.0 | Simplified words and their pinyin, in the pinyin index «Insert translation» reads for a ZH input | [ink-core's notice](../../packages/ink-core/NOTICE.md#cc-cedict) |
| [OpenMoji](https://github.com/hfg-gmuend/openmoji) 17.0.0 | CC-BY-SA-4.0 | The symbols' names and keywords in picture-search's OpenMoji index; the pictures, fetched at search time | [Ink2Pic's notice](../ink2pic/NOTICE.md#openmoji-and-keyword-data) |
| [emojilib](https://github.com/muan/emojilib) 4.0.3 | MIT | English keywords in the OpenMoji index | [Ink2Pic's notice](../ink2pic/NOTICE.md#openmoji-and-keyword-data) |
| [CLDR annotations](https://github.com/unicode-org/cldr-json) 49.0.0 | Unicode-3.0 | Portuguese, Spanish and Chinese names and keywords in the OpenMoji index | [Ink2Pic's notice](../ink2pic/NOTICE.md#openmoji-and-keyword-data) |

The pinyin index, `packages/ink-core/src/data/pinyin-index.json`, is bundled into `Lookup.snplg`
through `@supernote-tools/ink-core/pinyin-data` ([#158](https://github.com/martonpaulo/supernote-tools/issues/158)). As an
adaptation of CC-CEDICT by MDBG and the CC-CEDICT contributors, it is under CC BY-SA 4.0
(<https://creativecommons.org/licenses/by-sa/4.0/>); ink-core's notice says what was taken and
changed.

The OpenMoji index, `packages/picture-search/src/data/openmoji-index.json`, is bundled through
picture-search for the picture buttons ([#125](https://github.com/martonpaulo/supernote-tools/issues/125)). Definitions and translations come from
Wiktionary and Apertium at lookup time and are not shipped. A text box ends with the source that
answered, `(Wiktionary)` or `(Apertium)`: Wiktionary's text is CC BY-SA.
