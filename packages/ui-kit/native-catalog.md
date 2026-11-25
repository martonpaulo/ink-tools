# The native controls, measured

What the Supernote's own screens draw, measured on the tablet, so every Ink Tools surface draws
the same ([#272](https://github.com/martonpaulo/ink-tools/issues/272)). Each value that a control
uses lives in [`src/tokens.json`](src/tokens.json) with its source; this page records how it was
measured, the variants where two native screens disagree, and the one Ink Tools adopts.

## Contents

- [Method](#method)
- [Text styles](#text-styles)
- [Title bar](#title-bar)
- [Navigation list](#navigation-list)
- [List row](#list-row)
- [Lines](#lines)
- [Section caption](#section-caption)
- [Chevron](#chevron)
- [Switch](#switch)
- [Radio button](#radio-button)
- [Icons in rows](#icons-in-rows)
- [Icons](#icons)
- [Small filled button](#small-filled-button)
- [Selection border](#selection-border)
- [Not measured yet](#not-measured-yet)

## Method

- The tablet: the owner's Manta, 1920 x 2560 px, density 1.875 px per dp, 11.8 px per mm
  (`pxPerMm`). Every value below is in physical pixels of a full-screen
  `adb exec-out screencap -p`, then in millimetres as `tokens.json` stores it.
- The Settings pages open without a tap: `adb shell am start -n
  com.ratta.settings/.SettingsActivity --es activity_type <page>`, where `<page>` is
  `com.ratta.settings.input.KeyboardSetting`, `com.ratta.settings.input.HWLanguageSetting`,
  `com.ratta.settings.wifi.WifiSettings`, `com.ratta.settings.security.SecuritySettings`,
  `com.ratta.settings.input.DateAndTimeSetting` or
  `com.ratta.settings.application.PluginManagerFragment` (read from `SettingsActivity` with
  `jadx`).
- Colours and size names come from `aapt2 dump resources` of `com.ratta.settings`: its
  `dp_px_*` and `sp_px_*` dimensions (the `sw1024dp` values on the Manta) and its colours
  (`black` `#000000`, `gray` `#999999`, `dark` `#666666`).
- Screens read: Settings › Display & Input › Language & Region, Keyboard, Handwriting
  Recognition Language, Wi-Fi, Security & Privacy, Date & Time, Apps › Plugins; a note's
  sidebar › Page menu; Page › Manage Pages.
- A crop is named by its screen and its rectangle `x, y, width, height` in screen pixels, so a
  fresh screenshot gives it again. No native image is kept in the repository (the Clarify of
  [#272](https://github.com/martonpaulo/ink-tools/issues/272)): the controls are redrawn.

## Text styles

Every native text is regular weight. All text in Settings is black, `#000000`, but a value that
cannot change now, which is `gray` `#999999` (Date & Time › Time Zone under network time).

| Role | Native size | Where | Ink Tools role |
| :--- | :--- | :--- | :--- |
| The black bar's titles: the screen's, the left pane's, the page's | `sp_px_40`, 24.84 sp, 46.6 px | every Settings page, `title_bar`, `plugin_detail_title` | `barTitle` |
| A row's title, a navigation item's label | `sp_px_34`, 21.11 sp, 39.6 px | every row | `rowTitle` |
| A section caption: «Installed Languages», «Added Keyboards (Up to 7)», «About This Plugin» | `sp_px_34` | Handwriting Recognition Language, Keyboard, a plugin's page | `caption` |
| A row's subtitle and value, a description, the switch's word | `sp_px_30`, 18.63 sp, 34.9 px | Keyboard, Language & Region, `plugin_detail_desc`, Wi-Fi | `subtitle` |
| A plugin's «By:», version and size lines | `sp_px_26`, 16.15 sp, 30.3 px | `plugin_detail_developer`, `plugin_detail_code`, `plugin_detail_size` | `subtitle`: the native size is under `minFont` |
| The caption of the Plugins list, «Enabled (8/10)» | about `sp_px_24`, 29 px glyph height | Apps › Plugins | `caption`: the other captions are `sp_px_34`, and this one is under `minFont` |
| A plugin's «Delete» row | `sp_px_36`, 22.36 sp | `plugin_detail_delete` | none yet |
| A menu's title, «Page» | about 32 px glyph height, bold | the note's Page menu | none yet: no Ink Tools menu |
| A menu's item | about 32 px glyph height, regular | the note's Page menu | none yet |
| Ink Tools' own hints and status lines | none: the native Settings show no grey hint but a value that cannot change, `sp_px_30` | | `hint`, the subtitle's size in the context grey |

## Title bar

Crop: Language & Region, `0, 0, 1920, 133`.

- The band: black, 133 px tall (`dp_px_114`, `titleBarHeight`), the full screen width.
- The ×: a drawn square of two crossing strokes, 48 px (`closeMark`), its strokes about 5 px
  (`markStroke`), its centre 70 px from the leading edge (`closeCentre`), centred on the band's
  height.
- Two levels («× Settings ‹ Language & Region»): the left pane's part is 552 px wide
  (`navPaneWidth`), the × then the pane's title starting at 142 px (`paneTitleStart`); the page's part starts after
  the 2 px pane divider, its ‹ (31 x 56 px, `backMarkHeight`) starting 51 px in, in line with the
  rows' text, and its title centred on that part, not on the screen.
- One level, as an Ink Tools plugin's screen: the × at the leading edge and the title centred on
  the full width; the × never pushes it.

## Navigation list

Crop: Language & Region, `0, 133, 553, 1700`.

- An item: an icon about 64 px at about 30 px from the edge, the label at 140 px, `rowTitle`; one
  item every 152 px.
- The line under each item, the last too: dotted, 2 px (a 1 px black line between two half-grey
  ones), dashes of 6 px and gaps of about 6 px.
- The open item: a black bar 9 px wide (`navMarkWidth`), 147 px tall, at the item's trailing
  edge, beside the pane divider.
- The pane divider: a solid black line 2 px wide down the screen.

## List row

Crops: Language & Region, `553, 133, 1367, 410`; Keyboard, `553, 133, 1367, 920`.

- Height: 162 px (`dp_px_139`, `rowHeight`) with one or two lines of text, then the line under it.
- Side margins: the text starts 51 px after the pane's edge, and the line and the trailing
  control end 51 px before the other edge (`dp_px_44`, `sideMargin`). Handwriting Recognition
  Language ends them 79 px before it; Ink Tools adopts 51 px.
- A value at the trailing edge, «English ›»: `subtitle`, black, 26 px before the › (`markGap`).
- A two-line title (Handwriting Recognition Language) keeps the 162 px height.

## Lines

| Kind | Native | Where | Ink Tools |
| :--- | :--- | :--- | :--- |
| Solid | black, 2 px (`separator`) | after a group's last row; under the title of a menu or a screen's caption row (Manage Pages) | `RowGroup`'s line after its last row |
| Light | black, 1 px, dotted 3 px on, 4 px off (`lightLine`, `lightDash`, `lightGap`) | between two rows of one group: Apps › Plugins, the Page menu | `RowGroup`'s line between two rows |
| Dotted | black, 2 px, dashes of 6 px | under each item of the Settings navigation list | `NavList` |
| Short centred divider | not measured | between side-by-side items, as in the note's sidebar | none yet: [Not measured yet](#not-measured-yet) |

Where two screens disagree: Language & Region, Keyboard, Handwriting Recognition Language,
Wi-Fi and Security & Privacy draw the solid line after every row; Apps › Plugins and the note's
Page menu draw the light line between two rows of one group and the solid line after the group.
Ink Tools adopts the second (owner, 2026-11-25): it sets the levels apart.

## Section caption

Crops: Keyboard, `553, 133, 1367, 99`; Handwriting Recognition Language, `553, 133, 1367, 114`.

- A box 99 px tall (`dp_px_85`, `captionHeight`), its text at the bottom, `caption`, black; no line
  under it.
- Keyboard starts its text in line with the rows' text; Handwriting Recognition Language 12 px
  further in. Ink Tools adopts Keyboard's.

## Chevron

Crop: Language & Region, `1830, 180, 50, 70`.

- Two strokes at a right angle, 23 x 42 px (`chevronHeight`), strokes about 5 px, black, at the
  row's trailing margin.

## Switch

Crops: Security & Privacy, `1640, 170, 240, 90` (off); Wi-Fi, `1640, 170, 240, 90` (on).

- The track: a pill 136 x 70 px (`switchWidth`, `switchHeight`), its outline 5 to 6 px
  (`markStroke`).
- On: the track filled black, a white knob of 39 px at its trailing end. Off: a white track
  with a black outline, a black knob of 41 px (`switchKnob`) at its leading end. The knob keeps
  about 14 px to the track's outer edge.
- The word «ON» or «OFF» before the track, `subtitle`, black, about 25 px from it (`markGap`).

## Radio button

Crop: Handwriting Recognition Language, `1770, 290, 80, 80`.

- A ring of 54 px (`radioSize`), its stroke 5 px (`markStroke`); chosen, a filled dot of 30 px
  (`radioDot`) in it.

## Icons in rows

Crops: Apps › Plugins, `600, 1120, 1300, 120`; the Page menu, `230, 600, 560, 90`.

- A plugin's row: a 56 px icon box (`rowIcon`) at the side margin, its icon drawn about 48 px,
  centred on the row's height; the title 23 px after the box (`iconGap`); the › at the trailing
  margin.
- A menu item: a 58 px icon, the label 80 px after it; one item every 141 px.
- A row's trailing controls (Handwriting Recognition Language): the cloud download or the trash
  icon, then the radio button, about 70 px apart.

## Icons

- ⊖ remove: a ring of 60 px with a 5 px stroke and a bar (Keyboard).
- Trash: 52 px; cloud download: 53 x 54 px (Handwriting Recognition Language); `iconSize` is 52 px.

## Small filled button

Crop: Wi-Fi, `1660, 520, 220, 100`.

- «Scan»: a black box 193 x 79 px (`smallButtonWidth`, `smallButtonHeight`), square corners, its
  label in white, at the trailing margin of the «Select Network…» row. Ink Tools keeps the full
  touch target around the drawn box.

## Selection border

| Native | Where | Measured |
| :--- | :--- | :--- |
| The open tool of the note's sidebar, Page | crop `0, 1550, 120, 150` | stroke 5 px (`selectionStroke`), outer corner radius about 11 px (`selectionRadius`), the box 116 x 142 px around a 56 px icon |
| The current page in Manage Pages | crop `125, 340, 430, 560` | stroke 7 px, square corners, 12 px white between it and the page's own 2 px outline (`selectionInset`) |

Ink Tools adopts the sidebar's, the rounded one the owner named (2026-11-25), with the page's
inset. Applying it to every component is
[#287](https://github.com/martonpaulo/ink-tools/issues/287).

## Not measured yet

Read only on the screens above; the rest of the native surface is still to read
([#272](https://github.com/martonpaulo/ink-tools/issues/272)): the short centred divider of the
note's sidebar, the search field, the pager's sizes, the system dialogs `showRattaDialog` and
`showErrorTipDialog`, confirm and rename dialogs, toasts, the keyboard, the lasso toolbar, the pen
and eraser menus, Files, To-Do, Calendar, Digest, Mail, InkHub and the Home screen.
