# Device Link

`relay` is this plugin's internal name, kept in its npm package and data folder; the folder is `device-link` ([#176](https://github.com/martonpaulo/supernote-tools/issues/176)); it was Device Transfer up to 0.1.0 beta 13 and is Device Link from beta 14, with the same `pluginID` and `pluginKey`, so the tablet updates it in place ([#369](https://github.com/martonpaulo/ink-tools/issues/369)).

A Supernote plugin: send the current page, or a lasso selection, as a picture to your iPhone or
your Mac over [LocalSend](https://localsend.org), with one tap; and receive a text or a picture
from them straight into the open note.

**Status: built, not yet tried on the device.** The work is tracked in
[#98](https://github.com/martonpaulo/supernote-tools/issues/98), and the receive half in [#49](https://github.com/martonpaulo/supernote-tools/issues/49).

## What it does

- «Send Page» in the note's sidebar: the current page as a PNG.
- «Send Selection» in the lasso toolbar: only the selection as a PNG.
- «Send Text» in the lasso toolbar: the lassoed handwriting, recognised as text, which you read
  before you tap a device or «Cancel»; LocalSend shows it on the iPhone or the Mac as a message.
- Each send lists the LocalSend devices found, the last one you picked first; one tap sends.
  Settings picks the device listed first.
- «Receive» in the note's sidebar: for two minutes the tablet shows up in LocalSend as
  «Supernote». The first text arrives as a selected text box, the first PNG or JPEG as a floating
  picture; move it where you want it.
- Send a scanned PDF the same way: a new note appears in the Note folder, named after the time
  (`Scan 2026-11-16 0905`), with one page per PDF page as the page's background, so you write on
  it. Up to 50 pages and 30 MB ([#143](https://github.com/martonpaulo/supernote-tools/issues/143)).

## Send from the iPhone with one Shortcut

The Shortcut is ready-made: [Send to Supernote.shortcut](shortcuts/Send%20to%20Supernote.shortcut),
signed for anyone, built from [its source](shortcuts/Send%20to%20Supernote.plist)
([#49](https://github.com/martonpaulo/ink-tools/issues/49)).

1. Install LocalSend on the iPhone.
2. Open the `.shortcut` file on the iPhone and tap «Add Shortcut».
3. On the tablet, tap «Receive».
4. On the iPhone, share a text or a photo, pick «Send to Supernote», then LocalSend, then
   «Supernote».

The Shortcut shows in the Share Sheet for Text and Images. It converts an image to JPEG (iPhone
photos are HEIC, which the note does not take) and passes a text on as it is. LocalSend for iOS
has no Shortcuts action
([localsend#1074](https://github.com/localsend/localsend/issues/1074)), so the Shortcut ends in
the Share Sheet: the taps on LocalSend and on «Supernote» stay.

From the Mac, tap «Receive» and drop the text or the picture on «Supernote» in LocalSend.

## Built on

React Native + `sn-plugin-lib`, like `../lasso-actions`, with a native Java module for the network, as
`../plugin-diagnostics` has.
