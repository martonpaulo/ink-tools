# What we know about the Supernote

The one place for facts about the device that every plugin, tool and design uses. Each fact says
how it is known: **[measured]** on the owner's tablet, **[official]** from Ratta's docs or
changelog, **[reported]** by other developers, **[inference]**. Add a fact here when a session
learns one; a plugin's own brief keeps only what is specific to it.

## Contents

- [The owner's tablet](#the-owners-tablet)
- [Screen and units](#screen-and-units)
- [Greys and colours](#greys-and-colours)
- [Designing for the screen](#designing-for-the-screen)
- [Plugins](#plugins)
- [Files and sync](#files-and-sync)
- [Network and ADB](#network-and-adb)

## The owner's tablet

| Fact | Value | How known |
| :--- | :--- | :--- |
| Screen | 1920 x 2560 px, density 300 | [measured] `adb shell wm size`, `wm density`, 2026-11-14 |
| Model string | `ro.product.model` reads `Supernote Nomad`, though the screen is the Manta's (A5 X2, `getDeviceType()` = `5`) | [measured] 2026-11-14; [official] SDK source for the type |
| Android | 11 | [measured] `ro.build.version.release` |
| Firmware | Chauvet 3.31.45, build `Chauvet.E103.2610191001.2559_release` | [measured] `ro.build.display.id`, 2026-11-14 |

Write «the owner's tablet» in issues and docs, not a model name, until the model string is
explained.

## Screen and units

- Manta: 1920 x 2560 px, 10.7 inch, 3:4, about 299 ppi, so 1 mm is about 11.8 px [official specs,
  arithmetic in `plugins/ink2pic/docs/brief.md`].
- A page has the same 1920 x 2560 size; `getPageSize` answers it [measured, build 0.1.0 (3)].
- Stroke points from `getElements` are page pixels [measured, Probe, 2026-11-17,
  [#206](https://github.com/martonpaulo/ink-tools/issues/206)]. The pen digitizer (EMR) spans 21632 x
  16224 on the Manta page, its x running down the page and its y from the right edge to the left
  (`PointUtils.getRealMaxX`, `getRealMaxY` and `emrPoint2Android` in sn-plugin-lib 0.2.3, which
  says points are pixels after 0.1.65) [official source]. The points of an `event_pen_up` element
  read about 8 times the page size on the tablet («kept: large» for every word), so they are taken
  as EMR when a point falls off the page [inference, to measure in the device round: the plugin
  logs its first pen-up stroke raw and converted].
- The pen-up unit is EMR: the first stroke read raw 6627..7033 x 11625..12059 and converted to
  493..544 x 784..832 page px [measured, Real-Time Conversion 0.1.0 beta 2, 2026-11-17,
  [#206](https://github.com/martonpaulo/ink-tools/issues/206)]. `recognizeElements` on those pen-up
  elements failed for every word with «Recognition failed. Please try again!», while the same
  handwriting lassoed (page elements) was read [measured]; so recognition is sent the page's own
  elements from `getElements` [inference: it reads the elements' native points as
  page pixels, as the 0.2.3 `Stroke.points` doc says; to confirm in the device round].
- A pen-up element's uuid is not the uuid `getElements` gives the same stroke: none of a word's 4
  strokes was found by uuid in a page read of 4 elements [measured, Real-Time Conversion 0.1.0
  beta 3, 2026-11-17, [#206](https://github.com/martonpaulo/ink-tools/issues/206)]. In sn-plugin-lib
  0.2.3 the uuid is the key of the element's native point cache (`ElementDataAccessor`), made for
  each event or read [official source]. So a pen-up stroke is found in a page read by its bounds in
  page pixels; the plugin logs both shapes of one stroke to confirm it.
- A design board for this screen is 3:4; the study sheets use 794 x 1059 CSS px boards and export
  to the Manta page.

## Greys and colours

- The screen shows **16 grey levels**; PDFs are shown in 16 greys since firmware 3.31.45
  [official changelog].
- **Pen colours** (handwriting only): `#000000`, `#9D9D9D`, `#C9C9C9`, `#FEFEFE` [official,
  plugin API types
  [Stroke](https://docs.supernote.com/en/api-reference/supernote-plugin/types/stroke) and
  [PenInfo](https://docs.supernote.com/en/api-reference/supernote-plugin/types/pen-info)].
- **Ratta's own tones** (no brand colour; greys and one dark blue):

  | Hex | Where | How known |
  | :--- | :--- | :--- |
  | `#EFEFEF`, `#E5E5E5` | supernote.com background, secondary background | [official] site theme |
  | `#050504`, `#000000`, `#4A4A4A` | site accent, text, headings | [official] site theme |
  | `#919DA9` | site grey-blue button | [official] site theme |
  | `#383838` | ink in the Supernote Partner app icon | [measured] App Store image |
  | `#4F4C5D` | Vegan Leather Folio, Dark Blue | [measured] product photo |
  | `#484848`, `#BBBDBC`, `#D4D4D4` | Canvas Folio grey, Half Folio light grey, Vegan Leather White | [measured] product photos |
  | `#CCCDCC` | the Manta's e-ink screen in product photos | [measured] product photo |

  Photo-measured values are a median of a flat area and can shift with the photo's light. Sources
  and links: [#97](https://github.com/martonpaulo/ink-tools/issues/97).

## Designing for the screen

Rules that held on the owner's study sheets (2026-11-13) and the plugin screens:

- Use only a few greys, far apart: text, rules and borders black; context text `#444`; strong
  fill `#aaa`; highlight `#ccc`; soft panels `#eee`; background white. Never a tint as the only
  cue.
- Pastel and yellow fills turn white on the screen; a colour must also differ in lightness.
- Lines never thinner than 1 px (1.5 px for borders); body text about 14 px on a 794 px board
  (about 8 pt on the Manta), 12 px the floor; photos in grey with a little more contrast.
- No handwritten font, never italic; Atkinson Hyperlegible reads well.
- One item per line; frames only where they carry meaning.
- Study sheets: content only in the top half; the bottom half is for handwriting.
- Plugin screens: touch target at least 10 mm, text at least 3 mm; the tokens live in
  `packages/ui-kit` and a test refuses smaller sizes ([#93](https://github.com/martonpaulo/ink-tools/issues/93)).

## Plugins

- Install: copy the `.snplg` to `MyStyle/`, then Settings > Apps > Plugins > Add Plugin [official].
  Reinstalling from the existing entry reinstalls the host's managed copy, not the new file
  [reported]; a versioned file name avoids picking the wrong one.
- Limits: 30 installed, 10 enabled [official, 3.29.44 announcement].
- A plugin's view runs its start code once per plugin-host process: going back and opening the
  view again does not re-run it; `am force-stop com.ratta.supernote.pluginhost` starts a fresh
  process [measured, 2026-11-14, [#91](https://github.com/martonpaulo/ink-tools/issues/91)].
- A plugin can open a TCP listener and accept a connection over Wi-Fi, with the screen on and off
  [measured, 2026-11-14, [#91](https://github.com/martonpaulo/ink-tools/issues/91)].
- HTTPS `fetch` works; cleartext `http://` fails at once [measured, `brief.md`].
- Plugin call times on the owner's tablet, one «Insert best picture» for «apple», Ink2Pic
  0.1.0-dev.17 [measured, 2026-11-14, [#19](https://github.com/martonpaulo/ink-tools/issues/19)]: `recognizeElements` 0.9 to 1.7 s,
  `insertPageElements` 0.1 to 0.3 s, re-lasso 0.4 to 0.6 s, writing the PNG under 20 ms, a 200 px
  contour conversion 0.16 to 0.25 s, measuring 12 page-1 thumbnails 5.7 s.
- A plugin's file calls reach only a whitelist of shared paths: Ink2Pic 0.1.0-dev.18 listing
  `/storage/emulated/0/.ink2pic-symbols` failed with `SecurityException: Plugin [...] is not allowed
  to access sdcard path outside whitelist` [measured, 2026-11-15, [#23](https://github.com/martonpaulo/ink-tools/issues/23)].
- Lasso buttons of all plugins share one «⋯» list under the lasso toolbar; each row's icon shows
  at about 60 px [measured, 2026-11-15 screenshot, [#107](https://github.com/martonpaulo/ink-tools/issues/107)]. A button takes one icon, so each plugin
  ships one 96 x 96 PNG per button, which the tablet scales down to that size (owner D43 A).
- A lasso button registered while the plugin already runs shows in that list at once, and
  `insertText` puts a text box on the page [measured, 2026-11-15, [#115](https://github.com/martonpaulo/ink-tools/issues/115)].
- The lasso calls (`getLassoElements`, `getLassoRect`) need `plugin.permission.FILE:READ` declared
  and granted: without it they fail with code 1503, «File read permission has not been requested»,
  and the log shows `PluginSec DENY reason=sdcard_no_read` for the note's path [measured, 2026-11-16,
  Lingo 0.0.1 code 1, [#128](https://github.com/martonpaulo/ink-tools/issues/128)].
- A plugin that registers four lasso buttons gets four rows in the «⋯» list, each with its text
  name and no icon; the list ends after the last plugin row [measured, 2026-11-16, Lingo,
  [#128](https://github.com/martonpaulo/ink-tools/issues/128)].
- After a no-view lasso button inserts its text, the lasso is gone [measured, 2026-11-16, Lingo].
- Two plugins with native modules installed side by side: whether PluginHost gives each its own
  React host and class loader is not known [to test, [#142](https://github.com/martonpaulo/ink-tools/issues/142)]. Ink2Pic and Lookup both
  ship the Java of `com.ink2pic.files` and register their modules under their own names
  (`Ink2PicFiles` and `Ink2PicImage`, `LookupFiles` and `LookupImage`), so neither name is
  registered twice in one host either way.
- Every enabled plugin loads into one PluginHost process: after a host restart the log shows
  `getPackages packageName:<ReactPackage>` then `load pluginKey:<key>` for each plugin in turn
  (Lookup's `LookupFilesPackage`, Relay's `RelayPackage`, Retouch's `RetouchPackage`), with no
  `ClassNotFound`, `NoSuchMethod`, duplicate-class or `already registered` line [measured,
  2026-11-16, [#142](https://github.com/martonpaulo/ink-tools/issues/142)].
- A lasso button whose `editDataTypes` do not match the lasso stays in the «⋯» list, in grey, and
  does nothing; it is not hidden [measured, 2026-11-16, a lassoed text box].
- A plugin's declared permissions stay «Ask Every Time» until the plugin calls
  `requestPermission`: no dialog shows without that call, and every file call fails. Settings ›
  Apps › Plugins › the plugin › Permissions sets each one to Allow, Ask Every Time or Don't Allow
  [measured, Relay, [#163](https://github.com/martonpaulo/ink-tools/issues/163)]. An update
  by `inkctl plugin install` keeps the granted permissions [measured, Lookup beta 1 to beta 4].
- A plugin's native server socket accepted LocalSend connections while `INTERNET` was still «Ask
  Every Time» [measured, Relay «Receive», 2026-11-16]: the `INTERNET` gate may cover only
  outgoing sockets.
- The Mac's LocalSend answers a tablet's multicast announce by `POST /api/localsend/v2/register`
  to the announcer on 53317, and sent no multicast answer while nothing served that port [measured,
  Relay 0.1.0 beta 3 «Send Page», 2026-11-16, [#98](https://github.com/martonpaulo/ink-tools/issues/98)]. Relay's send discovery now serves `/register`
  for its window.
- The first write of a file that does not exist yet in shared storage left it empty while the call
  reported success; the next write over that file worked [measured, Lookup settings,
  [#162](https://github.com/martonpaulo/ink-tools/issues/162)]. Creating the file empty, closing
  it, then opening it again to write gives the full content on the first save: Word Lookup 0.2.0
  beta 10 wrote all 259 bytes of a new `MyStyle/Lookup/settings.json`, and the switch set before
  a PluginHost restart was the one read after it [measured, Nomad, 2026-11-16,
  [#162](https://github.com/martonpaulo/ink-tools/issues/162)].
- A plugin that declares only `FILE:READ` reads a file it did not write under
  `/storage/emulated/0/.data/plugin/`, and its delete throws `SecurityException: Plugin [...] has no
  DELETE permission` [measured, Account Sync 0.1.0 beta 7, [#116](https://github.com/martonpaulo/ink-tools/issues/116)].
- `/storage/emulated/0/<Plugin>/` is outside the whitelist: `mkdirs` is denied
  (`sdcard_not_in_whitelist`), and `File.delete` throws a `SecurityException` that the host
  suppresses in a native thread, so the JS call never settles [measured, Relay,
  [#164](https://github.com/martonpaulo/ink-tools/issues/164)].
- `lassoElements(rect)` selected the text boxes inside the rect but not a picture that crossed its
  bottom edge [measured]; that an element must lie wholly inside is [inference].
- `lassoElements(rect)` with an inserted picture's rect also selects the handwriting strokes under
  the picture, and a delete of that selection removes them [measured, pen round, 2026-11-16,
  Lookup 0.2.0 beta 4, [#168](https://github.com/martonpaulo/ink-tools/issues/168)].
- Reading a page's elements one by one for their rects costs about 8 to 11 ms per element (3
  elements in 24 ms, 5 in 54 ms); a test page of 69 to 90 elements ran past a 300 ms budget every
  time [measured, 2026-11-16, Lookup 0.2.0 beta 4,
  [#152](https://github.com/martonpaulo/ink-tools/issues/152)].
- `recognizeElements` on one lassoed handwritten word took 2.6 s in Lookup 0.2.0 beta 4 [measured,
  pen round, 2026-11-16, [#19](https://github.com/martonpaulo/ink-tools/issues/19)].
- The built-in Sticker plugin pastes a sticker as strokes and leaves it selected in a «pasted»
  state. `getLassoRect` then answers the selection's local rect (`{-40, 0, 140, 181}` for a sticker
  shown near (870, 1190)), and Back leaves the note and drops the pasted sticker [measured,
  [#165](https://github.com/martonpaulo/ink-tools/issues/165)].
- A finger drag (`adb shell input swipe`) on a lassoed selection does not move it [measured].
- The Back key does not close a plugin's full view (Lookup and Relay Settings, Relay «Receive»):
  the view stays until the plugin calls `closePluginView` or the host restarts [measured,
  2026-11-16].
- PluginHost exports only its launcher `StubActivity`, a `com.ratta.supernote.plugin.action.DEBUG`
  receiver and a messenger service; no intent opens one plugin's view [measured, `dumpsys
  package`, [#139](https://github.com/martonpaulo/ink-tools/issues/139)].
- InkHub's Upload Item form on the tablet, category Plugins: subcategory (Writing, Drawing,
  Reading, Utility, Game, Other), license, the package, up to 6 thumbnails in a 3:4 slot, picked
  from the tablet's own folders (Document, EXPORT, MyStyle, Note, SCREENSHOT, INBOX). It states no
  pixel size or file type [measured, 2026-11-15, [#100](https://github.com/martonpaulo/ink-tools/issues/100)].
- The Upload Item form does not scroll from `adb shell input swipe` or `input motionevent`; taps
  work [measured, 2026-11-15].
- `recognizeElements` has no language parameter [official signature]; it uses the device
  handwriting language, which the Note app reads freshly on each recognition call, so a change
  applies on the next call with no note reopen [source, firmware `Chauvet.E103.2610191001.2559`,
  [#151](https://github.com/martonpaulo/ink-tools/issues/151)]. The SDK has no call that
  reads or writes that language; `registerLangListener` reports the system UI language only
  [official, [#146](https://github.com/martonpaulo/ink-tools/issues/146)].
- Content providers: calendar and To-Do answer query, insert and delete from a plugin; the
  Knowledge (Digest) provider rejects the guessed URIs and refuses delete [measured, [#42](https://github.com/martonpaulo/ink-tools/issues/42), [#59](https://github.com/martonpaulo/ink-tools/issues/59)].
- The calendar's `data_info` insert refuses a row without `tag`, then one without
  `lastModifiedTime` (`SQLiteConstraintException: NOT NULL constraint failed`, one column per
  refusal) [measured, Account Sync 0.1.0 beta 5 and 7, [#43](https://github.com/martonpaulo/ink-tools/issues/43)]. A native row fills `calendarId`, `tag`
  (`task`), `state` (0), `readOnly`, `isAllDay` (0), `title`, `startTime`, `endTime`,
  `lastModifiedTime` (epoch ms) and `status`, and holds null in every other column [measured, one
  row, 2026-11-17, [#43](https://github.com/martonpaulo/ink-tools/issues/43)]; the descriptor's `requiredOnInsert` lists the filled ones.
- A lassoed picture can be read and replaced in place [measured, 2026-11-16, Probe 0.0.1 code 5,
  firmware `Chauvet.E103.2610191001.2559`, [#130](https://github.com/martonpaulo/ink-tools/issues/130)]:
  - `getLassoElements` gives the picture element (type 200) with its `numInPage`, `layerNum` and
    `picture.rect` in page pixels. Its `picture.picturePath` names a file under
    `/storage/emulated/0/.data/plugin/` that the plugin cannot open (`exists` false, `copyFile`
    ENOENT), so the element gives no pixels.
  - `generateLassoPreview(path)` writes the lassoed area as an RGBA PNG to a whitelisted path, at
    page-pixel size with about 6 px of margin per side (a 400 x 300 picture gave 412 x 311). That is
    the pixel read: it shows everything inside the lasso, and the size is the picture's size on the
    page, not the source file's size.
  - Both writes put a new PNG at the same rect, on the screen at once: `modifyPageElements` with the
    lassoed element and a new `picture.picturePath`, and `batchUpdatePageElements([numInPage],
    [new picture element])`, which deletes and inserts in one call.
  - The host copies each inserted PNG into `.data/plugin/` under a new name, so the plugin's own file
    can be removed after the write. `pageNum` read 0 before the write and 1 after, on page 1 of 1.
- A plugin can put ink and pictures on the open page and lasso them with no pen [measured,
  2026-11-16, a throwaway probe on sn-plugin-lib 0.2.3, [#148](https://github.com/martonpaulo/ink-tools/issues/148)]:
  - A stroke: `createElement(0)`, then for each point `stroke.points.add(i, {x, y})`,
    `stroke.pressures.add(i, 2000)` and `stroke.flagDraw.add(i, true)` in page pixels, then
    `insertPageElements([stroke], page, null)`. 151 points took 718 ms to add and 80 ms to insert;
    the zigzag showed as ink with `penType` 10 and `thickness` 400.
  - A picture: `createElement(200)` with `picture.picturePath` a PNG under `MyStyle/` and
    `picture.rect`, then `insertPageElements`: 245 ms.
  - `lassoElements(rect)` around either one selects it in 184 to 299 ms: `getLassoElementTypeCounts`
    gives `{bitmapNum: 1}` or `{trailNum: 1}`, the lasso toolbar shows, and every «⋯» row,
    other plugins' rows included, can then be pressed with `inkctl click`.
  - `insertPageElements` on the open note needs `FILE:WRITE` granted: without it, code 1501.
- Permissions of a no-view button [measured, 2026-11-16, Retouch and a probe,
  [#170](https://github.com/martonpaulo/ink-tools/issues/170)]:
  - After a PluginHost start, the first press of a plugin's button mounts the plugin's root
    component (`Running "<pluginKey>"` in the log) even with `showType: 0`, so its effects run then.
  - A `requestPermission` made while no view shows does not show its dialog
    (`requestPermission isHaveButton:true`); the dialog shows over the note at that plugin's next
    button press, while that press's own calls fail.
  - «Allow This Time Only» is revoked when the next press starts (`revokePermission` in the log),
    so a no-view button works only once both file permissions are «Always Allow».
  - With `FILE:READ` declared but not granted, `getLassoElements`, `getCurrentFilePath` and
    `getCurrentPageNum` answered, and `getPageSize` failed with 1503 and `PluginSec DENY
    reason=sdcard_no_read` for the note's path.
  - With `FILE:READ` and `FILE:WRITE` granted, deleting a file the plugin wrote in `MyStyle/`
    fails: `SecurityException: Plugin [...] has no DELETE permission`. Deletes need
    `plugin.permission.FILE:DELETE`, which the SDK lists beside the other three.
- A plugin's `console.log` lines reach logcat under the tag `ReactNativeJS`, not under the plugin's
  name: a log read filtered by the plugin's name as a tag shows nothing [measured].
- A pressed plugin row moves to the top of the plugin rows in the lasso «⋯» list, which the host
  sorts by last use [measured, 2026-11-16].

### Handwriting recognition language

Firmware `Chauvet.E103.2610191001.2559`; detail and file-and-line evidence in
[`research/2026-11-handwriting-language.md`](research/2026-11-handwriting-language.md)
([#151](https://github.com/martonpaulo/ink-tools/issues/151)).

- The engine is **MyScript iink** (`libiink.so`, `libMyScript*.so` in the keyboard app) [measured,
  source].
- The active recognition language is stored as **one empty file** whose name is the language code,
  in `/sdcard/.data/dictionary/default/`; the tablet holds `pt_BR` [measured]. There is no
  `Settings.System`/`Global`/`Secure` key, system property or "set active language" provider
  [measured, source]. The Settings app switches it by replacing that file, then broadcasting
  `hw_type_change` [source].
- The language is **one global file** read by every recognition app: Note, Digest (Document),
  Task, Email, Search and the keyboard IME all reference `/sdcard/.data/dictionary/default` and
  `getDefaultLang` [measured, static dex scan of each APK, 2026-11-16]. Switching it changes
  handwriting recognition everywhere.
- A plugin's **ordinary in-process file I/O cannot** touch it: `/sdcard/.data/dictionary/` is
  outside the whitelist (`Document, EXPORT, INBOX, MyStyle, Note, SCREENSHOT`, plus `InkHub/temp`
  and `.data/plugin`), so the guard in `libcore.io.BlockGuardOs` (posix layer, gated by the thread's
  plugin id) denies `listFiles`, `createNewFile` and `FileOutputStream` [measured, Probe
  `voc4oo2ysd7cdnkc`, 2026-11-16; source]. But a plugin **can switch it by a sandbox bypass**: a
  child process (`ProcessBuilder("sh","-c", …)`) and the system Documents provider
  (`DocumentsContract.createDocument`) both wrote the folder on the tablet; reflection to the raw
  Os, the host main-looper thread and a plain new thread were denied [measured]. The host runs as
  `android.uid.system`. A bypassing plugin suits the owner's device only and would likely fail store
  review ([#6](https://github.com/martonpaulo/ink-tools/issues/6)).
- The Settings handwriting-language screen opens via `com.ratta.settings/.SettingsActivity` with
  `com.ratta.settings.input.HWLanguageSetting` [source]. From any text field the owner reaches it in
  five taps: long-press the keyboard's globe key, «Keyboard Settings», «Handwriting», «Language»,
  the language [measured, 2026-11-16]. A plain tap on the globe only toggles handwriting and typed
  keys, and the long-press list's other rows are typed layouts.
- **There is no Android pull-down.** The `StatusBar` window is `GONE` and `NotificationShade`
  stays `INVISIBLE` even after `cmd statusbar expand-settings`; a top swipe does nothing. A Quick
  Settings tile added with `cmd statusbar add-tile` lands in `sysui_qs_tiles` but its
  `TileService` is never bound, and `cmd statusbar click-tile` does nothing [measured, test app,
  2026-11-16]. A Quick Settings tile is no surface on this device.
- **A sideloaded app switches the language with no bypass.** With `MANAGE_EXTERNAL_STORAGE`
  (`appops set … allow`), a test app created the new code file, deleted the old one and broadcast
  `hw_type_change` in 6 to 10 ms [measured, 2026-11-16]. Two surfaces work:
  - A **floating button** (`TYPE_APPLICATION_OVERLAY`, `SYSTEM_ALERT_WINDOW` by `appops`) stays
    visible and tappable over Note, Digest, To-Do, Email, Settings, a plugin view and the
    keyboard; each tap cycled the file [measured].
  - The app's **launcher icon** is added to the Supernote sidebar by itself (Settings › Apps ›
    Customize Sidebar listed it, and removed it on uninstall) [measured]; a tap runs the switch.
    The sidebar opens from the side touch strip (`fts_slide_ts`), which ADB cannot drive, so the
    tap from the sidebar itself is a pen-round step.
  - The Lingo app ([`apps/lingo-app/`](../apps/lingo-app/AGENTS.md), [#157](https://github.com/martonpaulo/ink-tools/issues/157), named Dialect until [#160](https://github.com/martonpaulo/ink-tools/issues/160)) ships both surfaces.
    Its floating button came back by itself after a tablet restart [measured, 2026-11-16]. Setting
    `MANAGE_EXTERNAL_STORAGE` to deny restarts the app's process, and the button shows again.
    Customize Sidebar lists a newly installed app only when that screen is opened again; it showed
    one entry, «Lingo» [measured].
- **A plugin can float a button over every app too.** SnapMark's optional «Floating capture
  button» is a `TYPE_APPLICATION_OVERLAY` window owned by `com.ratta.supernote.pluginhost`
  (uid 1000, appop `SYSTEM_ALERT_WINDOW`) that stays over Email with no plugin view open
  [measured, 2026-11-16]. `sn-plugin-lib` has no such call (button types are only 1 sidebar,
  2 lasso, 3 document selection), so it is the plugin's own native code adding a window in the
  host process; the host's own plugin view is one full-screen `TYPE_PHONE` window
  (`PluginHostService.initWindowManager`) [source].
- **The next recognition follows a switch, with no restart.** The Note app's TXT export
  recognised the same page as «Maa» in `en_US`, «magá» in `es_ES` and «maçã» in `pt_BR`, one
  export right after each floating-button tap, in 2.7 to 2.8 s each, the first no slower
  [measured, 2026-11-16]. The keyboard re-reads the file each time it opens
  (`onStartInputView` → `SkbContainer` → `Recognition.binderEvent` sets `recognizer.lang`; same
  process, no restart), and its label then shows the new language; while it stays open it keeps
  the old one [measured, log and label]. TXT export lands in `EXPORT/`, which Supernote Cloud
  uploads at once [measured].
- **The pen confirms it** [measured, pen round, 2026-11-16, Lingo app 0.1.0 beta 2,
  [#157](https://github.com/martonpaulo/ink-tools/issues/157)]: lasso «Recognize as Text» on
  a handwritten «maçã» gave «mass» in `en_US` and «maçã» in `pt_BR`, right after each
  floating-button tap. The handwriting keyboard in To-Do gave «~ Maga» in `en_US` and «maçã» in
  `pt_BR`; its bar showed the new language only after the keyboard was opened again. A tap on the
  app's entry in the Supernote sidebar switched the language with nothing on screen.
- Uninstalling a plugin from Settings («Its data will also be deleted») left its
  `MyStyle/<name>` folder untouched; a `plugin ls` right after the uninstall got no answer from
  the plugin provider once, then answered [measured, Ink2Pic, 2026-11-16].
- **Shell ADB can write** `/sdcard/.data/dictionary/` [measured], so a host-side `inkctl` command
  could switch the global language among the installed packs without a plugin.
- Installed language packs: `en_US`, `es_ES`, `pt_BR`, `zh_CN`, `zh_TW`, `ja_JP` (147 MB total);
  the other 60 of the 66 need a Settings download [measured].
- A `.note` header carries `<FILE_RECOGN_LANGUAGE:...>` (a plain note reads `none`); a Real-Time
  Recognition note gets the language at creation via `setFileRecognLanguage`, and the field is a
  writable file-format field even though the UI forbids changing it after creation [measured,
  source].
- Where the owner writes can be told by a sideloaded app's accessibility service, enabled over
  ADB with `settings put secure enabled_accessibility_services <package>/<service>` and
  `accessibility_enabled 1` [measured, 2026-11-16, a throwaway service,
  [#157](https://github.com/martonpaulo/ink-tools/issues/157)]:
  - The handwriting keyboard (`com.android.inputmethod.keyboard/.PinyinIME`) shows as a window of
    type `TYPE_INPUT_METHOD` in `getWindows()` about 140 ms after its `TYPE_WINDOW_STATE_CHANGED`
    event, and leaves the list when it closes; one `getWindows()` read took 4 to 125 ms.
  - `TYPE_WINDOW_STATE_CHANGED` names the foreground app and activity: Note
    `NoteInsidePagesActivity`, Digest `KnowledgeActivity`, To-Do `TaskActivity`, Email
    `HomeActivity`.
  - A window of type `TYPE_ACCESSIBILITY_OVERLAY` never received the keyboard in its insets, so an
    overlay alone cannot see the keyboard.
  - `UsageStatsManager.queryEvents` with the `GET_USAGE_STATS` app-op granted by `appops` lists
    each resumed activity (6 ms), but only when asked, so it needs a timer.
  - A `uiautomator` dump (`inkctl snapshot`) restarts the service (`onServiceConnected` again).
- Settings › Apps › Customize Sidebar lists one item per app package, by its label: the Lingo app
  shows once, «Lingo», although it has two launcher activities, and a sidebar tap opens the first
  one [measured, 2026-11-16, Lingo app 0.1.0 beta 2,
  [#160](https://github.com/martonpaulo/ink-tools/issues/160)].

### What a plugin can show while a no-view action runs

A lasso or toolbar button with `showType: 0` runs with no plugin view
([PluginButton](https://docs.supernote.com/en/api-reference/supernote-plugin/types/plugin-button)).
Read on 2026-11-14 for [#103](https://github.com/martonpaulo/ink-tools/issues/103): every page
`docs.supernote.com/llms.txt` lists, and the `sn-plugin-lib` 0.2.3 source in a plugin's
`node_modules`. No surface is both on the note and under the plugin's control:

| Surface | Show and clear | Where it is known from |
| :--- | :--- | :--- |
| Toast | `sn-plugin-lib` has none. React Native's own `ToastAndroid` (not the plugin API) shows a text toast with the app context, so it needs no activity; it has no cancel call and disappears after about 2 s or 3.5 s by itself | [official] docs index; React Native 0.79.2 `ToastModule.kt`. A plugin's toast shows at the bottom centre of the note for about 2 s [measured, Relay, 2026-11-16] |
| Ratta dialog | `NativeUIUtils.showErrorTipDialog(text)` and `showRattaDialog(text, left, right, isSuccess)` open the host's own dialogs; there is no call to close them | [official] SDK source only, not in the docs; the module exists on the device [measured, `plugins/ink2pic/docs/device-tests.md`]. Both pass `getCurrentActivity()`, which the host leaves null, and a native exception destroys the plugin (`plugins/ink2pic/docs/brief.md` section 10.5) |
| Plugin view | `showPluginView()` and `closePluginView()` open and close the plugin's own view on command | [official] [showPluginView](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-manager/show-plugin-view), [closePluginView](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-manager/close-plugin-view). The SDK's JSDoc names a «center dialog» region with a width and height, which the documented `PluginButton` lacks; whether the view can be small or see-through over the note: to test |
| Element on the page | `insertPageElements` then `deletePageElements` | [official] API. It writes into the note file: a plugin the host kills leaves it there, and it adds undo steps |
| Button name or state | `modifyButton`, `setButtonState` | [official] API; the lasso toolbar is hidden while the action runs [inference] |

The plugin view was chosen: a dark «Loading…» strip at the top of an otherwise transparent view
([#103](https://github.com/martonpaulo/ink-tools/issues/103), `packages/ui-kit/README.md`). Whether the host draws the view over the note, so
the note shows through, is still to test.

## Files and sync

- `MyStyle/` syncs with Supernote Cloud file by file, about 0.14 s per file per sync, so many
  small files cost minutes; a hidden folder outside the synced folders is skipped [measured,
  [#23](https://github.com/martonpaulo/ink-tools/issues/23)]. A plugin cannot read that hidden folder (see Plugins), so it is no home for
  plugin files; its private folder (`getPluginDirPath`) is the one place outside sync it reaches.
- `adb shell` (`uid=2000(shell)`, groups `sdcard_rw`, `ext_data_rw`) cannot list or write a plugin's
  private folder under `/data/data/com.ratta.supernote.pluginhost/files/plugins/<pluginID>`
  («Permission denied»), and `run-as com.ratta.supernote.pluginhost` answers «package not an
  application» [measured, 2026-11-17, [#116](https://github.com/martonpaulo/ink-tools/issues/116)].
  Whether that folder survives a plugin update is not measured yet [to test, [#23](https://github.com/martonpaulo/ink-tools/issues/23)].
- A file a plugin writes in `MyStyle/` is uploaded to Supernote Cloud within seconds (Retouch's
  `MyStyle/Retouch/history.json`, 5 s after the write) [measured, 2026-11-16].
  Retouch keeps its working files in its private folder since [#198](https://github.com/martonpaulo/ink-tools/issues/198); whether
  the note app takes an inserted PNG from there is [to test, [#198](https://github.com/martonpaulo/ink-tools/issues/198)].
- A sync conflict renames a folder to `<name>_CONFLICT_<17 digits>` [measured, [#22](https://github.com/martonpaulo/ink-tools/issues/22)].
- The tablet's own watcher picks up a copied file; Android refuses the sync broadcast from ADB
  [measured, `cli/inkctl/README.md`].

## Network and ADB

- The lasso tool takes the pen only: a loop drawn with `input motionevent` (touch) or
  `input stylus motionevent` selects nothing, and `sendevent` to the `Wacom-pen` node
  (`/dev/input/event7`) is refused (`Permission denied`, SELinux) [measured, 2026-11-16, Nomad,
  [#148](https://github.com/martonpaulo/ink-tools/issues/148)]. Once a lasso exists, `inkctl click` presses its toolbar and every «⋯» row.
  A plugin's `lassoElements(rect)` does lasso with no pen (see Plugins), so a helper plugin button
  is the route an agent has.
- USB ADB needs Sideloading on; Wi-Fi ADB is turned on over the cable (`inkctl wifi on`) and off
  with `inkctl wifi off` [measured]. With the tablet's Wi-Fi off (`adb -d shell svc wifi disable`),
  `adb -d` still answers over the cable [measured, 2026-11-16,
  [#171](https://github.com/martonpaulo/ink-tools/issues/171)]. Since that change inkctl sends every
  call over the cable when `adb devices` lists one authorized USB tablet, and over Wi-Fi ADB
  otherwise; `inkctl status` names the link [source]. Before it, inkctl reached the tablet over
  Wi-Fi only and lost it with the tablet's Wi-Fi off [measured, 2026-11-16].
- After a tablet restart, `inkctl status` fails with exit 3 and names the USB route
  (`adb tcpip 5555`); `inkctl wifi on` over the cable restores it [measured, 2026-11-16,
  [#1](https://github.com/martonpaulo/ink-tools/issues/1)].
- Two ways to put a selection on the page without the pen, for a round: a text received by Relay
  lands as a lassoed text box, and a sticker from the built-in Sticker plugin lands as lassoed
  strokes in the «pasted» state. Neither is a lassoed handwritten word or picture [measured,
  2026-11-16].
- With `wifi_sleep_policy` at `2`, the tablet kept answering while asleep for 15 minutes and lost
  1% battery [measured, `cli/inkctl/README.md`].
