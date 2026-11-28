# The native controls, measured

What the Supernote's own screens draw, measured on the tablet, so every Ink Tools surface draws
the same ([#272](https://github.com/martonpaulo/ink-tools/issues/272)). Each value that a control
uses lives in [`src/tokens.json`](src/tokens.json) with its source; this page records how it was
measured, the variants where two native screens disagree, and the one Ink Tools adopts.

## Contents

- [Method](#method)
- [Look check](#look-check)
- [Reference screens](#reference-screens)
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
- [Code block](#code-block)
- [Rename dialog](#rename-dialog)
- [Note menu](#note-menu)
- [Eraser menu](#eraser-menu)
- [Lasso toolbar](#lasso-toolbar)
- [Toast](#toast)
- [Keyboard](#keyboard)
- [Component table](#component-table)
- [How the native widgets draw](#how-the-native-widgets-draw)
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
  `com.ratta.settings.application.PluginManagerFragment` (the targets `SettingsActivity`
  routes to, observed on the device).
- Colours and size names come from `aapt2 dump resources` of `com.ratta.settings`: its
  `dp_px_*` and `sp_px_*` dimensions (the `sw1024dp` values on the Manta) and its colours
  (`black` `#000000`, `gray` `#999999`, `dark` `#666666`).
- Screens read: Settings › Display & Input › Language & Region, Keyboard, Handwriting
  Recognition Language, Wi-Fi, Security & Privacy, Date & Time, Apps › Plugins; a note's
  sidebar › Page menu; Page › Manage Pages; and, on 2026-11-26, a note's Rename dialog, the note
  menu, the eraser menu, the lasso toolbar, a toast and the handwriting keyboard.
- A crop is named by its screen and its rectangle `x, y, width, height` in screen pixels, so a
  fresh screenshot gives it again. No native image is kept in the repository (the Clarify of
  [#272](https://github.com/martonpaulo/ink-tools/issues/272)): the controls are redrawn.

## Look check

`node apps/handwriting-language/scripts/look-check.cjs --screen NAME --ours OURS.png --out SHEET.png`
([#299](https://github.com/martonpaulo/ink-tools/issues/299)) measures a picture of one of our screens, 1920 px wide
or any other width, against the values of this page, which `tokens.json` holds: the black bar, the
rule to rule height of a row, a caption's box and its row, the solid and dotted rules, both side margins, the
switch's track and the radio ring, and the text grey and its contrast. It prints each value as `same`, `differs` or
`no native` (the native screen has none, such as a switch on a screen of radio rows), the native value then ours, and draws one sheet: our picture with its rules and their pitch marked, the native rhythm
drawn from these values (a native row where ours is a row; ours kept, hatched, where the catalog has no
value, such as a note), and the table. The values are in pixels of the Manta (11.8 px per mm) at any picture
width, since every token is in millimetres. `--native NATIVE.png` takes a screencap of the native screen
and measures it the same way, in place of the catalog's values; on a two-pane Settings screen it measures the pane
right of the menu's divider. The JVM test
(`apps/handwriting-language/look/LookTest.java`) runs the measure over a recorded picture of our own screen.
What it cannot measure stays for the owner's taste: the order of the rows, the wording and the whitespace of a note.

## Reference screens

The native screen each of our screens is judged against, and what the check measures there. A screen
with no row has no native model yet.

| Our screen | Native reference | What the catalog measured there |
| :--- | :--- | :--- |
| Handwriting Language | Settings › Handwriting Recognition Language (radio rows, caption, chevron), Language & Region (value row, chevron), Security & Privacy (switch) | row 162 px, caption box 112 px, side margin 51 px, radio ring 54 px, switch 140 x 70 px, chevron 23 x 42 px |
| Each plugin's settings and its other screens | Apps › Plugins and a plugin's page (`plugin_detail_*`) | the 133 px bar, rows with an icon 176 px, the light line between rows, the full-width «Uninstall» button 140 px |
| A list of pages with a current one | Page › Manage Pages | the selection border: stroke 7 px, 12 px inset |
| A confirm dialog | A note's Delete This Page | the dialog's buttons 198 x 84 px |

## Text styles

Every native text is regular weight. All text in Settings is black, `#000000`, but a value that
cannot change now, which is `gray` `#999999` (Date & Time › Time Zone under network time).

| Role | Native size | Where | Ink Tools role |
| :--- | :--- | :--- | :--- |
| The black bar's titles: the screen's, the left pane's, the page's | `sp_px_40`, 24.84 sp, 46.6 px | every Settings page, `title_bar`, `plugin_detail_title` | `barTitle` |
| A row's title, a navigation item's label | `sp_px_34`, 21.11 sp, 39.6 px | every row | `rowTitle` |
| A section caption: «Installed Languages», «Added Keyboards (Up to 7)», «About This Plugin» | `sp_px_34` | Handwriting Recognition Language, Keyboard, a plugin's page | none: Ink Tools takes the Plugins list's smaller caption |
| A row's subtitle and value, a description, the switch's word | `sp_px_30`, 18.63 sp, 34.9 px | Keyboard, Language & Region, `plugin_detail_desc`, Wi-Fi | `subtitle` |
| A plugin's «By:», version and size lines | `sp_px_26`, 16.15 sp, 30.3 px | `plugin_detail_developer`, `plugin_detail_code`, `plugin_detail_size` | `subtitle`: the native size is under `minFont` |
| The caption of the Plugins list, «Enabled (8/10)» | `sp_px_30` (`tv_hub_section_title`, a 47 px line box against the rows' 54 px) | Apps › Plugins | `caption`, in the context grey: Ink Tools adopts this smaller one so a caption never reads as a row (owner, 2026-11-25) |
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
  control end 51 px before the other edge (`dp_px_44`, `sideMargin`). A list of radio rows,
  Handwriting Recognition Language, ends them 79 px before it (`radioListTrailingMargin`), as
  device round 9's look check measured again; ui-kit's `ChoiceList` ends there and a render rule
  checks it ([#299](https://github.com/martonpaulo/ink-tools/issues/299)).
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

- A box from the line above to the caption's bottom: 99 px in Keyboard (`dp_px_85`), 112 px in
  Apps › Plugins; Ink Tools takes Keyboard's 99 px (`captionHeight`, owner D97 A,
  [#416](https://github.com/martonpaulo/ink-tools/issues/416)), so a first caption's baseline
  sits where Keyboard's does. Its text at the
  bottom, no line under it. The
  native text is black; Ink Tools draws it in the context grey at the subtitle's size, as the
  Plugins list's smaller caption ([Text styles](#text-styles)).
- Keyboard starts its text in line with the rows' text; Handwriting Recognition Language 12 px
  further in. Ink Tools adopts Keyboard's.

## Chevron

Crop: Language & Region, `1830, 180, 50, 70`.

- Two strokes at a right angle, 23 x 42 px (`chevronHeight`), strokes about 5 px, black, at the
  row's trailing margin.

## Switch

Crops: Security & Privacy, `1640, 170, 240, 90` (off); Wi-Fi, `1640, 170, 240, 90` (on).

- The track: a pill 140 x 70 px, twice as wide as tall (`switchWidth`, `switchHeight`), its
  outline 5 px (`markStroke`).
- On: the track filled black, a white knob at its trailing end. Off: a white track with a black
  outline, a black knob at its leading end. The knob is 47 px in both (`switchKnob`) and keeps
  12 px to the track's outer edge. The first reading, 39 and 41 px, was cut by the screenshot's
  threshold; the library's sizes and a new crop agree on 47 px ([#287](https://github.com/martonpaulo/ink-tools/issues/287)).
- The word «ON» or «OFF» before the track, `subtitle`, black, 19 px from it (`switchWordGap`).

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

## Code block

The native screens show no raw text, so the code block has no native model
([#405](https://github.com/martonpaulo/ink-tools/issues/405)). It reuses the native ink border
(`border`) and the minimum text size, and takes the system monospaced face, `monospace`. Which face
the tablet draws for it is [to measure] in the next device round.

## Rename dialog

Read 2026-11-26 from a note's menu › Rename, on the Manta, from `inkctl snapshot` bounds and a
full-screen capture. Crop of the dialog: `320, 513, 1280, 658`.

- The box: 1280 x 658 px, a 1 px ink border, small rounded corners. The Loading dialog has square
  corners ([How the native widgets draw](#how-the-native-widgets-draw)).
- The title band: from y 513 to about 690, closed by a 1 px ink line. The title «Rename»
  (`tv_rename_title`, `873, 570, 172, 63`) is bold and centred.
- The field (`et_rename`, `400, 784, 1118, 102`): a 1 px ink border, with a clear ⊗ at its
  trailing end.
- A 1 px line above the button row.
- Cancel (`ll_rename_cancel`, target `995, 979, 231, 193`): drawn as an outlined box of 231 x 85
  px (`995, 1032, 231, 85`). OK (`ll_rename_confirm`, target `1287, 979, 231, 193`): the same size,
  filled ink with paper text. 61 px between the two.

Where two screens disagree: the confirm dialog's buttons are 198 x 84 px
([Component table](#component-table)), the rename dialog's 231 x 85 px. No Ink Tools component
draws a text-input dialog yet, so none is adopted; the tokens are
[#272](https://github.com/martonpaulo/ink-tools/issues/272)'s next Task.

## Note menu

Read 2026-11-26 from the sidebar › notes: the menu the Files list shows for a note. Crop:
`171, 665, 666, 1035`.

- The title «Note» (`466, 665, 76, 47`) above the list.
- The list (`menu`, `171, 755, 666, 945`): 666 px wide; rows 139 to 141 px high (Rename,
  `324, 755, 448, 139`).
- In each row: a 63 x 63 px icon at x 234 (63 px in from the box), the label from x 324.
- A group caption row, «Quick Access», only 64 px high (`324, 1216, 448, 64`).
- Its sub-rows carry an «Add» button of 126 x 65 px (`650, 1316, 126, 65`), with a 1 px line
  under them (`304, 1419, 473, 1`).
- A pointer of 42 x 19 px (`pointToView`) toward the sidebar button.

The Page menu ([Component table](#component-table), Menu popup) has the same 141 px items; the
note menu adds the short caption row and the pointer.

## Eraser menu

Read 2026-11-26 from a tap on the selected eraser. Crop: `171, 709, 675, 786`.

- The popup (`eraserSelectView`): 675 x 786 px.
- The title band (`rl_eraser_title`, `171, 709, 675, 133`): 133 px, the title «Regular Eraser»
  centred (`392, 752, 233, 47`).
- Four size rows, 144 to 145 px high, from x 232 to 785 (61 px in from the box), each a 512 x
  102 px image of the stroke.
- A 1 px separator (`232, 1023, 553, 1`).
- A pointer of 42 x 19 px (`134, 770, 42, 19`).

## Lasso toolbar

Read 2026-11-26 from a lasso selection in a note. Crop: `193, 222, 936, 114`.

- Eight buttons of 116 x 114 px each, from Copy (`193, 222, 116, 114`) to More
  (`1013, 222, 116, 114`).
- Each icon 63 x 63 px, centred (26 px in from the sides, 25 px from the top).
- A 2 px gap between groups: after Cut (x 541, Title at 543) and after Link (x 893, Delete at
  895).
- The toolbar box: a 1 px border, small rounded corners.

## Toast

Read 2026-11-26 from «Real-Time Text on» (Real-Time Conversion). Crop: `811, 2423, 297, 92`.

- A pill of 297 x 92 px with fully rounded ends, filled grey 240 (`#F0F0F0`), no border.
- Dark text about 25 px high, centred on x 960.
- It sits just above the page bar, which starts at y 2444.

## Keyboard

Read 2026-11-26 from the handwriting keyboard that Rename opens. The keyboard's window is not in
the screen tree, so every value comes from the capture. Crop: `0, 1745, 1920, 815`.

- Its bar: between two 1 px ink lines at y 1745 and 1862 (117 px).
- At the leading side: a globe, space and a return glyph.
- In the centre: «Handwriting» in bold over the language name.
- At the trailing side: ←, →, delete and a closing chevron.
- Under the bar, the writing area, paper, to the bottom of the screen.

## Component table

From the sweep of 2026-11-25: a `screencap` and an `inkctl snapshot --all` of each screen (a plain
`snapshot` in a note, where scrolling could draw), element ids and bounds in screen pixels. Every
native element met maps to one Ink Tools component, or to «new».

| Component | Native instances (screen, element id, size) | Measured | Ink Tools |
| :--- | :--- | :--- | :--- |
| Title bar, one level | Feedback (`titleBar` 1920 x 133, `ivBack` 31 x 58); InkHub (`titleContainer`, `ivBack`); Mail (`containerTitle`); a plugin's page (`plugin_detail_title`) | 133 px band; the title 63 px line box (`sp_px_40`); ‹ 31 x 58 px | `TitleBar` |
| Title bar, two levels | Settings (`main_activity_ic_close` 140 x 133, the pane 551 px) | × in a 140 px slot; pane title at 142 px | `TitleBar` with `paneTitle` |
| Title bar, white with icon buttons | Calendar (`top_bar_view` 1920 x 133, icons 102 x 102); Mail (`btnCompose`, `email_search`, `email_sync` 109 x 133); Digest | white band, black icons, 2 px line under it (`viewLineTop`, `viewDividerTitle` 1920 x 2) | new |
| Left navigation list | Settings (`ll_*` 551 x 147, `indicator_*` 9 x 147); To-Do (`schedule_group_*` 503 x 132, icon 56); Digest (`knowledge_base_list` 503, items with `item_divider` 503 x 1); InkHub (`navItemView` 503 x 128, `viewDivider` 391 x 2); Mail (589, items 130) | panes 503, 551 or 589 px; items 128 to 147 px; icon 56 px; the open item: Settings an ink bar 9 px, the apps a bordered box | `NavList` (Settings variant); the apps' bordered box is the selection border |
| List row | every Settings page (162 px); Apps › Plugins (`tv_name`, 176 px with an icon); Add Keyboard, Add Language (two lines, 162 px) | [List row](#list-row) | `ListRow` |
| Value row | Language & Region («English ›»), Date & Time | value `sp_px_30`, 26 px before › | `ListRow` with a trailing value (Android: `Ink.valueRow`) |
| Section caption | Plugins (`tv_hub_section_title`, 47 px line box); Handwriting Recognition Language, Keyboard (54 px) | [Section caption](#section-caption) | `SectionCaption` in `RowGroup` |
| Lines | [Lines](#lines); the sidebar (`separator_line` 62 x 1, centred in 116); Digest (`item_divider` 503 x 1) | solid 2 px, light dotted 1 px, nav dotted 2 px, short centred 62 x 1 px | `RowGroup`, `NavList`; the short divider is new |
| Switch | Wi-Fi, Security & Privacy, My Device (Bluetooth, Pogo Pin), a plugin's page | [Switch](#switch) | `Switch`, `SwitchRow`, `SwitchGroup` |
| Radio button | Handwriting Recognition Language | [Radio button](#radio-button) | `Radio`, `ChoiceList` |
| Add and remove | Add Keyboard (⊕ per row), Keyboard (⊖), Add Language (download arrow), Handwriting Recognition Language (cloud, trash) | icons 52 to 60 px | `IconButton` (`remove`, `delete`, `download`); ⊕ is new |
| Round check on the leading side | To-Do (an open task's ring) | ring at the row's leading edge | `CheckMark` covers the ✓; the ring is new |
| Chevron row | Language & Region, Keyboard («Add Keyboard ›»), My Device, a plugin's page («Permissions ›») | [Chevron](#chevron) | `ListRow` with `Chevron` (Android: `Ink.chevronRow`) |
| Full-width outlined button | a plugin's page (`plugin_detail_delete` 1255 x 140, «Uninstall») | 140 px tall, the row's width, outline | `Button` with `kind="destructive"`, the only button that spans the width ([#411](https://github.com/martonpaulo/ink-tools/issues/411)) |
| Small filled button | Wi-Fi («Scan» 193 x 79) | [Small filled button](#small-filled-button) | `Button` with `kind="primary"`; at a row's trailing edge, `ActionRow`'s `row` button ([#411](https://github.com/martonpaulo/ink-tools/issues/411)) |
| Confirm dialog | a note's Delete This Page (`parentPanel` 1382 x 445; title «Prompt»; `dialog_tips_img` 75 x 75; `dialog_tips_message`; `dialog_cancel` and `dialog_fix` 198 x 84) | the cancel outlined, the action filled black, both 198 x 84 at the trailing edge | `showRattaDialog` (the host draws it) |
| Menu popup | a note's sidebar › Page (`tv_title` «Page», items `tv_button` 448 x 139) | bordered box, bold title with a solid line under it, items 141 px, light lines in a group, solid between groups | new |
| Tool popup | a document's pen menu («Pens»: sizes, a ⊖ slider ⊕, colour swatches, «Restore Defaults») | bordered box with a title, the chosen size ringed | new |
| Sidebar button | a note (`button_container` 116 x 141, icon 63, `button_tag`); a document (119 x 116) | icon 63 px; the open tool in the selection border | none: plugins register their icon, the host draws it |
| Selection border | the sidebar's open tool; Manage Pages' current page; the apps' open nav item (To-Do, Digest, Mail) | [Selection border](#selection-border) | tokens only; [#287](https://github.com/martonpaulo/ink-tools/issues/287) |
| Pager | Add Language (first, previous, «1 / 5», next, last); Mail; Manage Pages; a document's page bar (`side_pageBar` 1920 x 116) | the current page underlined | `Pager` |
| Search field | Add Language («Enter language name» with a magnifier); To-Do («Enter task» with a calendar icon and a grey «Add») | underline only, no box | `SearchField` |
| Empty state | Digest («No Digests Yet», a large icon over a bold line) | icon about 90 px, bold `sp_px_30` | new |
| Badge | a plugin's «Official» (Apps › Plugins); InkHub's like and download counts | small rounded outline | new |
| Calendar grid | Calendar (month, `big_date` with ‹ ›, today ringed in a square) | day cells about 165 x 175 px | none needed yet |

## How the native widgets draw

Measured from the vendor UI library in `com.ratta.settings` (`supernoteuilib`, firmware
3.31.45) on the device; no vendor material enters the repository (owner,
[#287](https://github.com/martonpaulo/ink-tools/issues/287)). Sizes are the library's `dp_px_*` and `sp_px_*` dimensions at the Manta's
`sw1024dp`, about 1.165 px each. Ink Tools takes the ideas, never the code or the drawables.

| Native widget | How it draws | Ink Tools |
| :--- | :--- | :--- |
| `RattaSwitch` | a row: the word, `sp_px_30`, then the track `2 x dp_px_60` by `dp_px_60` with a `dp_px_4` ink outline and round ends, the knob `dp_px_40` moved from the start to the end; on fills the track black and turns the knob white; only the track takes the tap; no animation | `Switch`: the same shape and sizes; the whole row of word and track is the target, at least `touchTarget` |
| `TitleBar` | the black band `dp_px_114` high, the title `sp_px_40` white centred on the full width; the back target a square of the band's height at the leading edge, its ‹ `dp_px_27` x `dp_px_50` centred in it; an optional text action at the trailing edge, `sp_px_36` | `TitleBar`: the × and ‹ targets take the band's full height; `action`, the text action at `barActionFont` ([#411](https://github.com/martonpaulo/ink-tools/issues/411)) |
| `TurnPageBar` | \|‹ ‹ number › ›\|: four image arrows, `dp_px_36` on the Manta, each in a `dp_px_88` target; `dp_px_68` between the arrows and «3 / 12», whose current page is bold; out of range, the arrows turn pale and stop taking taps; a 2 px line under the number only where tapping it opens a page jump | `Pager`: drawn arrows at `pagerArrow`, «page / total» with the current page bold, `pagerNumberGap`; the targets keep `touchTarget` |
| `TextView_BlackLine_fit_Text` | the bordered button: paper with a `dp_px_2` ink outline (`black_rectangle`), label `sp_px_30`; while a finger is down it draws a thick ink line along its bottom edge, half of a `dp_px_14` stroke visible; disabled, a grey `#aaaaaa` outline and `#999999` label; the label shrinks to fit one line | `Button`: the 2 px border (`border`) and the press bar (`pressBar`); disabled stays the dashed `#444444` outline, since `#999999` is under 7:1 on paper ([#233](https://github.com/martonpaulo/ink-tools/issues/233)); the label wraps instead of shrinking, so it never falls under `minFont` |
| `MenuItemView` | a row `dp_px_139` high: the title `sp_px_34` black, a › image `dp_px_22` x `dp_px_36` at the trailing edge, then a solid `dp_px_2` line | `ListRow` with `Chevron` in a `RowGroup`, already the same |
| `RattaEditText` | a text field with no box of its own (the screen draws it), text `sp_px_34`; a × `dp_px_48` at its trailing edge that clears the text, shown only while it has focus and text; its own cursor and no long-press menu | `SearchField`: the × that clears (`clearMark`), shown while the field has text, focus or not, since a tap outside the input ends the focus first |
| `PageSelectView`, `PageJumpView` | the page picker a tap on the pager's number opens | none yet: no Ink Tools screen jumps to a page |
| `LoadingDialog` | a floating box `dp_px_821` x `dp_px_332`, paper with a `dp_px_2` ink outline, square corners, centred, nothing dimmed around it; «Prompt» `sp_px_34`, then a `dp_px_64` ⓘ and the hint, such as «Loading…», `sp_px_34`, `dp_px_21` after it; it does not close on a tap outside; static | `WorkingStrip`: the same box, the ⓘ and «Loading…» (`loadingWidth`, `loadingPaddingV`, `loadingPaddingH`, `loadingIcon`, `loadingIconGap`), with no «Prompt» line, which says nothing |
| The Plugins list's loading | under the title bar, on paper: a static mark of eight short round-ended rays, `dp_px_150`, then «Loading…» `sp_px_40` `dp_px_68` under it, both centred | `LoadingView`: the same, drawn (`loadingMark`, `loadingMarkGap`) |
| Progress dialogs (plugin install, sync) | a box with 12 px corners, a bold `sp_px_40` title over a 1 px line, a bar `dp_px_32` high with round ends, paper with a 1 px outline filling black, Cancel at the trailing edge | none yet: no Ink Tools progress bar ([#287](https://github.com/martonpaulo/ink-tools/issues/287)'s missing list) |

## Not measured yet

Still to read ([#272](https://github.com/martonpaulo/ink-tools/issues/272)): the Home screen, the
lasso toolbar's More list, and each new component's exact pixel sizes, which the table above
gives only as element bounds.
