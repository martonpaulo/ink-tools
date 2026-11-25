# Notice

picture-search is licensed under CC BY-NC-SA 4.0, as all of Ink Tools ([LICENSE](../../LICENSE)). It
ships third-party data, and every plugin that bundles it ships that data too
([#288](https://github.com/martonpaulo/ink-tools/issues/288)):

| Project | License | What picture-search uses | Details |
| --- | --- | --- | --- |
| [OpenMoji](https://github.com/hfg-gmuend/openmoji) 17.0.0, `data/openmoji.json` at `f9fc506` | CC-BY-SA-4.0 | The symbols' names and keywords in the shipped index; the pictures, fetched at search time | [below](#openmoji-and-keyword-data) |
| [emojilib](https://github.com/muan/emojilib) 4.0.3, `dist/emoji-en-US.json` at `b4da694` | MIT | English keywords in the OpenMoji index | [below](#openmoji-and-keyword-data) |
| [CLDR annotations](https://github.com/unicode-org/cldr-json) 49.0.0, `cldr-annotations-full` pt, es, zh at `a4b6724` | Unicode-3.0 | Portuguese, Spanish and Chinese names and keywords in the OpenMoji index | [below](#openmoji-and-keyword-data) |

## OpenMoji and keyword data

`packages/picture-search/src/data/openmoji-index.json` is built by `scripts/build-openmoji-index.cjs` of this package from
these files, each pinned to a commit and a SHA-256 in the script ([#67](https://github.com/martonpaulo/ink2pic/issues/67)):

- `https://raw.githubusercontent.com/hfg-gmuend/openmoji/f9fc506a3f913be9897ab0181d611d4c910a4104/data/openmoji.json`:
  OpenMoji 17.0.0 by HfG Schwäbisch Gmünd and the OpenMoji contributors, CC BY-SA 4.0
  (<https://creativecommons.org/licenses/by-sa/4.0/>). Taken: hexcode, annotation, tags,
  openmoji_tags and group. Changed: folded to lowercase without accents; flags, skin tones, the
  «man» and «woman» twins and the OpenMoji and Unicode extras (brand logos among them) left out.
  The OpenMoji index adapts this data, so CC BY-SA 4.0 covers it as well.
- `https://raw.githubusercontent.com/muan/emojilib/b4da69426d5dc6e8c8c02c09b163ff3e7160b316/dist/emoji-en-US.json`:
  emojilib 4.0.3, MIT, copyright (c) Mu-An Chiou. Taken: the keywords, folded.
- `https://raw.githubusercontent.com/unicode-org/cldr-json/a4b67247b446fd51b475991017a2481911210c60/cldr-json/cldr-annotations-full/annotations/<pt|es|zh>/annotations.json`:
  Unicode CLDR 49.0.0, Unicode License V3, copyright (c) 1991-2026 Unicode, Inc.
  (<https://www.unicode.org/license.txt>). Taken: each emoji's name (`tts`) and keywords
  (`default`), folded.

The pictures, `https://raw.githubusercontent.com/hfg-gmuend/openmoji/f9fc506a3f913be9897ab0181d611d4c910a4104/black/618x618/<HEX>.png`
at the same pinned commit as the keywords, recorded as `pictures` in the index and checked by `--check`
([#99](https://github.com/martonpaulo/ink2pic/issues/99)), are OpenMoji's, CC BY-SA 4.0: each result and each saved picture records the credit «OpenMoji» and
the license.
