# Retouch — agent guidance

Scoped guidance for `plugins/image-editing/`. Inherits the repository root `../../AGENTS.md`; this file
holds only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Built, device round pending** ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)): lasso one picture on the page and press
**Image Editing**, the plugin's one lasso button ([#226](https://github.com/martonpaulo/ink-tools/issues/226), `src/buttons.ts`), also a note
toolbar button the owner can pin, which with nothing lassoed shows ui-kit's Needs state
([#248](https://github.com/martonpaulo/ink-tools/issues/248)); its full view,
the editor (`src/editor.ts`, `src/EditorView.tsx`), shows the picture and every edit switched on in
Settings as a button: **Enhance**, **Lighter**, **Darker**, **Undo**, **Restore original**,
**Rotate 90°**, **Mirror**, **Flip**, **Invert** ([#131](https://github.com/martonpaulo/supernote-tools/issues/131)), **Trim** ([#132](https://github.com/martonpaulo/supernote-tools/issues/132)),
**Remove background**, **Make sticker** ([#134](https://github.com/martonpaulo/ink-tools/issues/134)) and **Document** ([#137](https://github.com/martonpaulo/supernote-tools/issues/137)). A tap
lassoes the picture again by its rect, runs the same `pressEdit` a lasso row ran, with the view's
status line in place of the toast, and shows the picture again from a fresh lasso preview.
**Crop** ([#132](https://github.com/martonpaulo/ink-tools/issues/132)) and **Erase** ([#134](https://github.com/martonpaulo/ink-tools/issues/134)) take the pen in the editor: the marks
drawn over the preview, mapped to page pixels, go through `cropBox` and `eraseMarks`. A pen move
draws nothing; when the pen lifts, Crop shows the stroke's dots, and Erase shows the picture with
that stroke erased by the same Java erase, run on the shown image into a `<ms>-stroke.png`, one
refresh per stroke; **Done** runs one page erase with every stroke, **Undo stroke** drops the last one
and **Cancel** drops them all ([#278](https://github.com/martonpaulo/ink-tools/issues/278)). The edit list takes its own height
first, and the picture keeps at least 30% of the screen ([#279](https://github.com/martonpaulo/ink-tools/issues/279)). When the
lasso held pen marks with the picture, they run at once through the shared `src/guide.ts`, which
reads the marks, deletes them and lassoes the picture alone. **Styles** ([#133](https://github.com/martonpaulo/supernote-tools/issues/133)) opens its
grid over the editor: `src/styles.ts` renders the picture in every style switched on into
`style-*.png` in its working folder, `src/StylesGrid.tsx` shows them, a tap runs that style through
`runEdit`, and `styles.json` keeps the last style and the two options. **Enhance All Images** and
**Undo All Images** ([#140](https://github.com/martonpaulo/ink-tools/issues/140)) lasso each picture of the page in turn by its rect and run
Enhance or Undo on it through `runEdit` (`src/page.ts`), then the editor closes. Back or **Close**
closes the editor and keeps the edited picture ([#204](https://github.com/martonpaulo/ink-tools/issues/204)). Settings
live in memory until [#40](https://github.com/martonpaulo/supernote-tools/issues/40)'s storage, as Lingo's do. While an edit runs the editor shows «Loading…» and waits
([#103](https://github.com/martonpaulo/ink-tools/issues/103)); an edit that changes nothing says why in the editor, and a missing
file permission is asked for when the editor opens (`src/press.ts`, [#170](https://github.com/martonpaulo/ink-tools/issues/170)). On a 960 x 870
picture on the Manta, Enhance took 3926 ms, Restore original 1274 ms and Document 2028 ms on a
1200 px photo (measured, 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)); the other edits' times are still to come
([#145](https://github.com/martonpaulo/ink-tools/issues/145)).

## What it is

Edit a picture already on the page, readable on the 16-grey screen with one tap. Scope:
`../../docs/plugin-scope.md` › retouch; product definition and limits: [`docs/product.md`](docs/product.md).

## How it works

- Read: `generateLassoPreview` writes the lassoed area as a PNG, the only pixel read the host gives
  (`../../docs/supernote.md`, [#130](https://github.com/martonpaulo/supernote-tools/issues/130)). The Java side crops its margin to the picture's rect.
- Edit: `native/src/com/retouch/image/Retouch.java`, plain Java, tested on the JVM
  (`npm run test:native`). It reuses `Decolor` and `EinkPixels` from `../../packages/picture-search/native`.
- Write: `modifyPageElements` with the lassoed element and the new `picture.picturePath`
  (`src/edit.ts`).
- Undo and Restore original: `src/history.ts` keeps each picture's states as PNG files in the
  working folder, listed in `history.json`, found again by note, page and rect.
- Working folder: `work/` in the private plugin folder (`getPluginDirPath`), which Supernote
  Cloud sync does not upload ([#198](https://github.com/martonpaulo/ink-tools/issues/198)). An install empties it, so Undo forgets
  the pictures edited before an update. Once per session, after the first press, `src/orphans.ts`
  removes the preview and state PNGs of Retouch's own naming that earlier builds left in
  `MyStyle/Retouch/`, and those in `work/` older than the session that the history does not name;
  it logs one `sweep:` line per folder ([#182](https://github.com/martonpaulo/ink-tools/issues/182)).
- Debug switch ([#134](https://github.com/martonpaulo/ink-tools/issues/134)): «Save edit input» in Settings, off by default and reset
  on restart, makes `RetouchModule` save each edit's lasso preview, the picture it edits and, for
  Remove background and Make sticker, the mask (black kept, white cleared) as
  `<edit>-<ms>-preview.png`, `-input.png` and `-mask.png` in `MyStyle/Retouch/debug/`
  (`src/debug.ts`). Every cutout logs its input's size, scale and alpha and gray stats
  (`Retouch.inputStats`) under the `Retouch` log tag.

## Rules

- No slider and no live preview: every step on e-ink costs a refresh. An edit is one tap.
- A new edit is one row of `EDITS` in `src/edits.ts`, one place in `EDITOR_GROUPS` of
  `src/editor.ts` and, for pixel work, one `Retouch.Edit`. Never a lasso button of its own: the
  lasso menu holds one Image Editing row ([#226](https://github.com/martonpaulo/ink-tools/issues/226)).
- A failure never writes on the page: it is logged, and the picture stays as it was.
- A missing `FILE:READ` or `FILE:WRITE` grant fails each edit at `getPageSize` with 1503 and
  nothing on the page ([#170](https://github.com/martonpaulo/supernote-tools/issues/170), `../../docs/supernote.md` › Plugins). So the editor
  checks both when it opens and each tap checks them again: one missing is asked for while the view
  shows. Removing its preview and state PNGs needs
  `FILE:DELETE` too ([#182](https://github.com/martonpaulo/supernote-tools/issues/182)).
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../ink2pic/docs/brief.md`.

## Reuse

Scaffold from the removed Lingo plugin ([#161](https://github.com/martonpaulo/ink-tools/issues/161)); native build from `../device-transfer/scripts/`; Java module names under Retouch's
own names through `Ink2PicFilesPackage` ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)).
