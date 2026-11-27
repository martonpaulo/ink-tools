# Note Editor

A macOS app to read and edit `.note` notebook files for Supernote tablets on the Mac, without
breaking the format ([#48](https://github.com/martonpaulo/ink-tools/issues/48)). **In progress**:
it opens a note read-only and pages through it; editing follows.

## The app

- **Open a note.** File › Open, Open Recent, a drop on the Dock icon or on a notebook window.
- **Open from Tablet** (File menu, Shift-Command-O). It lists the tablet's notes through
  [`inkctl`](../../cli/inkctl/), copies the one you choose to
  `~/Library/Application Support/com.martonpaulo.inktools.noteeditor/From Tablet/`, and opens
  the copy. Every call passes `--read-only`, so the tablet's file never changes. It needs `inkctl` in
  `~/.local/bin` (its README), `/opt/homebrew/bin` or `/usr/local/bin`, and the tablet on its cable.
- **Page through it.** The page list beside the page, which scales to the window. The arrow keys,
  Page Up and Page Down turn pages; Home and End go to the first and last page; the Go menu names them.

Build and open it on a Mac with Xcode 27:

```sh
make app
open "build/Note Editor.app"
```

`make check` builds, lints and tests it; `make help` lists every target.

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
