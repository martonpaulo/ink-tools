# Real-Time Conversion — agent guidance

Scoped guidance for `plugins/real-time-conversion/`. Inherits the repository root `../../AGENTS.md`;
this file holds only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Built in the cloud, not yet on the device** ([#144](https://github.com/martonpaulo/ink-tools/issues/144), sub-issues [#184](https://github.com/martonpaulo/ink-tools/issues/184) to [#188](https://github.com/martonpaulo/ink-tools/issues/188)).
On the tablet the plugin is called **Real-Time Conversion**; `real-time-conversion` stays its folder,
gate, workflow and tag prefix, `RealTimeConversion` its `pluginKey` and log prefix. Design: the
research note `../../docs/research/2026-11-live-handwriting-to-text.md`.

- «Real-Time Text» (sidebar, NOTE, no view, [#184](https://github.com/martonpaulo/ink-tools/issues/184)) turns the mode on and off (`src/buttons.ts`).
  `setButtonState` in sn-plugin-lib 0.2.3 only enables or disables a button, so the state shows by
  the button's icon (`assets/mode-on.png`, `assets/mode-off.png`), registered again on each change,
  and a toast says it in words.
- The word-end rule ([#185](https://github.com/martonpaulo/ink-tools/issues/185), `src/words.ts`): position closes a word, an idle time
  closes the last one, and a mark (accent, i-dot, tilde) joins its word within a grace time. Every
  distance is a ratio to the line's letter height, from Ink2Pic's brief › 8.11.
- What stays handwriting ([#186](https://github.com/martonpaulo/ink-tools/issues/186), `src/shapes.ts`): tall, long or scribbled strokes, very large
  writing, and an answer that is empty, has no letter, or is one character for wide ink.
- The conversion ([#187](https://github.com/martonpaulo/ink-tools/issues/187), `src/convert.ts`): recognition at the page size of the
  page's own elements, found by uuid in a `getElements` read, never the pen-up ones, whose points
  are EMR units ([#206](https://github.com/martonpaulo/ink-tools/issues/206)); a `recognize:` line logs their shape; then ONE
  `batchUpdatePageElements` call deletes the word's strokes (found again by uuid) and inserts a
  text box at its place, in the tablet's default font. Words convert one at a time.
- «Undo Conversion» (sidebar, [#188](https://github.com/martonpaulo/ink-tools/issues/188), `src/undo.ts`): the last conversion only, kept in memory;
  the box is found by its text and rect, the strokes rebuilt from their saved points.
- Settings (`App.tsx`, `src/settings.ts`): «Start with Real-Time Text on» (off), «Word spacing»,
  «Wait before converting». In memory until [#40](https://github.com/martonpaulo/ink-tools/issues/40)'s storage. A chosen font waits for the
  device round (research note §6, question 4).

## Rules

- Every SDK call goes through `@supernote-tools/sn-adapter/official`, gathered in `src/device.ts`;
  `src/convert.ts`, `src/undo.ts` and `src/buttons.ts` take their host as a parameter, so the tests
  drive them with fakes and synthetic strokes.
- `src/words.ts` and `src/shapes.ts` stay pure: no SDK, no timer; the clock is passed in.
- Nothing runs while the pen is down: the work starts at pen-up. A failure keeps the handwriting and
  is logged; never a success-shaped default.
- Turning the mode off removes the pen-up listener at once and drops the open words untouched.
- Permissions: `FILE:READ` (page size) and `FILE:WRITE` (the page change, code 1501 without it,
  [#148](https://github.com/martonpaulo/ink-tools/issues/148)); a no-view button needs both «Always Allow» ([#170](https://github.com/martonpaulo/ink-tools/issues/170)).
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../ink2pic/docs/brief.md` and
  `../../docs/supernote.md`.

## Device round

Open, for the Mac: does `event_pen_up` arrive with no view open after a sidebar press; does a
re-registered sidebar button show its new icon; does one `batchUpdatePageElements` delete strokes
and insert a `createElement(500)` text box with one partial refresh; does the pen keep its speed;
does a rebuilt stroke look like the original; the idle, grace and ratio defaults.

## Reuse

Scaffold copied from the removed Lingo plugin (no native module, [#161](https://github.com/martonpaulo/ink-tools/issues/161)), which took it from `../bridge` and `../ink2pic`.
