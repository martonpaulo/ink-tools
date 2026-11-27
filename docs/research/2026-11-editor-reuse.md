# Ink Notebook Editor: what existing software already gives the note reader, Markup and the document window

Status: research for [#460](https://github.com/martonpaulo/ink-tools/issues/460), 2026-11-27, with
[#459](https://github.com/martonpaulo/ink-tools/issues/459), [#350](https://github.com/martonpaulo/ink-tools/issues/350),
[#264](https://github.com/martonpaulo/ink-tools/issues/264), [#362](https://github.com/martonpaulo/ink-tools/issues/362) and
[#365](https://github.com/martonpaulo/ink-tools/issues/365). It follows the PDFKit prototype on
[#460](https://github.com/martonpaulo/ink-tools/issues/460) and the earlier notes
[`2026-11-note-format.md`](2026-11-note-format.md), [`2026-11-note-write-back.md`](2026-11-note-write-back.md) and
[`2026-11-editor-dependency-levels.md`](2026-11-editor-dependency-levels.md); it does not repeat them.

Marks: **[measured]** run here on a note the tablet wrote; **[documented]** a primary source below;
**[observed in the app bundle]** what a shipped app contains, read without running it; **[inference]** reasoned, not run.

## Contents

- [Answer in short](#answer-in-short)
- [What the editor relies on today](#what-the-editor-relies-on-today)
- [The shape records that stop the reader](#the-shape-records-that-stop-the-reader)
- [Supernote readers and renderers](#supernote-readers-and-renderers)
- [Other e-ink note tools](#other-e-ink-note-tools)
- [Apple frameworks and Mac PDF editors](#apple-frameworks-and-mac-pdf-editors)
- [Supernote's own apps](#supernotes-own-apps)
- [Licence fit](#licence-fit)
- [Recommendations](#recommendations)
- [Sources](#sources)

## Answer in short

- [#459](https://github.com/martonpaulo/ink-tools/issues/459) needs no new library. The pages fail on the tablet's
  shape records (`straightLine`, `GEO_circle`, `GEO_polygon`, and `GEO_ellipse` by the plugin library) and the star
  (`fiveStarsSignal`). Supernote's own plugin library names all of them as one element type, geometry `700`, with
  their fields [documented]. Each carries an ordinary point path and a drawn trail status [measured]. The fix is
  in `PageElements.swift`.
- The shapes of [#350](https://github.com/martonpaulo/ink-tools/issues/350) and
  [#352](https://github.com/martonpaulo/ink-tools/issues/352) have a public way in: the plugin library's `Geometry`
  model and `Element.geometry` [documented]. Smart Pen already inserts it on the open page. The Device Link helper has
  no geometry element yet.
- Apple's **PaperKit** is the public Markup framework. Preview links it [observed in the app bundle]. On macOS 26
  and later it gives a markup canvas, a Mac markup toolbar, and a data model of shapes, lines, text boxes and
  images [documented]. On macOS 27, which the editor targets, the model can be read back element by element
  [documented]. The PDFKit prototype on [#460](https://github.com/martonpaulo/ink-tools/issues/460) found no Markup UI
  in PDFKit. PaperKit is that missing part.
- `snnote-swift` (MIT, Swift, first released in 2026-11) is the first Swift reader of the format. It read every page
  of the owner's test note, shapes included, with no page skipped [measured]. It is too new and too narrow to replace
  `NoteFormat`: it has no picture kind and no writer. Its format notes, its rule «step over an unknown record and count
  it», and its public test corpus are worth reusing.
- No GPL or AGPL code fits the project's licence. MIT, BSD and Apache-2.0 code can be used if its notice is kept, as
  [`NOTICE.md`](../../NOTICE.md) already does.

## What the editor relies on today

- `NoteFormat/` is a Swift port of `supernote-tool`'s reader (Apache-2.0, at `c1019f1c`): the container, `RATTA_RLE`,
  and the layer composition ([`apps/ink-notebook-editor/NOTICE.md`](../../apps/ink-notebook-editor/NOTICE.md)).
- The element reader (`PageElements.swift`) is the project's own. It follows walnut356's public description of the
  record and does not use `supernote-tool`, which reads only bitmaps.
- Route T writes every element edit through the Device Link helper and the plugin library's file API
  ([`apps/ink-notebook-editor/AGENTS.md`](../../apps/ink-notebook-editor/AGENTS.md#the-write-path)). The helper's
  element kinds are `stroke`, `text` and `picture` (`plugins/device-link/src/editor/operations.ts`).

## The shape records that stop the reader

Measured on the two copies of the owner's test note. The Mac copy has 33 pages and the newer copy from the tablet has
54. The reader ran from a scratch copy of `NoteFormat`, and only counts and kind names were printed.

| Kind name | Records | Points | Trail status, operation | Head words 12 to 24 | Document name |
| :--- | ---: | :--- | :--- | :--- | :--- |
| `others` (pen ink) | about 15,400 | the pen path | `0`, `97` | `…, 10, 0, 32` | `superNoteNote` |
| `straightLine` | 53 | 2, the ends | `0`, `97` | `…, 0, 32, 32` | `name is not set` |
| `GEO_circle` | 72 | more than 64, the outline | `0`, `97` | `…, 0, 32, 32` | `name is not set` |
| `GEO_polygon` | 71 | 5 for a rectangle, more for other polygons | `0`, `97` | `…, 0, 32, 32` | `name is not set` |
| `fiveStarsSignal` | 1 | 6 | `0`, `0` | `…, 10, 0, 32` | `superNoteNote` |
| `bitmap` | 19 | 5, the frame | `0`, `97` or `20` | `0, 0, 32, 32` | both names occur |

- 19 of the 54 pages fail today. Each fails on its first shape record: «element N is of an unknown kind», and the whole
  page has no elements ([#459](https://github.com/martonpaulo/ink-tools/issues/459), cause already on the issue).
- The record layout is the one the reader already walks. Only the kind test refuses them [measured].
- The plugin library (`sn-plugin-lib` 0.2.3, MIT, `lib/typescript/src/model/Element.d.ts`) defines [documented]:
  - `Element.TYPE_GEO = 700` and `TYPE_FIVE_STAR = 800`, with `Element.geometry` and `Element.fiveStar`;
  - `Geometry`: `type` (`straightLine`, `GEO_circle`, `GEO_ellipse`, `GEO_polygon`), `penColor`, `penType`, `penWidth`,
    `points`, and `ellipseCenterPoint`, `ellipseMajorAxisRadius`, `ellipseMinorAxisRadius` and `ellipseAngle`;
  - `PluginCommAPI.insertGeometry` and `modifyLassoGeometry` for the open page, and `PluginFileAPI.insertElements`,
    `modifyElements` and `deleteElements` for a note file.
- So a circle or an ellipse keeps its centre and radii in the model, and its record also carries the outline as points.
  Selecting it by its points works today. Editing it by its corners
  ([#352](https://github.com/martonpaulo/ink-tools/issues/352)) needs the model's fields [inference].
- Unknown: whether `insertElements` on a closed note accepts an element of type `700`. Smart Pen uses only
  `insertGeometry` on the open page. This is the first device check of the geometry issue.

## Supernote readers and renderers

Activity is the last push on GitHub, read 2026-11-27.

| Project | Licence | Language | Activity | What it reads or writes | For our issues |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [jya-dev/supernote-tool](https://github.com/jya-dev/supernote-tool) (`supernotelib`) | Apache-2.0 | Python | 2026-08 | container, bitmaps, PNG, PDF, SVG by tracing the bitmap, text | already ported; no strokes, so nothing for [#459](https://github.com/martonpaulo/ink-tools/issues/459) |
| [altessa-s/snnote-swift](https://github.com/altessa-s/snnote-swift) on [snnote-lib](https://github.com/altessa-s/snnote-lib) v1.0.0 | MIT | Swift over C23 | created 2026-10, last push 2026-11-21, no stars | container, bitmaps, every stroke record with status, role, kind and outline, Headings, keywords, links, text boxes, recognition, `.mark`, LZ4 stroke logs; read only | read all 54 pages of the test note in 1.6 s, 0 skipped; shapes come back as `other("GEO_circle")` and `other("GEO_polygon")`, drawn; pictures come back as `other("bitmap")` [measured]. Format reference and test oracle for [#459](https://github.com/martonpaulo/ink-tools/issues/459) |
| [philips/supernote-typescript](https://github.com/philips/supernote-typescript) | Apache-2.0 | TypeScript | 2026-11 | records, `straightLine` and stars, eraser and lasso status, vector ink, SVG, searchable PDF (raster with the recognised words as invisible text), 27 public fixtures | reference for [#365](https://github.com/martonpaulo/ink-tools/issues/365) (`svg.ts`, `vector-ink.ts`) and the corpus for reader tests |
| [philips/supernote-obsidian-plugin](https://github.com/philips/supernote-obsidian-plugin) | MIT | TypeScript | 2026-10 | a viewer and exporter on `supernote-typescript` | a product reference: view, export and copy as image |
| [allenporter/supernote](https://github.com/allenporter/supernote) | Apache-2.0 | Python | 2026-11 | a private cloud server and a notebook library: header, footer, keywords, Headings, links, an X2 `RATTA_RLE` encoder, page pictures | reference for a Mac-written file ([#362](https://github.com/martonpaulo/ink-tools/issues/362)); its writer writes pictures, not records |
| [Walnut356/snlib](https://github.com/Walnut356/snlib) | none | Rust | 2026-02 | records | facts only |
| [altessa-s/snrender-go](https://github.com/altessa-s/snrender-go), [snnote-go](https://github.com/altessa-s/snnote-go) | MIT | Go over C | 2026-11 | PNG, SVG and PDF output on the same C library | the same author's renderer; not tried here |
| [dsummersl/sn2md](https://github.com/dsummersl/sn2md) | AGPL-3.0 | Python | 2026-11 | notes to Markdown through `supernotelib` | licence does not fit |

`snnote-swift` checks its pages against the Supernote Private Cloud's own converter, which runs as a container. It
matches within one grey level [documented]. The same converter could check `NoteFormat` too [inference].

## Other e-ink note tools

| Project | Licence | Language | Activity | What it gives |
| :--- | :--- | :--- | :--- | :--- |
| [ricklupton/rmscene](https://github.com/ricklupton/rmscene) | MIT | Python | 2026-04 | reads reMarkable v6 `.rm` files: a scene tree of layers, lines and text, read without loss |
| [ricklupton/rmc](https://github.com/ricklupton/rmc) | MIT | Python | 2026-11 | converts `.rm` to SVG and PDF, and text to `.rm` |
| [ax3l/lines-are-rusty](https://github.com/ax3l/lines-are-rusty) | ISC | Rust | 2021 | older `.rm` reader and SVG output |
| [lucasrla/remarks](https://github.com/lucasrla/remarks) | GPL-3.0 | Python | 2024 | annotations over PDF and EPUB; licence does not fit |

They solve the same problem for another tablet. The scene is a typed tree that keeps unknown blocks and writes them
back, and SVG and PDF are written straight from the stroke model. These are design references only. No code is
needed from them.

## Apple frameworks and Mac PDF editors

Preview 27's load commands list these frameworks (read with `otool -L`, no other part of Preview examined). The public
ones that carry its document window:

| Preview feature | Public framework | Mac availability | For our issues |
| :--- | :--- | :--- | :--- |
| Page view, fit, thumbnails, find, text selection | PDFKit (`PDFView`, `PDFThumbnailView`, `PDFDocument.findString`, `PDFPageOverlayViewProvider`) | 10.4 and later; overlays 13 | the prototype on [#460](https://github.com/martonpaulo/ink-tools/issues/460): view, fit, thumbnails and find work |
| Markup: shapes, lines with arrows, text boxes, signatures, the markup toolbar | **PaperKit** (`PaperMarkupViewController`, `MarkupToolbarViewController`, `PaperMarkup`, `ShapeMarkup`, `ShapeConfiguration`) | 26; `ShapeMarkup` and `PaperMarkup.subelements` 27 | [#460](https://github.com/martonpaulo/ink-tools/issues/460) Markup, [#350](https://github.com/martonpaulo/ink-tools/issues/350), [#351](https://github.com/martonpaulo/ink-tools/issues/351), [#264](https://github.com/martonpaulo/ink-tools/issues/264) |
| Live Text over a picture | VisionKit (`ImageAnalysisOverlayView`) | 13 | Mac OCR ([#321](https://github.com/martonpaulo/ink-tools/issues/321)) |
| Quick Look, Share | QuickLookUI, AppKit sharing | long-standing | [#323](https://github.com/martonpaulo/ink-tools/issues/323) |

Preview also links private frameworks (AnnotationKit, CorePDF, VisionKitCore). They are not usable, and PaperKit,
PDFKit and VisionKit are their public side.

PaperKit in detail [documented]:

- `ShapeConfiguration.Shape`: `rectangle`, `roundedRectangle`, `ellipse`, `line`, `arrowShape`, `regularPolygon`,
  `star`, `chatBubble`. This is the shape set of [#350](https://github.com/martonpaulo/ink-tools/issues/350) and
  [#351](https://github.com/martonpaulo/ink-tools/issues/351).
- `PaperMarkup` has `insertNewShape(configuration:frame:rotation:)`, `insertNewLine(configuration:from:to:startMarker:endMarker:)`,
  `insertNewTextbox(attributedText:frame:rotation:)` and `insertNewImage(_:frame:rotation:)`. It also has
  `dataRepresentation()` and `draw(in:frame:options:)`, and on macOS 27 `subelements`, so every element the person
  made can be read back.
- `ShapeMarkup` (27) exposes `shape`, `strokeColor`, `fillColor`, `lineWidth`, the line markers and `attributedText`.
  These are the fields a tablet geometry element or text box needs.
- `FeatureSet` limits what the toolbar offers. With it, the tools can offer only what the tablet keeps: no fill
  colour, the Manta tones only, and no inks if handwriting on the Mac stays out of scope.
- Unknown until a prototype: how a `PaperMarkupViewController` sits over a `PDFView` page or over the editor's own page
  view, and how its coordinates map to page pixels.

Mac PDF editors:

- [Skim](https://skim-app.sourceforge.io/) (BSD-3-Clause, Objective-C on PDFKit, SourceForge SVN, files released
  2026-11) has its own `PDFView` subclass with note tools, snapshots and a notes panel. It is a reference for toolbar
  and notes-panel behaviour. Copying is allowed under BSD with its notice. It brings Objective-C and PDF-annotation
  code that a tablet element model does not need.
- No maintained open-source Swift PDFKit Markup editor was found. The prototype on
  [#460](https://github.com/martonpaulo/ink-tools/issues/460) and PaperKit cover that part.

## Supernote's own apps

- Supernote Partner for Mac 2.6.0 (2026-10-12) syncs notes, exports a note as text, and shares the Mac keyboard as
  text input on the tablet [documented]. The mobile app lists file actions (view, upload, download, move, rename, copy,
  delete) and exports to text and PDF [documented]. Neither page offers editing the strokes or elements of a note.
- The Mac app is a Flutter app. It ships a native note library (`flutter_note_lib`) beside MyScript's recognition
  libraries, MuPDF and OpenCV [observed in the app bundle]. Of the record kind names, that library contains only
  `others` and `fiveStarsSignal`, with no shape kind [observed in the app bundle]. So the app most likely draws a shape
  from its stored layer pixels or as ordinary ink, never from the geometry fields [inference].
- The owner's Reddit thread on editing notes in the mobile and desktop apps
  (`r/Supernote`, post `1jhpwnh`) could not be read: reddit.com, old.reddit.com, the `.json` and `.rss` forms and a
  reader service all returned a login wall or 403. Its points are not in this note.
- Unmet needs seen in the two official pages: editing on the computer, adding pictures or typed text from the
  computer, and a vector export. These are [#264](https://github.com/martonpaulo/ink-tools/issues/264),
  [#350](https://github.com/martonpaulo/ink-tools/issues/350) and [#365](https://github.com/martonpaulo/ink-tools/issues/365) [inference].

## Licence fit

- The project is CC BY-NC-SA 4.0 ([`LICENSE`](../../LICENSE)). Each subproject's `NOTICE.md` keeps third-party
  licences ([`NOTICE.md`](../../NOTICE.md)).
- MIT, BSD, ISC and Apache-2.0 code may be ported or linked into it, if the notice is kept, and for Apache-2.0
  also its change statement. This is what the `supernote-tool` port and Tabler Icons already do.
- GPL-3.0 and AGPL-3.0 code may not be used. Their copyleft needs the combined work under the GPL, and the
  NonCommercial term is an added restriction the GPL forbids. This excludes `sn2md` and `remarks`.
- A repository with no licence gives facts only (`snlib`, `olaink`).
- Apple frameworks are platform APIs and need no notice.

## Recommendations

| Order | Decision | What | Issues |
| :--- | :--- | :--- | :--- |
| 1 | Use existing project capability | read `straightLine`, `GEO_*` and `fiveStarsSignal` in `PageElements.swift` as a geometry element, and step over a still-unknown kind with a counted cause, as `snnote-lib` does | [#459](https://github.com/martonpaulo/ink-tools/issues/459) |
| 2 | Use native platform capability | send Mac shapes as the tablet's own geometry element (`Element.geometry`, type `700`) through the helper | [#463](https://github.com/martonpaulo/ink-tools/issues/463); serves [#350](https://github.com/martonpaulo/ink-tools/issues/350), [#352](https://github.com/martonpaulo/ink-tools/issues/352) |
| 3 | Prototype before deciding | PaperKit's canvas and Mac toolbar over a note page, with `ShapeMarkup` mapped to geometry elements and text boxes | [#464](https://github.com/martonpaulo/ink-tools/issues/464); serves [#460](https://github.com/martonpaulo/ink-tools/issues/460), [#350](https://github.com/martonpaulo/ink-tools/issues/350), [#264](https://github.com/martonpaulo/ink-tools/issues/264) |
| 4 | Use maintained dependency, for tests only | run the reader over `supernote-typescript`'s public corpus, and compare with `snnote-swift`, so the next unknown kind fails a test, not the owner's note | [#465](https://github.com/martonpaulo/ink-tools/issues/465) |
| — | Build custom, with references | vector SVG and PDF from each record's stored outline, with `supernote-typescript`'s `svg.ts` as the reference | [#365](https://github.com/martonpaulo/ink-tools/issues/365) |

Not adopted: `snnote-swift` as the runtime reader (no picture kind, no writer, weeks old, one author, and a second
parser beside `NoteFormat`); Skim's code (Objective-C, PDF annotations, not tablet elements); every reMarkable tool
(another format).

## Sources

- `sn-plugin-lib` 0.2.3 (MIT), as installed in `plugins/word-lookup/node_modules`: `model/Element.d.ts`,
  `sdk/PluginCommAPI.d.ts`, `sdk/PluginFileAPI.d.ts`.
- [altessa-s/snnote-swift](https://github.com/altessa-s/snnote-swift) at `bfb480c` (2026-11-21), its README and
  `docs/FORMAT.md`; [snnote-lib](https://github.com/altessa-s/snnote-lib) v1.0.0 at `2cab8367`.
- [philips/supernote-typescript](https://github.com/philips/supernote-typescript) at `52dde1ec`, `plans/vector-format-spec.md`.
- Apple documentation (DocC data, read 2026-11-27): [PaperKit](https://developer.apple.com/documentation/paperkit),
  [PaperMarkup](https://developer.apple.com/documentation/paperkit/papermarkup),
  [ShapeMarkup](https://developer.apple.com/documentation/paperkit/shapemarkup),
  [MarkupToolbarViewController](https://developer.apple.com/documentation/paperkit/markuptoolbarviewcontroller),
  [PDFPageOverlayViewProvider](https://developer.apple.com/documentation/pdfkit/pdfpageoverlayviewprovider),
  [ImageAnalysisOverlayView](https://developer.apple.com/documentation/visionkit/imageanalysisoverlayview); PencilKit's
  `PKCanvasView` is not available on macOS, only on Mac Catalyst.
- Supernote support: [Partner app for desktop](https://support.supernote.com/supernote-partner-app-for-desktop) and
  [Partner app for mobile](https://support.supernote.com/1753209-supernote-partner-app), both updated 2026-10-12.
- [Skim](https://skim-app.sourceforge.io/) and its [SourceForge project](https://sourceforge.net/projects/skim-app/).
