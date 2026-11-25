# Smart Shapes — agent guidance

Scoped guidance for `plugins/smart-shapes/`. Inherits the repository root `../../AGENTS.md`. A
`CLAUDE.md` symlink points at this file.

## What it is

A device plugin ([#253](https://github.com/martonpaulo/ink-tools/issues/253), owner D65 A): a stroke
held still at its end, as the native Smart Straight Line, becomes a clean triangle, circle, square,
rectangle or arrow. A figure smaller than the minimum size (default 16 mm, about two handwriting
lines) always stays ink, so a held «T» in a line of text never changes. It has no button; its
settings button opens the Settings view (`App.tsx`): the switch, the minimum size and each of the five
shapes. Its render is the `smart-shapes-settings` screen of the renders, `npm -C plugins/account-sync run renders`
([#265](https://github.com/martonpaulo/ink-tools/issues/265), [#288](https://github.com/martonpaulo/ink-tools/issues/288)).

## How it works

- `src/hold.ts`, `src/guard.ts` and `src/recognize.ts` come from Snap v0.9.0 (MIT), as
  [`NOTICE.md`](NOTICE.md) records; keep the notice with any copied code. The triangle, the square
  and the minimum size are this repository's own.
- `src/run.ts` joins the motion listener's hold to each pen-up, one stroke at a time; `src/snap.ts`
  decides and replaces against a host (`src/device.ts` on the tablet), so the tests run on a fake
  page.
- Replace order: wait for the pen to lift, save the stroke, delete it, insert the shape with
  `insertGeometry` in the active pen; a failed insert writes the stroke back.
- Delete route: through the lasso (`lassoElements` on the stroke's rect, then
  `deleteLassoElements`) when the lasso holds that stroke alone, which keeps the undo history
  [community, Snap]; else by its number (`deletePageElements`), which clears it [community, Snap].
  Whether one undo then brings the stroke back is a device check on the issue.

## Build and test

```sh
npm run validate   # lint, types, Jest over generated hand-drawn strokes and a fake page
npm run build      # build/outputs/SmartShapes.snplg; the device build is the CI prerelease
```
