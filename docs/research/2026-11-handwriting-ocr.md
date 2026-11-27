# Handwriting OCR on the Mac: Apple Vision against the tablet's recognition

Status: research for [#321](https://github.com/martonpaulo/ink-tools/issues/321), measured on the
Mac on 2026-11-26. The Ink Notebook Editor reads both sources into one word index; this note
records how far they agree and how long Vision takes.

## Contents

- [Answer in short](#answer-in-short)
- [Method](#method)
- [Results](#results)
- [What is left](#what-is-left)

## Answer in short

- Vision found 70.0 % of the words the tablet recognised on 25 handwriting pages, with the Mac's
  preferred languages (English, Portuguese of Brazil, Spanish, Danish); 77.6 % on Spanish pages,
  78.4 % on Portuguese pages, 36.1 % on Chinese pages, which those languages do not cover.
- Vision returned about twice as many words as the tablet (1880 against 911). Without a typed
  transcript this note cannot say which source is right where they differ, so the editor keeps
  both: every tablet word, and each Vision word the tablet did not already hold at that place.
- Vision took 3.2 s a page with six preferred languages and 0.19 s a page with the note's one
  language, on an Apple silicon Mac. A 60-page note indexes in about three minutes in the
  background, once; the index is kept in the Caches folder by the note's content.

## Method

- Pages: the 25 first pages with five or more recognised words, up to six per note, of the owner's
  five Manta notes with Real-Time Recognition on (Spanish, Portuguese and Chinese). They were read
  on the Mac only and are not committed, as `apps/note-editor/AGENTS.md` says.
- Each page was drawn at 1920 x 2560 in greys and read by Vision's `RecognizeTextRequest` at the
  accurate level with language correction, the setting the editor uses.
- A tablet word counts as found when Vision returned the same word on the page, with case,
  accents and punctuation folded, each Vision word used once.
- Second run: Vision with only the note's own recognition language instead of the Mac's list.

## Results

| Languages given to Vision | Pages | Tablet words | Vision words | Found | Seconds a page |
| :--- | ---: | ---: | ---: | ---: | ---: |
| The Mac's preferred languages | 25 | 911 | 1880 | 70.0 % | 3.21 |
| The note's own language | 25 | 911 | 1877 | 68.7 % | 0.19 |

By the note's language, with the Mac's preferred languages: Spanish 548 words, 77.6 % found;
Portuguese of Brazil 194 words, 78.4 %; Chinese 169 words, 36.1 % (29.0 % with Chinese given
alone).

## What is left

- A typed transcript of handwriting test pages, written on the tablet in `Note/Tests/` during a
  device round, to measure each source against the truth rather than against each other.
- A note made on the tablet with recognition on, as a committed fixture of `NoteFormat`'s tests.
