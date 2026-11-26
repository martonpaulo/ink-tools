# Paper games for a Supernote Manta note-template generator

Research report, 2026-11-26. Scope: every pen-and-paper game or puzzle that a generator could put on a
Supernote Manta page, what already exists for the Supernote and other e-ink tablets, and the gaps.

Status of this work: input for the Puzzles plugin, approved by the owner on 2026-11-26
([`plugin-scope.md` › Puzzles](../plugin-scope.md#puzzles), [#376](https://github.com/martonpaulo/ink-tools/issues/376)); it replaced the parked note
templates of [#141](https://github.com/martonpaulo/ink-tools/issues/141). Where this report differs from the owner's design of 2026-11-26, the design
wins: answers never go on a note page (no answer page or upside-down answer; building block 7 is
not built), and each game is a new page after the current one with its grid as the background.

## Contents

1. [Device constraints that shape every choice](#1-device-constraints)
2. [How to read the tables](#2-how-to-read-the-tables)
3. [Logic and number grids](#3-logic-and-number-grids)
4. [Word games](#4-word-games)
5. [Two-player pen games](#5-two-player-pen-games)
6. [Mazes and path puzzles](#6-mazes-and-path-puzzles)
7. [Drawing puzzles](#7-drawing-puzzles)
8. [Maths puzzles](#8-maths-puzzles)
9. [Excluded games and why](#9-excluded-games)
10. [What already exists for the Supernote](#10-what-already-exists-for-the-supernote)
11. [What people do on other e-ink tablets](#11-other-e-ink-tablets)
12. [Gaps our generator could fill](#12-gaps)
13. [Ranked shortlist: the 20 to build first](#13-ranked-shortlist)
14. [Shared building blocks](#14-shared-building-blocks)
15. [Licensing risks](#15-licensing-risks)
16. [Sources](#16-sources)

---

## 1. Device constraints

- **Page.** 1920 x 2560 px at 300 ppi, 10.7-inch Carta 1300 panel, 16 greys, no front light
  ([Supernote Manta](https://supernote.com/products/supernote-manta)). One millimetre is 11.8 px.
  The page is 162.6 x 216.7 mm; with margins, the usable area is about 150 x 200 mm.
- **Cell sizes for pen input.**
  - A handwritten digit or letter needs a cell of 7 mm (83 px) at the least; 10 to 15 mm is
    comfortable, and 15 mm leaves room for sudoku candidates (pencil marks).
  - A shading mark (fill, dot, cross) works down to 5 to 6 mm.
  - So the largest grids are about 21 x 28 cells at 7 mm, 15 x 20 cells at 10 mm, and 10 x 13 cells at
    15 mm.
- **Greys.** Use only the 16 native levels (multiples of 17: 0x00, 0x11 … 0xFF) so the panel does
  not dither. Givens in black, grid lines in dark grey, region shading (sudoku boxes, cages,
  arrowword clue cells) in a light grey that ink still reads over.
- **No animation, no timer.** Every game must be static or turn-based.
- **Erasing.** Games that need many corrections (heavy candidate notes, moving pieces) fit worse.
  If the puzzle is the page background (a template) or an inserted picture, erasing ink should not
  damage the grid (to verify on the device).
- **What the plugin API already gives** (from [`docs/supernote.md`](../supernote.md), measured):
  - `getElements` returns stroke points in page pixels, so strokes can be mapped to cells without
    recognition.
  - `recognizeElements` converts strokes to text in 0.9 to 2.6 s per call, in the device's
    handwriting language, with no language parameter.
  - A PNG under `MyStyle/` can be inserted as a picture (`insertPageElements` with a picture
    element, or `PluginNoteAPI.insertImage`), and `insertNotePage` adds a page from a system
    template.
  - Strokes can be inserted, so the plugin can draw marks (a circle on a wrong cell, a hint digit).
- **Runtime.** Plugins run in React Native on PluginHost. Hermes, the usual React Native engine, is
  not known to run WebAssembly (to verify on PluginHost), so C generators such as Tatham's would be
  ported to TypeScript or run at build time on a computer.

## 2. How to read the tables

- **Pl:** 1 = solo, 2 = two players (passing the tablet, or the plugin as the opponent).
- **Generation:** E = easy, M = medium, H = hard. "U" = a solver can prove a unique solution.
  "n/a" = no single solution (a game, not a puzzle). Known code is named with its licence.
- **Words:** what language data is needed.
- **E-ink and pen:** a fitting grid size on the Manta page, and how much erasing it needs.
- **Check:**
  - A = an answer page makes sense.
  - Ci = the plugin can check by ink presence per cell, edge or path, with no recognition.
  - Cr = checking needs handwriting recognition (digits or letters).
  - — = no answer to check.
- **Val:** value for a Supernote user, 1 (niche) to 3 (build first).
- Tatham = [Simon Tatham's Portable Puzzle Collection](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/),
  MIT; each of its games has a generator with uniqueness and difficulty levels.
- Nikoli = the genre is on [Nikoli's puzzle list](https://www.nikoli.co.jp/en/puzzles/).

---

## 3. Logic and number grids

### 3.1 Sudoku and Latin-square family

| # | Game (local names) | Pl | Generation and uniqueness | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 1 | Sudoku (Number Place; 数独 Sūdoku; same name in PT, ES, DE, FR) | 1 | E, U. [tdoku](https://github.com/t-dillon/tdoku) BSD-2-Clause (solver and generator); Tatham Solo MIT (generator with difficulty grades); [QQwing](https://ostermiller.org/qqwing/about.html) GPL-2.0-or-later | none | 9 x 9 at 15 mm; candidates fit; light erasing | A, Cr (digits) | 3 |
| 2 | Mini sudoku 4 x 4 and 6 x 6 (for children) | 1 | E, U; same code with smaller boxes | none | 20 to 25 mm cells, very readable | A, Cr | 2 |
| 3 | Large sudoku 12 x 12 and 16 x 16 (Hexadoku, Super Sudoku) | 1 | M, U; Tatham Solo handles other box sizes | none | 16 x 16 at 9 mm; letters A-G or two-digit numbers | A, Cr | 2 |
| 4 | Jigsaw sudoku (Irregular, Nonomino, Puzzle sudoku) | 1 | M, U; Tatham Solo "jigsaw" mode | none | 9 x 9; regions drawn as thick lines or grey | A, Cr | 3 |
| 5 | Killer sudoku (Sum sudoku; Samunamupure) | 1 | M, U; Tatham Solo "killer" mode | none | 9 x 9 at 15 mm; dashed cages in grey, small sums | A, Cr | 3 |
| 6 | Sudoku X (Diagonal sudoku) | 1 | E, U; add the diagonal rule to the solver | none | 9 x 9; diagonals in light grey | A, Cr | 2 |
| 7 | Hyper sudoku (Windoku, NRC sudoku) | 1 | E, U | none | 9 x 9; four extra grey boxes | A, Cr | 1 |
| 8 | Samurai sudoku (Gattai-5, Sudoku Samurai) | 1 | M, U; overlapping solver | none | 21 x 21 at 7 mm: tight, no candidates | A, Cr | 2 |
| 9 | Kropki sudoku (dots: consecutive or double) | 1 | M, U; constraint solver | none | 9 x 9; white and black dots on edges | A, Cr | 2 |
| 10 | Thermo sudoku | 1 | M, U | none | 9 x 9; grey thermometers | A, Cr | 2 |
| 11 | Arrow sudoku | 1 | M, U | none | 9 x 9; grey arrows | A, Cr | 1 |
| 12 | Sandwich sudoku | 1 | M, U | none | 9 x 9 with outside clues | A, Cr | 2 |
| 13 | Anti-knight and anti-king sudoku | 1 | M, U | none | 9 x 9 | A, Cr | 1 |
| 14 | Greater-than sudoku (Comparison sudoku) | 1 | M, U | none | 9 x 9 with signs between cells | A, Cr | 1 |
| 15 | Even-odd sudoku | 1 | E, U | none | 9 x 9; grey circles or squares | A, Cr | 1 |
| 16 | Futoshiki (Unequal; 不等式 futōshiki) | 1 | E, U; Tatham Unequal | none | 5 x 5 to 7 x 7 at 15 mm | A, Cr | 3 |
| 17 | Calcudoku (KenKen and KenDoku are trademarks; MathDoku, Inky) | 1 | M, U; Tatham Keen | none | 4 x 4 to 7 x 7; cages with operator | A, Cr | 3 |
| 18 | Skyscrapers (Towers, Building puzzle; 摩天楼) | 1 | M, U; Tatham Towers | none | 4 x 4 to 7 x 7 with outside clues | A, Cr | 3 |
| 19 | Str8ts (trademark, to verify) / Straights | 1 | M, U; no known open generator | none | 9 x 9 with black cells | A, Cr | 2 |
| 20 | Suguru (Tectonic, Number Blocks; Nanbā burokku) | 1 | M, U; constraint solver | none | 6 x 6 to 9 x 9; region borders | A, Cr | 3 |
| 21 | Ripple Effect (Hakyū kōka) | 1 | M, U; Nikoli | none | 8 x 8 to 10 x 10 | A, Cr | 2 |
| 22 | Fillomino (Allied Occupation) | 1 | M, U; Tatham Filling | none | 8 x 8 to 12 x 12; draw borders or write digits | A, Cr | 2 |
| 23 | Makaro | 1 | M, U; Nikoli | none | 8 x 8 with arrows | A, Cr | 1 |
| 24 | Inshi no heya (Factor rooms) | 1 | M, U; Nikoli | none | 5 x 5 to 7 x 7 | A, Cr | 1 |
| 25 | Mainarizumu | 1 | M, U; Nikoli | none | 5 x 5 to 7 x 7 | A, Cr | 1 |
| 26 | Hidato (trademark; generic: Hidoku, Number snake) | 1 | M, U; path search; Tatham Signpost is related | none | 8 x 8 to 10 x 10 | A, Cr | 2 |
| 27 | Numbrix (trademark; orthogonal Hidato) | 1 | M, U | none | 9 x 9 | A, Cr | 1 |
| 28 | Sujiko | 1 | E, U | none | 3 x 3 with sum circles | A, Cr | 1 |
| 29 | Survo puzzle | 1 | M, U | none | 3 x 4 to 4 x 5 | A, Cr | 1 |

### 3.2 Shading and placement grids (no digits to write, so ink-checkable)

| # | Game (local names) | Pl | Generation and uniqueness | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 30 | Nonogram (Picross is a Nintendo trademark; Griddlers, Hanjie, Paint by Numbers, Illust-Logic, Nonogramm DE, Nonograma PT/ES, Logimage FR) | 1 | M. Random grids: Tatham Pattern MIT, U. Picture grids need source art, then a uniqueness check: [nonny](https://github.com/gkikola/nonny) GPL-3.0+, [pbnsolve](https://github.com/mikix/nonogram-db) (licence to verify), the `nonogram` Rust crate MIT | none | 15 x 15 at 8 mm, 20 x 20 at 6 mm, plus clue margins; fill or cross | A, Ci | 3 |
| 31 | Binairo (Takuzu, Binero, Binary puzzle, 0h h1; Tatham Unruly) | 1 | E, U; Tatham Unruly | none | 8 x 8 to 12 x 12; write 0/1 or shade for 1 | A, Ci if 1 = shaded, else Cr | 3 |
| 32 | Star Battle (Two Not Touch) | 1 | M, U; constraint solver | none | 8 x 8 to 10 x 10; draw a dot or star | A, Ci | 3 |
| 33 | Tents (Tents and Trees, Zeltlager DE) | 1 | E, U; Tatham Tents | none | 8 x 8 to 12 x 12; tree icons in grey | A, Ci | 3 |
| 34 | Battleship solitaire (Bimaru, Yubotu, Schiffe versenken solitaire) | 1 | M, U; constraint solver | none | 10 x 10 with row and column counts | A, Ci | 3 |
| 35 | Hitori (Tatham Singles) | 1 | E, U; Tatham Singles | none | 6 x 6 to 10 x 10; shade cells | A, Ci | 3 |
| 36 | Light Up (Akari, Bijutsukan) | 1 | M, U; Tatham Light Up | none | 7 x 7 to 12 x 12; draw a dot for a bulb | A, Ci | 3 |
| 37 | Fill-a-Pix (Mosaic; Tatham Mosaic) | 1 | E, U; Tatham Mosaic | none | 15 x 15 to 20 x 20; shade; a picture appears | A, Ci | 3 |
| 38 | Static minesweeper (mark the mines from numbers) | 1 | M, U; Tatham Mines' generator gives a no-guess board | none | 10 x 10 to 16 x 16 | A, Ci | 2 |
| 39 | Nurikabe (Cell Structure) | 1 | M, U; Nikoli | none | 7 x 7 to 10 x 10; shade | A, Ci | 3 |
| 40 | Heyawake | 1 | M, U; Nikoli | none | 8 x 8 to 10 x 10 with rooms | A, Ci | 2 |
| 41 | LITS (Nuruomino) | 1 | M, U; Nikoli | none | 8 x 8 to 10 x 10 with regions | A, Ci | 2 |
| 42 | Norinori | 1 | M, U; Nikoli | none | 8 x 8 to 10 x 10 | A, Ci | 2 |
| 43 | Aquarium | 1 | M, U | none | 6 x 6 to 10 x 10 | A, Ci | 2 |
| 44 | Thermometers (Thermo puzzle) | 1 | M, U | none | 6 x 6 to 10 x 10 | A, Ci | 2 |
| 45 | Kuromasu / Kurodoko (Tatham Range) | 1 | M, U; Tatham Range | none | 7 x 7 to 10 x 10 | A, Ci | 2 |
| 46 | Yajilin (Arrow Ring) | 1 | H, U; Nikoli | none | 8 x 8 to 10 x 10; shade plus a loop | A, Ci | 2 |
| 47 | Kakurasu | 1 | E, U | none | 5 x 5 to 7 x 7 | A, Ci | 2 |
| 48 | Magnets (Tatham Magnets) | 1 | M, U; Tatham Magnets | none | 6 x 6 to 8 x 8; write + and − | A, Cr | 1 |
| 49 | Undead (Tatham Undead) | 1 | M, U; Tatham Undead | none | 5 x 5 to 7 x 7; write G, V, Z | A, Cr | 1 |
| 50 | Statue Park | 1 | H, U | none | 8 x 8 to 10 x 10 | A, Ci | 1 |
| 51 | Kurotto, Shakashaka, Choco Banana, Moon-or-Sun, Nurimisaki, Tilepaint (smaller Nikoli shading genres) | 1 | M to H, U; no open generators known; [pzprjs](https://github.com/robx/pzprjs) MIT has rule checkers | none | 8 x 8 to 10 x 10 | A, Ci | 1 |

### 3.3 Region, loop and link grids

| # | Game (local names) | Pl | Generation and uniqueness | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 52 | Slitherlink (Fences, Loopy, Takegaki; Surizā rinku) | 1 | M, U; Tatham Loopy, also on hex and other lattices | none | 10 x 10 to 15 x 15 dots; draw the loop | A, Ci (edges) | 3 |
| 53 | Masyu (Pearl; Tatham Pearl) | 1 | M, U; Tatham Pearl | none | 8 x 8 to 12 x 12; black and white pearls | A, Ci | 3 |
| 54 | Numberlink (Arukone; Flow Free is a trademark) | 1 | M; uniqueness needs a solver (SAT or search) | none | 7 x 7 to 12 x 12; draw paths | A, Ci | 3 |
| 55 | Hashiwokakero (Bridges, Hashi, Brücken DE) | 1 | M, U; Tatham Bridges | none | 7 x 7 to 13 x 13 circles; draw single or double bridges | A, Ci | 3 |
| 56 | Shikaku (Rectangles, Divide by Squares) | 1 | E, U; Tatham Rectangles | none | 8 x 8 to 15 x 15; draw rectangles | A, Ci | 3 |
| 57 | Tentai Show (Galaxies, Spiral Galaxies) | 1 | M, U; Tatham Galaxies | none | 7 x 7 to 10 x 10; draw borders | A, Ci | 2 |
| 58 | Train tracks (Tracks; Tatham Tracks) | 1 | M, U; Tatham Tracks | none | 8 x 8 to 10 x 10 | A, Ci | 2 |
| 59 | Slant (Gokigen Naname; Tatham Slant) | 1 | M, U; Tatham Slant | none | 8 x 8 to 12 x 12; draw diagonals | A, Ci | 2 |
| 60 | Dominosa (Tatham Dominosa) | 1 | M, U; Tatham Dominosa | none | 7 x 8 for a double-six set | A, Ci | 2 |
| 61 | Signpost (arrow path; Tatham Signpost) | 1 | M, U; Tatham Signpost | none | 5 x 5 to 7 x 7; write numbers | A, Cr | 2 |
| 62 | Palisade (Tatham Palisade), Sashigane, Double Choco, Tatamibari | 1 | M, U; Tatham Palisade; the rest have no known generators | none | 6 x 6 to 10 x 10; draw borders | A, Ci | 1 |
| 63 | Country Road, Suraromu, Yajisan-Kazusan, Hotaru Beam, Mid-loop, Nagareru, Dotchi-Loop (smaller Nikoli loop genres) | 1 | H, U; no open generators known; pzprjs MIT checks rules | none | 8 x 8 to 10 x 10 | A, Ci | 1 |
| 64 | Map colouring (Four Colour; Tatham Map) | 1 | M, U; Tatham Map | none | 20 to 30 regions; colour with pen greys or symbols | A, Ci (shade levels) | 2 |

### 3.4 Deduction puzzles

| # | Game (local names) | Pl | Generation and uniqueness | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 65 | Logic grid puzzle (Zebra or Einstein puzzle; Einstein-Rätsel DE; Logigramme FR; Problemas de lógica ES; Problemas de lógica PT) | 1 | M, U: random solution, then add clues until a solver finds one solution. The hard part is natural clue text per language | sentence templates per language; category lists | 3 x 4 to 4 x 5 categories; cross-off grid plus clues | A, Ci (ticks in the grid) | 3 |
| 66 | Codebreaker deduction (static Mastermind / Bulls and Cows: guesses with feedback are given, find the code) | 1 | E, U: pick guesses until one code is left | none | half a page | A, Cr | 2 |
| 67 | Black Box, static (laser results given, mark the balls) | 1 | M, U; Tatham Black Box logic | none | 8 x 8 | A, Ci | 1 |

---

## 4. Word games

Common language note. Traditional grid conventions differ:

- **Portuguese:** accents and cedilla are dropped in crosswords (Ç as C, Ã as A).
- **French:** accents are dropped.
- **German:** Ä, Ö, Ü are written AE, OE, UE, and ß as SS.
- **Spanish:** Ñ is its own letter and stays; accents are dropped.
- **English:** plain A to Z.

The word pipeline (section 14) must apply these rules per language.

### 4.1 Crosswords

| # | Game (local names) | Pl | Generation and uniqueness | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 68 | Crossword, blocked, symmetric (American style; British blocked; Palavras cruzadas PT; Crucigrama ES; Kreuzworträtsel DE; Mots croisés FR) | 1 | H. Grid fill is a search over a scored word list; it is solvable at 5 x 5 to 13 x 13. Clues are the hard part: they need a clue bank per language. Code: [genxword](https://github.com/riverrun/genxword) GPL-3.0, [Exet](https://github.com/viresh-ratnakar/exet) (licence to verify) | scored word list plus a clue per word | 13 x 13 at 9 mm leaves half a page for clues; 15 x 15 needs clues on a facing page | A, Cr (letters) | 3 |
| 69 | Mini crossword 5 x 5 (NYT Mini style) | 1 | M; small fill is easy, clues still needed | as above | 5 x 5 at 20 mm with clues on the same page | A, Cr | 3 |
| 70 | European-style crossword (Mots croisés with Roman-numbered rows, German grids with many black cells) | 1 | H; freer fill rules than American | as above | 10 x 10 to 13 x 13 | A, Cr | 2 |
| 71 | Arrowword (Scandinavian style; Palavras cruzadas diretas PT, the Coquetel format popular in Brazil; Autodefinido ES; Schwedenrätsel or Pfeilrätsel DE; Mots fléchés FR; Korsord SV) | 1 | H. Clues sit inside grid cells, so each clue must be very short (one to three words). Fill and clue fit are searched together. Open example: [Mots Fléchés](https://leo-nicolle.github.io/mots-fleches) (licence to verify) | short clue bank per language | 10 x 14 cells at 10 mm; clue text at 6 to 7 pt is readable at 300 ppi | A, Cr | 3 |
| 72 | Cryptic crossword (British cryptic; Um die Ecke gedacht DE) | 1 | H: clue writing is beyond reliable generation; an open dataset of published clues, [cryptics.georgeho.org](https://cryptics.georgeho.org/), holds publishers' copyrighted clues | English only, realistically | 13 x 13 to 15 x 15 | A, Cr | 1 |
| 73 | Barred crossword (Listener style) | 1 | H | as above | 12 x 12 | A, Cr | 1 |
| 74 | Codeword (Cipher crossword; Nankuro; Mots codés FR; Zahlenkreuzworträtsel or Codewort DE; Criptograma or palavras cruzadas codificadas PT; Crucigrama codificado ES) | 1 | M, U: a dense fill from a word list, then check that the letter-to-number map has one solution. **No clues needed** | word list only | 13 x 13 at 10 mm plus an A-Z key | A, Cr | 3 |
| 75 | Fill-in (Criss-cross, Kriss Kross, Word fit; Mots casés FR; Ausfüllrätsel DE; Palavras cruzadas sem dicas or Cruzadinha PT; Encaja palabras ES) | 1 | M, U: place a given word list; check that only one placement exists. **No clues needed** | word list only | 13 x 13 to 15 x 15 plus the word list | A, Cr | 3 |
| 76 | Free-form criss-cross with clues (classroom crossword, words crossing without a full grid) | 1 | E: place words greedily; genxword does this | words plus clues (theme lists) | any size | A, Cr | 2 |

### 4.2 Search and letter puzzles

| # | Game (local names) | Pl | Generation and uniqueness | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 77 | Word search (Caça-palavras PT; Sopa de letras ES; Buchstabensalat, Suchsel or Wortsuchrätsel DE; Mots mêlés FR) | 1 | E, U: place words, fill blanks, check that each word appears only once. Code: SuperFun's word search, MIT, 68 themes in EN, DE, FR, ES, IT | themed word lists per language | 15 x 15 to 20 x 20 at 7 mm; circle or strike words | A, Ci (a stroke along the letters) | 3 |
| 78 | Word search with a hidden message (leftover letters spell a phrase; common in FR and SV) | 1 | M | themes plus phrases | as above | A, Cr | 2 |
| 79 | Anagram and word jumble (Jumble is a trademark; Anagramas PT/ES; Buchstabensalat DE; Anagrammes FR) | 1 | E, U: keep only words with a single anagram | frequency-ranked word list | half a page | A, Cr | 2 |
| 80 | Word wheel (Target; Wortrad DE; Spelling Bee is an NYT trademark) | 1 | E: pick a pangram, list every valid word | word list with a familiarity cut-off | half a page; write words | A (word list), Cr | 3 |
| 81 | Letter grid word hunt (Boggle is a trademark) | 1 | E: roll a grid, list words | word list | 4 x 4 or 5 x 5 at 20 mm | A, Cr | 2 |
| 82 | Word ladder (Doublets, Lewis Carroll; Escada de palavras PT) | 1 | E: graph search on same-length words; many paths are valid | word list | a column of blanks | A (one path), Cr against the dictionary | 2 |
| 83 | Cryptogram (Cryptoquote, Aristocrat; Kryptogramm DE; Criptograma PT/ES; Cryptogramme FR) | 1 | E: substitution cipher over a quote; unique if the quote is long enough | public-domain quotes per language | a quote of 80 to 150 letters | A, Cr | 2 |
| 84 | Acrostic (Double-Crostic; Damero maldito ES; Silbenrätsel is the German cousin) | 1 | M: needs a quote and clue words whose letters rebuild it | quotes plus clues | full page | A, Cr | 2 |
| 85 | Syllable puzzle (Silbenrätsel DE: join syllables into answers; first letters spell a phrase) | 1 | M | clues plus hyphenation (Hunspell hyphenation dictionaries) | full page | A, Cr | 2 |
| 86 | Bridge words (Brückenrätsel DE; Mots en pont FR: find a word that ends one compound and starts another) | 1 | M | compound-word lists (DE, EN) | half a page | A, Cr | 1 |
| 87 | Knight's move text puzzle (Rösselsprung DE) | 1 | M: a knight's tour over syllables of a quote | quotes plus hyphenation | 8 x 8 | A, Cr | 1 |
| 88 | Pen Wordle (guess a five-letter word; the plugin marks letters) | 1 | E | answer list plus a guess dictionary per language | six rows of five 20 mm cells | needs Cr each turn | 2 |
| 89 | Longest word from letters (Le mot le plus long, from Des chiffres et des lettres FR; Countdown letters round EN) | 1 | E | word list | half a page | A (best words), Cr | 2 |
| 90 | Rebus and picture word puzzles (Jeroglífico ES, Rébus FR) | 1 | H: needs curated pictures | yes | a picture plus blanks | A | 1 |

### 4.3 Word games for two or more players

| # | Game (local names) | Pl | Generation and uniqueness | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 91 | Hangman (Forca PT; Ahorcado ES; Galgenmännchen DE; Le pendu FR) | 2, or 1 against the plugin | n/a; the plugin can pick a word | word list per language when the plugin plays | a quarter page | Cr if the plugin plays | 2 |
| 92 | Categories (Stadt, Land, Fluss DE; Adedonha or Stop PT; Basta or Tutti frutti ES; Petit bac FR; Scattergories is a trademark) | 2+ | n/a; generate a letter plus a set of categories | category names per language | a table page | — | 2 |
| 93 | Jotto (and Bulls and Cows with words) | 2 | n/a | word list | a half page per player | — | 1 |
| 94 | Ghost and Superghost | 2+ | n/a | dictionary for disputes | a score line | — | 1 |

---

## 5. Two-player pen games

A generator gives these a ready board page. The plugin could also play one side, reading the
opponent's move from the new stroke (section 14).

| # | Game (local names) | Pl | Generation | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 95 | Tic-tac-toe (Jogo da velha PT; Tres en raya or Gato ES; Tic-Tac-Toe or Drei gewinnt DE; Morpion FR) | 2 | n/a; a page of 12 small boards | none | twelve 40 mm boards | — | 1 |
| 96 | Ultimate tic-tac-toe | 2 | n/a; one 9 x 9 board | none | 9 x 9 at 15 mm | — | 3 |
| 97 | Gomoku (Five in a row; Fünf gewinnt DE; Morpion FR; Renju and Pente are stricter variants) | 2 | n/a; a squared grid | none | 19 x 25 at 7.5 mm; ideal on e-ink | — | 3 |
| 98 | SOS | 2 | n/a | none | 8 x 8 to 10 x 10 | — | 2 |
| 99 | Notakto, Treblecross, Wild tic-tac-toe, Order and Chaos, Quantum tic-tac-toe, 3D tic-tac-toe (4 x 4 x 4 drawn as four boards) | 2 | n/a; rule card plus board | none | boards fit easily | — | 1 |
| 100 | Dots and boxes (Jogo dos pontinhos PT; Timbiriche ES-MX; Käsekästchen DE; La pipopipette FR) | 2 | n/a; a dot lattice | none | 10 x 14 dots; lines only, no erasing | — | 3 |
| 101 | Dots (Kropki, PL: enclose the opponent's dots) | 2 | n/a; a dot grid | none | 20 x 26 at 7 mm | — | 2 |
| 102 | Sprouts and Brussels Sprouts | 2 | n/a; a few starting dots | none | blank page | — | 2 |
| 103 | Sea battle (Battleship is a Hasbro trademark; Batalha naval PT; Hundir la flota or Batalla naval ES; Schiffe versenken DE; Bataille navale FR) | 2, or 1 against the plugin | n/a; two 10 x 10 grids; the plugin can hide its fleet and answer shots | none | two grids at 10 mm on one page | Cr for shot coordinates, or Ci for a mark on the target grid | 3 |
| 104 | Paper soccer (Paper football; Piłkarzyki PL) | 2 | n/a; a pitch of dots | none | 8 x 10 field at 12 mm | — | 2 |
| 105 | Racetrack (Vector Race; Formel 1 on squared paper DE) | 2+ | M: generate a random track inside a squared grid | none | 40 x 55 at 3.5 mm squares; lines only | — | 3 |
| 106 | Hex | 2 | n/a; an 11 x 11 rhombus of hexagons | none | 11 x 11 at 10 mm; mark cells | — | 3 |
| 107 | Y and Havannah (hex connection games) | 2 | n/a; hex board | none | a triangle or hexagon board | — | 1 |
| 108 | Sim (two players draw edges of a hexagon; avoid a triangle) | 2 | n/a; six dots | none | solid against dashed lines | — | 2 |
| 109 | Domineering (Crossram) and Cram | 2 | n/a; 8 x 8 board | none | draw dominoes | — | 2 |
| 110 | Nim and Marienbad (matchstick rows) | 2, or 1 against the plugin | n/a; random row sizes | none | strike sticks | — | 2 |
| 111 | Chomp | 2 | n/a | none | 4 x 7 bar | — | 1 |
| 112 | Col and Snort (map colouring games) | 2 | M: generate a map | none | shade regions | — | 1 |
| 113 | Hackenbush (blue-red) | 2 | M: generate a drawing | none | erase edges: poor fit | — | 1 |
| 114 | Join Five (Morpion solitaire) | 1 | n/a; the starting cross on a grid | none | 30 x 40 at 5 mm; lines only | — | 3 |
| 115 | Bulls and Cows, Mastermind on paper (two players) | 2 | n/a | none | a score table | — | 2 |
| 116 | Labyrinth (paper-and-pencil game: players hide mazes from each other) | 2 | n/a | none | two grids | — | 1 |
| 117 | Roll-and-write score sheets (dice games: Yahtzee and Kniffel are trademarks; generic dice poker sheets; mechanics like Qwixx or Railroad Ink are trademarked products) | 1 to 4 | n/a; the plugin rolls the dice | none | a score sheet | — | 2 |
| 118 | MASH, Consequences, Exquisite corpse, Picture consequences | 2+ | n/a | prompts per language | blank page; folding does not work on one tablet | — | 1 |
| 119 | Beetle (draw a beetle by dice), Tennis (paper game), Pentomino placement game | 2 | n/a | none | blank or grid page | — | 1 |

---

## 6. Mazes and path puzzles

| # | Game (local names) | Pl | Generation and uniqueness | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 120 | Rectangular maze (Labirinto PT; Laberinto ES; Labyrinth or Irrgarten DE; Labyrinthe FR) | 1 | E, U: a perfect maze has one path. Algorithms: recursive backtracker, Wilson, Kruskal, Eller (Jamis Buck, *Mazes for Programmers*). InkGames uses [amaze](https://github.com/wolfsolver/Supernote-InkGames) and codebox's mazes | none | 20 x 27 at 7 mm to 40 x 54 at 3.5 mm | A, Ci (path trace) | 3 |
| 121 | Circular maze (theta) | 1 | E, U | none | 10 to 20 rings | A, Ci | 3 |
| 122 | Hexagonal (sigma) and triangular (delta) mazes | 1 | E, U | none | full page | A, Ci | 2 |
| 123 | Shape maze (a maze clipped to a silhouette: a heart, a country, a letter) | 1 | M, U: mask from an image | none | full page | A, Ci | 2 |
| 124 | Weave maze (passages cross over and under) | 1 | M, U | none | 15 x 20 | A, Ci | 2 |
| 125 | Multi-level maze (stairs between floors) | 1 | M, U | none | two or three floors on one page | A, Ci | 1 |
| 126 | Logic maze: number jump maze, arrow maze, alternating-colour maze (Abbott style) | 1 | M, U: breadth-first search proves one shortest path | none | 6 x 6 to 10 x 10 | A, Ci | 2 |
| 127 | One-stroke drawing (Hitofude-gaki; Eulerian path: trace every line once without lifting the pen) | 1 | E: generate a graph with zero or two odd vertices | none | a figure of 10 to 30 edges | A, Ci | 2 |
| 128 | Knight's tour and other move puzzles (visit every square once) | 1 | E | none | 6 x 6 to 8 x 8; write move numbers | A, Cr | 1 |
| 129 | Tangled lines (which start leads to which end) | 1 | E | none | 5 to 10 lines | A | 2 |
| 130 | Picture maze (Ukidashi meiro: the right path reveals a picture) | 1 | H: needs source art | none | full page | A | 1 |
| 131 | Theseus and the Minotaur style chase maze | 1 | M: needs a state search | none | 6 x 6 | A | 1 |

---

## 7. Drawing puzzles

| # | Game (local names) | Pl | Generation and uniqueness | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 132 | Connect the dots (Dot to dot; Ligue os pontos PT; Une los puntos ES; Verbinde die Punkte DE; Relier les points FR; Ten tsunagi) | 1 | M: sample points along line art; needs source drawings (CC0 clip art, such as Openclipart) | none | 50 to 200 numbered dots; numbers at 6 pt | A (the drawing) | 2 |
| 133 | Spot the difference (Jogo dos 7 erros PT; Encuentra las diferencias ES; Fehlersuchbild DE; Jeu des 7 erreurs FR) | 1 | M: generate a scene from shapes, then change N details (add, remove, move, re-grey) | none | two pictures stacked; 16 greys help | A (circled changes), Ci (a circle near each change) | 2 |
| 134 | Grid copy and symmetry completion (draw the mirror half; Spiegelbild DE) | 1 | E: from pixel art or random patterns | none | 12 x 12 at 6 mm per half | A, Ci | 2 |
| 135 | Shade by number (paint by numbers with greys) | 1 | M: quantise an image to 3 or 4 greys | none | regions at least 5 mm | A | 1 |
| 136 | Counting puzzles (how many triangles or squares in a figure) | 1 | E: count by enumeration | none | one figure | A | 1 |
| 137 | Odd one out and find-the-pair among shapes | 1 | E | none | a 6 x 6 field of shapes | A, Ci | 1 |
| 138 | Hidden object (Where's Wally is a trademark) | 1 | H: needs art | none | full page | A | 1 |

---

## 8. Maths puzzles

| # | Game (local names) | Pl | Generation and uniqueness | Words | E-ink and pen | Check | Val |
|---|---|---|---|---|---|---|---|
| 139 | Kakuro (Cross Sums, Kakro; Kakkuro) | 1 | M, U: make a black-white pattern, fill digits, then check uniqueness with a solver; no known permissive open generator, so build on the shared solver | none | 10 x 10 to 12 x 12 at 12 mm; diagonal clue cells in grey | A, Cr | 3 |
| 140 | Number crossword (Cross-figure, Cross Number; Kreuzzahlrätsel DE) | 1 | M: arithmetic clues for each entry | none | 9 x 9 to 11 x 11 | A, Cr | 2 |
| 141 | Math grid (Crossmath, math square: rows and columns are equations with blanks) | 1 | E, U with a solver | none | 5 x 5 to 7 x 7 at 15 mm | A, Cr | 3 |
| 142 | Number fill-in (Nansuke; Zahlen-Ausfüllrätsel DE: place a given list of numbers) | 1 | M, U | none | 13 x 13 | A, Cr | 2 |
| 143 | Alphametic (Verbal arithmetic, Cryptarithm; Fukumenzan; SEND + MORE = MONEY) | 1 | M, U: search word triples whose sum has one digit map | word list per language | half a page | A, Cr | 2 |
| 144 | Number pyramid and number wall (Zahlenmauer or Rechenmauer DE; Pirâmide numérica PT) | 1 | E, U | none | 5 to 7 rows | A, Cr | 2 |
| 145 | Magic square (fill so rows, columns and diagonals add up) | 1 | E | none | 3 x 3 to 5 x 5 | A, Cr | 2 |
| 146 | Target number (Le compte est bon FR; Countdown numbers EN; 24 game) | 1 | E: check that a solution exists, print one | none | quarter page per round | A, Cr | 2 |
| 147 | Arithmagon and number triangles | 1 | E | none | quarter page | A, Cr | 1 |
| 148 | Area maze (Menseki meiro, Naoki Inaba: find the unknown with area reasoning) | 1 | H: geometry construction with integer answers | none | one figure | A, Cr | 2 |
| 149 | Mental arithmetic drills (times tables grid, number chains; Rechenkette DE) | 1 | E | none | full page | A, Cr | 2 |
| 150 | Matchstick equations (move one stick to fix the equation) | 1 | M: search over seven-segment digits | none | one row of sticks | A | 1 |
| 151 | Shinro (find hidden stones from arrows and counts) | 1 | M, U | none | 8 x 8 | A, Ci | 1 |

**Total: 151 numbered entries.** Some rows group closely related variants (rows 51, 62, 63, 99,
118, 119); counted one by one, the report covers about 175 games.

---

## 9. Excluded games

These need motion, hidden state or frequent piece moves, which pen and e-ink handle badly.

- **Sliding and rotation puzzles:** Fifteen, Sixteen, Twiddle, Netslide, Net, Cube, Inertia,
  Flood, Same Game, Untangle, Flip and Lights Out (all in Tatham). Each move rewrites the board.
- **Board games with moving or flipping pieces:** chess, checkers, reversi, Go, nine men's morris,
  peg solitaire. Each move means erasing. SuperFun already plays several as an app (section 10).
- **Timed games:** speed rounds and Speedoku.
- **Games that need one secret per player on separate paper:** Mastermind with a human codemaker,
  Battleship between two people on one tablet. They work only with the plugin as the opponent
  (rows 103 and 115).

---

## 10. What already exists for the Supernote

| What | Link | What it does | How it is made | Price or licence | What we learn or reuse |
|---|---|---|---|---|---|
| SuperFun (plugin) | [github.com/AgP42/SuperFun](https://github.com/AgP42/SuperFun) | About 20 games as an app inside a plugin: sudoku, nonogram, minesweeper, word search, 2048, Fifteen, Mastermind, peg solitaire, memory; chess, ultimate tic-tac-toe, Connect Four, reversi, checkers, draughts, dots and boxes, tic-tac-toe and battleship against an AI; 2-4 player hot-seat | Generated on the device. Sudoku is unique; nonograms are hand-drawn pictures checked for uniqueness; word search has 68 themes in EN, DE, FR, ES, IT; the AI uses minimax, alpha-beta or MCTS. Finger-first taps, with handwritten sudoku entries mentioned | Free, MIT. v1.0.1 for Chauvet 3.29.43 (Manta, Nomad), v0.28.7 for older firmware | The closest competitor. It plays in its own screen, not on the note. Its MIT code (sudoku generator, nonogram checker, word lists, AIs) can be reused with attribution. Gaps: no Portuguese, no logic genres beyond sudoku and nonogram, no crosswords |
| InkGames (plugin) | [github.com/wolfsolver/Supernote-InkGames](https://github.com/wolfsolver/Supernote-InkGames) | A "digital printing house": generates a puzzle and inserts it as a picture into the current note, to solve by hand | On the device: sudoku (sudoku.js, or the online Dosuku API), mazes (amaze, codebox mazes), word search (WordFind), nonograms. No timers, no automatic checks | Licence not stated: its code cannot be reused until that is settled; 11 stars, 14 commits, 5 open issues | The same idea as ours, in an early state. No answer page, no check, four games. Our advantage must be breadth, an answer page, the ink check and languages |
| xunafay/sudoku | [github.com/xunafay/sudoku](https://github.com/xunafay/sudoku) | A Flutter sudoku app for the A5 X | Generated; handwriting input planned | Open source (licence to verify); work in progress | Shows demand for handwriting entry |
| "Sudoku - Paperlike!" (sideloaded APK) | [r/Supernote thread, May 2024](https://axebps-redlib.hf.space/r/Supernote/comments/1d0tyfq/sudoku_supernote) | Sudoku with handwritten digit recognition | Generated; sideloaded Android app | Unknown | Users want to write digits, not tap them |
| NYT crossword to Supernote | [nathanbuchar.com guide](https://nathanbuchar.com/automatically-uploading-the-nyt-crossword-supernote/), [gist](https://gist.github.com/nathanbuchar/8c7a87a8383ee83c7c636f861b0d86a0), [arichiv/supernote-crossword](https://github.com/arichiv/supernote-crossword) | Downloads tomorrow's NYT crossword PDF into a Dropbox folder that the Supernote syncs | Static: the NYT's own PDF. Node.js server or GitHub Actions; needs an NYT subscription and a browser cookie; does not work with Supernote Cloud | Script MIT (arichiv); the puzzle needs a paid NYT subscription | People want a daily crossword so much that they build cookie scripts. A daily generated puzzle without a subscription meets the same need |
| OnPlanners Supernote puzzle books | [Sudoku](https://onplanners.com/template/supernote-sudoku-puzzles), [Word search](https://onplanners.com/template/supernote-word-search-puzzles) | Configurable PDF books with an index, puzzles and hyperlinked solutions | Generated on their website: 16 sudoku types, sizes 4 x 4 to 16 x 16, five difficulty levels, eight interface languages, left- or right-handed layout, up to 250 pages | $8 per planner, $19.97 for all 19 Supernote planners, one-time; personal use only | Hyperlinked solutions, difficulty choice and handedness are expected features. Static once downloaded |
| Etsy puzzle PDFs | [Supernote puzzle bundle](https://www.etsy.com/listing/1559452768), [Supernote word search book](https://www.etsy.com/listing/1806143912) | Bundles of sudoku, mazes, kakuro, crosswords and word searches sized for the A5 X, A6 X and Nomad | Static PDFs, mostly generated by the seller; hyperlinked index | About $5 to $30; personal use | A market exists. Sellers warn that some hyperlink features do not behave like native templates |
| InkHub (built in) | [Supernote support: InkHub](https://support.supernote.com/en_US/supernote-inkhub-share-discover-and-get-more-from-your-device), [InkHub monthly picks](https://supernote.com/blogs/supernote-blog/inkhub-monthly-picks-vol-1-the-practical-edit) | The device's community library for notes, templates, drawings, digests, stickers, and plugins later | User uploads from the device (Export and Share, then Share to InkHub); Chauvet 3.28.42 and later | Free | A distribution channel for puzzle template packs, and later for the plugin itself. No puzzle packs were found there in this search (InkHub is only browsable on the device) |
| Template collections and generators | [awesome-supernote](https://github.com/fharper/awesome-supernote), [supernote-templates.mostlyuseful.tech](https://supernote-templates.mostlyuseful.tech/), [diaryGenerator](https://github.com/jacrify/diaryGenerator), [NoTeTO](https://github.com/dynobo/noteto) | Free PNG templates (lined, planners) and hyperlinked PDF notebook generators | Static PNGs; generator scripts | Free, licences vary | The MyStyle PNG template route is well known to users; no puzzle templates are listed apart from InkGames and the NYT scripts |

## 11. Other e-ink tablets

| Device | What | Link | What it does | How it is made | Price or licence | What we learn or reuse |
|---|---|---|---|---|---|---|
| reMarkable | Toltec "puzzles" | [toltec-dev.org/stable](https://toltec-dev.org/stable/) | A port of Tatham's collection | Generated on the device; needs Toltec, a community package system that installs over SSH and lags behind new OS releases | MIT | Tatham's generators run fine on e-ink hardware; the interaction is app-style taps |
| reMarkable | remarkable-sudoku | [ecosyste.ms entry](https://awesome.ecosyste.ms/projects/github.com%2Fhookedbehemoth%2Fremarkable-sudoku) | A Rust sudoku app | Generated; Toltec | Open source (licence to verify) | — |
| reMarkable | recrossable | [github.com/sandsmark/recrossable](https://github.com/sandsmark/recrossable) | A crossword game with handwritten answers | Generated with CWC; a small dlib neural network reads letters; ships `nyt.tsv` and a jargon list (origin not documented) | GPL-2.0; 74 stars | Proof that pen letters in crossword cells can be read on e-ink. Its word list's origin is unclear: do not reuse it |
| reMarkable | remarkable-crosswords, remarkable-crossword-dl, getxword, Val Town scripts | [shapeshed](https://awesome.ecosyste.ms/projects/github.com%2Fshapeshed%2Fremarkable-crosswords), [ruebeckscube](https://uithub.com/ruebeckscube/remarkable-crossword-dl), [getxword](https://awesome.ecosyste.ms/projects/github.com%2Fjdan%2Fgetxword), [Val Town](https://www.val.town/x/bmalicoat/reMarkableXNYTCrossword), [Notion guide](https://uxthoughts.notion.site/NYT-Daily-Crossword-to-reMarkable-228c78fafcc880b68aa5e79ce7505b28) | Fetch the Guardian or NYT crossword daily and upload it with [rmapi](https://github.com/juruen/rmapi) | Static newspaper PDFs; scheduled scripts; [xword-dl](https://github.com/thisisparker/xword-dl) gets .puz files | Scripts are open source; NYT needs a subscription | The biggest e-ink puzzle habit is the daily newspaper crossword, delivered by script |
| reMarkable | Etsy puzzle books | [Sudoku book for reMarkable](https://www.etsy.com/listing/1889755264) | 100-puzzle PDF books, sized for reMarkable 2, Paper Pro and Kindle Scribe, with a tappable index | Static, seller-generated | A few dollars; personal use | Same market as on the Supernote; reMarkable templates have the same size as the Supernote's, per [sugoi-supernote](https://github.com/dwongdev/sugoi-supernote) |
| Kindle Scribe | Write-on books | [the-ebook-reader.com guide](https://blog.the-ebook-reader.com/2023/05/27/crosswords-and-sudoku-puzzles-for-kindle-scribe/) | Fixed-layout crossword and sudoku books in the Kindle store with a "Write-on" label; Send to Kindle for PDFs (the Guardian, Krazydad) | Static, publisher-made | Book prices; free PDFs | A MobileRead user complained that big grids put clues on one page and the grid on the next ([thread](https://www.mobileread.com/forums/showthread.php?p=4360402)): keep the grid and clues on one page |
| Kindle (browser) | KindlePlay | [Android Authority](https://www.androidauthority.com/play-old-school-games-on-kindle-browser-3613531) | Browser games, sudoku among them | Web app | Free | — |
| Kobo Elipsa, Elipsa 2E | Beta features | [Kobo help: Beta features](https://help.kobo.com/hc/en-us/articles/360017763733-About-Beta-Features), [MobileSyrup review](https://mobilesyrup.com/2021/06/17/koba-elipsa-review-dreaming-big/) | Sudoku, Unblock It, Solitaire, Word Scramble, Sketch Pad | Generated, built in | Free | The review says the stylus cannot fill the sudoku grid and the slow refresh makes play tedious: pen-first and refresh-light design matters |
| Kobo stylus models | Puzzle Genius "Puzzles for Stylus Devices" | [puzzlegenius.org](https://puzzlegenius.org/new-puzzles-for-kobo-devices/) | Ebooks of 100 sudoku, killer sudoku, suguru or tetromino puzzles; tap an icon to switch between puzzle and solution; a free weekly magazine | Static ebooks | £1.99 / €1.99 / $1.99 each at launch | A one-tap solution toggle is valued. Suguru and tetromino puzzles sell beside sudoku |
| Boox (Onyx), Android | Simon Tatham's Puzzles for Android | [github.com/chrisboyle/sgtpuzzles](https://github.com/chrisboyle/sgtpuzzles), [F-Droid](https://f-droid.org/en/packages/name.boyle.chris.sgtpuzzles/) | All of Tatham's games, offline | Generated | MIT | Boox users run ordinary Android puzzle apps with touch; nothing pen-native for puzzles was found |
| Boox, Android | General apps and PDFs in NeoReader | [Android Authority: e-ink apps](https://www.androidauthority.com/best-apps-android-e-ink-device-3631357) | Any Android puzzle app; PDFs annotated with the pen | Mixed | Mixed | The article notes that games with little animation and few refreshes suit e-ink |
| Any | Krazydad | [krazydad.com](https://krazydad.com/) | Free printable sudoku, kakuro and other puzzle PDFs | Generated by the author, static | Free for personal use (terms to verify) | A common free source people send to e-ink tablets |
| Any | Daily subscriptions | — | No service was found that delivers a fresh generated puzzle PDF to an e-ink tablet every day | — | — | An open gap (section 12) |

## 12. Gaps

What nobody does yet, and our generator could do on the Supernote:

1. **Fresh puzzles generated on the tablet, offline, for many genres.** InkGames prints four
   genres; SuperFun plays two logic genres in its own screen. Nobody offers the Tatham and Nikoli
   logic families (slitherlink, star battle, hitori, light up, bridges, calcudoku…) on a Supernote
   page.
2. **Solving with the pen on the note, then a check.** No Supernote tool checks a hand-solved
   page. The API reads strokes in page pixels, so shading, loop, path and word-search puzzles can be
   checked from ink alone; digit and letter puzzles can use `recognizeElements`. Errors can be
   marked with an inserted grey circle.
3. **Word puzzles in Portuguese, Spanish, German and French with each tradition's own format.**
   No e-ink tool generates palavras cruzadas diretas, autodefinidos, Schwedenrätsel or mots
   fléchés. SuperFun's word search has no Portuguese. Codeword and fill-in need no clues, so they
   can be the first multilingual crossword-like games.
4. **A daily puzzle without a subscription or a cookie script.** A puzzle seeded by the date
   gives every user the same daily grid; a short code lets friends share one puzzle.
5. **Manta-tuned pages.** Exact 16-grey levels, cell sizes chosen for the pen, grid and clues on one
   page, left- or right-handed layout, and the puzzle as a background that erasing cannot damage.
6. **Graded help instead of only a full answer.** Reveal one cell, show the next logical step, or
   check one row. Puzzle Genius only toggles the full solution; OnPlanners only links to it.
7. **The plugin as an opponent on the page.** Dots and boxes, gomoku, sea battle and Nim, with the
   player's move read from the new stroke. SuperFun plays against an AI only through taps in its
   own screen.
8. **A difficulty ladder and a record.** Grade every puzzle with a human-style solver, then step the
   level up after solved puzzles.

---

## 13. Ranked shortlist

Ranked by value for a Supernote user, ease of generation with a unique solution, fit for pen and
e-ink, and whether a check is possible. Rows 1 to 15 need no word data; rows 16 to 20 add
languages.

| Rank | Game | Why it is here | Main reuse | Check |
|---|---|---|---|---|
| 1 | Sudoku (classic, sizes 4 x 4 to 16 x 16) | The best-known pen puzzle; the owner named it | tdoku BSD-2, Tatham Solo MIT, SuperFun MIT | A, Cr |
| 2 | Nonogram | High demand, pictures reward solving, ink-checkable | Tatham Pattern MIT; SuperFun's checker MIT | A, Ci |
| 3 | Word search (5 languages) | Easy, popular, multilingual, ink-checkable | SuperFun's themes MIT (add Portuguese) | A, Ci |
| 4 | Maze (rectangular and circular) | Trivial to generate, endless, ink-checkable | Standard algorithms | A, Ci |
| 5 | Killer sudoku | The top sudoku variant | Tatham Solo killer mode | A, Cr |
| 6 | Calcudoku | Popular maths logic | Tatham Keen | A, Cr |
| 7 | Kakuro | A classic of puzzle magazines | Shared solver | A, Cr |
| 8 | Futoshiki | Small, quick, elegant | Tatham Unequal | A, Cr |
| 9 | Slitherlink | Nikoli's best loop puzzle, ink-checkable on edges | Tatham Loopy | A, Ci |
| 10 | Star Battle | Very popular, ink-checkable | Shared solver | A, Ci |
| 11 | Binairo | Quick, ink-checkable when 1 = shaded | Tatham Unruly | A, Ci |
| 12 | Hitori | Shading only, ink-checkable | Tatham Singles | A, Ci |
| 13 | Light Up | Dots only, ink-checkable | Tatham Light Up | A, Ci |
| 14 | Bridges (Hashiwokakero) | Drawing lines suits the pen | Tatham Bridges | A, Ci |
| 15 | Jigsaw sudoku | A cheap variant once sudoku exists | Tatham Solo jigsaw mode | A, Cr |
| 16 | Fill-in (criss-cross) in 5 languages | A crossword feel with no clues needed | Word pipeline | A, Cr |
| 17 | Codeword in 5 languages | No clues needed, a newspaper favourite | Word pipeline | A, Cr |
| 18 | Crossword with clues (mini 5 x 5 up to 13 x 13), 5 languages | The owner named it; needs a clue bank | Word pipeline plus clue bank | A, Cr |
| 19 | Arrowword (palavras cruzadas diretas, Schwedenrätsel, mots fléchés, autodefinido) | The most popular format in Brazil, Germany and France | Word pipeline plus short-clue bank | A, Cr |
| 20 | Dots and boxes (plus gomoku and ultimate tic-tac-toe boards) | Two-player boards cost almost nothing; the plugin can later play | Grid renderer only | — |

Next in line: Skyscrapers, Tents, Masyu, Numberlink, Battleship solitaire, logic grid puzzles,
Sea battle against the plugin, Racetrack, Hex, Word wheel.

## 14. Shared building blocks

1. **Page renderer.**
   - It writes a 1920 x 2560 greyscale PNG using only the 16 native levels, with lines snapped to
     whole pixels.
   - Its primitives are square, hex and triangle lattices, dot lattices, thick region borders,
     cages, outside clues, small clue text in cells and icons (tree, pearl, arrow).
   - Cell-size presets: 7, 10 and 15 mm. Layouts: portrait, landscape, left- or right-handed.
   - Output: a `MyStyle/` template, an inserted picture, or a new page. A footer holds the game
     name, difficulty, seed and a one-line rule.
2. **Seeded generator framework.** Each game exposes `generate(seed, size, difficulty)`. The seed
   makes a puzzle reproducible, gives a shareable code, and allows a daily puzzle seeded by the date.
3. **Uniqueness solver.**
   - A generic constraint core counts solutions up to two. It has propagation, backtracking,
     dancing links (exact cover for sudoku variants, dominoes and polyominoes), and a SAT fallback
     for hard genres.
   - Two generation patterns cover almost every genre: build a solution and remove clues while the
     puzzle stays unique; or place random clues and repair them.
   - Port Tatham's per-game solvers (MIT) to TypeScript, or run them at build time.
4. **Difficulty rating.** A human-style solver applies named techniques in order (singles, then
   pairs, then chains). The hardest technique needed sets the level, as in Tatham's games. Tests
   pin the level of known puzzles.
5. **Word pipeline per language (EN, PT, ES, DE, FR).**
   - Source lists are normalised to Unicode NFC, then uppercased. Each language's grid convention
     is applied (section 4).
   - Filters remove offensive words, proper nouns and rare words, using a frequency cut-off.
   - Words are scored for crossword fill. Theme lists feed word search.
   - The clue bank is the hardest part. It can be built once, offline and reviewed, then shipped as
     data: short definitions for arrowwords, longer ones for crosswords.
6. **Ink check engine.**
   - It reads the page's strokes with `getElements` (page pixels) and maps them to cells, edges or
     paths.
   - It classifies ink presence per cell (shade, dot, cross), per edge (loops, borders) and per
     path (mazes, word search strikes).
   - For digits and letters it sends the strokes of each cell to `recognizeElements`, which takes
     0.9 to 2.6 s per call, or uses a small digit-only classifier.
   - It compares the result with the stored solution and marks errors by inserting grey strokes.
7. **Answer page and booklet composer.** It builds the answer page (a later page in the note, or
   small and upside-down) and N puzzles per note with an index page.
8. **Rule cards and copy.** One short rule text per game in each interface language, written by us.
9. **Opponent engine (later).** Minimax or MCTS for two-player boards, reading the opponent's move
   from the new stroke. SuperFun's MIT AIs are a starting point.

## 15. Licensing risks

1. **The project licence is CC BY-NC-SA 4.0** (`LICENSE`). GPL code cannot be combined with it,
   because the GPL forbids the extra non-commercial restriction. So do not bundle QQwing
   (GPL-2.0+), genxword (GPL-3.0), nonny (GPL-3.0+), nonogram-rs (GPL-3.0), recrossable or CWC
   (GPL). Use MIT and BSD code instead: Tatham, tdoku, SuperFun, pzprjs, Collaborative Word List.
   A clean-room rewrite from the rules is also safe.
2. **CC BY-SA data cannot be relicensed under BY-NC-SA.** This covers Wiktionary and its kaikki.org
   extracts, wordfreq's data, Lexique (French) and OdeNet (German). BY-SA 4.0 lets an adaptation
   carry only BY-SA or a licence Creative Commons lists as compatible, and BY-NC-SA is not on that
   list.
   - Options: ship such a list as a separate file under its own licence, with attribution (an
     aggregation); or use a build-time source whose output is facts only (a bare word list),
     after legal review.
   - Clue texts copied from Wiktionary are an adaptation and must stay BY-SA.
3. **Spell-check dictionaries carry copyleft licences.**
   - The Brazilian Portuguese VERO dictionary is LGPL-3 and MPL-2 (per packagers).
   - The Spanish, German and French Hunspell dictionaries each have their own terms (MPL, LGPL,
     GPL): verify each folder in [LibreOffice/dictionaries](https://github.com/LibreOffice/dictionaries).
   - An MPL file can ship unchanged beside the code; a GPL-only dictionary cannot be bundled.
   - SCOWL (English) is permissive, with notices kept.
4. **The EU database right.** Extracting a substantial part of a protected database, such as a
   commercial word list or a clue database, can infringe even when single words are free.
   Scraped clue sets (xd.saul.pw, Matt Ginsberg's clues, cryptics.georgeho.org) hold publishers'
   copyrighted clues: do not use them.
5. **Puzzle instances are copyrighted; rules are not.** Never copy Nikoli, NYT, Guardian or
   Etsy puzzles. Write our own rule texts. Tatham's documentation is MIT, so it is safe with
   attribution.
6. **Trademarks on names.** Use the generic name in the product:
   - KenKen and KenDoku (Nextoy / KenKen Puzzle LLC): say Calcudoku.
   - Hidato (Doo-Bee Toys and Games, Gameblend): say Number snake.
   - Numbrix (registered).
   - Str8ts (to verify): say Straights.
   - Picross (Nintendo): say Nonogram.
   - Battleship (Hasbro): say Sea battle.
   - Boggle, Scrabble, Yahtzee, Kniffel, Jumble, Wordle, Spelling Bee, Flow Free, Where's Wally and
     Scattergories are all trademarks.
   - Nikoli holds "数独" (Sudoku) as a trademark in Japan; the word is generic elsewhere.
7. **Code with no stated licence cannot be reused:** InkGames, Mots Fléchés, Exet, pbnsolve,
   nonogram-db, remarkable-sudoku and xunafay/sudoku until their licences are confirmed.
8. **Pictures for nonograms, dot-to-dot and spot the difference** must be self-made or CC0
   (Openclipart); never traced from copyrighted art.
9. **Fonts** in rendered pages need an open licence such as SIL OFL.

---

## 16. Sources

Puzzle lists and encyclopedias:
- Simon Tatham's Portable Puzzle Collection (MIT): https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
- Nikoli puzzle list: https://www.nikoli.co.jp/en/puzzles/
- Wikipedia, List of Nikoli puzzle types: https://en.wikipedia.org/wiki/List_of_Nikoli_puzzle_types
- Wikipedia, Category Paper-and-pencil games: https://en.wikipedia.org/wiki/Category:Paper-and-pencil_games
- Wikipedia, Category Logic puzzles: https://en.wikipedia.org/wiki/Category:Logic_puzzles
- Wikipedia, Paper-and-pencil game and tic-tac-toe variants: https://en.wikipedia.org/wiki/List_of_paper-and-pencil_games

Generators and solvers:
- tdoku (BSD-2-Clause): https://github.com/t-dillon/tdoku
- QQwing (GPL-2.0-or-later): https://ostermiller.org/qqwing/about.html
- pzprjs, puzz.link (MIT): https://github.com/robx/pzprjs
- genxword (GPL-3.0): https://github.com/riverrun/genxword
- Exet: https://github.com/viresh-ratnakar/exet
- nonny (GPL-3.0+): https://github.com/gkikola/nonny
- nonogram-db with pbnsolve: https://github.com/mikix/nonogram-db
- nonogram-rs (GPL-3.0): https://docs.rs/crate/nonogram-rs/latest
- Mots Fléchés generator: https://leo-nicolle.github.io/mots-fleches
- Simon Tatham's Puzzles for Android (MIT): https://github.com/chrisboyle/sgtpuzzles

Word data:
- Collaborative Word List (MIT, scored): https://github.com/Crossword-Nexus/collaborative-word-list
- SCOWL copyright: https://sources.debian.org/src/scowl/7.1-1/Copyright/
- LibreOffice dictionaries: https://github.com/LibreOffice/dictionaries
- VERO pt-BR dictionary: https://pt-br.libreoffice.org/projetos/vero/ ; Arch package: https://aur.archlinux.org/packages/hunspell-pt-br
- Lexique (CC BY-SA 4.0): https://lexique.org/databases/Lexique400/README-Lexique.txt
- Wiktextract and kaikki.org: https://github.com/tatuylonen/wiktextract
- Crossword datasets overview: https://www.georgeho.org/crosswords-datasets-dictionaries/
- Word-list shopping overview: https://tcampbell.substack.com/p/shopping-for-wordlists

Device and ecosystem:
- Supernote Manta: https://supernote.com/products/supernote-manta
- Supernote plugin docs: https://docs.supernote.com/en/first-plugin.md
- Project device notes: ../docs/supernote.md
- SuperFun: https://github.com/AgP42/SuperFun
- InkGames: https://github.com/wolfsolver/Supernote-InkGames
- awesome-supernote: https://github.com/fharper/awesome-supernote
- InkHub: https://support.supernote.com/en_US/supernote-inkhub-share-discover-and-get-more-from-your-device
- OnPlanners Supernote sudoku: https://onplanners.com/template/supernote-sudoku-puzzles
- NYT crossword to Supernote: https://nathanbuchar.com/automatically-uploading-the-nyt-crossword-supernote/
- Toltec: https://toltec-dev.org/stable/
- recrossable: https://github.com/sandsmark/recrossable
- xword-dl: https://github.com/thisisparker/xword-dl
- Kindle Scribe puzzles: https://blog.the-ebook-reader.com/2023/05/27/crosswords-and-sudoku-puzzles-for-kindle-scribe/
- Kobo beta features: https://help.kobo.com/hc/en-us/articles/360017763733-About-Beta-Features
- Puzzle Genius: https://puzzlegenius.org/new-puzzles-for-kobo-devices/

Trademarks:
- KenKen: https://trademarks.justia.com/owners/kenken-puzzle-llc-3815902 ; https://www.calcudoku.org/
- Hidato: https://en.wikipedia.org/wiki/Hidato
- Numbrix: https://trademark.justia.com/766/90/numbrix-76690127.html

Not verified in this pass (marked "to verify" above): the licences of Exet, pbnsolve, nonogram-db,
InkGames, Mots Fléchés, remarkable-sudoku and xunafay/sudoku; wordfreq's data licence; each
non-Portuguese Hunspell dictionary's licence; the Str8ts trademark; Krazydad's terms; whether
PluginHost runs WebAssembly; whether erasing ink can damage a puzzle picture or template.
