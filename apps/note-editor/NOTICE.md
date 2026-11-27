# Notice

The Note Editor is licensed under CC BY-NC-SA 4.0, as the repository is ([LICENSE](../../LICENSE)). It
contains code ported from a third-party project:

| Project | License | What it uses | Details |
| --- | --- | --- | --- |
| [supernote-tool](https://github.com/jya-dev/supernote-tool) (`supernotelib`) at commit `c1019f1c290ed5b586a9518978dbb78240b882d3` | Apache-2.0 | The `.note` parser, the RATTA_RLE decoder and the layer composition, ported to Swift | [below](#supernote-tool) |

## supernote-tool

Copyright (c) 2020 jya. Licensed under the Apache License, Version 2.0; the license text is in
[`NoteFormat/LICENSE-supernote-tool.txt`](NoteFormat/LICENSE-supernote-tool.txt).

Ported, in `NoteFormat/Sources/NoteFormat/` ([#261](https://github.com/martonpaulo/ink-tools/issues/261)):

- `NoteFile.swift` from `supernotelib/parser.py` (`SupernoteXParser`) and `fileformat.py`: the
  signature and its known versions, the footer address, the `<KEY:VALUE>` metadata blocks, the page
  and layer blocks, the duplicated `MAINLAYER` name, and the page sizes.
- `RattaRLE.swift` from `supernotelib/decoder.py` (`RattaRleDecoder`, `RattaRleX2Decoder`) and
  `color.py`: the run-length rules, the colour codes and the grey palette.
- `PageImage.swift` from `supernotelib/converter.py` (`ImageConverter`): the layer order and
  visibility, the blank `style_white` background and the custom template picture.

Changed: written in Swift; grey output only; the old `SN_FILE_ASA_` format, pages without layers
and the `SN_ASA_COMPRESS` encoding are not read; a page without `LAYERINFO` shows every layer, where
`supernotelib` shows only `MARK` layers; the background's empty pixels stay white 255; a run past
the page's pixel count fails at once.
