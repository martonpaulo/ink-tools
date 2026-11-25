# Ink Notebook Editor

A macOS app to read and edit `.note` notebook files for Supernote tablets on the Mac, without
breaking the format ([#48](https://github.com/martonpaulo/ink-tools/issues/48)). **In progress**:
the reader exists, the app does not yet.

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
