# Notice

`puzzle-core` is part of Ink Tools, licensed under CC BY-NC-SA 4.0 ([LICENSE](../../LICENSE)).
Its code is our own, written from the rules of each game. Its word lists in `words/` are built by
`scripts/build_word_lists.py` from the sources below; `words/sources.json` pins each file by its
URL and SHA-256 ([#381](https://github.com/martonpaulo/ink-tools/issues/381)). The repository
bundles no GPL code and no CC BY-SA data, so Wiktionary, kaikki.org, wordfreq's data, Lexique,
OdeNet and the Hunspell dictionaries are not used.

## Tatoeba sentences

The word frequencies of every list come from the [Tatoeba](https://tatoeba.org) sentence
exports, by Tatoeba's contributors, released under
[CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/). Only the number of sentences
each word stands in is used; no sentence is bundled. The lists are an adaptation: words were
counted, names and rare words removed, and letters folded to the grid's alphabet.

## SCOWL 2020.12.07

The English list keeps only words of SCOWL (Spell Checker Oriented Word Lists) sizes 10 to 50, by
Kevin Atkinson and the SCOWL contributors, <http://wordlist.aspell.net>. Its licence:

```text
Copyright 2000-2018 by Kevin Atkinson

Permission to use, copy, modify, distribute and sell these word
lists, the associated scripts, the output created from the scripts,
and its documentation for any purpose is hereby granted without fee,
provided that the above copyright notice appears in all copies and
that both that copyright notice and this permission notice appear in
supporting documentation. Kevin Atkinson makes no representations
about the suitability of this array for any purpose. It is provided
"as is" without express or implied warranty.
```

SCOWL's own `Copyright` file, in the pinned archive, lists the further sources its lists derive
from and their terms.

## List of Dirty, Naughty, Obscene and Otherwise Bad Words

The offensive words removed from each list come from the
[LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) lists
by Shutterstock and its contributors, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
They are read at build time only and are not bundled.

## SuperFun word-search banks

The English, German, French and Spanish word-search themes are taken from the word banks of
[SuperFun](https://github.com/AgP42/SuperFun) (`src/wordsearch.js`), folded to each grid's letters;
Spanish words get their Ñ back where the Spanish list has that spelling. Its licence:

```text
MIT License

Copyright (c) 2026 AgP42

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Ink Tools Portuguese themes

The Portuguese word-search themes, `words/themes-pt.source.json`, were written for this package
under the repository's licence, CC BY-NC-SA 4.0.
