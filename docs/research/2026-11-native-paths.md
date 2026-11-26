# Native and higher-level paths: what the tablet offers that Ink Tools rebuilds or routes around

Status: research, 2026-11-25. Firmware `Chauvet.E103.2610191001.2559_release` (3.31.45, 2026-10-20),
PluginHost 1.00.2610150, `sn-plugin-lib` 0.2.3 (the latest on npm, 2026-10-12). Read-only `adb`
only; nothing was installed, changed or tapped. Vendor material stays in the session scratch
(`.scratch/native-survey/`) and never in the repository.

## Contents

- [Question and method](#question-and-method)
- [The SDK: what we do not use](#the-sdk-what-we-do-not-use)
- [Findings by area](#findings-by-area)
- [Double check: why each part was built its way](#double-check-why-each-part-was-built-its-way)
- [Outside sources](#outside-sources)
- [Decisions and issues](#decisions-and-issues)

## Question and method

The owner asked which things could be native, or take a higher-level path, that we are not using:
the tablet's apps and Android resources, shorter or sturdier paths, and recent outside solutions,
keeping the layered, pluggable architecture. Every finding was rated on the dependency levels of
`docs/architecture.md` › Layer rules (1 the highest, 5 the lowest), and then double-checked against
the history of the part it would replace: a decision, an issue, or a need the higher path lacks.

Sources: the SDK in `plugins/word-lookup/node_modules/sn-plugin-lib`; 17 vendor APKs pulled from
`/system_ext/app/*` (device data); `framework.jar` (`EinkManager`, `View`); read-only
`dumpsys`, `service list`, `getprop`, `settings list` and one provider read; the official changelog
and docs; npm and GitHub.

98 findings: UI 12, note and page 17, recognition and language 8, files 8, sync 7, transfer 5,
settings and Mac control 7, device and e-ink 7, lifecycle and buttons 7, whole-tool overlaps 10,
Android resources 10, outside sources 20.

## The SDK: what we do not use

37 official calls are unused, among them: `reloadFile`, `saveCurrentNote`, `getTitles`,
`getLassoTitles`, `insertKeyWord`, `insertTextLink`, `setLassoStrokeLink`, the layer calls,
`openFile`, `getExportPath`, `getStorageAvailableSpace`, `RattaFileSelector.selectFile` and
`selectImage`, `NativeUIUtils.showRattaDialog` and `showErrorTipDialog`, and the
`PluginDocAPI` calls (`getLastSelectedText`, `getCurrentDocText`). Nine options are shipped but
undocumented (level 1u): `NativePluginManager.modifyButtonRes`, `getOrientation`,
`registerButtonRes` sub-menus and `expandMenuItem`, `fillRegionByPoint`, `getFileMD5`, among
others. Five host methods exist but no SDK call reaches them: `convertImage2Sticker`,
`saveSticker(path, rect)`, `getPageRotationType`, `clearFileCache`, `notifyPluginState`; they are
reachable only by reflection on `HostCommImpl` (level 5). `NativePluginManager.setFullAuto` is an
empty TODO. The host registers no native view, so `TouchView` does not work.

No plugin calls an internal where an official call does the same job.

## Findings by area

Facts worth keeping (each also belongs in `docs/supernote.md`):

- `showRattaDialog` and `showErrorTipDialog` work from a plugin on this host: `HostUIImpl` swaps a
  null activity for the application context and raises the window to type 2002. The older line in
  `docs/supernote.md` that a native dialog kills the plugin is wrong for PluginHost 1.00.2610150.
- A plugin view is always full screen: the host sets −1 × −1 for every `showType` but 0, so no small
  «center dialog» view exists.
- `batchUpdatePageElements` redraws only when it answers 0; on 1 it updates the cache without a
  redraw, and it always clears undo and redo. `reloadFile` runs `reloadCurrentNotePage`.
- `Stroke.recognPoints` carries a `timestamp` per point (`RecognData`).
- The native Calendar syncs one Google account's primary calendar or one Outlook account.
- The keyboard broadcasts `keyboard_show` and `keyboard_hide`; the launcher listens to them.
- Firmware 3.31.45 adds toolbar pinning of a plugin button, a native flip of selected handwriting
  and a fix for sync-conflict files.
- The system service `eink` (`IEinkManager`) and `View.setEinkUpdateMode` control refresh modes
  (level 3).
- There is no notification shade.

The full per-area tables (today, what the device offers, the higher path, effort, risk, level now
and better, probe) are summarised in [Decisions and issues](#decisions-and-issues); every adopted
item lists its device check on its issue.

## Double check: why each part was built its way

Almost every higher path existed in `sn-plugin-lib` 0.2.3 when we built; the gaps were reading
misses, not missing paths. Several parts are ours on purpose:

| Item | Verdict | Why |
| :--- | :--- | :--- |
| Our own LocalSend in Device Transfer | Keep | Owner D42 B and [#98](https://github.com/martonpaulo/ink-tools/issues/98): one tap, no view, a device pinned by fingerprint, received items placed in the note; the official app's share sheet loses all three |
| Notipal | Keep ours | The owner tested and rejected it on 2026-11-15 (bundled tools, a v1 certificate fails from the iPhone) |
| Pic2Note vs Image Editing | Keep ours | [#138](https://github.com/martonpaulo/ink-tools/issues/138): ours edits the picture already on the page, with the 16-grey Enhance and undo; borrow single algorithms only (MIT) |
| SNNote Swift reader | Keep ours | Ours matches the tablet's PNGs to 0.003 % and is the base of the planned write-back ([#261](https://github.com/martonpaulo/ink-tools/issues/261), [#262](https://github.com/martonpaulo/ink-tools/issues/262)) |
| `openFile` for `inkctl note open` | Keep ours | It sends the same intent as `am start`; try `source_type=2` and a 1-based page from `am start` first |
| `modifyButtonRes` for Real-Time Conversion on/off | Keep ours | `modifyButton` never notifies the sidebar, so the icon may not change, and its parent-id path never answers |
| `getCurrentPageNum` instead of the screen counter | Keep ours | It stayed wrong with no jump ([#220](https://github.com/martonpaulo/ink-tools/issues/220)), pointing to a stale listener |
| `predict_name` stroke class | Keep ours | Not reachable from the JS SDK |
| Word Lookup in Documents | Out | [#141](https://github.com/martonpaulo/ink-tools/issues/141) (2026-11-15), confirmed 2026-11-25: the owner works in Notes |
| `reloadFile` after a conversion | Adopt with conditions ([#296](https://github.com/martonpaulo/ink-tools/issues/296)) | Only when the batch answer shows no redraw, never while the pen is down; check that no stroke is lost and undo still works |
| Native confirm dialog | Adopt ([#296](https://github.com/martonpaulo/ink-tools/issues/296)) | Already decided in [#273](https://github.com/martonpaulo/ink-tools/issues/273); fix the wrong `docs/supernote.md` line |
| Native error tip | Adopt for simple cases ([#296](https://github.com/martonpaulo/ink-tools/issues/296)) | Only a no-view failure with nothing to retry; `ErrorView` keeps Retry and fix actions |
| `saveCurrentNote` before page export | Adopt ([#296](https://github.com/martonpaulo/ink-tools/issues/296)) | The latest strokes reach the PNG |
| `recognPoints` timestamps | Adopt as an extra signal ([#296](https://github.com/martonpaulo/ink-tools/issues/296)) | Timing alone cannot find a word end (measured), so position stays |
| `ContentObserver` on Calendar and To-Do | Adopt beside the timer ([#296](https://github.com/martonpaulo/ink-tools/issues/296)) | Remote changes still need the timer; an echo guard for our own writes |
| `_CONFLICT_` settings reader | Remove after each plugin logs its private settings read ([#296](https://github.com/martonpaulo/ink-tools/issues/296)) | The 3.31.45 conflict fix and [#22](https://github.com/martonpaulo/ink-tools/issues/22)'s move |
| Pinned toolbar button for Handwriting Language | Not adopted | Owner, 2026-11-25: the floating button shows only while there is text or ink input ([#195](https://github.com/martonpaulo/ink-tools/issues/195)) |
| Keywords, source links, shape fill | Not now | Owner, 2026-11-25: no new features now |

## Outside sources

Read on 2026-11-25 (dates are each project's last push): the Chauvet 3.31.45 changelog
(support.supernote.com, 2026-10-20); `sn-plugin-lib` on npm (0.2.3, 2026-10-12); Laumss/sn-plugins
(Notipal, Mosaic, 2026-11-20); amberharness/localsendsupernote (2026-11-16); j-raghavan/sn-canvas and
jpmoo/supercanvas (firmware pen ink, 2026-11-24); Keplex/supernote-pic2note (2026-11-01);
AgP42/SuperDashboard (2026-11-23); ofples/supernote-plugin-research (2026-10-18);
allenporter/supernote (Open Private Cloud, 2026-11-25); altessa-s/snnote-swift and sncloud-go
(2026-11-21); adrianba/task-sync (2026-11-23); schaefer-dev/supernote-viewer (2026-11-22);
fharper/awesome-supernote (2026-11-10). Not found: a newer SDK, a native dictionary or
translation feature.

## Decisions and issues

- Adopted official paths: [#296](https://github.com/martonpaulo/ink-tools/issues/296) (with `reloadFile`; [#206](https://github.com/martonpaulo/ink-tools/issues/206) closed before it was built).
- Handwriting Language's button rule: [#195](https://github.com/martonpaulo/ink-tools/issues/195).
- The level rule and the check before moving a part up: `docs/architecture.md` › Layer rules and
  `docs/decisions.md`.
