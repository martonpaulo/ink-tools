# Smart Pen

On the tablet this plugin is called **Smart Pen**; `smart-pen` is its folder, and
`RealTimeConversion`, kept from the plugin it grew from, its internal name
([#305](https://github.com/martonpaulo/ink-tools/issues/305)).

A Supernote plugin for the pen while you write. Each feature is a module you switch on or off in
its Settings; an off module has no button and never listens to the pen.

**Status: beta, built, not yet tested on the tablet** ([#144](https://github.com/martonpaulo/ink-tools/issues/144), [#253](https://github.com/martonpaulo/ink-tools/issues/253), [#305](https://github.com/martonpaulo/ink-tools/issues/305)).

## What it does

- **Real-Time Text**: while «Real-Time Text» in the sidebar is on, each handwritten word becomes
  typed text at its place soon after you finish it, with no lasso. A word gap, a new line or a
  pause closes a word, and an accent written just after still joins it. Drawings, arrows and
  scribbles stay handwriting.
  - «Undo Conversion» in the sidebar brings back the handwriting of the last conversion.
  - «Convert to Text», for a whole lasso, is in Lasso Actions since
    [#306](https://github.com/martonpaulo/ink-tools/issues/306).
  - Settings: start with Real-Time Text on, word spacing, and how long to wait before converting.
- **Smart Shapes**: draw a triangle, circle, square, rectangle or arrow and hold the pen still at
  the end; it becomes a clean shape. A figure under the smallest size stays handwriting, so a held
  letter never changes. A stroke that becomes a shape is never also converted to text.
  - Settings: the smallest shape, and each of the five shapes on or off.

The switches and settings are kept in the plugin's private folder, so they survive a restart.

Versions follow SemVer with a numbered beta: `0.1.0-beta.8` reads `0.1.0 beta 8` on the tablet
([#155](https://github.com/martonpaulo/ink-tools/issues/155)).

## Build

```bash
npm ci
npm run validate
npm run build
```
