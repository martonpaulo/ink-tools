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
  and links: [#97](https://github.com/martonpaulo/supernote-tools/issues/97).

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
  `packages/ui-kit` and a test refuses smaller sizes ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)).

## Plugins

- Install: copy the `.snplg` to `MyStyle/`, then Settings > Apps > Plugins > Add Plugin [official].
  Reinstalling from the existing entry reinstalls the host's managed copy, not the new file
  [reported]; a versioned file name avoids picking the wrong one.
- Limits: 30 installed, 10 enabled [official, 3.29.44 announcement].
- A plugin's view runs its start code once per plugin-host process: going back and opening the
  view again does not re-run it; `am force-stop com.ratta.supernote.pluginhost` starts a fresh
  process [measured, 2026-11-14, [#91](https://github.com/martonpaulo/supernote-tools/issues/91)].
- A plugin can open a TCP listener and accept a connection over Wi-Fi, with the screen on and off
  [measured, 2026-11-14, [#91](https://github.com/martonpaulo/supernote-tools/issues/91)].
- HTTPS `fetch` works; cleartext `http://` fails at once [measured, `brief.md`].
- Plugin call times on the owner's tablet, one «Insert best picture» for «apple», Ink2Pic
  0.1.0-dev.17 [measured, 2026-11-14, [#19](https://github.com/martonpaulo/supernote-tools/issues/19)]: `recognizeElements` 0.9 to 1.7 s,
  `insertPageElements` 0.1 to 0.3 s, re-lasso 0.4 to 0.6 s, writing the PNG under 20 ms, a 200 px
  contour conversion 0.16 to 0.25 s, measuring 12 page-1 thumbnails 5.7 s.
- A plugin's file calls reach only a whitelist of shared paths: Ink2Pic 0.1.0-dev.18 listing
  `/storage/emulated/0/.ink2pic-symbols` failed with `SecurityException: Plugin [...] is not allowed
  to access sdcard path outside whitelist` [measured, 2026-11-15, [#23](https://github.com/martonpaulo/supernote-tools/issues/23)].
- Lasso buttons of all plugins share one «⋯» list under the lasso toolbar; each row's icon shows
  at about 60 px [measured, 2026-11-15 screenshot, [#107](https://github.com/martonpaulo/supernote-tools/issues/107)]. A button takes one icon, so each plugin
  ships one 96 x 96 PNG per button, which the tablet scales down to that size (owner D43 A).
- A lasso button registered while the plugin already runs shows in that list at once, and
  `insertText` puts a text box on the page [measured, 2026-11-15, [#115](https://github.com/martonpaulo/supernote-tools/issues/115)].
- The lasso calls (`getLassoElements`, `getLassoRect`) need `plugin.permission.FILE:READ` declared
  and granted: without it they fail with code 1503, «File read permission has not been requested»,
  and the log shows `PluginSec DENY reason=sdcard_no_read` for the note's path [measured, 2026-11-16,
  Lingo 0.0.1 code 1, [#128](https://github.com/martonpaulo/supernote-tools/issues/128)].
- A plugin that registers four lasso buttons gets four rows in the «⋯» list, each with its text
  name and no icon; the list ends after the last plugin row [measured, 2026-11-16, Lingo,
  [#128](https://github.com/martonpaulo/supernote-tools/issues/128)].
- After a no-view lasso button inserts its text, the lasso is gone [measured, 2026-11-16, Lingo].
- InkHub's Upload Item form on the tablet, category Plugins: subcategory (Writing, Drawing,
  Reading, Utility, Game, Other), license, the package, up to 6 thumbnails in a 3:4 slot, picked
  from the tablet's own folders (Document, EXPORT, MyStyle, Note, SCREENSHOT, INBOX). It states no
  pixel size or file type [measured, 2026-11-15, [#100](https://github.com/martonpaulo/supernote-tools/issues/100)].
- The Upload Item form does not scroll from `adb shell input swipe` or `input motionevent`; taps
  work [measured, 2026-11-15].
- `recognizeElements` has no language parameter [official signature]; that it uses the
  handwriting language of Settings › Display & Input › Keyboard is [inference]. The SDK has no
  call that reads or writes that language; `registerLangListener` reports the system UI language
  only [official, [#146](https://github.com/martonpaulo/supernote-tools/issues/146)].
- Content providers: calendar and To-Do answer query, insert and delete from a plugin; the
  Knowledge (Digest) provider rejects the guessed URIs and refuses delete [measured, [#42](https://github.com/martonpaulo/supernote-tools/issues/42), [#59](https://github.com/martonpaulo/supernote-tools/issues/59)].
- A lassoed picture can be read and replaced in place [measured, 2026-11-16, Probe 0.0.1 code 5,
  firmware `Chauvet.E103.2610191001.2559`, [#130](https://github.com/martonpaulo/supernote-tools/issues/130)]:
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

### What a plugin can show while a no-view action runs

A lasso or toolbar button with `showType: 0` runs with no plugin view
([PluginButton](https://docs.supernote.com/en/api-reference/supernote-plugin/types/plugin-button)).
Read on 2026-11-14 for [#103](https://github.com/martonpaulo/supernote-tools/issues/103): every page
`docs.supernote.com/llms.txt` lists, and the `sn-plugin-lib` 0.2.3 source in a plugin's
`node_modules`. No surface is both on the note and under the plugin's control:

| Surface | Show and clear | Where it is known from |
| :--- | :--- | :--- |
| Toast | `sn-plugin-lib` has none. React Native's own `ToastAndroid` (not the plugin API) shows a text toast with the app context, so it needs no activity; it has no cancel call and disappears after about 2 s or 3.5 s by itself | [official] docs index; React Native 0.79.2 `ToastModule.kt`. Whether the host loads the module and the screen shows the toast: [inference], to test |
| Ratta dialog | `NativeUIUtils.showErrorTipDialog(text)` and `showRattaDialog(text, left, right, isSuccess)` open the host's own dialogs; there is no call to close them | [official] SDK source only, not in the docs; the module exists on the device [measured, `plugins/ink2pic/docs/device-tests.md`]. Both pass `getCurrentActivity()`, which the host leaves null, and a native exception destroys the plugin (`plugins/ink2pic/docs/brief.md` section 10.5) |
| Plugin view | `showPluginView()` and `closePluginView()` open and close the plugin's own view on command | [official] [showPluginView](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-manager/show-plugin-view), [closePluginView](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-manager/close-plugin-view). The SDK's JSDoc names a «center dialog» region with a width and height, which the documented `PluginButton` lacks; whether the view can be small or see-through over the note: to test |
| Element on the page | `insertPageElements` then `deletePageElements` | [official] API. It writes into the note file: a plugin the host kills leaves it there, and it adds undo steps |
| Button name or state | `modifyButton`, `setButtonState` | [official] API; the lasso toolbar is hidden while the action runs [inference] |

The choice between them is on [#103](https://github.com/martonpaulo/supernote-tools/issues/103).

## Files and sync

- `MyStyle/` syncs with Supernote Cloud file by file, about 0.14 s per file per sync, so many
  small files cost minutes; a hidden folder outside the synced folders is skipped [measured,
  [#23](https://github.com/martonpaulo/supernote-tools/issues/23)]. A plugin cannot read that hidden folder (see Plugins), so it is no home for
  plugin files; its private folder (`getPluginDirPath`) is the one place outside sync it reaches.
  Whether that folder survives a plugin update is not measured yet [to test, [#23](https://github.com/martonpaulo/supernote-tools/issues/23)].
- A sync conflict renames a folder to `<name>_CONFLICT_<17 digits>` [measured, [#22](https://github.com/martonpaulo/supernote-tools/issues/22)].
- The tablet's own watcher picks up a copied file; Android refuses the sync broadcast from ADB
  [measured, `cli/snadb/README.md`].

## Network and ADB

- The lasso tool takes the pen only: a loop drawn with `input motionevent` (touch) or
  `input stylus motionevent` selects nothing, and `sendevent` to the `Wacom-pen` node
  (`/dev/input/event7`) is refused (`Permission denied`, SELinux) [measured, 2026-11-16, Nomad,
  [#148](https://github.com/martonpaulo/supernote-tools/issues/148)]. Once a lasso exists, `snadb click` presses its toolbar and every «⋯» row.
- USB ADB needs Sideloading on; Wi-Fi ADB is turned on over the cable (`snadb wifi on`) and off
  with `snadb wifi off` [measured].
- With `wifi_sleep_policy` at `2`, the tablet kept answering while asleep for 15 minutes and lost
  1% battery [measured, `cli/snadb/README.md`].
