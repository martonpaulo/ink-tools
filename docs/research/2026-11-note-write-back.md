# How Ink Notebook Editor writes a note back: Mac-written bytes or the tablet's file API

Status: research for [#263](https://github.com/martonpaulo/ink-tools/issues/263), 2026-11-26.
Device rounds 5 and 6 on the owner's Manta (firmware `Chauvet.E103.2610191001.2559`), on
agent-made test notes in `Note/Tests/` only, never the owner's notes. Tools: `note-tool` and
`note-render`, built from `apps/ink-notebook-editor/NoteFormat` (release), and `inkctl`.

Marks, as in [`../supernote.md`](../supernote.md): **[measured]** on the tablet in this round;
**[inference]** reasoned, not run.

## Contents

- [Answer in short](#answer-in-short)
- [The six cells](#the-six-cells)
- [Facts found on the way](#facts-found-on-the-way)
- [Reuse pass](#reuse-pass)

## Answer in short

- Route T, the tablet's file API through the helper inside Device Link, is the default for every
  edit: its pictures and text boxes are real elements that survive the tablet's next edit, and the
  pages it does not touch keep their bytes [measured].
- Route B, Mac-written bytes then `inkctl files push`, is kept only for a page move (0.5 s, every
  page block byte-equal) and for Revert to Backup. A Mac-written picture or text box is pixels only:
  the tablet's next ink write on that page redraws from the elements and drops it [measured].
- The rule lives in [`apps/ink-notebook-editor/AGENTS.md`](../../apps/ink-notebook-editor/AGENTS.md#the-write-path);
  its decision row is in [`../decisions.md`](../decisions.md#decision-index).

## The six cells

Base notes: `WB6 tpic 2026-11-26` and `WB6 ttext 2026-11-26`, each made by its own `inkctl note new`,
three pages, each page inked with `inkctl ink write` and read back with `note-render` before use.
Untouched pages were compared with `note-tool diff` (`NoteDiff.lines`) before and after each edit.

| Cell | Time, Mac command to file on the tablet | Opens on the tablet | Untouched pages | Seen |
| :--- | ---: | :--- | :--- | :--- |
| Mac move (1 to 3) | `note-tool move` under 0.01 s, `inkctl files push` 0.5 s | yes; each page's `inkctl note png` matches `note-render` (0.000 % of pixels) | every MAINLAYER, BGLAYER and TOTALPATH byte-equal | the tablet's first save rewrites only page metadata |
| Mac picture (page 2) | under 0.01 s plus 0.44 s push | yes; the screen shows the picture | byte-equal | pixels only: after a tablet ink write on that page the picture is gone |
| Mac text (page 2) | under 0.01 s plus 0.47 s push | yes | byte-equal | as the Mac picture: pixels only |
| Tablet move (`inkctl note move-page`, 1 to 3) | 15.0 s (the helper's `movePage` 433 ms) | yes | pages 2 and 3 byte-equal | the moved page gets a new PAGEID; it renders equal to the old page 1 (0.000 %) |
| Tablet picture (`inkctl note insert-picture`, page 2) | 4.8 s (the insert 39 ms) | yes; the picture shows, selected | pages 1 and 3 byte-equal | a real element: page 2's TOTALPATH grows 56342 to 58877 bytes; it stays after a tablet ink write |
| Tablet text (`inkctl note insert-text`, page 2) | 5.8 s (the insert 171 ms) | yes | pages 1 and 3 byte-equal | a real element (TOTALPATH 56342 to 57125 bytes); `note-render` equals the tablet's page PNG (0.001 %); it stays after a tablet ink write |

Most of a tablet cell's time is the screen steps of `inkctl`, not the file call. The time per edit
kind on a page of 500 or more strokes is measured with Edit without waiting
([#314](https://github.com/martonpaulo/ink-tools/issues/314)). Every test note was removed afterwards,
read back with `inkctl files ls Note/Tests` (51 to 41 entries, no write-back note left).

## Facts found on the way

Each is recorded once in [`../supernote.md`](../supernote.md):

- `insertNotePage` on the open note drops the ink written since its last save, so the helper saves
  first (round 5; the fix met on the tablet in round 6).
- The tablet's own page PNG leaves out every picture element; `note-render` of the pulled file
  draws it.
- Each `inkctl note new` note has its own file ID, and a tablet page move gives the page a new PAGEID.

## Reuse pass

Candidates read on 2026-11-25: `allenporter/supernote` (Apache-2.0: `reconstruct`, `merge`,
`NotebookAuthor.from_notebook()`, an X2 `RATTA_RLE` encoder), `liketheduck/supernote-ocr-enhancer`
(Apache-2.0), `DigiBugCat/supernote-sync` (no licence, facts only), `philips/supernote-typescript`
(Apache-2.0) and `j-raghavan/supernote-stickers` (MIT).

Choice: keep the project's own `NoteWriter` and port nothing [inference]. With route T as the
default, the Mac writes bytes only for a page move and a backup restore, which `NoteWriter` already
does with every page block byte-equal; none of the candidates is needed for those. `allenporter/supernote`
stays the reference for Mac-written vector strokes ([#362](https://github.com/martonpaulo/ink-tools/issues/362)).
