# Real-Time Conversion

On the tablet this plugin is called **Real-Time Conversion**; `real-time-conversion` is its folder
and internal name.

A Supernote plugin: while **Real-Time Text** is on, each handwritten word becomes typed text at its
place soon after you finish it, with no lasso. Drawings, arrows and scribbles stay handwriting.

**Status: beta, built, not yet tested on the tablet** ([#144](https://github.com/martonpaulo/ink-tools/issues/144)).

## What it does

- «Real-Time Text» in the sidebar turns the mode on and off.
- A word converts only when it is finished: a word gap, a new line or a pause closes it, and an
  accent written just after still joins it.
- «Undo Conversion» in the sidebar brings back the handwriting of the last conversion.
- Settings: start with the mode on, word spacing, and how long to wait before converting.

Versions follow SemVer with a numbered beta: `0.1.0-beta.1` reads `0.1.0 beta 1` on the tablet
([#155](https://github.com/martonpaulo/ink-tools/issues/155)).

## Build

```bash
npm ci
npm run validate
npm run build
```
