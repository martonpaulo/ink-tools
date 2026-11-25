# Device Transfer

`relay` is this plugin's internal name, kept in its npm package and data folder; the folder is `device-transfer` ([#176](https://github.com/martonpaulo/supernote-tools/issues/176)).

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

1. Install LocalSend on the iPhone.
2. In Shortcuts, make a new Shortcut and turn on «Show in Share Sheet» for Text and Images.
3. Add «Convert Image» to JPEG (iPhone photos are HEIC, which the note does not take).
4. Add LocalSend's share action, or «Share» and pick LocalSend, then «Supernote».
5. On the tablet, tap «Receive», then share from the iPhone with the Shortcut.

From the Mac, tap «Receive» and drop the text or the picture on «Supernote» in LocalSend.

## Built on

React Native + `sn-plugin-lib`, like `../word-lookup`, with a native Java module for the network, as
`../plugin-diagnostics` has.
