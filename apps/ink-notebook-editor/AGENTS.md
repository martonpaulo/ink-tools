# Ink Notebook Editor — agent guidance

Scoped guidance for `apps/ink-notebook-editor/`. Inherits the repository root `../../AGENTS.md`. A
`CLAUDE.md` symlink points at this file.

## What it is

A macOS app that reads and edits `.note` notebook files on the Mac without breaking the format,
like editing a PDF ([#48](https://github.com/martonpaulo/ink-tools/issues/48)). The scope is in
[`docs/plugin-scope.md` › Ink Notebook Editor](../../docs/plugin-scope.md#ink-notebook-editor);
the folder's place in the monorepo is in [`docs/architecture.md`](../../docs/architecture.md).
The reader and a read-only app exist ([#262](https://github.com/martonpaulo/ink-tools/issues/262)); the order is the Plan of [#48](https://github.com/martonpaulo/ink-tools/issues/48), with sub-issues [#261](https://github.com/martonpaulo/ink-tools/issues/261) to [#264](https://github.com/martonpaulo/ink-tools/issues/264).

## Scope

A computer editor for one note at a time (owner, 2026-11-26; the feature list is in
[`docs/plugin-scope.md` › Ink Notebook Editor](../../docs/plugin-scope.md#ink-notebook-editor)):

- Open a `.note` file on the Mac and show every page faithfully.
- Find and take content out: Mac OCR and the tablet's recognition, Find in Note, copy as text or
  image, and export (searchable PDF, Markdown) as getting the owner's own content out.
- Edit it without loss: select, move, resize, rotate, delete, copy and paste, pages, pictures,
  typed text boxes, Headings.
- The Mac shows, the tablet writes: every edit is a request that the tablet helper, a module of an
  existing plugin ([#304](https://github.com/martonpaulo/ink-tools/issues/304)), applies with the
  tablet's file API; the Mac pulls the note back and checks the untouched pages.
- Edit without waiting: the Mac draws each edit at once and sends it in the background, reads
  strokes from its own copy, sends only the targets, joins a run of edits into one request and
  redraws only the edited page; an edit kind slower than the write-path round's ceiling on a page
  of 500 or more strokes stays out of the first release.
- Mac OCR only reads and indexes: it never writes into the file.

## Out of scope

- Handwriting or drawing input on the Mac.
- Search across all notes; Find in Note stays.
- Sharing with other people, collaboration, comments, publishing.
- Managing To-Do, Calendar or Digest; a later Quick capture only sends to them, through Panoram,
  and never writes the tablet's database.

## First delivery: a faithful reader

1. Reuse, decided in [#261](https://github.com/martonpaulo/ink-tools/issues/261): `NoteFormat/` is a Swift port of
   `supernote-tool`'s reader (Apache-2.0, [NOTICE](NOTICE.md)). A Mac app cannot ship its Python
   runtime, and no Swift or macOS reader exists. Its page 1 of each public sample of
   `supernote-typescript` matched `supernote-tool`'s PNG pixel for pixel, but for the page white (255
   here, as `supernote-tool` gives). The sample with no `LAYERPROTOCOL` fails with a named error, as it
   fails in `supernote-tool`.
2. Test notebooks: `NoteFormat/Tests/NoteFormatTests/Fixtures/` holds notes the agent made on the
   tablet with `inkctl note new`, `note insert-page`, `note insert-text` and `note insert-picture`,
   each page beside the tablet's own PNG from `inkctl note png`. Handwriting from `Note/Tests/` is
   compared on the Mac only and never committed; never use the owner's own notebooks as fixtures.
3. Checked: every fixture page, and four handwriting pages, match the tablet's PNG to 0.003 % of
   pixels or less ([`docs/supernote.md` › Note file format](../../docs/supernote.md#note-file-format)).

Editing and write-back follow only once the reader is faithful.

## Name

The name is brand-free: «Ink Notebook Editor». «for Supernote notebooks» may appear only in a
description, never in the name, the bundle identifier or the icon
([`docs/decisions.md`](../../docs/decisions.md)).

## The app

A SwiftPM macOS app on the owner's Swift app standard (`bench-project-standards`'s `swift-apps.md`),
with this folder as its root: `Package.swift`, `Makefile`, `Support/`, `scripts/` and the shared
`.swiftlint.yml` and `.swift-format`, copied unchanged.

- `Sources/InkNotebookEditorKit/`: pure logic, Foundation and CoreGraphics only (`scripts/validate.sh`
  checks it): page navigation, page fit, the tablet listing and the `inkctl` client.
- `Sources/InkNotebookEditor/`: the SwiftUI app, `MainActor` by default. A read-only
  `DocumentGroup(viewing:)` of the imported type `com.martonpaulo.inktools.notebookeditor.note`,
  declared in `Support/Info.plist` with the role Viewer, so Ratta's own app keeps the `.note` files.
  Every visible word is in `Copy.swift`; `make strings` refreshes `Support/Localizable.xcstrings`.
- The tablet only through `inkctl`, never ADB (owner, 2026-11-16), and every call with
  `--read-only`; `files pull` passes `--allow-notes`, since the owner picks the note.

Differences from the standard, each for a reason:

- Not sandboxed: it starts `inkctl`, a program outside the bundle.
- No changelog, Sparkle, disk image or release: a personal app with no public distribution yet.
- `make lint` names `Sources Tests`, so it skips `NoteFormat/`, which has its own gate.

## Validation

The gate `ink-notebook-editor` (`gates.json`) runs `swift test` in `NoteFormat/`, then `make check`
here, in CI on the `xcode-27` runner (`.github/workflows/validate-ink-notebook-editor.yml`, one of
the per-subproject workflows of the root `ci-pipelines` divergence). A reader change keeps every
parse and decode failure a `NoteFormatError`, never a blank page, and adds its test in
`NoteFormat/Tests/`. An interface change lands with its renders: `RENDER_EVIDENCE=<dir> make renders`
draws every window state off screen, light and dark, at three sizes.
