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
- Only Manta tones: the 16 screen greys and the pen colours of
  [`docs/supernote.md` › Greys and colours](../../docs/supernote.md#greys-and-colours). An inserted
  image is converted to Manta greys and shown as the tablet will show it; ink and text tools offer
  only the pen tones; no colour enters a note and no colour preview is shown.
- One exception to «the tablet writes», later: Edit through Supernote Cloud writes the `.note` on
  the Mac, with real vector strokes and elements, never a page bitmap alone, after a backup.
- Every owner decision of 2026-11-26, with its issue:
  [`docs/decisions.md` › Ink Notebook Editor scope of 2026-11-26](../../docs/decisions.md#ink-notebook-editor-scope-of-2026-11-26).

## Out of scope

- Handwriting or drawing input on the Mac.
- Search across all notes, Spotlight indexing, tabs and two notes side by side; Find in Note stays.
- Sharing with other people, collaboration, comments, publishing.
- Managing To-Do, Calendar or Digest; a later Quick capture only sends to them (Todoist, Apple
  Calendar, and Telegram «Saved Messages» for Digest) and never writes the tablet's database.
- The Partner app or an own sync server; Supernote Cloud beyond the editor's own note files.

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
  checks it): page navigation, page fit, the zoom steps and fit rules
  ([#319](https://github.com/martonpaulo/ink-tools/issues/319)), the tablet listing, the `inkctl` client and the
  watch of a note opened from the tablet ([#315](https://github.com/martonpaulo/ink-tools/issues/315)).
- `Sources/InkNotebookEditor/`: the SwiftUI app, `MainActor` by default. A read-only
  `DocumentGroup(viewing:)` of the imported type `com.martonpaulo.inktools.notebookeditor.note`,
  declared in `Support/Info.plist` with the role Viewer, so Ratta's own app keeps the `.note` files.
  Every visible word is in `Copy.swift`; `make strings` refreshes `Support/Localizable.xcstrings`.
- The tablet only through `inkctl`, never ADB (owner, 2026-11-16), and every read with
  `--read-only`; `files pull` passes `--allow-notes`, since the owner picks the note. Only the
  write path writes ([#313](https://github.com/martonpaulo/ink-tools/issues/313)).

## The write path

Every edit is one `TabletOperation` (`Sources/InkNotebookEditorKit/`): the note, the hash of the
Mac's copy it was made on, the page and the change. `WritePath.send` refuses it on another base,
keeps a backup of the copy (`NoteBackups`, the 10 newest per note in Application Support), sends it,
pulls the note back and stops when a page the edit did not touch changed (`NoteDiff.untouchedChanged`,
by page id). A failure leaves the Mac's copy and keeps the backup.

- Route T, the default: `inkctl note edit` hands the operations to the helper inside Device Link
  ([#312](https://github.com/martonpaulo/ink-tools/issues/312)), which applies them with the tablet's file API.
- Route B, recorded exceptions only, each refused while the note is open on the tablet:
  - a page move: `NoteWriter.movePage`, then `inkctl files push`; [#263](https://github.com/martonpaulo/ink-tools/issues/263) measured every
    layer and element block byte-equal, and the tablet's save rewrites only page metadata;
  - Revert to Backup: the backup's own bytes, pushed, pulled back and compared byte for byte.
  Firmware watch: [#318](https://github.com/martonpaulo/ink-tools/issues/318).
- Edit without waiting ([#314](https://github.com/martonpaulo/ink-tools/issues/314)): `BackgroundSender` queues each drawn edit and sends it in the
  background, one at a time; a run of nudges on the same elements is one request when it ends; a
  refusal gives back the editor's undo and a plain message; after a send only the edited page is
  drawn again. No operation reads a page's elements on the tablet.
- In the app, `NoteEditor` holds one note's edits, for a note opened from the tablet only: it draws
  the Mac's copy with every edit still on its way applied in order, so a refusal or an undo of a
  waiting edit only leaves that list; Edit › Undo and Redo follow `EditHistory`
  ([#328](https://github.com/martonpaulo/ink-tools/issues/328)), File › Revert to Backup lists the
  note's backups, and a refusal shows its sentence in a bar over the pages. Page moves, by a drag
  in the page list or Edit › Move Page Up and Down, are the first edit
  ([#330](https://github.com/martonpaulo/ink-tools/issues/330)).
- Pages are added and deleted by the helper ([#329](https://github.com/martonpaulo/ink-tools/issues/329)); the Mac draws them at once from
  `NotePreview`, an in-memory copy never written or sent. A deleted page's ink is only in the
  backup kept before its send, so its undo is that backup, by Revert to Backup's route B.
- A selection moves by a drag on it or the arrow keys, a run of nudges one request
  ([#325](https://github.com/martonpaulo/ink-tools/issues/325)); no Mac code writes strokes, so `LiftedInk` draws the move at once from the
  page's own pixels until the tablet's copy comes back. On a note from a file the drag still takes
  the selection out to another app.
- Insert › Picture…, Screenshot and Text Box…, a picture dropped on a page and Paste send a picture
  or a typed text box as tablet elements ([#264](https://github.com/martonpaulo/ink-tools/issues/264)). A picture is rounded to the 16 screen greys
  (`MantaGreys`) before the Mac draws or sends it; an insert's undo is the backup kept before it.
- Delete removes a selection by the helper's `deleteElements` ([#327](https://github.com/martonpaulo/ink-tools/issues/327)), drawn at once as the template
  where it was; its undo is the backup kept before its send.
- `NoteWriter.drawPicture` and `drawText` stay measuring tools of [#263](https://github.com/martonpaulo/ink-tools/issues/263), never writers.

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
