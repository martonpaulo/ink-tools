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
- [Note file format](#note-file-format)
- [Network and ADB](#network-and-adb)

## The owner's tablet

| Fact | Value | How known |
| :--- | :--- | :--- |
| Screen | 1920 x 2560 px, density 300 | [measured] `adb shell wm size`, `wm density`, 2026-11-14 |
| Model | Manta (A5 X2): `ro.product.board` reads `A5X2`, `getDeviceType()` = `5`. `ro.product.model` reads `Supernote Nomad`, a firmware identifier, not the model | [measured] 2026-11-14 and 2026-11-25; [official] SDK source for the type |
| Android | 11 | [measured] `ro.build.version.release` |
| Firmware | Chauvet 3.31.45, build `Chauvet.E103.2610191001.2559_release` | [measured] `ro.build.display.id`, 2026-11-14 |

The owner's tablet is the Manta. `ro.product.model` reads «Supernote Nomad»: a firmware identifier
shared with the Nomad line, not the model (owner, 2026-11-26). Never take the model from it. Read `ro.product.board` (`A5X2` is the Manta, `A6X2`
the Nomad) or `getDeviceType()`, as `inkctl status` does ([#284](https://github.com/martonpaulo/ink-tools/issues/284)).

## Screen and units

- Manta: 1920 x 2560 px, 10.7 inch, 3:4, about 299 ppi, so 1 mm is about 11.8 px [official specs,
  arithmetic in [`research/plugin-brief/brief.md`](research/plugin-brief/brief.md)].
- Nomad: 1404 x 1872 px, 7.8 inch, 3:4, about 300 ppi [official specs only; never measured: the
  owner's tablet is the Manta, [#284](https://github.com/martonpaulo/ink-tools/issues/284)]. Handwriting Language's
  button place is tested on both screens, each turned both ways
  ([#244](https://github.com/martonpaulo/ink-tools/issues/244)).
- A floating window of a sideloaded app follows a screen turn: Handwriting Language's button,
  saved at the lower leading corner, sat at (0, 1800) on the turned 2560 x 1920 screen and back at
  (0, 2440) after [measured, `user_rotation` 1 then 0, 2026-11-25,
  [#244](https://github.com/martonpaulo/ink-tools/issues/244)].
- A page has the same 1920 x 2560 size; `getPageSize` answers it [measured, build 0.1.0 (3)].
- Stroke points from `getElements` are page pixels [measured, Probe, 2026-11-17,
  [#206](https://github.com/martonpaulo/ink-tools/issues/206)]. The pen digitizer (EMR) spans 21632 x
  16224 on the Manta page, its x running down the page and its y from the right edge to the left
  (`PointUtils.getRealMaxX`, `getRealMaxY` and `emrPoint2Android` in sn-plugin-lib 0.2.3, which
  says points are pixels after 0.1.65) [official source].
- The points of an `event_pen_up` element are in EMR units, not page pixels: the first stroke read
  raw 6627..7033 x 11625..12059 and converted to 493..544 x 784..832 page px with the formula of
  `PointUtils.emrPoint2Android` [measured, Real-Time Conversion 0.1.0 beta 2, 2026-11-17, firmware
  `Chauvet.E103.2610191001.2559`, [#206](https://github.com/martonpaulo/ink-tools/issues/206)].
  A plugin converts them once, through `sn-adapter`'s `readEmrRange` and `emrToPage`.
- EMR points follow the screen, whatever the page: they convert to screen pixels with the display
  size, and a page made for another Supernote model (an A5X or A6X page, 1404 x 1872, on a Manta)
  is scaled to fill the screen, so screen pixels scale to the page's own by page side over screen
  side. Converting with the page size alone put a shape 516 px to the left on such a page
  [reported, Snap 0.9.4 release notes, a measured fact; not yet seen on our tablets,
  [#269](https://github.com/martonpaulo/ink-tools/issues/269)]. `sn-adapter` reads the display
  size with `PluginCommAPI.getPageDisplaySize`, deprecated in sn-plugin-lib 0.2.3 for `getPageSize`
  but the one call that answers the screen [inference; a device round confirms it on such a note].
- `recognizeElements` accepts only the page's own elements, from `getElements`: on the pen-up
  elements it failed for every word with «Recognition failed. Please try again!» [measured, beta
  2]; on the same strokes read from the page it answered («converted 4 characters from 4 strokes»)
  [measured, Real-Time Conversion 0.1.0 beta 5, 2026-11-17,
  [#206](https://github.com/martonpaulo/ink-tools/issues/206)].
- A pen-up element's uuid is not the uuid `getElements` gives the same stroke: none of a word's 4
  strokes was found by uuid in a page read of 4 elements [measured, Real-Time Conversion 0.1.0
  beta 3, 2026-11-17, [#206](https://github.com/martonpaulo/ink-tools/issues/206)]. In sn-plugin-lib
  0.2.3 the uuid is the key of the element's native point cache (`ElementDataAccessor`), made for
  each event or read [official source]. So a pen-up stroke is found in a page read by its bounds in
  page pixels: beta 5 found 6 of 7 and 1 of 8 page elements that way [measured, 2026-11-17].
- `batchUpdatePageElements` refuses a text box whose `textRect` holds a non-integer, with
  «`elements[0].textBox.textRect.right` must be an integer» [measured, Real-Time Conversion 0.1.0
  beta 5, 2026-11-17, [#206](https://github.com/martonpaulo/ink-tools/issues/206)].
- The page does not redraw after a plugin's `batchUpdatePageElements`: the converted text box was
  on the page but showed only at the next page change [measured, owner pen test, beta 5,
  2026-11-17, [#206](https://github.com/martonpaulo/ink-tools/issues/206)]. PluginHost has no
  intent that redraws a note ([`research/2026-11-pluginhost-control.md`](research/2026-11-pluginhost-control.md)).
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
- Limits: 30 installed, 10 enabled [official, 3.29.44 announcement]. PluginHost 1.00.2610150 holds both in
  code: `PluginManager.PLUGIN_ENABLE_MAX_NUM = 10`, and enabling an 11th fails with error 201
  `ERROR_MAX_ENABLE_NUM`; `PluginInstallManager.PLUGIN_MAX_NUM` caps installed plugins at 30
  [device data, PluginHost 1.00.2610150, 2026-11-25]. Third-party plugins share the 10, so Ink Tools
  keeps at most 8 enabled ([`decisions.md`](decisions.md), [#304](https://github.com/martonpaulo/ink-tools/issues/304)).
- A plugin's view runs its start code once per plugin-host process: going back and opening the
  view again does not re-run it; `am force-stop com.ratta.supernote.pluginhost` starts a fresh
  process [measured, 2026-11-14, [#91](https://github.com/martonpaulo/ink-tools/issues/91)].
- A plugin can open a TCP listener and accept a connection over Wi-Fi, with the screen on and off
  [measured, 2026-11-14, [#91](https://github.com/martonpaulo/ink-tools/issues/91)].
- HTTPS `fetch` works; cleartext `http://` fails at once [measured, `brief.md`].
- A plugin's Java can load another app's code: `createPackageContext("com.ratta.settings",
  CONTEXT_INCLUDE_CODE | CONTEXT_IGNORE_SECURITY)`, then its class loader loads the vendor's
  `RattaSwitch` and makes an instance, inside PluginHost [measured, firmware 3.31.45, 2026-11-25,
  [#287](https://github.com/martonpaulo/ink-tools/issues/287)]. Shown in a plugin view, it is not tried; Ink Tools does not use it, since its controls stay
  at the highest dependency level that serves ([`architecture.md` › Layer rules](architecture.md#layer-rules)).
- React Native's `URL` parses a string, but its getters throw: Account Sync 0.1.0-beta.10's To-Do
  pass failed with `URL.protocol is not implemented` [measured, 2026-11-17,
  [#209](https://github.com/martonpaulo/ink-tools/issues/209)]. React Native 0.79.2's
  `Libraries/Blob/URL.js` throws on every getter but `href`, and its `URLSearchParams` has only the
  constructor, `append` and `toString`. Tablet code takes `parseUrl` of `sync-core`; the `url` rule
  of `scripts/boundaries.py` refuses `new URL(` there.
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
- Native launcher icons are 48 dp vector drawables on a 48 viewport: outline strokes 4 wide,
  black, no fill, round caps and joins, centerlines within 4 to 44 [measured, 2026-11-25, Settings,
  To-Do, Calendar, Email and Digest, pulled with `adb pull` and read with `aapt2 dump xmltree`;
  Note and Document are 64 px bitmaps with 4 px strokes; InkHub is the one filled icon,
  [#271](https://github.com/martonpaulo/ink-tools/issues/271)]. `design/icons/native.json` records them and `design/icons/icons.json` draws every Ink Tools icon to them.
- The Note app's toolbar and lasso icons are 64 px bitmaps with 4 px strokes whose ink keeps a
  median 11 px from the box on every side (17%) [measured, 2026-11-25, 71 icons of
  `com.ratta.supernote.note` that draw on white, [#271](https://github.com/martonpaulo/ink-tools/issues/271)]; 32 of their 41 single-stroke icons
  measure 4 px across a stroke, anti-aliasing summed [measured, 2026-11-25]. Each plugin icon is
  built from Tabler glyphs, scaled so its ink spans 41 of 64 on its longer side and centred, with a
  stroke of 4 of 64: the same stroke share and at least that margin
  ([`decisions.md`](decisions.md#decision-index)).
- `PluginManager.unregisterButton(id)` of an id the plugin does not hold never answers: the JS
  promise stays pending forever [measured and device data, 2026-11-17, Image Editing 0.1.0 beta 11,
  [#226](https://github.com/martonpaulo/ink-tools/issues/226)]. `PluginButtonManager.unregisterPluginButtonInternal`
  throws `Throwable("Plugin button is not exists!")`, and its caller answers
  `promise.resolve(th)`, a Java `Throwable` the React Native bridge cannot pass. A plugin that
  awaits such a call before `registerButton` never registers its button, so the lasso menu shows
  no row for it. Register first, and never await an unregister of an id this runtime did not
  register itself.
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
  React host and class loader is not known [to test, [#142](https://github.com/martonpaulo/ink-tools/issues/142)]. Each plugin that ships
  the Java of `com.ink2pic.files` registers its modules under its own names (Lookup's
  `LookupFiles` and `LookupImage`), so no name is registered twice in one host either way.
- Every enabled plugin loads into one PluginHost process: after a host restart the log shows
  `getPackages packageName:<ReactPackage>` then `load pluginKey:<key>` for each plugin in turn
  (Lookup's `LookupFilesPackage`, Relay's `RelayPackage`, Retouch's `RetouchPackage`), with no
  `ClassNotFound`, `NoSuchMethod`, duplicate-class or `already registered` line [measured,
  2026-11-16, [#142](https://github.com/martonpaulo/ink-tools/issues/142)].
- Pen input in a plugin view: `sn-plugin-lib` 0.2.3 types every motion with `toolType` 0
  unknown, 1 finger or 2 EMR pen (`event/PluginEvent.ts`), and a plugin view is an ordinary React
  Native view, so its touch responder is taken to get the pen as a pointer [inference, to measure,
  [#226](https://github.com/martonpaulo/ink-tools/issues/226), [#134](https://github.com/martonpaulo/ink-tools/issues/134)]. Image Editing's editor draws Erase and Crop marks that way; the
  marks drawn on the page and lassoed with the picture stay as the fallback.
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
- A send from the tablet to the Mac's saved LocalSend target made no offer on the Mac: with
  LocalSend listening on TCP 53317, the tablet's TCP check of that port answered closed while the
  macOS firewall was on, and «Send Text» showed «not reachable» [measured, Device Transfer 0.1.0
  beta 5 and 6, 2026-11-17, [#98](https://github.com/martonpaulo/ink-tools/issues/98)]. The firewall was not the only cause: with
  LocalSend permitted through it, beta 9 still showed «not reachable» [measured, 2026-11-25].
- LocalSend 1.18.2 requires a TLS client certificate on 53317: a client that presents none gets
  the TLS 1.3 alert 116 «certificate required» at its first read, and any valid self-signed one
  is accepted; its request names only its own certificate as an authority [measured, `openssl
  s_client` to the Mac's LocalSend 1.18.2, 2026-11-25, [#98](https://github.com/martonpaulo/ink-tools/issues/98)]. Its source makes the
  certificate optional only while web share is on, and trusts a `register` only when the claimed
  `fingerprint` is the client certificate's SHA-256 (`packages/core/src/http/server/`). A LocalSend
  client presents its own identity's certificate; Device Link presents the `Identity.java`
  certificate it receives with, so its fingerprint matches [measured on the Mac: `PinnedClient`
  got 200 from `register` with it and an `IOException` without it; the tablet's send is
  unverified until the next device round].
- The first write of a file that does not exist yet in shared storage left it empty while the call
  reported success; the next write over that file worked [measured, Lookup settings,
  [#162](https://github.com/martonpaulo/ink-tools/issues/162)]. Creating the file empty, closing
  it, then opening it again to write gives the full content on the first save: Word Lookup 0.2.0
  beta 10 wrote all 259 bytes of a new `MyStyle/Lookup/settings.json`, and the switch set before
  a PluginHost restart was the one read after it [measured, Manta, 2026-11-16,
  [#162](https://github.com/martonpaulo/ink-tools/issues/162)].
- A plugin that declares only `FILE:READ` reads a file it did not write under
  `/storage/emulated/0/.data/plugin/`, and its delete throws `SecurityException: Plugin [...] has no
  DELETE permission` [measured, Account Sync 0.1.0 beta 7, [#116](https://github.com/martonpaulo/ink-tools/issues/116)]. So a one-shot drop file there, which `adb shell`
  writes and the plugin takes and deletes, needs `plugin.permission.FILE:DELETE` granted: with it,
  Account Sync 0.1.0 beta 10 moved both sign-in secrets in and left the folder empty [measured,
  2026-11-17, [#116](https://github.com/martonpaulo/ink-tools/issues/116)].
- `/storage/emulated/0/<Plugin>/` is outside the whitelist: `mkdirs` is denied
  (`sdcard_not_in_whitelist`), and `File.delete` throws a `SecurityException` that the host
  suppresses in a native thread, so the JS call never settles [measured, Relay,
  [#164](https://github.com/martonpaulo/ink-tools/issues/164)].
- `lassoElements(rect)` selected the text boxes inside the rect but not a picture that crossed its
  bottom edge [measured]; that an element must lie wholly inside is [inference].
- A pen stroke drawn over a picture joins the picture's lasso: a closed rectangle stroke inside a
  200 x 200 picture, lassoed by the picture's rect, gave `getLassoElementTypeCounts`
  `{"trailNum":1,"bitmapNum":1}`, and the «⋯» list kept Image Editing's rows next to the stroke
  rows [measured, Manta, 2026-11-17, [#132](https://github.com/martonpaulo/ink-tools/issues/132)].
  Image Editing's Crop and Erase rely on three facts not yet measured, each logged on its press: a lassoed
  stroke's points read in page pixels, as a page read's do (points off the page are taken as EMR);
  each lassoed stroke has its `numInPage`; and `batchUpdatePageElements(nums, [], page)` with an
  empty insert list deletes those strokes and leaves the picture's place for a new
  `lassoElements(rect)` [unverified, [#132](https://github.com/martonpaulo/ink-tools/issues/132), [#134](https://github.com/martonpaulo/ink-tools/issues/134)].
- `lassoElements(rect)` with an inserted picture's rect also selects the handwriting strokes under
  the picture, and a delete of that selection removes them [measured, pen round, 2026-11-16,
  Lookup 0.2.0 beta 4, [#168](https://github.com/martonpaulo/ink-tools/issues/168)].
- Reading a page's elements one by one for their rects costs about 8 to 11 ms per element (3
  elements in 24 ms, 5 in 54 ms); a test page of 69 to 90 elements ran past a 300 ms budget every
  time [measured, 2026-11-16, Lookup 0.2.0 beta 4,
  [#152](https://github.com/martonpaulo/ink-tools/issues/152)].
- Reading every element of a 540-stroke page at once (two bridge calls per stroke, all in flight)
  crashed the Note app with SIGSEGV in 2 of 2 runs, while the same page read one element after the
  other took under 3 s and did not crash [measured, 2026-11-17, Lookup 0.2.0 beta 21, firmware
  `Chauvet.E103.2610191001.2559`, [#221](https://github.com/martonpaulo/ink-tools/issues/221)].
  sn-adapter keeps at most `OCCUPIED_READS_IN_FLIGHT` (4) reads in flight [unverified on the device].
- `recognizeElements` on one lassoed handwritten word took 2.6 s in Lookup 0.2.0 beta 4 [measured,
  pen round, 2026-11-16, [#19](https://github.com/martonpaulo/ink-tools/issues/19)]; 963 to 999 ms
  on the Manta's «apple» fixture in Word Lookup 0.2.0 beta 27 [measured, 2026-11-25].
- PluginHost's JS runs plain text work far slower than a Mac: picture-search's text scorers took
  about 120 ms per pass over 12 results, and its first ranking in a fresh JS instance (after an
  install) took 1057 ms for 18 results, against 87 ms later on the same instance [measured,
  2026-11-25, Word Lookup 0.2.0 beta 26 and 27, firmware `Chauvet.E103.2610191001.2559`,
  [#19](https://github.com/martonpaulo/ink-tools/issues/19)]. Score once and reuse it.
  Most of that cost was building patterns and parsing a data file, not the scoring: under the
  Hermes VM React Native 0.79.2 ships (`sdks/hermesc/osx-bin/hermes`), each `new RegExp` with
  `\p{L}` and the `iu` flags took 2 to 9 ms to build, and 11 were built per `readIntent` call. Build
  a pattern once at module load, and parse only the part of a bundled index a call needs. With both
  in beta 30 the first ranking took 192 ms for those 18 results, and 60 ms for 17 [measured,
  2026-11-25, Word Lookup 0.2.0 beta 30, [#19](https://github.com/martonpaulo/ink-tools/issues/19)].
- The built-in Sticker plugin pastes a sticker as strokes and leaves it selected in a «pasted»
  state. `getLassoRect` then answers the selection's local rect (`{-40, 0, 140, 181}` for a sticker
  shown near (870, 1190)), and Back leaves the note and drops the pasted sticker [measured,
  [#165](https://github.com/martonpaulo/ink-tools/issues/165)].
- A finger drag (`adb shell input swipe`) on a lassoed selection does not move it [measured].
- The Back key does not close a plugin's full view (Lookup and Relay Settings, Relay «Receive»):
  the view stays until the plugin calls `closePluginView` or the host restarts [measured,
  2026-11-16]. A plugin's own Settings view, a host window, stays over Settings after
  `am force-stop com.ratta.settings`; Back closed it there. Image Editing's Settings view opened
  from its permission path did not close on Back, and Home, then opening a note, left it
  [measured, 2026-11-17, [#204](https://github.com/martonpaulo/ink-tools/issues/204)]; with its «Close» button (Image Editing beta 8) it
  closes back to Settings [measured, 2026-11-17, [#224](https://github.com/martonpaulo/ink-tools/issues/224)].
- React Native's `hardwareBackPress`, and so `BackHandler`, never reaches a plugin view: PluginHost
  1.00.2610150 (the Manta's) shows every plugin's root view in one `PluginContainer`, a
  `FrameLayout` added with `WindowManager.addView` as a `TYPE_PHONE` overlay (type 2002, flags
  `0x520`, focusable), never in an Activity. React Native emits the event only from
  `ReactInstanceManager.onBackPressed` or `ReactHostImpl.onBackPressed`, which only `ReactActivity`
  and `ReactFragment` call, and no PluginHost class overrides `dispatchKeyEvent`, sets a key
  listener or calls `onBackPressed` [device data, PluginHost, 2026-11-25; measured: no
  `ReactNativeJS` line on Back, 2026-11-17 and 2026-11-25,
  [#204](https://github.com/martonpaulo/ink-tools/issues/204)]. A full view's way out is its own
  visible «Close». The window is focusable and a window hands a key to its focused view, so Image
  Editing 0.1.0 beta 15 makes its React root view focusable, focuses it on each show and turns Back
  into `hardwareBackPress` (`BackKey.java`) [inference, device round pending,
  [#226](https://github.com/martonpaulo/ink-tools/issues/226)].
- A plugin's detail page in Settings › Apps › Plugins has a «Settings» row only when the plugin has
  a config button: on Probe's page, which has none, «Uninstall» sits where Account Sync's page has
  «Settings» (y about 920), and a blind tap there opened the uninstall dialog [measured, 2026-11-17,
  [#214](https://github.com/martonpaulo/ink-tools/issues/214)]. Read `plugin_detail_title` before any tap on that page.
- PluginHost exports only its launcher `StubActivity`, a `com.ratta.supernote.plugin.action.DEBUG`
  receiver and a messenger service; no intent opens one plugin's view [measured, `dumpsys
  package`, [#139](https://github.com/martonpaulo/ink-tools/issues/139)].
- So a plugin's own action runs by a file, not an intent: inkctl writes `action.json` in a folder
  the plugin reads, and the plugin reads it on a JS timer in PluginHost
  (`packages/sn-adapter/src/official/actions.ts`, `inkctl plugin action`); a plugin with no action
  yet is pressed with `inkctl click` on its named element. How soon the timer answers, and whether
  it runs while the tablet sleeps, is [unverified]
  ([#283](https://github.com/martonpaulo/ink-tools/issues/283)).
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
- The Digest is the Room table `knowledge` of `content://com.ratta.supernote.knowledge.provider`:
  PluginHost may insert (`knowledge/insert`), query and update; `isTrustedCaller` lists five Ratta
  packages, not PluginHost, and guards every delete, tags, restores and the sync state, so a delete
  is refused before its URI is read. `source_type` 4 («self add») shows as «custom source», with no
  note or document. An entry holds text only: `content` of 1 to 15,000 characters, `comment_str`
  up to 2,000, a collection, `metadata` JSON and an optional `.mark` file; there is no image column
  [source, device data, 2026-11-17, [#42](https://github.com/martonpaulo/ink-tools/issues/42)]. An insert from a plugin is
  [unverified: not yet run on the tablet].
- The To-Do app lists only `tasks_table` rows with `deleted = 0`: 278 rows inserted with `deleted`,
  `sort`, `taskId` and their siblings NULL were in its lists' counts as 0, and the one row the native
  sync rewrote (`taskId` set, `deleted = 0`, `sort = 0`, `hasSync = 1`) was the only one shown
  [measured, Account Sync 0.1.0 beta 15, [#212](https://github.com/martonpaulo/ink-tools/issues/212)]. Account Sync now writes every column a native
  insert fills (the descriptor's `insertDefaults` and `insertNow`) and its own `taskId`. A list
  whose `taskListId` Account Sync made (`inktools…`) kept it after the native sync (`hasSync = 1`).
  A task with an empty `taskListId` is an unfiled task, the app's own Inbox [observed device behaviour of
  `DataBaseTools.insert`; a pulled unfiled task is not yet seen on the tablet].
- After a pass of Account Sync 0.1.0 beta 15, the native To-Do cloud sync left 5 extra rows in a
  list Account Sync made: `hasSync = 1`, a `taskId` of its own, and the list, title and due time of
  a pulled row that kept its `inktools…` `taskId` [measured rows, Account Sync 0.1.0 beta 18; their
  origin inferred, [#212](https://github.com/martonpaulo/ink-tools/issues/212)]. The repair soft-deletes such a twin (`deleted = 1`), so
  it is never read as a tablet-only task.
- A To-Do row in `tasks_table` or `task_group_table` is removed by `deleted = 1`, which hides it
  from the app's lists: Account Sync's old «Inbox» list, soft-deleted that way, left the app while
  its tasks moved to the unfiled Inbox [measured, Account Sync 0.1.0 beta 18, 2026-11-17,
  [#212](https://github.com/martonpaulo/ink-tools/issues/212)]. That the app itself deletes only this way is [inference, from the
  `deleted = 0` filter].
- The calendar's `data_info` delete removes no row, whether selected by `title = ?` [measured,
  Account Sync 0.1.0 beta 11, [#43](https://github.com/martonpaulo/ink-tools/issues/43)] or by the row id the insert returned: beta 21 left one active
  «Account Sync dry insert» row at each plugin host start [measured, 2026-11-17, [#213](https://github.com/martonpaulo/ink-tools/issues/213)]. So
  Account Sync's probe never inserts: its test write is an update selected by `id = -1`, which
  matches no row, and it runs only in a sync pass that needs a module that is on, never when the
  host loads Account Sync [[#43](https://github.com/martonpaulo/ink-tools/issues/43)]. Its Calendar writer updates and cancels a pulled event by its row id.
- The calendar provider never deletes a row: `CalendarContentProvider.delete` calls
  `DataBaseTools.delete`, whose body is `return 0;` [source, device data, `SupernoteCalendar.apk`,
  firmware `Chauvet.E103.2610191001.2559`, [#43](https://github.com/martonpaulo/ink-tools/issues/43)]. The app removes a synced event by
  `status = 'cancelled'` and a new `lastModifiedTime`; `adb shell content update` with that status
  on 7 test rows hid them from the Calendar app, and the rows stay in the table [measured,
  2026-11-17, [#43](https://github.com/martonpaulo/ink-tools/issues/43)]. Account Sync removes an event the same way.
- The Calendar app's month dots (`DataBaseTools.getDuringEvent`) and day list (`getTodayEvent`)
  read every `data_info` row with `status = 'confirmed' AND recurrence is null` in one loop inside
  one `try`, and for an `isAllDay` 1 row call `DateUtils.getLongDate(startDate)`, which is
  `startDate.split("-")` on a `yyyy-MM-dd` text [source, device data, `SupernoteCalendar.apk`,
  firmware `Chauvet.E103.2610191001.2559`, [#28](https://github.com/martonpaulo/ink-tools/issues/28)]. An all-day row with `startDate` NULL throws
  `NullPointerException` and the loop drops it and every later row: Account Sync 0.1.0 beta 23 and
  24 showed one event of 217, and filling `startDate` and `endDate` on the 29 all-day rows showed
  all of them [measured, 2026-11-17, [#28](https://github.com/martonpaulo/ink-tools/issues/28)]. These queries filter on no calendar and no
  `eventId` [source]. A native all-day row holds Google's `start.date` and exclusive `end.date` in
  `startDate` and `endDate` [source]. So an all-day row Account Sync writes carries both dates as
  `yyyy-MM-dd`, a timed row leaves them NULL, and the repair fills them on older rows by row id.
  Account Sync keeps `eventId` NULL and the link in `calendarId` (`inktools:` and both ids)
  [[#28](https://github.com/martonpaulo/ink-tools/issues/28)].
- The native Google sync (`GoogleSync.getAllEvents`) reads only `tag = 'event'` rows and uploads one
  with no `eventId` to Google [source, [#28](https://github.com/martonpaulo/ink-tools/issues/28)], so Account Sync's `tag=task` rows never reach
  Google.
- The Calendar app logs `getDuringEvent list size:N` and `GetTodayData: todayList size:N` each time
  it opens, which checks what it shows with no screen read; `am force-stop
  com.ratta.supernote.calendar`, then `am start -n com.ratta.supernote.calendar/.MainActivity`,
  restarts it [measured, 2026-11-17, [#28](https://github.com/martonpaulo/ink-tools/issues/28), [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
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
  - `createElement(0)` gives `stroke.penType` 0, and `insertPageElements` refuses such a stroke
    with code 302 «Invalid pen type» (logcat `readableMap2Stroke error penType:0`), whatever pen the
    note shows; setting `penType` before the insert is required [measured, 2026-11-25, Manta,
    [#249](https://github.com/martonpaulo/ink-tools/issues/249)].
  - A picture: `createElement(200)` with `picture.picturePath` a PNG under `MyStyle/` and
    `picture.rect`, then `insertPageElements`: 245 ms.
  - `lassoElements(rect)` around either one selects it in 184 to 299 ms: `getLassoElementTypeCounts`
    gives `{bitmapNum: 1}` or `{trailNum: 1}`, the lasso toolbar shows, and every «⋯» row,
    other plugins' rows included, can then be pressed with `inkctl click`.
  - `insertPageElements` on the open note needs `FILE:WRITE` granted: without it, code 1501.
  - `insertPageElements(elements, page, 0)` writes into any page of the open note, not only the
    shown one [measured, 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
  - On 2026-11-17, `createElement(200)` in a plain plugin had no `picture` object (`Cannot set
    property 'picturePath' of undefined`), and `PluginNoteAPI.insertImage(path)` put the picture
    on the current page, placed by the host near the page centre [measured, [#214](https://github.com/martonpaulo/ink-tools/issues/214)]. Why
    this differs from the probe of 2026-11-16 above is [unverified].
- `PluginFileAPI.insertNotePage` needs a template name from `PluginCommAPI.getNoteSystemTemplates()`
  (for example `style_white`): the name `getNotePageTemplate` returns (`style_white_a5x2`) fails with
  «802 Background template file does not exist!» [measured, 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
- Right after a plugin's `PluginCommAPI.jumpToPage`, the next press of the plugins button is lost;
  a wait of about 4 s before it works, and 1.5 s was too short on a page with a picture [measured,
  Probe, 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
- A Lasso Actions or Device Link insert leaves the inserted picture lassoed, but a plugin command
  run after it clears the lasso: `getLassoElementTypeCounts` then answers 904 [measured, Probe,
  2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)]. Lasso again by the element's rect before pressing a row.
- A plugin's type 1 button (`registerButton(1, ...)`) shows in NOTE's toolbar «Plugins» menu, with
  Run Command, Snap and Send Page. Opening that menu clears a lasso: a lassoed drawing, then the
  menu and Image Editing's button, and `getLassoElements` answered `904 No lasso action has been
  performed. Cannot call the API!` [measured, Image Editing 0.1.0 beta 13, Manta, 2026-11-25,
  [#248](https://github.com/martonpaulo/ink-tools/issues/248)]. Whether a button pinned to the toolbar keeps a lasso is [unverified].
- A lasso «⋯» row (`registerButton(2, ...)`, any `editDataTypes`) keeps the lasso, unlike a sidebar
  button: from Plugin Diagnostics' lasso row, `getLassoRect` answered the lassoed strokes' box in
  23 ms and `saveStickerByLasso` wrote a sticker file in 39 ms [measured, Plugin Diagnostics
  0.0.2 beta 10, Manta, 2026-11-25, [#249](https://github.com/martonpaulo/ink-tools/issues/249)].
  On the same tablet and day:
  - `lassoElements(rect)` selects strokes only: a text box inside the rect stayed out of the lasso
    and so out of the sticker. Whether a sticker keeps a text box or a picture lassoed by hand is
    [unverified].
  - `insertSticker` on another page pastes the piece at the page centre, selected, in the
    «pasted» state. In that state `getLassoRect` answers 904 in the same sidebar press and the
    local rect `{0, 0, 180, 180}` from a lasso row; `resizeLasso` to a page rect then moves the
    piece exactly there (38 ms).
  - Back while a pasted piece is still selected drops it from the page. What commits a paste is
    [unverified].
  - A rect lasso takes every stroke inside the rect, ink already on the page included.
  - `FileUtils.listFiles` lists a file as `{type, path}`, and answers null again once the folder
    is empty.
- The floating selection `insertImage` leaves shows the lasso «⋯» rows, other plugins' included,
  but is no lasso for the plugin API: `getLassoRect` answers 904, and Image Editing's «Document»
  pressed on it logged `done` and left the placed picture unchanged. After one such press, Back
  and reopening the note, the page held no element: the received photo was gone [measured,
  Device Transfer 0.1.0 beta 7, 2026-11-17, [#196](https://github.com/martonpaulo/ink-tools/issues/196)]. Whether Back alone drops a floating
  `insertImage` picture is [unverified].
- A picture `insertImage` places is not on the page right away: `getElements` read 23 ms and about
  120 ms after the insert held 0 elements, and later the page held it as `type=200 rect=[498, 680,
  1421, 1880]`, a 923 x 1200 JPEG centred on the 1920 x 2560 page at its own size [measured,
  Device Transfer 0.1.0 beta 8, 2026-11-17, [#196](https://github.com/martonpaulo/ink-tools/issues/196)]. When it lands is [unverified]; Device
  Link reads again every 250 ms for up to 3 s.
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
- `convertElement2Sticker` refuses a picture element with error 205, «Sticker conversion supports
  only normal strokes and geometries» [measured, Word Lookup, 2026-11-16, [#35](https://github.com/martonpaulo/ink-tools/issues/35)].
- Each plugin install restarts PluginHost, so every enabled plugin's load pass runs again: one
  Account Sync test row appeared per install, three in 8 minutes [measured, 2026-11-17,
  [#43](https://github.com/martonpaulo/ink-tools/issues/43)]. Every host start (a tablet restart, a plugin install, a host restart by itself) ran
  Account Sync's load pass: it ran a To-Do pass with no press, and beta 25's Calendar repair ran
  before any «Sync now» [measured, 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)]. PluginHost kills its own process after a native plugin is upgraded or
  uninstalled; whether a plugin with no native code restarts it is [unverified]
  ([`research/2026-11-pluginhost-control.md`](research/2026-11-pluginhost-control.md)).
- `adb shell content query --uri content://com.ratta.supernote.pluginhost/plugins` lists every
  installed plugin with its version and `enable` state, and `…/plugins/<pluginID>` gives its
  `usesPermissions`, each `status` 2 for Always Allow; the provider is read-only [measured,
  2026-11-17, [`research/2026-11-pluginhost-control.md`](research/2026-11-pluginhost-control.md),
  [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
- Install, enable, disable and permission changes have no `adb` one-liner: they go through the
  exported AIDL service `PluginSettingService` (`IPluginSetting`: `installPlugin` 1,
  `setPluginEnable` 6, `updatePluginPermissions` 9), which `am`, `content` and `service call`
  cannot drive, since `installPlugin` needs a live callback binder. The service has no permission
  guard, and `installPlugin(path, cb)` opens any path, so a `.snplg` in `MyStyle/` installs with no
  copy. The callbacks (`IPluginInstallCallback`, `IPluginSetCallback`, `IPluginUninstallCallback`)
  are in package `com.ratta.supernote.plugincorelib.callback`. A button press by intent exists only
  for the built-in Sticker plugin (`a5db6166e8fe8e17`, exported `PluginHostService`, `action=VIEW`
  with the extra `action=plugin`) [source, device data, PluginHost `1.00.2610150`,
  [`research/2026-11-pluginhost-control.md`](research/2026-11-pluginhost-control.md), [#214](https://github.com/martonpaulo/ink-tools/issues/214)]. The Ink Tools
  bridge app holds that binder ([#215](https://github.com/martonpaulo/ink-tools/issues/215)); through it a plugin list took 1.35 s,
  «Always Allow» 3.5 s, an install 2.9 s, a disable 2.4 s and an enable 3.1 s, where the screen
  path took about 40 s, 60 to 240 s and about 25 s each [measured, Manta, 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
- PluginHost's log tags for a round: `PluginInstallManager` (install), `PluginContainerService`
  (the `PluginHostService`), `PluginSettingService`, `PluginsContentProvider`, `PluginManager` and
  `PluginPermissionManager` [source, [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
- PluginHost permission `status` values: 2 Always Allow, 1 While Using, 0 Denied, -1 Cancelled
  [reported by the device round of 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)]; the bridge's `allow` takes any of them,
  and the single-plugin row reads it back.
- An install through the bridge can answer `onFailed` with error 100, «Plugin [<other id>] is not
  allowed to access other plugin's private dir», naming a background plugin, while the update has
  landed: PluginHost's log shows it seeds a current plugin per thread, and the binder thread
  that served the call still carried Account Sync's id. The plugin list showed the new version, and
  after `am force-stop com.ratta.supernote.pluginhost` the next installs answered `updated:`
  [measured, Manta, bridge 0.1.0 beta 2, 2026-11-17,
  [#225](https://github.com/martonpaulo/ink-tools/issues/225)]. Why the thread keeps the other id
  is [unverified]; `inkctl plugin install` reads the version back after an `onFailed`.
- An enable through the bridge after a disable once got no callback: PluginHost logged
  `PluginSec DENY reason=other_plugin` on the plugin's own `.npk` and the call timed out; an
  uninstall and an install loaded it [reported by the device round of 2026-11-17, Image Editing,
  [#228](https://github.com/martonpaulo/ink-tools/issues/228)]. It did not happen again on
  Plugin Diagnostics or on Image Editing 0.1.0 beta 12, whose `.npk` loaded between
  `setCurrentPluginId` and `clearCurrentPluginId` and whose buttons came back in 1 s; each enable
  also logs `DENY reason=system_dir_listing path=/sys/devices/system/cpu`, which stops nothing
  [measured, Manta, 2026-11-25, [#228](https://github.com/martonpaulo/ink-tools/issues/228)]. The cause is [unverified]; a refused
  enable makes `inkctl plugin enable` fail with that `DENY` line and the steps that load it again.
- The built-in Sticker plugin has no enable switch; every other plugin is turned on or off in
  Settings › Apps › Plugins [reported by the device round of 2026-11-17, not re-measured, [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
- A plugin's `console.log` lines reach logcat under the tag `ReactNativeJS`, not under the plugin's
  name: a log read filtered by the plugin's name as a tag shows nothing [measured].
- A pressed plugin row moves to the top of the plugin rows in the lasso «⋯» list, which the host
  sorts by last use [measured, 2026-11-16].
- Image Editing's edits on the Manta take 2.1 to 3.8 s on a full-width picture (Enhance 3750 ms,
  Lighter 2154 ms, Darker 2100 ms) and under 1.1 s on a 400 x 362 one; the table is in
  [Image Editing's product notes](../plugins/image-editing/docs/product.md#measured-edit-times)
  [measured, Image Editing 0.1.0 beta 15, Manta, 2026-11-25, [#145](https://github.com/martonpaulo/ink-tools/issues/145)].
- After the one-pass edits and the fast PNG encoder, every Image Editing edit on a 976 x 886
  picture takes under 1 s (Enhance 941 ms, Lighter 876 ms, Darker 902 ms), and the picture keeps its
  size [measured, Image Editing 0.1.0 beta 16, Manta, 2026-11-26, [#145](https://github.com/martonpaulo/ink-tools/issues/145)].
- The picture a lassoed-picture edit receives is almost all half transparent: for the 400 x 362
  apple, Retouch's cutout log read `alpha clear 9 partial 144154 opaque 637`, grey 157/158/254,
  so a mask built on opaque pixels clears the object [measured, Image Editing 0.1.0 beta 15, Manta,
  2026-11-25, [#134](https://github.com/martonpaulo/ink-tools/issues/134)].

### Handwriting recognition language

Firmware `Chauvet.E103.2610191001.2559`; detail and file-and-line evidence in
[`research/2026-11-handwriting-language.md`](research/2026-11-handwriting-language.md)
([#151](https://github.com/martonpaulo/ink-tools/issues/151)).

- Settings opens one of its pages from another app: `com.ratta.settings/.SettingsActivity` with the
  string extra `activity_type` set to the page's class, such as
  `com.ratta.settings.input.HWLanguageSetting` (Handwriting Recognition Language),
  `…input.KeyboardSetting`, `…wifi.WifiSettings`, `…security.SecuritySettings`,
  `…input.DateAndTimeSetting` or `…application.PluginManagerFragment`
  (`SettingsActivity.isValidActivityType`); Handwriting Language's chevron row uses it [measured,
  source, [#272](https://github.com/martonpaulo/ink-tools/issues/272)].
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
  `voc4oo2ysd7cdnkc`, 2026-11-16; source]. But a plugin **can switch it through a route outside the plugin file API**: a
  child process (`ProcessBuilder("sh","-c", …)`) and the system Documents provider
  (`DocumentsContract.createDocument`) both wrote the folder on the tablet; reflection to the raw
  Os, the host main-looper thread and a plain new thread were denied [measured]. The host runs as
  `android.uid.system`. A plugin that takes such a route suits the owner's device only and would likely fail store
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
- **A sideloaded app switches the language through its own permission.** With `MANAGE_EXTERNAL_STORAGE`
  (`appops set … allow`), a test app created the new code file, deleted the old one and broadcast
  `hw_type_change` in 6 to 10 ms [measured, 2026-11-16]. Two surfaces work:
  - A **floating button** (`TYPE_APPLICATION_OVERLAY`, `SYSTEM_ALERT_WINDOW` by `appops`) stays
    visible and tappable over Note, Digest, To-Do, Email, Settings, a plugin view and the
    keyboard; each tap cycled the file [measured].
  - The app's **launcher icon** is added to the Supernote sidebar by itself (Settings › Apps ›
    Customize Sidebar listed it, and removed it on uninstall) [measured]; a tap runs the switch.
    The sidebar opens from the side touch strip (`fts_slide_ts`), which ADB cannot drive, so the
    tap from the sidebar itself is a pen-round step.
  - The Lingo app ([`apps/handwriting-language/`](../apps/handwriting-language/AGENTS.md), [#157](https://github.com/martonpaulo/ink-tools/issues/157), named Dialect until [#160](https://github.com/martonpaulo/ink-tools/issues/160)) ships both surfaces.
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
  - A `uiautomator` dump (`inkctl snapshot`, also `inkctl screen`) restarts the service
    (`onServiceConnected` again); `adb exec-out screencap -p` does not.
  - NOTE's toolbar buttons are nodes with stable content descriptions (`pen_1`, `eraser_1`,
    `lasso`, …), not clickable: `ACTION_CLICK` fails, a `dispatchGesture` tap at the centre selects
    the tool in about 100 ms. No node shows which tool is selected. With the tablet asleep the
    tree is empty. An untouchable overlay with `FLAG_WATCH_OUTSIDE_TOUCH` gets each touch-down with
    its source but no position or tool type. The pen (`Wacom-pen`) is source `0x5002`, a
    touchscreen, which Android 11's touch exploration takes too [official, AOSP] [measured, 2026-11-25,
    [#251](https://github.com/martonpaulo/ink-tools/issues/251),
    [tap gestures study](research/2026-11-tap-gestures.md)].
- Settings › Apps › Customize Sidebar lists one item per app package, by its label: the Lingo app
  shows once, «Lingo», although it has two launcher activities, and a sidebar tap opens the first
  one [measured, 2026-11-16, Lingo app 0.1.0 beta 2,
  [#160](https://github.com/martonpaulo/ink-tools/issues/160)]. It lists an app with no activity
  too (Ink Tools Bridge), with the application's `android:icon`, or Android's default icon
  without one [measured, 2026-11-25, Ink Tools Bridge 0.1.0 beta 2 and beta 3,
  [#260](https://github.com/martonpaulo/ink-tools/issues/260)]. Every install of the app, an update with the same launcher activity
  included, drops the item until the Supernote launcher (`com.ratta.supernote.launcher`) reads
  the apps again: `am force-stop com.ratta.supernote.launcher` brought it back each time; a
  restart of the Settings app alone did not [measured, 2026-11-25, Handwriting Language 0.1.0 beta 5,
  [#246](https://github.com/martonpaulo/ink-tools/issues/246)].

### What a plugin can show while a no-view action runs

A lasso or toolbar button with `showType: 0` runs with no plugin view
([PluginButton](https://docs.supernote.com/en/api-reference/supernote-plugin/types/plugin-button)).
Read on 2026-11-14 for [#103](https://github.com/martonpaulo/ink-tools/issues/103): every page
`docs.supernote.com/llms.txt` lists, and the `sn-plugin-lib` 0.2.3 source in a plugin's
`node_modules`. No surface is both on the note and under the plugin's control:

| Surface | Show and clear | Where it is known from |
| :--- | :--- | :--- |
| Toast | `sn-plugin-lib` has none. React Native's own `ToastAndroid` (not the plugin API) shows a text toast with the app context, so it needs no activity; it has no cancel call and disappears after about 2 s or 3.5 s by itself | [official] docs index; React Native 0.79.2 `ToastModule.kt`. A plugin's toast shows at the bottom centre of the note for about 2 s [measured, Relay, 2026-11-16]. Its text is in no log: logcat shows only `WindowManager: addWindow win:Window{… Toast}` and `NotificationService: Toast already killed. pkg=com.ratta.supernote.pluginhost`, and `dumpsys notification` lists no toast; `inkctl wait toast` reads its accessibility event instead [measured, 2026-11-25, Android 11, [#297](https://github.com/martonpaulo/ink-tools/issues/297)] |
| Ratta dialog | `NativeUIUtils.showErrorTipDialog(text)` and `showRattaDialog(text, left, right, isSuccess)` open the host's own dialogs; there is no call to close them | [official] SDK source only, not in the docs; the module exists on the device [measured, [`research/plugin-brief/device-tests.md`](research/plugin-brief/device-tests.md)]. Both pass `getCurrentActivity()`, which the host leaves null; on PluginHost 1.00.2610150 `HostUIImpl` swaps a null context for the application context and raises the window to type 2002, so the plugin lives on [device data, 2026-11-25, [`research/2026-11-native-paths.md`](research/2026-11-native-paths.md); device check on [#296](https://github.com/martonpaulo/ink-tools/issues/296)]. The older note in [`research/plugin-brief/brief.md`](research/plugin-brief/brief.md) section 10.5 predates this host |
| Plugin view | `showPluginView()` and `closePluginView()` open and close the plugin's own view on command | [official] [showPluginView](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-manager/show-plugin-view), [closePluginView](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-manager/close-plugin-view). The SDK's JSDoc names a «center dialog» region with a width and height, which the documented `PluginButton` lacks; but the host sets the window to −1 × −1 for every `showType` but 0, so a plugin view is always full screen [device data, 2026-11-25, [`research/2026-11-native-paths.md`](research/2026-11-native-paths.md)] |
| Element on the page | `insertPageElements` then `deletePageElements` | [official] API. It writes into the note file: a plugin the host kills leaves it there, and it adds undo steps |
| Button name or state | `modifyButton`, `setButtonState` | [official] API; the lasso toolbar is hidden while the action runs [inference] |

The plugin view was chosen: the native loading box centred in an otherwise transparent view
([#103](https://github.com/martonpaulo/ink-tools/issues/103), [#287](https://github.com/martonpaulo/ink-tools/issues/287), `packages/ui-kit/README.md`). Opened from Settings, the host draws that
view over the screen behind it, which shows around the box undimmed [measured, Plugin Diagnostics
test build, 2026-11-25, [#287](https://github.com/martonpaulo/ink-tools/issues/287)]; over a note it is still to test.

## Files and sync

- `MyStyle/` syncs with Supernote Cloud file by file, about 0.14 s per file per sync, so many
  small files cost minutes; a hidden folder outside the synced folders is skipped [measured,
  [#23](https://github.com/martonpaulo/ink-tools/issues/23)]. A plugin cannot read that hidden folder (see Plugins), so it is no home for
  plugin files; its private folder (`getPluginDirPath`) is the one place outside sync it reaches.
- `adb shell` (`uid=2000(shell)`, groups `sdcard_rw`, `ext_data_rw`) cannot list or write a plugin's
  private folder under `/data/data/com.ratta.supernote.pluginhost/files/plugins/<pluginID>`
  («Permission denied»), and `run-as com.ratta.supernote.pluginhost` answers «package not an
  application» [measured, 2026-11-17, [#116](https://github.com/martonpaulo/ink-tools/issues/116)].
  That folder survives a plugin update: Word Lookup's `search-cache.json` there, filled by beta 11,
  answered a search after the update to beta 12 [measured, 2026-11-17,
  [#13](https://github.com/martonpaulo/ink-tools/issues/13), [#210](https://github.com/martonpaulo/ink-tools/issues/210)]. So a cache there is keyed by the plugin's
  `versionCode`. The Ink2Pic brief records that an install emptied it on build 0.1.0 (12)
  ([ink2pic#41](https://github.com/martonpaulo/ink2pic/issues/41)).
  Word Lookup keeps its inserted pictures there since [#23](https://github.com/martonpaulo/ink-tools/issues/23); whether the note app takes a PNG
  inserted from there is [to test, [#23](https://github.com/martonpaulo/ink-tools/issues/23), [#198](https://github.com/martonpaulo/ink-tools/issues/198)].
- A file a plugin writes in `MyStyle/` is uploaded to Supernote Cloud within seconds (Retouch's
  `MyStyle/Retouch/history.json`, 5 s after the write) [measured, 2026-11-16].
  Retouch keeps its working files in its private folder since [#198](https://github.com/martonpaulo/ink-tools/issues/198); whether
  the note app takes an inserted PNG from there is [to test, [#198](https://github.com/martonpaulo/ink-tools/issues/198)].
- A sync conflict renames a folder to `<name>_CONFLICT_<17 digits>` [measured, [#22](https://github.com/martonpaulo/ink-tools/issues/22)]. It takes a
  child changed on the tablet since the last sync and the folder deleted and recreated on the
  cloud side (the launcher's `SingleSyncTask`, [#22](https://github.com/martonpaulo/ink-tools/issues/22)), so Word Lookup keeps
  `settings.json` in the private folder and read the newest conflict copy's when theirs is gone.
- The tablet's own watcher picks up a copied file; Android refuses the sync broadcast from ADB
  [measured, `cli/inkctl/README.md`].
- **Custom fonts for text boxes** live in `MyStyle/fonts` ([#247](https://github.com/martonpaulo/ink-tools/issues/247)). The Note app's text-box font
  menu lists «System Font», the built-in fonts of `/sdcard/.data/fonts` (Dolce, 851tegakizatsu,
  Satisfy), then every `.ttf` or `.otf` file under `MyStyle/fonts`, subfolders included, each file
  as its own entry named by its file name without the extension: Moon Uniform's three files showed
  as `MoonUniform-Bold`, `MoonUniform-Light` and `MoonUniform-Regular`, not one family [measured,
  2026-11-25, firmware `Chauvet.E103.2610191001.2559_release`, `inkctl font install`]. The menu
  keeps its list in memory and reads the folders again when it closes, so a new font shows the
  second time it opens, or at once after `am force-stop com.ratta.supernote.note` [source]. Like
  all of `MyStyle/`, the fonts sync to Supernote Cloud.
- The font picked in one text box becomes the Note app's default: every new text box, and the
  text that the native lasso «Recognize as Text» makes, then use it. A font check that picks
  MoonUniform left later recognized text in Moon signs until «System Font» was picked again in a
  new text box; a round sets it back to the font it found [measured, 2026-11-25, Manta,
  [#247](https://github.com/martonpaulo/ink-tools/issues/247), [#250](https://github.com/martonpaulo/ink-tools/issues/250)].
  The setting is in the Note app's private storage, not in `settings list`.
- A lasso «⋯» row exists only while its plugin is enabled: «Convert to Text» shows only with
  Real-Time Conversion turned on [measured, 2026-11-25, `inkctl lasso rows`,
  [#250](https://github.com/martonpaulo/ink-tools/issues/250)].

## Note file format

Measured on notes the owner's tablet wrote on 2026-11-25 (firmware
`Chauvet.E103.2610191001.2559_release`), read with the Ink Notebook Editor's `NoteFormat`
([#261](https://github.com/martonpaulo/ink-tools/issues/261)):

- A new note starts `noteSN_FILE_VER_20260016`; the header says `APPLY_EQUIPMENT` `N5`, so pages are
  1920 x 2560 [measured].
- A page has a main and a background layer, both `RATTA_RLE`; the three other layers are absent
  (address `0`) until used, and `LAYERINFO` lists them as deleted [measured].
- The page style carries the screen's suffix in the file (`style_5mm_grid_a5x2`), while
  `insertNotePage` takes the name without it (`style_5mm_grid`) [measured]. The background of every
  template is stored in the note itself, so the note draws without the tablet's template files.
- A page made from an imported PDF template has the style `user_pdf_<file>_<page>`; its background
  layer says `RATTA_RLE` but holds a 1920 x 2560 RGBA PNG, and the footer names each one as
  `STYLE_<style><md5>`; `PDFSTYLELIST` lists the styles in base64 [measured, 2026-11-25,
  [#308](https://github.com/martonpaulo/ink-tools/issues/308)].
- A template's dots and ruled lines are 1 to 3 pixels wide: drawn at a third of the page's size or
  less, plain resampling leaves a 5 mm dot grid at grey 190 and a thumbnail blank, so the Ink
  Notebook Editor darkens before it resamples [measured, 2026-11-25,
  [#308](https://github.com/martonpaulo/ink-tools/issues/308)].
- A text box and a picture a plugin inserts are drawn into the main layer's bitmap, so a reader of
  the bitmaps shows them with no element decoding [measured].
- `PluginFileAPI.generateNotePng` at `times: 1` on white matches `NoteFormat`'s drawing of the same
  page to 0.003 % of pixels or less, over 9 pages: blank, three templates, a text box with a picture,
  and four handwriting pages [measured, `inkctl note png`, `note-render --compare`].
  A second test note, dots with ink and ruled lines, matched at 0.000 % (2026-11-25,
  [#308](https://github.com/martonpaulo/ink-tools/issues/308)).
- A picture `PluginNoteAPI.insertImage` places stays a floating selection on screen, and Probe's call
  gave no answer in 20 s, yet the note file held the picture once the note was opened again
  [measured, 2026-11-25].
- The note file holds no serial number or account: the header's `FILE_ID` and each `PAGEID` are
  random [measured].

## Network and ADB

- The lasso tool takes the pen only: a loop drawn with `input motionevent` (touch) or
  `input stylus motionevent` selects nothing, and `sendevent` to the `Wacom-pen` node
  (`/dev/input/event7`) is refused (`Permission denied`, SELinux) [measured, 2026-11-16, Manta,
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
- The note app takes the `page` extra of `am start` (from 0) only for a note it has not opened
  before: a note opened before reopens at its last page and the extra is ignored, while a plugin's
  `PluginCommAPI.jumpToPage(page)` (from 0) moves to the page [measured, 2026-11-17, Manta,
  [#220](https://github.com/martonpaulo/ink-tools/issues/220)]. So `inkctl note open --page` and
  `inkctl fixture` move with the Probe's `jumpToPage`. Probe's `getCurrentPageNum` read right after
  the jump is not the shown page: it was often the page before the jump, and stayed at 8 on page 10
  [measured, 2026-11-25, Manta, [#220](https://github.com/martonpaulo/ink-tools/issues/220)]. They prove the page from the note's page counter «N / total»
  in the `tv_button` text instead, read up to 6 times; that counter's text is [unverified] on the
  tablet until the next device round.
- After a tablet restart, `inkctl status` fails with exit 3 and names the USB route
  (`adb tcpip 5555`); `inkctl wifi on` over the cable restores it [measured, 2026-11-16,
  [#1](https://github.com/martonpaulo/ink-tools/issues/1)]. USB ADB came back authorized, with no prompt, about 20 s after power-on, and Wi-Fi
  ADB was off (`service.adb.tcp.port` empty, `settings global adb_wifi_enabled` 0). For a few
  seconds after `inkctl wifi on`, `adb -s <serial>` over USB answers «device not found» while adbd
  restarts in TCP mode [measured, 2026-11-17, [#1](https://github.com/martonpaulo/ink-tools/issues/1), [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
- Android 11's Wireless debugging (`settings put global adb_wifi_enabled 1`, Developer options on)
  works on the Manta but does not survive a restart: at boot adbd logs `persist.adb.tls_server.enable
  changed to 0` and `adb wifi stopped`, and `adb_wifi_enabled` reads 0. Turning it on asks once per
  Wi-Fi network («Allow wireless debugging on this network?», with «Always allow on this network»
  unchecked by default); once that box is checked, the setting turns on with no dialog. Its port is
  new each time (40231, then 43029) and the Mac finds it with `adb mdns services`
  (`_adb-tls-connect._tcp`). `adb connect` to it worked with no pairing code, because the Manta's
  adbd requires no authentication at all (`ro.adb.secure` 0, adbd logs `authentication not
  required`) [measured, 2026-11-25, Manta, firmware Chauvet.E103.2610191001.2559,
  [#1](https://github.com/martonpaulo/ink-tools/issues/1)].
- The tablet sleeps between long steps (`dumpsys power` shows `mWakefulness=Asleep`), and a press
  then does nothing; `input keyevent 224` (WAKEUP) before a step wakes it [measured, 2026-11-17,
  [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
- `adb shell logcat -c` did not always clear the buffer before the next read, and `logcat -d -T
  '<MM-dd HH:mm:ss.000>'` with the device's own time printed no line in a script; reading the whole
  buffer and filtering by text worked [measured, 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
- `adb shell content query` columns can hold commas, so a row is parsed safely only with a
  projection that puts the free-text column last; `content update --bind <column>:n:` writes NULL
  (the `n` type) [measured, 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)].
- Two ways to put a selection on the page without the pen, for a round: a text received by Relay
  lands as a lassoed text box, and a sticker from the built-in Sticker plugin lands as lassoed
  strokes in the «pasted» state. Neither is a lassoed handwritten word or picture [measured,
  2026-11-16].
- With `wifi_sleep_policy` at `2`, the tablet kept answering while asleep for 15 minutes and lost
  1% battery [measured, `cli/inkctl/README.md`].
