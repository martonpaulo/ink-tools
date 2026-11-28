# Language packs from public data: CLDR, Tatoeba and wiktextract

Status: research for [#484](https://github.com/martonpaulo/ink-tools/issues/484), 2026-11-28. It
compares the three sources the Clarify names, for a pack per language that no code per language
builds. The generic pipeline is `packages/puzzle-core/scripts/build_pack.py`; the Italian proof
runs on the Mac, since the cloud session's proxy refuses `downloads.tatoeba.org` and `kaikki.org`.

Marks: **[measured]** read or run in this session or in the Clarify's measurement of
2026-11-27; **[inference]** reasoned, not run.

## Contents

- [Answer in short](#answer-in-short)
- [The sources side by side](#the-sources-side-by-side)
- [What each feature needs](#what-each-feature-needs)
- [Unicode CLDR](#unicode-cldr)
- [Tatoeba](#tatoeba)
- [wiktextract on kaikki.org](#wiktextract-on-kaikkiorg)
- [Limits found](#limits-found)
- [Sources](#sources)

## Answer in short

- CLDR gives every language's grid letters and its folding with no code per language: its `index`
  set is the alphabet a grid shows, and its `Latin-ASCII` transform, with a language's own
  `<code>-ASCII` transform where one exists, folds every other letter. On today's five languages
  this gives the same letters as the four hand-written rules of `build_word_lists.py` (a check of
  15 words in this session, among them «coração», «Straße», «GROẞ», «niño» and «cœur») [measured].
- Tatoeba gives the word frequencies through one URL pattern for every language, keyed by an
  ISO 639-3 code (`.../per_language/ita/ita_sentences.tsv.bz2`) [measured, `words/sources.json`].
- wiktextract gives the dictionary, the clues and the tags the owner chose as the only filters:
  a proper noun is the part of speech `name`, an offensive word a sense tagged `vulgar` or
  `offensive` [inference, from the wiktextract JSON format].
- The three together are large (more than 750 MB for one language, below), so a pack is built off
  the tablet and the tablet downloads only the pack.

## The sources side by side

| | Unicode CLDR | Tatoeba | wiktextract (kaikki.org) |
| :--- | :--- | :--- | :--- |
| Gives | letters, folding, names, plurals | word frequencies | words, parts of speech, tags, glosses |
| Coverage | 657 locales with `characters.json`, 597 of them with an `index` set; 2 `-ASCII` transforms (`Latin-ASCII`, `de-ASCII`) among 375 [measured, CLDR 49] | every language with sentences on Tatoeba; the size varies widely [measured: English 23.8 MB, Italian 9.2 MB, Portuguese 6.1 MB compressed] | every language the English Wiktionary describes [measured: Italian 743 MB, Portuguese 582 MB JSONL] |
| Size | `cldr-misc-full` 8.5 MB, `cldr-transforms` 1.7 MB, `cldr-core` 3.5 MB unpacked [measured, npm 49.0.0]; CLDR common 32.6 MB [measured, Clarify] | per language, above | per language, above |
| Update cadence | two releases a year, version 49.0.0 on npm [measured] | a weekly export (`build_word_lists.py --refresh`) | rebuilt from Wiktionary dumps [inference]; pin each file by SHA-256 as `words/sources.json` does |
| Licence | Unicode License v3 (`Unicode-3.0`) | CC BY 2.0 FR | CC BY-SA 4.0 (Wiktionary's text) |
| Reached from the cloud | yes, npm registry [measured] | no, the proxy refuses it [measured, Clarify] | no, the proxy refuses it [measured, Clarify] |

## What each feature needs

| Feature | Needs | From |
| :--- | :--- | :--- |
| Word search | grid letters, folding, a word list by frequency, the words its filler avoids | CLDR `index` and transforms; Tatoeba counts; wiktextract `vulgar` and `offensive` tags |
| Crossword, arrowword | the same, and one short clue per word | the first gloss of the word's first sense that is not a proper noun |
| Dictionary in Lookup | common words offline, the rest online (Clarify, 2026-11-27) | the pack's words and glosses; online for the rest |
| Language registry | names, codes, letters, folding | CLDR, owned by [#500](https://github.com/martonpaulo/ink-tools/issues/500) |

## Unicode CLDR

- `main/<code>/characters.json` holds `exemplarCharacters` (the letters the language writes, such
  as `[aà b c … z]`), `auxiliary` (letters of loanwords) and `index` (the letters a list is sorted
  under, upper case, such as `[A B C … N Ñ O … Z]` for Spanish). The `index` set is the grid's
  alphabet: it keeps Ñ for Spanish and A to Z for Portuguese, French, German, English and
  Italian, as the current lists do [measured, CLDR 49].
- `transforms/Latin-ASCII.txt` maps each Latin letter to ASCII (`Æ → AE`, `ß → ss`, `œ → oe`) and
  removes combining marks after NFD; `de-ASCII.txt` first writes `ä` as `ae`. Folding upper-cases
  the word, keeps each letter of the `index` set, takes the language's own transform, then
  `Latin-ASCII`, then strips the marks. The title-case context rules (`{$AE} [:Lowercase:] → Ae`)
  give the same letters once the word is upper case, so the pipeline reads only the plain rules.
- The registry of [#500](https://github.com/martonpaulo/ink-tools/issues/500) should own this
  table, so the pipeline, Puzzles and picture search fold the same way; the pipeline reads the
  CLDR files directly until that registry lands.

## Tatoeba

- One export per language: `id`, language code, sentence text, tab-separated, bzip2 [measured,
  `build_word_lists.py`]. Only the count of sentences each word stands in is kept, never a
  sentence, as today.
- The export is keyed by ISO 639-3 (`ita`, `por`), not BCP 47: the code conversion is a boundary
  of the language registry ([#500](https://github.com/martonpaulo/ink-tools/issues/500)).
- A word with an apostrophe counts whole when Wiktionary has it, else each part does, which covers
  an elision such as «l'acqua» with no rule per language [inference; checked over a synthetic
  extract in `test_build_pack.py`].

## wiktextract on kaikki.org

- One JSON object per line: `word`, `pos`, `lang_code`, `senses` (each with `glosses` and `tags`)
  and `tags` [inference, from the wiktextract documentation].
- A word stays only when Wiktionary has an entry for it that is not a proper noun; this replaces
  SCOWL for English and the capitalisation guess of `proper_nouns` for every language (the
  Clarify, from [#479](https://github.com/martonpaulo/ink-tools/issues/479)).
- The kaikki extraction of the English Wiktionary glosses every language in English. A clue in the
  puzzle's own language needs that language's Wiktionary edition, which wiktextract also reads;
  which edition a pack takes is open, and the Mac task builds the Italian pack with the English
  one unless the owner chooses otherwise [inference].

## Limits found

- CLDR's `index` set is an alphabet only for alphabetic scripts: Japanese lists the kana rows
  (`[あ か さ た な は ま や ら わ]`) [measured, CLDR 49]. Chinese, Japanese and Thai need ICU word
  splitting and another grid model, as the Clarify says; the pipeline today serves languages whose
  `index` set is their letters.
- Each source keeps its licence: the pack's manifest lists each file with its SHA-256 and licence,
  apart from the Ink Tools code licence (Clarify, 2026-11-27). CC BY-SA 4.0 applies to the pack,
  which is a release asset, never a file of the repository.
- The sizes above mean a full build needs about 1 GB of disk for one language with English
  Wiktionary data [inference, from the measured sizes].

## Sources

- Unicode CLDR 49.0.0, npm packages `cldr-misc-full`, `cldr-transforms` and `cldr-core`,
  <https://github.com/unicode-org/cldr-json>, Unicode License v3.
- Tatoeba per-language exports, <https://downloads.tatoeba.org/exports/per_language/>, CC BY 2.0 FR.
- wiktextract, <https://github.com/tatuylonen/wiktextract>; its extractions on
  <https://kaikki.org>, CC BY-SA 4.0.
