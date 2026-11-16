# Notice

`ink-core` is MIT-licensed, as the repository is ([LICENSE](../../LICENSE)). It ships third-party data:

| Project | License | What `ink-core` uses | Details |
| --- | --- | --- | --- |
| [CC-CEDICT](https://cc-cedict.org/wiki/) of 2026-01-04, from the npm tarball `cc-cedict` 1.1.1 | CC-BY-SA-4.0 | Simplified words and their pinyin, in the shipped pinyin index | [below](#cc-cedict) |
| [Wiktionary](https://www.wiktionary.org/) pages pt «maçã» and es «manzana» | CC-BY-SA-4.0 | Test fixtures only, never shipped | [below](#wiktionary-test-fixtures) |

## CC-CEDICT

`src/data/pinyin-index.json` is built by `scripts/build-pinyin-index.cjs` from
`https://registry.npmjs.org/cc-cedict/-/cc-cedict-1.1.1.tgz`, pinned to its SHA-256 in the script
([#129](https://github.com/martonpaulo/supernote-tools/issues/129)). The tarball's code is MIT; its
`data/simplified.js` is CC-CEDICT by MDBG and the CC-CEDICT contributors, CC BY-SA 4.0
(<https://creativecommons.org/licenses/by-sa/4.0/>). Taken: each simplified word made only of
Chinese characters, and its readings. Changed: readings lowercased, tones kept as digits, `u:`
written `v`, grouped by their toneless spelling and ranked; the English definitions left out. The
index, as an adaptation of this data, is under CC BY-SA 4.0 too. A plugin that imports
`src/pinyin-data.ts` ships the index and lists it in its own `NOTICE.md`.

## Wiktionary test fixtures

`__tests__/fixtures/wiktionary-pt-recorded.json` and `wiktionary-es-recorded.json` are the MediaWiki
`action=parse` answers for pt.wiktionary «maçã» (revision 3188657) and es.wiktionary «manzana»
(revision 6383798), recorded unchanged on 2026-11-16 ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)). The text is by the Wiktionary
contributors under CC BY-SA 4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>); the page
history names them. The fixtures are only read by tests and are not part of any plugin build.
