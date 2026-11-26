# Smart Pen — agent guidance

Scoped guidance for `plugins/smart-pen/`. Inherits the repository root `../../AGENTS.md`; this file
holds only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Built in the cloud, not yet on the device** ([#305](https://github.com/martonpaulo/ink-tools/issues/305), from [#144](https://github.com/martonpaulo/ink-tools/issues/144) and [#253](https://github.com/martonpaulo/ink-tools/issues/253)).
On the tablet the plugin is called **Smart Pen**; `smart-pen` is its folder, gate, workflow and tag
prefix. It grew from Real-Time Conversion and keeps its `pluginID` (`c4f1drtuzuh0f50a`) and
`pluginKey` (`RealTimeConversion`, also `package.json` and `app.json` `name`), so the tablet updates
it in place; the old Smart Shapes plugin (`SmartShapes`) must be uninstalled from the tablet, or both
would draw shapes. Log lines start `SmartPen:`.

## Modules

`src/modules.ts` is the table: one row per module, with its switch in Settings (`App.tsx`). A module
that is off is never registered: no button, no pen listener. The Gestures of
[#270](https://github.com/martonpaulo/ink-tools/issues/270) add a row when they are built.

- **Real-Time Text** (`src/modules/text/`, [#184](https://github.com/martonpaulo/ink-tools/issues/184) to [#188](https://github.com/martonpaulo/ink-tools/issues/188)): the sidebar buttons «Real-Time Text»
  (the mode, `buttons.ts`) and «Undo Conversion», and until [#306](https://github.com/martonpaulo/ink-tools/issues/306) moves it the lasso button
  «Convert to Text» ([#250](https://github.com/martonpaulo/ink-tools/issues/250), `lasso.ts`). `setButtonState` in sn-plugin-lib 0.2.3 only enables or
  disables a button, so the mode shows by its icon (`assets/mode-on.png`, `assets/mode-off.png`),
  registered again on each change, and a toast says it in words. The engine (the word-end rule, what
  stays handwriting, the conversion, the undo) is `ink-core`'s `@ink-tools/ink-core/conversion`
  (`packages/ink-core/src/conversion/`); its pure tests run in the packages gate, and the tests that
  drive it over the fake tablet, which checks page writes with the real SDK's schema, run here.
- **Smart Shapes** (`src/modules/shapes/`, [#253](https://github.com/martonpaulo/ink-tools/issues/253)): a stroke held still at its end becomes a clean
  triangle, circle, square, rectangle or arrow; a figure under the minimum size stays ink.
  `hold.ts`, `guard.ts` and `recognize.ts` come from Snap v0.9.0 (MIT), as [`NOTICE.md`](NOTICE.md)
  records; keep the notice with any copied code. Replace order: wait for the pen to lift, save the
  stroke, delete it (through the lasso when it holds that stroke alone, else by its number), insert
  the shape with `insertGeometry`; a failed insert writes the stroke back.

## How the modules share the pen

`src/pen.ts` is the one pen-up listener. Smart Shapes decides first on each stroke; a stroke it
replaced never reaches Real-Time Text, so a shape is never also converted. A stroke it kept goes on
to Real-Time Text, which frees it; with Real-Time Text not listening, Smart Shapes frees it. With
neither module listening the device listener is removed.

## Settings

`src/settings.ts` owns the file's shape: `modules` (one switch each, all on by default), `text` and
`shapes`. picture-search's settings store keeps it in the private plugin folder's `settings.json`
(`src/profile.ts`), through the plugin's own native file module, `SmartPenFiles`
(`native/com/smartpen/files/SmartPenFilesPackage.java`, built by `scripts/native-build.cjs`). A
switch of a module a newer build added is kept and written back. The old plugins kept their
settings in memory only, so nothing migrates. `src/runtime.ts` applies a change: each module's
settings in memory, and each switch that changed starts or stops its module.

## Rules

- Every SDK call goes through `@ink-tools/sn-adapter/official`, gathered in each module's
  `device.ts`; the rest take their host as a parameter, so the tests drive them with fakes and
  synthetic strokes.
- Nothing runs while the pen is down: the work starts at pen-up. Real-Time Text's motion listener
  only notes down and up, so a conversion's `reloadFile` never runs mid-stroke
  ([#296](https://github.com/martonpaulo/ink-tools/issues/296)). A failure keeps the handwriting and
  is logged; never a success-shaped default.
- Turning Real-Time Text off removes its pen-up listener at once and drops the open words untouched.
- Permissions: `FILE:READ` (page size, the stroke) and `FILE:WRITE` (the page change, code 1501
  without it, [#148](https://github.com/martonpaulo/ink-tools/issues/148)); a no-view button needs both «Always Allow» ([#170](https://github.com/martonpaulo/ink-tools/issues/170)).
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID` or `pluginKey`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../../docs/research/plugin-brief/brief.md` and
  `../../docs/supernote.md`.

## Device round

Open, for the Mac: install Smart Pen over Real-Time Conversion and uninstall Smart Shapes with
`inkctl`; the module switches across a restart; shapes and word-by-word conversion together on one
page; «Undo Conversion». From Real-Time Conversion: does `event_pen_up` arrive with no view open
after a sidebar press; does a re-registered sidebar button show its new icon; the idle, grace and
ratio defaults; for «Convert to Text», what the native «Recognize as Text» makes. From Smart Shapes:
whether one undo brings a replaced stroke back.

Pen replay ([#298](https://github.com/martonpaulo/ink-tools/issues/298)): `src/actions.ts` runs
`record-pen` and `replay-pen` on sn-adapter's action channel, ticked by `SmartPenTicks` with no view
open, from `action.json` in `.data/plugin/inktools-smart-pen/`. Once per release the owner writes a
word and holds a circle 1 s after `inkctl ink record start`; `inkctl ink record stop FILE`
saves the tape, and each round replays it with `inkctl ink replay FILE --plugin smart-pen` on a
fresh mode start (a converter that saw EMR points from the real pen keeps reading EMR).

## Build and test

```sh
npm run validate   # lint, types, Jest: the modules, the router, the settings file, both modules over fakes
npm run build      # build/outputs/RealTimeConversion.snplg with its app.npk; the device build is the CI prerelease
```
