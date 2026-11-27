# Note Editor

A macOS app to read and edit `.note` notebook files for Supernote tablets on the Mac, without
breaking the format ([#48](https://github.com/martonpaulo/ink-tools/issues/48)). **In progress**:
it opens a note and pages through it, and edits a note opened from the tablet.

## The app

- **Open a note.** File › Open, Open Recent, a drop on the Dock icon or on a notebook window.
- **Open from Tablet** (File menu, Shift-Command-O). It lists the tablet's notes through
  [`inkctl`](../../cli/inkctl/), copies the one you choose to
  `~/Library/Application Support/com.martonpaulo.inktools.noteeditor/From Tablet/`, and opens
  the copy. Every call passes `--read-only`, so the tablet's file never changes. It needs `inkctl` in
  `~/.local/bin` (its README), `/opt/homebrew/bin` or `/usr/local/bin`, and the tablet on its cable.
- **Page through it.** The page list beside the page, which scales to the window. The arrow keys,
  Page Up and Page Down turn pages; Home and End go to the first and last page; the Go menu names them.
- **Export the ink as vectors.** File › Export as Vector PDF… writes the note, and Export Page as
  SVG… the page in view: each stroke is the outline the tablet fills, over the page's template.

Build and open it on a Mac with Xcode 27:

```sh
make app
open "build/Note Editor.app"
```

`make check` builds, lints and tests it; `make help` lists every target.

## Editing

A note opened from the tablet is edited; a note opened from a file stays read-only. Every edit goes
by the write path of [`AGENTS.md`](AGENTS.md#the-write-path).

- In the app, `NoteEditor` holds one note's edits, for a note opened from the tablet only: it draws
  the Mac's copy with every edit still on its way applied in order, so a refusal or an undo of a
  waiting edit only leaves that list; Edit › Undo and Redo follow `EditHistory`
  ([#328](https://github.com/martonpaulo/ink-tools/issues/328)), File › Revert to Backup lists the
  note's backups, and a refusal shows its sentence in a bar over the pages; when an edit or a
  revert went to a conflict note instead, the bar's Open Conflict Note copies and opens that note
  in its own window ([#475](https://github.com/martonpaulo/ink-tools/issues/475)). Page moves, by a drag
  in the page list or Edit › Move Page Up and Down, are the first edit
  ([#330](https://github.com/martonpaulo/ink-tools/issues/330)).
- Pages are added and deleted by the helper ([#329](https://github.com/martonpaulo/ink-tools/issues/329)); the Mac draws them at once from
  `NotePreview`, an in-memory copy never written or sent. A deleted page's ink is only in the
  backup kept before its send, so its undo is that backup, by Revert to Backup's route B. Pages
  selected together in the page list are deleted as one edit, one request and one Undo. An added
  page is sent with its system template name (`PageTemplate`), without the screen suffix a page
  style carries in the file, which the tablet refuses. Insert Page… offers the tablet's own
  templates, system and custom, read each time its sheet opens (`inkctl note templates`,
  `TabletTemplates`, [#451](https://github.com/martonpaulo/ink-tools/issues/451)), else the note's
  own with why; a page on a template no page uses is drawn blank until the tablet's copy returns.
- A selection moves by a drag on it or the arrow keys, a run of nudges one request
  ([#325](https://github.com/martonpaulo/ink-tools/issues/325)); no Mac code writes strokes, so `LiftedInk` draws the move at once from the
  page's own pixels until the tablet's copy comes back. On a note from a file the drag still takes
  the selection out to another app.
- A resize, a rotation or a flip of a selection is one `ElementTransform`
  ([#326](https://github.com/martonpaulo/ink-tools/issues/326)): one matrix about the selection frame,
  kept on the page; strokes take the helper's `transformElements`, a text box its new rect and is
  never turned, a picture a new picture file at its new box; its undo is the backup kept before its
  send. The selection's handles resize it, Shift keeping the proportion, the knob above it rotates
  it, Shift by 15°, and Tools › Rotate Left, Rotate Right, Flip Horizontal and Flip Vertical, also
  VoiceOver actions, turn it. A change made before the tablet answers builds on the changes on
  their way (`ElementChain`), drawn from the ink the first of them lifted. A picture's new file is
  cut from the Mac's copy of the page, so ink over it goes with it, and a moved picture goes the
  same way; no element change of a page starts while a picture's change is on its way to it, as the
  tablet renumbers the page's elements.
- Insert › Picture…, Screenshot and Text Box…, a picture dropped on a page and Paste send a picture
  or a typed text box as tablet elements ([#264](https://github.com/martonpaulo/ink-tools/issues/264)). A picture is rounded to the 16 screen greys
  (`MantaGreys`) before the Mac draws or sends it; an insert's undo is the backup kept before it.
- Edit › Edit Text Box…, a double-click on a text box or its VoiceOver action opens one text box,
  made on the tablet or on the Mac, with its text and font size read from the Mac's copy, or from
  its edit still on its way ([#264](https://github.com/martonpaulo/ink-tools/issues/264)). Done sends one `modifyElements`
  with the new `text` and `fontSize`, which the helper sets on that text box; the box keeps its
  place and width and takes the height of its lines, wrapped ones counted. The Mac draws the template where the old
  text was and the new text over it at once; Undo is the backup kept before the send.
- Insert › Shape draws a line, an arrow, a rectangle, a rounded rectangle, an ellipse, a triangle or
  a diamond by a drag on the page, Shift keeping it square or straight; a click puts it at its
  default size there and Return in the middle of the page, and Escape cancels
  ([#350](https://github.com/martonpaulo/ink-tools/issues/350)). `ShapeDrawing` makes each one the
  tablet's own geometry element (`HelperElement.geometry`, `GeometryShape`: a line, a polygon, a
  circle or an ellipse at angle 0), which the helper inserts as type 700
  ([#463](https://github.com/martonpaulo/ink-tools/issues/463)), in black at one width; the Mac draws
  it at once, and its undo is the backup kept before its send.
- Delete removes a selection by the helper's `deleteElements` ([#327](https://github.com/martonpaulo/ink-tools/issues/327)), drawn at once as the template
  where it was; its undo is the backup kept before its send.
- Cut, Copy and Paste ([#327](https://github.com/martonpaulo/ink-tools/issues/327)): `PageElement.content` reads what each element holds; `ElementClipping`,
  our own pasteboard type, places it at the pointer or in place, and a paste is one `insertElements`,
  strokes as strokes with a `PenTone`. The Edit menu commands are still to come.

## The reader

`NoteFormat/` is a Swift package that reads a `.note` file and draws each page in grey
([#261](https://github.com/martonpaulo/ink-tools/issues/261)). Its `note-render` command draws one
page to PNG, or compares it with a reference PNG:

```sh
cd NoteFormat
swift run note-render My.note --page 1 --out page1.png
swift run note-render My.note --page 1 --compare tablet-page1.png
```

Unofficial. Not affiliated with or endorsed by Ratta. The reader is ported from
[supernote-tool](https://github.com/jya-dev/supernote-tool), Apache-2.0 ([NOTICE](NOTICE.md)).
