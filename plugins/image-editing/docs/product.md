# Retouch product definition

Status: current, 2026-11-16. Scope and the reuse check behind it are in
[`../../../docs/plugin-scope.md`](../../../docs/plugin-scope.md#retouch).

## Contents

- [What it is](#what-it-is)
- [Who it is for](#who-it-is-for)
- [What it does](#what-it-does)
- [What it will never do](#what-it-will-never-do)
- [Limits the owner set](#limits-the-owner-set)

## What it is

Retouch is a Supernote plugin that edits a picture already on the page. You lasso the picture and
press its one lasso row, «Image Editing», which opens the editor on the picture with every edit as
a button; each tap replaces the picture in place ([#226](https://github.com/martonpaulo/ink-tools/issues/226)).

## Who it is for

A Supernote Manta owner who puts photos, screenshots and drawings in notes and finds them faded
or too dark on the 16-grey screen.

## What it does

- Enhance for e-ink, Lighter, Darker, Undo and Restore original, each one tap
  ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)).
- Rotate 90° clockwise, Mirror (left to right), Flip (top to bottom) and Invert, which turns a
  dark-mode screenshot into paper, each one tap
  ([#131](https://github.com/martonpaulo/supernote-tools/issues/131)).
- Trim the white margins, one tap, and Crop with the pen: tap Crop, draw a rectangle on the
  picture in the editor, tap Crop again; or draw it on the page and lasso both
  ([#132](https://github.com/martonpaulo/supernote-tools/issues/132)).
- Remove background, which clears the border around the main object to transparent, and Make
  sticker, which puts the object on a white card, each one tap, and Erase with the pen: tap Erase,
  draw over the part to remove in the editor, tap Erase again, or draw on the page and lasso the
  picture and the marks; a band along each mark, and the inside of a mark that closes on itself,
  turns clear
  ([#134](https://github.com/martonpaulo/supernote-tools/issues/134)).
- Document, one tap: straighten a photographed page or whiteboard to an upright rectangle on a
  white background, cleaned to black and white. The page corners are found automatically; a photo
  with no clear page is cleaned without a warp, never distorted
  ([#137](https://github.com/martonpaulo/supernote-tools/issues/137)).
- Each edit is a button of the editor and a switch in Settings; the lasso menu holds one row,
  «Image Editing», never one per edit ([#226](https://github.com/martonpaulo/ink-tools/issues/226)).

## What it will never do

- Sliders for brightness, contrast or levels, or a live preview: every step costs one e-ink
  refresh ([#47](https://github.com/martonpaulo/supernote-tools/issues/47)).
- Scale a picture up.

## Limits the owner set

| Limit | Value | Set |
| :--- | :--- | :--- |
| Time of one edit | Within 2 s on the Manta, measured on the device; a longer one shows the plugin's «Working…» panel ([#103](https://github.com/martonpaulo/supernote-tools/issues/103)) | Owner, 2026-11-15 ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)) |
| Picture width after Enhance | At most the page width, never scaled up | Owner, 2026-11-15 ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)) |

## Measured edit times

Image Editing 0.1.0 beta 15 on the Manta, from the editor view's button to Retouch's own
`done in` log line, on the 960 x 870 px apple fixture (`MyStyle/Fixtures/fixture-photo-apple.png`)
([#145](https://github.com/martonpaulo/ink-tools/issues/145), 2026-11-25):

| Edit | Full width (976 x 886 on the page) | Small (400 x 362) |
| :--- | ---: | ---: |
| Enhance | 3750 ms | 1009 ms |
| Lighter | 2154 ms | 718 ms |
| Darker | 2100 ms | 736 ms |
| Undo | 1012 ms | 456 ms |
| Restore original | 1165 ms | 495 ms |
| Trim | | 994 ms |
| Remove background | | 910 ms |

Enhance, Lighter and Darker on a full-width picture pass the 2 s limit above.
