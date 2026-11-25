# Snap after v0.9.0: what changed, and whether Smart Shapes should take it

Status: research for [#267](https://github.com/martonpaulo/ink-tools/issues/267), 2026-11-25.
Source: the public repository `CharlesCheval/supernote-snap`, read at its tags `v0.9.0` (2026-10-03,
the last MIT release, the base of Smart Shapes, [#253](https://github.com/martonpaulo/ink-tools/issues/253)),
`v0.9.1` (2026-10-08), `v0.9.3` (2026-10-20) and `v0.9.4` (2026-11-12, the newest), with
`git diff v0.9.0 v0.9.4` (19 commits, about 900 lines added, half of them in `src/recognize.ts` and
`src/snapper.ts`), compared with `plugins/smart-shapes/` at `342a9d9`.

Every change below is described by its behavior only. This note quotes no Snap code written after
v0.9.0, as that code is under CC BY-NC-SA 4.0.

Marks: **[community]** Snap's code or release notes; **[measured]** by Snap's author on a tablet, as
its code comments and release notes report; **[inference]** reasoned here, not run.

## Contents

- [Answer in short](#answer-in-short)
- [What changed after v0.9.0](#what-changed-after-v090)
- [The three options](#the-three-options)
- [If the newer code were taken](#if-the-newer-code-were-taken)
- [Recommendation](#recommendation)

## Answer in short

- **Recommendation: reimplement the useful ideas ourselves under MIT, with no copied code** (option B).
- The later Snap work is small. Two parts matter to Smart Shapes: the placement fix for a page made
  for another device, and three refinements of the triangle. Both are ideas and device facts we can
  write ourselves from their behavior.
- The placement fix is a likely defect of three of our plugins, not only Smart Shapes. It is its own
  issue: [#269](https://github.com/martonpaulo/ink-tools/issues/269).
- Taking the code would make Smart Shapes non-commercial and share-alike for a gain of a few hundred
  lines, so it does not pay.

## What changed after v0.9.0

| Area | Release, file | Snap's change | What Smart Shapes would gain |
| :--- | :--- | :--- | :--- |
| Licence | v0.9.1, `LICENSE`, `package.json` | MIT becomes CC BY-NC-SA 4.0; no code changes in this release [community]. | Nothing. |
| Device support | v0.9.4, `src/pagemap.ts`, `src/snapper.ts` | Pen (EMR) points convert to pixels with the **display** size, then scale to the page's own size by page over display. On an A6X note on a Manta, converting with the page size put the shape 516 px to the left, and the display size alone made it 37 % too large [measured]. | Smart Shapes converts with the page size only (`emrToPage` in `packages/sn-adapter/src/official/elements.ts`), as do Real-Time Conversion and Image Editing [inference]: shapes would land in the wrong spot on a note from another model. The fix is a device fact: [#269](https://github.com/martonpaulo/ink-tools/issues/269). |
| Supported shapes | v0.9.3, `src/recognize.ts`, `src/settings.ts` | A triangle: the largest triangle on the stroke's convex hull, tried before the rectangle and the circle [community]. | Smart Shapes already has its own triangle (its two farthest points, then the point farthest from their line); no gain from the shape itself. |
| Recognition quality | v0.9.3, `src/recognize.ts` | Triangle types: a drawn triangle becomes the closest ticked type (right, isosceles, equilateral), or stays as drawn when the option «any» is on and no type is close (corners move less than 7 % of the longest side) [community]. | An optional «make it equilateral, right or isosceles» setting. A new feature, not a fix. |
| Recognition quality | v0.9.3, `src/recognize.ts` | A triangle with a side within 8 to 12 degrees of the page axes turns so that side is exactly horizontal or vertical, as Snap already did for rectangles [community]. | A level base on a slightly tilted triangle. Small; our rectangle and square already straighten. |
| Recognition quality | v0.9.4, `src/recognize.ts` | A wide, flat rectangle was taken for a triangle; now the fitted triangle must also cover at least 75 % of the stroke's area, and a stroke with a long tail away from its loop (a square root) is never a triangle [community]. | Our triangle error is relative to the shortest height, so a flat rectangle may already fail it [inference]. A test with a wide, flat rectangle answers it, at no licence cost. |
| Supported shapes | v0.9.4, `src/symbols.ts`, `src/settings.ts` | An optional dot at the centre of every circle (unit circles), drawn as a tight spiral, since a geometry cannot be filled [community]. | A small option, off by default in Snap. Not asked for. |
| Supported shapes | v0.9.3, `src/snapper.ts` | Coordinate axes and their ticks become one polyline, so the lasso moves them as one piece [community]. | Nothing: Smart Shapes has no axes, brace or square root. |
| Bug fix | v0.9.3, `src/snapper.ts` | No more save and reload of the note after a shape: it lost strokes written meanwhile. The page redraws only once the pen rests [community]. | Nothing: Smart Shapes never saves or reloads the note; it deletes through the lasso or by element number. |
| Hold timing | v0.9.3, `src/hold.ts` | The hold tracker also records the time of the last pen or finger event, and can read the last hold without taking it, for the redraw above [community]. | Nothing: the hold rule itself (still time at the end of the stroke) did not change. |
| Performance | v0.9.3, `src/snapper.ts` | An early exit before any host call when the pen-up shows no pause at the end of the stroke [community]. | Nothing: `handleStroke` in `plugins/smart-shapes/src/snap.ts` already returns `no hold` before it reads the stroke. |
| Firmware | none | No change names a firmware version. | Nothing. |

## The three options

- **A. Stay on v0.9.0 (MIT), take nothing.** No work. It leaves the cross-device placement wrong and
  the triangle without its refinements.
- **B. Reimplement the useful ideas ourselves under MIT, with no copied code.** The placement fix
  ([#269](https://github.com/martonpaulo/ink-tools/issues/269)) is a measured device fact; the
  triangle types, its straightening and the area test are plain geometry. We write them from the
  behavior in this note, with our own tests. The repository stays MIT, and the shared conversion in
  `packages/sn-adapter/` fixes three plugins at once.
- **C. Take the newer code under CC BY-NC-SA 4.0.** The least code of our own, but Smart Shapes
  becomes non-commercial and share-alike, and the cross-device fix could not move into
  `packages/`, so the other two plugins would still need option B.

## If the newer code were taken

What option C would need, so that the choice is made with its cost in view:

- **One folder.** The copied code and everything derived from it stay in `plugins/smart-shapes/`,
  whose `LICENSE` becomes CC BY-NC-SA 4.0, and whose `NOTICE.md` gives the attribution: author,
  source repository and tag, the licence and its link, and that the code was changed. The rest of
  the repository stays MIT.
- **No leak.** Nothing under CC BY-NC-SA reaches `packages/` or another plugin. `scripts/boundaries.py`,
  which already checks the adapter boundaries over every package and plugin, would add one rule: no
  file outside `plugins/smart-shapes/` imports from it, and no file in `packages/` carries its notice.
- **Non-commercial.** The plugin could never be sold, bundled into a paid product or used to earn
  money (see [workbench#1942](https://github.com/martonpaulo/workbench/issues/1942)), and every
  derived version must be shared under the same licence.
- **A licence made for other works.** Creative Commons advises against its licences for software.
  Here that means: no patent grant, so a contributor could still hold a patent on the method; and no
  source-code obligation, so the licence does not require anyone to publish the source of what they
  build from it, unlike a software copyleft licence.

## Recommendation

**Option B.** The gain from the newer Snap is a device fact and a few geometric refinements, which
cost little to write ourselves and keep the whole repository MIT. Option C would put a non-commercial
licence on a plugin for the few hundred lines B replaces. Option A leaves a likely defect.

Order under B:

1. The cross-device placement, [#269](https://github.com/martonpaulo/ink-tools/issues/269), first:
   it is a defect in three plugins.
2. A test with a wide, flat rectangle in `plugins/smart-shapes/__tests__/recognize.test.ts`; an area
   test only if it fails.
3. Triangle types and the triangle's straightening only when the owner asks for them, as new
   features of [#253](https://github.com/martonpaulo/ink-tools/issues/253).

Whoever writes them works from this note and from our own tests, never from Snap's later files.
