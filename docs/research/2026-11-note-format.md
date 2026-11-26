# The note file format, element by element, for a Mac-written note

Status: research for [#362](https://github.com/martonpaulo/ink-tools/issues/362), 2026-11-26. It feeds
[#339](https://github.com/martonpaulo/ink-tools/issues/339) (a new note made on the Mac) and
[#363](https://github.com/martonpaulo/ink-tools/issues/363) (an edit through Supernote Cloud).
Firmware `Chauvet.E103.2610191001.2559`, note app `1.00.261015`, files `SN_FILE_VER_20260016`,
Manta (`N5`).

Marks: **[measured]** on notes the tablet wrote, read on the Mac; **[observed on the device]**
how the tablet's own note software behaves; **[community documentation]** a public source below,
not yet seen here; **[unknown]** not established.

## Contents

- [Answer in short](#answer-in-short)
- [The file](#the-file)
- [Element records](#element-records)
- [Per feature: how the tablet does it and how the editor does it](#per-feature-how-the-tablet-does-it-and-how-the-editor-does-it)
- [The proof notes](#the-proof-notes)
- [Left to study](#left-to-study)
- [Sources](#sources)

## Answer in short

- A note written on the Mac from scratch, with no tablet bytes copied, is byte-equal to a new note
  the tablet makes, but for its two random IDs (3110 bytes, `minimal.note` below) [measured].
- A second Mac-written note with strokes of three pens in the four pen tones, a stroke on Layer 1,
  a Heading, a keyword, a text box, a picture and a grid template reads back through `NoteFormat`
  with every element, point and layer pixel equal to what was written [measured]. Whether the
  Manta opens, lassos and erases it waits for a device check.
- The tablet accepts a file when its type is `note`, its signature names a known version, it ends
  with `tail` and the footer address, and every footer entry but `DIRTY` points at a block that
  fits in the file [observed on the device]. No checksum covers a block, a page or the file
  [observed on the device].
- The tablet never removes a stroke record on erase, lasso delete, lasso move or Real-Time Text:
  it gives the record a negative trail status and stops drawing it [community documentation,
  measured]. `NoteFormat` now leaves such records out of a page's elements.

## The file

| Part | What it holds | Mark |
| :--- | :--- | :--- |
| Signature | `note`, then `SN_FILE_VER_20260016`, 24 bytes | measured |
| Blocks | a 4-byte little-endian length, then the bytes; an address `0` means absent | measured |
| End | `tail`, then the footer's address | measured |
| Header (`FILE_FEATURE`) | a new note: `FILE_TYPE`, `APPLY_EQUIPMENT` `N5`, `FINALOPERATION_PAGE`, `FINALOPERATION_LAYER`, `DEVICE_DPI`, `SOFT_DPI`, `FILE_PARSE_TYPE`, `RATTA_ETMD`, `FILE_ID`, `FILE_RECOGN_TYPE`, `FILE_RECOGN_LANGUAGE`, `HORIZONTAL_CHECK`, `IS_OLD_APPLY_EQUIPMENT`, `ANTIALIASING_CONVERT`, in this order; an edited note adds `MODULE_LABEL`, `APP_VERSION`, `PDFSTYLE`, `PDFSTYLEMD5`, `STYLEUSAGETYPE`, `HIGHLIGHTINFO` | measured |
| `FILE_ID`, `PAGEID` | `F` or `P`, the local time to the microsecond (20 digits), then 12 letters and digits | measured, observed on the device |
| Footer | `PAGE<n>`, then `TITLE_`, `KEYWORD_`, `LINKO_` and `LINKI_` entries, `COVER_0`, `DIRTY`, `FILE_FEATURE` and one `STYLE_<template>` entry per template used | measured |
| Page block | a new page: `PAGESTYLE`, `PAGESTYLEMD5`, `LAYERSEQ`, `PAGEID`, the five layer addresses, `TOTALPATH`, `THUMBNAILTYPE`, `RECOGNSTATUS`, `RECOGNTEXT`, `RECOGNFILE`, `LAYERINFO`, `RECOGNTYPE`, `RECOGNFILESTATUS`, `RECOGNLANGUAGE`, `ORIENTATION`, `PAGETEXTBOX`, `DISABLE`; an edited page also has `EXTERNALLINKINFO` and `IDTABLE` | measured |
| Template | the `STYLE_` block is the background's `RATTA_RLE` bitmap, which the page's `BGLAYER` points at too; white is 300 runs of 16384 transparent pixels | measured |
| Saving | the tablet appends each changed block and a new footer at the end, then rewrites `tail` and the footer address; earlier bytes stay until a compaction | observed on the device |

## Element records

`TOTALPATH` holds a count, then one length-prefixed record per element in drawing order, the last on
top. A record is a 208-byte head, then length-prefixed arrays and fixed sections, as
[supernote-typescript's format notes](https://github.com/philips/supernote-typescript/blob/52dde1ecb0735d76df56e33226e80045339feb06/plans/vector-format-spec.md)
lay out [community documentation, measured]. What this study adds on Manta files:

| Field | Pen stroke | Stroke the file API inserts | Text box | Picture | Heading band |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Kind name | `others` | `others` | `0000` | `bitmap` | `0001` |
| Document name | `superNoteNote` | `superNoteNote` | `name is not set` | `name is not set` | `name is not set` |
| Head words 12 to 24 | `10, 0, 32, -1` | `0, 32, 32, 0` | `0, 32, 32, 0` | `0, 32, 32, 0` | `0, 32, 32, 0` |
| Record class (head 40) | `5000` | `5000` | `0` | `0` | `0` |
| Operation number (section 1, second word) | `97` | `0` | `30` | `20` | `400` |
| Points | the pen path | the given path | the frame, 5 corners | the frame, 5 corners | 2 corners |
| Pressures, angles | per point | pressures `2000`, no angles | zero | zero | zero |
| Page size in section 4 | `1920, 2560` | `1920, 2560` | `1404, 1872` | `1404, 1872` | `1404, 1872` |
| Element type in section 4 | `0` | `0` | `5000000` | `2000000` | `1000254` (the band's style) |
| First text field | `none` | `none` | 20 comma-separated base64 fields | 20 fields | 20 fields |

- Pen strokes drawn by hand, per tool, on public Manta samples (`SN_FILE_VER_20260016`): needle pen
  `pen 10`, ink pen `16`, calligraphy pen `15`, marker `11`; all carry the head words `10, 0, 32, -1`,
  record class `5000`, a pressure and an angle per point, and 2 fill-direction entries. Tones: `0`,
  `157`, `201`, `254`; the marker stores its black as `1` and its dark grey as `158`. Erasers: the
  stroke eraser `pen 3`, colour `255`, class `-2`, operation `601`; the area eraser `pen 9`, class
  `-4`, operation `603`; the eraser of the ink pen `pen 16`, colour `255`, class `-1`, operation `602`.
  The lasso is `pen 4`, class `-5`, operation `604`, followed by a second record whose operation
  says what the selection did (`14` delete, `4` and `2` move or copy) [measured on community
  samples; the eraser `602` also on a test note of this project].
- The 20 fields of a text box, a picture or a Heading band: two zeros, the element type, a creation
  time or `none`, the rectangle twice (`x,y,width,height`), three `none`, `0`, the font size, `none`,
  the content (the text, or the PNG), the style (text) or the PNG again (picture), then `47` or
  `0`, `1`, `1`, `0`, `none` [measured].
- A text box also sets the page's `PAGETEXTBOX` to `1` and adds its rectangle to `DISABLE`, which
  keeps recognition out of it [measured, community documentation].
- Points are stored down from the top and in from the right, in screen units: `21632` high and
  `16224` wide on a Manta page [measured].
- The outline the tablet keeps per stroke (rings of float points in page pixels) and a 16-byte
  `0xFF` entry per outline ring follow the arrays [measured]. The tablet makes the outline only
  when a stroke or element is created (by the pen, the lasso or the file API) and when it upgrades an
  old file; it does not make it again when it opens a note, and the lasso selects by the stored
  outline [observed on the device]. So a Mac-written stroke must carry its outline. The file API
  makes the outline for an element sent without one [observed on the device].
- Trail status, the first word after the five arrays that follow the points: `0` drawn; `-99`
  erased; `-16` deleted by the lasso or replaced by Real-Time Text; `-4` partly erased, its pieces
  follow as new records; `-3` moved, the moved copy is a later record [community documentation;
  `-16` measured on `realtime-text-tablet.note`]; `-5` removed by an undo, or replaced by the fill
  tool [observed on the device; measured on test notes after undo rounds].

## Per feature: how the tablet does it and how the editor does it

The editor's features: [`plugin-scope.md` › Ink Notebook Editor](../plugin-scope.md#ink-notebook-editor),
[#48](https://github.com/martonpaulo/ink-tools/issues/48) and [#332](https://github.com/martonpaulo/ink-tools/issues/332).
«Ours» is route T (the tablet's file API through the helper, [#313](https://github.com/martonpaulo/ink-tools/issues/313)) unless it says route B
(bytes the Mac writes).

| Feature | The tablet | Ours | Verdict | Mark | Issue |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Reading and drawing | draws a page from its layer bitmaps; can redraw them from the records | `NoteFormat` decodes the bitmaps; 0.003 % of pixels from the tablet's PNG | matches | measured | — |
| Elements of a page | draws only records whose trail status is not negative | read every record but erasers and Heading bands; now also leaves out a negative status | matched after the fix in this change | measured | [#362](https://github.com/martonpaulo/ink-tools/issues/362) |
| Page move | its own move keeps the `PAGEID`, renumbers the page in the `PAGE`, `TITLE_`, `KEYWORD_` and `LINKO_` footer keys, leaves each keyword block's `KEYWORDPAGE` as it was, and rewrites the header; the file API's move is a copy and a delete, so the page gets a new `PAGEID` | route B, `NoteWriter.movePage`: keeps every block and the `PAGEID`, renumbers `TITLE_`, `KEYWORD_`, `LINKO_` and `LINKI_` | matches but for `LINKI_` and the header | observed on the device, measured | [#442](https://github.com/martonpaulo/ink-tools/issues/442) |
| Page add, duplicate, delete | its own calls; a delete also removes the page's Headings, keywords and links | route T | matches | observed on the device | — |
| Strokes written on the Mac | records as above, with the outline the lasso uses | the proof writer writes file-API records with an outline | matches the reader; the lasso on the device waits for the device check | measured, observed on the device | [#362](https://github.com/martonpaulo/ink-tools/issues/362) |
| Eraser and lasso delete | keep the record, set its trail status | route T; the reader now hides them | matches | community documentation, measured | — |
| Lasso move, resize, rotate, flip | marks the old record moved and writes a moved copy with new outline and shift rectangles | route T | matches | community documentation | — |
| Pictures | `bitmap` record with the PNG in its fields, pixels in the main layer | route T; the proof writer writes the same record | matches the reader; the device check confirms | measured | [#362](https://github.com/martonpaulo/ink-tools/issues/362) |
| Text boxes | `0000` record with text, font size and font path; the page shows the main layer's pixels, and the tablet draws the box again in its font when the box is edited or moved | route T; the proof writer writes the record and its own pixels | the Mac must draw the text in a font the tablet has, or the box changes look on its first edit | observed on the device, measured | [#362](https://github.com/martonpaulo/ink-tools/issues/362) |
| Headings | a `0001` band record and a footer `TITLE_` block with the picture of the ink under it | route T; the proof writer writes both | matches the reader; the device check confirms | measured | [#362](https://github.com/martonpaulo/ink-tools/issues/362) |
| Keywords | a footer `KEYWORD_` block and a block with the word; on a page move only the key's page changes | the proof writer writes both | matches | measured, observed on the device | — |
| Links | a `LINKO_` block per link (`LINKTYPE` `0` page, `1` file, `4` web; `LINKFILE` the target's path in base64, `LINKFILEID` its `FILE_ID`, `PAGEID` the target page, `LINKBITMAP` the picture of the linked ink) and a `0000` record with operation `500` and element type `20000000` | not written | a link names its target by path, `FILE_ID` and `PAGEID`, so the Mac must keep all three | community documentation (a Nomad sample) | [#347](https://github.com/martonpaulo/ink-tools/issues/347), [#348](https://github.com/martonpaulo/ink-tools/issues/348) |
| Templates | the page draws the template bitmap stored in the note (`STYLE_`, `BGLAYER`), not the tablet's template file | the proof writer draws its own grid under a built-in name | a Mac-drawn template must equal the tablet's own pixels, or the note shows the Mac's | measured | [#362](https://github.com/martonpaulo/ink-tools/issues/362) |
| PDF backgrounds | `user_pdf_` style, a PNG in the background layer, `PDFSTYLELIST` | read | matches | measured | — |
| Layers | `LAYER1` to `LAYER3` blocks, `LAYERINFO` and `LAYERSEQ`, the record's layer number | the proof writer writes Layer 1 | matches the reader | measured | — |
| Recognition | per page `RECOGNTEXT`, `RECOGNFILE`, their statuses and `IDTABLE` (each stroke number to its recognition id); the tablet sets the status when it edits the page | route B and the writer keep the old blocks | differs | measured, observed on the device | [#440](https://github.com/martonpaulo/ink-tools/issues/440) |
| IDs and checks | random `FILE_ID` and `PAGEID`; per page a stroke number from 1; checks as in the answer above | the writer keeps IDs and makes new ones the same way | matches | measured, observed on the device | — |
| Backups | keeps its own copy of each note and puts it back when the file does not start with `note`; a thumbnail cache keyed by the note's inode, path and `FILE_ID` | 10 backups on the Mac ([#313](https://github.com/martonpaulo/ink-tools/issues/313)) | whether a pushed file leaves these stale [unknown] | observed on the device | [#441](https://github.com/martonpaulo/ink-tools/issues/441) |
| Conflicts | a sync conflict keeps a copy and offers a page-by-page merge matched by `PAGEID` | both copies kept ([#317](https://github.com/martonpaulo/ink-tools/issues/317)) | matches while the Mac keeps `PAGEID`s | observed on the device | — |
| Supernote Cloud | uploads and downloads whole files, checked by MD5 and size | not built ([#363](https://github.com/martonpaulo/ink-tools/issues/363)) | an upload must give the file's MD5 | observed on the device | [#363](https://github.com/martonpaulo/ink-tools/issues/363) |
| `DIRTY` | the count of page saves appended since the last compaction; above a limit that falls with the file's size the tablet compacts the note on open or close, which sets it back to `0` | a new Mac note writes `0` | matches; a Mac append should add one per page it appends | observed on the device, measured | [#362](https://github.com/martonpaulo/ink-tools/issues/362) |
| Write path | appends changed blocks and a new footer | route T by default; route B appends the same way | matches | observed on the device, measured | — |

## The proof notes

- Written by a throwaway tool kept out of the repository, from the layouts above; no byte of a
  tablet file is copied.
- `minimal.note`: one white page. Byte-equal to the tablet's new note `blank.note` (fixture) once
  both IDs are masked.
- `full.note`: two pages. Page 1: twelve strokes (needle pen 2 px, ink pen 4 px, marker 15 px, each
  in `#000000`, `#9D9D9D`, `#C9C9C9` and `#FEFEFE`), one stroke on Layer 1, a Heading of level 1
  with its band and its ink, a keyword over a stroke, a text box and a 400 x 300 picture. Page 2: a
  5 mm grid template and two strokes.
- Read back with `NoteFormat`: every element's kind, layer, box and point, the Heading, and every
  layer's pixels equal what was written. The device check (open, lasso, erase, recognition) is the
  open line of [#362](https://github.com/martonpaulo/ink-tools/issues/362).

## Left to study

1. The device check of `full.note`: opens, lassos and erases; that the Mac-written outline serves
   the lasso; how the text box, the grid template and the Heading look.
2. `LINKI_` on a page move and what the tablet rewrites in the header then
   ([#442](https://github.com/martonpaulo/ink-tools/issues/442)).
3. A Manta note with links of each kind, read on the Mac.

## Sources

- [supernote-typescript](https://github.com/philips/supernote-typescript) at `52dde1ec`
  (Apache-2.0): the record layout and the trail status, facts only.
- [snlib](https://github.com/Walnut356/snlib) at `e576c18a` (no licence: facts only) and
  walnut356's post [«Inspecting the Supernote .note format»](https://walnut356.github.io/posts/inspecting-the-supernote-note-format).
- [allenporter/supernote](https://github.com/allenporter/supernote) at `8414762a` (Apache-2.0):
  the header, footer, keyword, Heading and link blocks; its writer writes pictures of pages, not
  records.
- [supernote-tool](https://github.com/jya-dev/supernote-tool) at `c1019f1c` (Apache-2.0): the
  reader `NoteFormat` is ported from ([NOTICE](../../apps/ink-notebook-editor/NOTICE.md)).
