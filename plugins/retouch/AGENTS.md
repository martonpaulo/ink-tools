# Retouch — agent guidance

Scoped guidance for `plugins/retouch/`. Inherits the repository root `../../AGENTS.md`; this file
holds only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Built, device round pending** ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)): lasso one picture on the page and tap
**Enhance**, **Lighter**, **Darker**, **Undo**, **Restore original**, **Rotate 90°**, **Mirror**,
**Flip**, **Invert** ([#131](https://github.com/martonpaulo/supernote-tools/issues/131)), **Trim** ([#132](https://github.com/martonpaulo/supernote-tools/issues/132)) or **Document** ([#137](https://github.com/martonpaulo/supernote-tools/issues/137)) in
the lasso menu. Each is a
lasso button for pictures, run with no view, and a switch in Settings, all on by default.
**Styles** ([#133](https://github.com/martonpaulo/supernote-tools/issues/133)) is the one lasso button with a view: `src/styles.ts` renders the
picture in every style switched on into `MyStyle/Retouch/style-*.png`, `src/StylesGrid.tsx` shows
them, a tap runs that style through `runEdit`, and `styles.json` keeps the last style and the two
options. **Enhance All Images** and **Undo All Images** ([#140](https://github.com/martonpaulo/ink-tools/issues/140)) lasso each picture of the
page in turn by its rect and run Enhance or Undo on it through `runEdit` (`src/page.ts`). Settings
live in memory until [#40](https://github.com/martonpaulo/supernote-tools/issues/40)'s storage, as Lingo's do. An edit past 2 s shows the shared «Loading…» strip at the top of the note
([#103](https://github.com/martonpaulo/ink-tools/issues/103)); a press that changes nothing shows a toast with the reason, and a
missing file permission opens Settings, which asks for it (`src/press.ts`, [#170](https://github.com/martonpaulo/ink-tools/issues/170)). The time of
each edit on the Manta is still to come ([#145](https://github.com/martonpaulo/ink-tools/issues/145)).

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
- Undo and Restore original: `src/history.ts` keeps each picture's states as PNG files in
  `MyStyle/Retouch/`, listed in `history.json`, found again by note, page and rect.

## Rules

- No slider and no live preview: every step on e-ink costs a refresh. An edit is one tap.
- A new edit is one row of `EDITS` in `src/edits.ts` and, for pixel work, one `Retouch.Edit`.
- A failure never writes on the page: it is logged, and the picture stays as it was.
- Every button runs with no view, so it works only once `FILE:READ` and `FILE:WRITE` are «Always
  Allow»: the host shows a no-view request at the next press and revokes «Allow This Time Only» at
  the press after, and a missing grant fails each press at `getPageSize` with 1503 and nothing on
  the page ([#170](https://github.com/martonpaulo/supernote-tools/issues/170), `../../docs/supernote.md` › Plugins). So each press checks both
  first: one missing gives the toast and opens Settings, which asks while its view shows. Removing its preview and state PNGs needs
  `FILE:DELETE` too ([#182](https://github.com/martonpaulo/supernote-tools/issues/182)).
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../ink2pic/docs/brief.md`.

## Reuse

Scaffold from the removed Lingo plugin ([#161](https://github.com/martonpaulo/ink-tools/issues/161)); native build from `../relay/scripts/`; Java module names under Retouch's
own names through `Ink2PicFilesPackage` ([#142](https://github.com/martonpaulo/supernote-tools/issues/142)).
