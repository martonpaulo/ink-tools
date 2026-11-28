# ui-kit: Settings UI conventions

The Settings look every plugin shares ([#50](https://github.com/martonpaulo/supernote-tools/issues/50)). Every Ink Tools surface follows the
Supernote's own native controls, one shared component each (owner, 2026-11-25,
[#273](https://github.com/martonpaulo/ink-tools/issues/273)); the measured catalog of those controls is
[`native-catalog.md`](native-catalog.md) ([#272](https://github.com/martonpaulo/ink-tools/issues/272)). Each component follows how the
vendor's own widget works, learnt from the device's screens and from measuring the vendor's own controls,
and redrawn in our own code, names and tokens: no vendor code, vendor text or
drawable enters the repository, and no vendor widget is loaded at runtime, since the controls stay
at the highest dependency level that serves ([`docs/architecture.md` › Layer rules](../../docs/architecture.md#layer-rules); owner, 2026-11-25,
[#287](https://github.com/martonpaulo/ink-tools/issues/287); [`native-catalog.md` › How the native widgets draw](native-catalog.md#how-the-native-widgets-draw)). The tokens live in
[`src/tokens.json`](src/tokens.json), read by [`src/metrics.ts`](src/metrics.ts) and by the Android apps, the repeated styles in [`src/styles.ts`](src/styles.ts) and the one
button in [`src/Button.tsx`](src/Button.tsx); a test refuses text under the minimum size and a
control under the touch target ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)). The e-ink rules behind these conventions are in
[`docs/supernote.md` › Designing for the screen](../../docs/supernote.md#designing-for-the-screen).

## Contents

- [Layout](#layout)
- [Type](#type)
- [Grey as colour](#grey-as-colour)
- [Controls](#controls)
- [The «Loading…» box](#the-loading-box)
- [Needs, Error and Close](#needs-error-and-close)
- [The Back key](#the-back-key)
- [Raw text](#raw-text)

## Layout

- One screen is one column on white paper: a title, then sections, then the actions at the
  trailing edge of the last row, as OK sits in the system dialogs (`shared.actions`).
- A screen opens with the `TitleBar` as the first child of `shared.screen`, its × closing the view;
  the bar reaches over the screen padding to touch the top, left and right edges, as the native
  band does, and the renders fail a bar that does not
  ([#309](https://github.com/martonpaulo/ink-tools/issues/309)) and a full view with no bar; a
  render line marks a screen that is no full view, such as the «Loading…» box, with its reason
  ([#311](https://github.com/martonpaulo/ink-tools/issues/311)); a setting is one `ListRow`: its
  name, an optional value or hint under it, and its control at the trailing edge.
- Where the native screens disagree, Ink Tools draws each kind of setting one way
  ([#274](https://github.com/martonpaulo/ink-tools/issues/274)): an on/off setting is a `SwitchRow`
  (a `ListRow` with a trailing `Switch`), several independent on/off items are a `RowGroup`
  with their caption over one `SwitchRow` each, one value out of several is a `ChoiceList` (a
  `RowGroup` with one `ListRow` per value and its `Radio`), and a page opened from a row is a
  `ListRow` with a `Chevron`. Nothing scrolls: rows that outgrow the space page with the native
  `Pager` at the bottom, as the Supernote's own lists do, so no list ends inside a row and the
  screen never redraws a moving list in its fast, faded mode (owner, 2026-11-28, superseding D108's
  «More below» for such lists, [#548](https://github.com/martonpaulo/ink-tools/issues/548)). A list of same-family rows is a
  `PagedList` (or a `ChoiceList` with `paged`), its caption and note on every page; a screen of
  several groups is a `PagedColumn`, each group whole on its page. Either takes the space its
  parent leaves, so a fixed part under it, such as a screen's main button, keeps its own room and
  never lies over a row ([#578](https://github.com/martonpaulo/ink-tools/issues/578)). The renders fail a list that ends inside a row, rows that
  scroll past their view and a control over a row.
- An image shows in a `MediaFrame`: fitted at its own proportions and centred on both axes in the
  space it is given. An `Image` sized by `aspectRatio` beside `flex` lands at the leading edge on the
  device, so the renders fail it, and fail an image off-centre in its frame
  ([#576](https://github.com/martonpaulo/ink-tools/issues/576)).
- A choice row's radio ring ends where the list's lines end, `radioListTrailingMargin` from the
  screen's edge, as the native list of radio rows draws it; the ring sits at the trailing edge of
  its touch target, and the renders fail a ring off that end (owner D112, [#546](https://github.com/martonpaulo/ink-tools/issues/546)).
- Three levels, as the native screens group them (owner, [#275](https://github.com/martonpaulo/ink-tools/issues/275);
  measured in [`native-catalog.md` › Lines](native-catalog.md#lines)): the caption (the subtitle's
  size in the context grey, at the bottom of its `captionHeight` box, no line under it), its rows of the native fixed
  `rowHeight`, the light dotted line (`lightLine`) between two rows of one group, and the solid line
  (`separator`) after the group's last row. The group's `note` sits under its last row, above the
  solid line, never between a caption and its rows. `RowGroup` draws all of it; the caption's box
  is the space above a group: it takes back the screen's `sectionGap` above it, so a first caption's
  box starts at the title bar's bottom line as in native Settings, and the group adds that gap under
  its solid line, so two groups stand one caption box apart and plain text after a group keeps a
  gap (owner D91 A, [#416](https://github.com/martonpaulo/ink-tools/issues/416)); the renders fail a
  first caption that does not start at the bar. A row with no caption is a `RowGroup` too. A `ListRow` draws no line and a screen draws no caption by itself:
  `SectionCaption` is not exported.
- A language shows only its name, never its code such as `pt_BR` (owner,
  [#275](https://github.com/martonpaulo/ink-tools/issues/275)).
- The screen padding is the native side margin, `sideMargin`, so a row's text starts where the
  native rows' does ([#411](https://github.com/martonpaulo/ink-tools/issues/411)). Every other gap is the one spacing step, `SPACE_MM` (section gap, control gap,
  row padding); a screen adds no spacing value of its own. The renders fail a list row under
  `rowHeight` or off that inset, and a text whose size is no native text role's.
- Several pages of Settings are a `NavList` in a left pane, or a page opened from a row with a
  `Chevron` and left with the title bar's ‹, as the system Settings does.

## Type

- One text style per native role, all regular weight, in `tokens.json`'s `text` group and
  `textStyles` ([`native-catalog.md` › Text styles](native-catalog.md#text-styles)): `barTitle` (the
  black bar's titles, `shared.barTitle`), `barAction` (the bar's text action, `shared.barAction`), `caption` (`shared.heading`), `rowTitle` (row titles and
  body text, `shared.text`), `subtitle` (a row's subtitle or value, a group's note, a description,
  the switch's word, `shared.subtitle`) and `hint` (Ink Tools' own grey hints and status lines,
  `shared.hint`); a screen's own title, where it has no title bar yet, takes `fontTitle`
  (`shared.title`); nothing under `minFont`. The values are the Manta's (`sw1024dp`); on a narrower
  screen the native Settings use smaller ones, which Ink Tools does not follow, since its row would
  fall under `minFont`.
- The ×, ‹ and › are drawn strokes at the native size (`closeMark`, `backMarkHeight`,
  `chevronHeight`, `markStroke`), never text glyphs. No italic, no handwritten font.
- The title bar centres its title on its full width, as the native one does: the × and ‹ never
  push it aside.

## Grey as colour

The screen shows 16 greys, so «some colour» (the owner, 2026-11-14) means a few greys used as
accents, each with a fixed role, never as the only cue:

| Grey | Role |
| :--- | :--- |
| `#000000` | text, borders, the primary button's fill |
| `#444444` | Ink Tools' own hints and status lines: 9.7:1 on paper (`metrics.context`); a disabled control's label and dashed border. Section captions too, smaller than the rows, so the levels read apart (owner, [#275](https://github.com/martonpaulo/ink-tools/issues/275)); the native subtitles and values are ink ([#272](https://github.com/martonpaulo/ink-tools/issues/272)) |
| `#aaaaaa` | a strong fill: the band behind a screen title, a count badge |
| `#cccccc` | a highlight: the row being changed |
| `#eeeeee` | a soft panel: a block of help text, an empty state |
| `#ffffff` | paper |

A grey that marks a state also changes a shape or a word: a selected toggle wears the selection border, a
disabled control its label. Every text keeps at least `textContrast`, 7:1, against what is behind
it: the token test fails a text colour under it and the renders fail a drawn text under it (interface
rule 3, [#575](https://github.com/martonpaulo/ink-tools/issues/575)). Lighter greys than `#444444` never carry text a person must read; the
field's placeholder (`#595959`) is the one exception, at 7:1. A grey joins `metrics.ts` as a
token when the first screen uses it, named by its role.

## Controls

One component per native control, each drawn only from the tokens of `src/metrics.ts`, so a
screen draws no control of its own; the `controls` rule of `scripts/boundaries.py` fails a plugin's
`src/` that does ([#273](https://github.com/martonpaulo/ink-tools/issues/273)). The sizes of the new
tokens are defaults marked for [#272](https://github.com/martonpaulo/ink-tools/issues/272), whose catalog replaces them in
`metrics.ts` alone. Every glyph and icon is redrawn, never a native drawable. The native confirm
and error dialogs are `sn-plugin-lib`'s `NativeUIUtils.showRattaDialog` and `showErrorTipDialog`,
never a redrawn copy; sn-adapter does not wrap them yet, so no plugin calls them today.

| Component | What it draws |
| :--- | :--- |
| `TitleBar` | the black band: the drawn × to close (`onClose`), ‹ to go back (`onBack`), each a target the band's full height, the title centred; with `paneTitle`, the native two levels, «× Settings ‹ Language & Region»; with `action`, the screen's one action as text at its trailing edge, such as «Sync now» ([#411](https://github.com/martonpaulo/ink-tools/issues/411)) |
| `NavList` | the left navigation list: an optional icon and a label per item, the dotted line under each, the open item marked by an ink bar at its trailing edge |
| `ListRow` | a title, an optional subtitle, a `leading` slot (the ✓) and a `trailing` slot (its control), at the native `rowHeight`, with no line of its own; with `onPress` the whole row is one button |
| `RowGroup` | rows that belong together: an optional caption, the rows with the light dotted line between two of them, an optional `note`, and the solid line after the group |
| `Switch` | the word «ON» or «OFF» before a pill-shaped track twice as wide as tall, filled black with a paper knob at its trailing end when on, an ink outline with an ink knob at its leading end when off, the knob one size in both; role `switch` |
| `Radio` | an ink ring, with a filled dot when `checked`; role `radio` |
| `CheckMark` | the ✓ on the leading side of a chosen row; unchecked, the same width empty |
| `Chevron` | the › that says a row opens a page |
| `SearchField` | a bordered field with a drawn magnifier and a grey placeholder, its spoken name; a × that clears the text while the field has text |
| `Pager` | \|‹ ‹ page / total › ›\| with drawn arrows, the current page in bold; a button that would leave the range is disabled, its arrow grey |
| `IconButton` | `remove` (⊖), `delete` (a trash) and `download` (an arrow over a tray), each with its spoken name |
| `Button` | one button hierarchy ([#411](https://github.com/martonpaulo/ink-tools/issues/411)): `kind` `primary`, the small filled black button such as «Scan», the one main action of a screen; `secondary` (the default), an outlined button as wide as its label; `row`, a settings row's action, `rowButtonWidth` wide; `destructive`, the outlined button that spans the width at a page's end, as the native «Uninstall» |
| `ActionRow` | a setting with an action instead of a switch, such as an account and its «Sign out»: a `ListRow` whose trailing control is a `row` button, with an optional second one, such as Cancel while it asks to confirm |
| `SwitchRow` | an on/off setting: a `ListRow` whose trailing `Switch` speaks the row's title |
| `SwitchGroup` | an on/off setting with no caption: a `SwitchRow` that is its own `RowGroup`, closed by the solid line |
| `ChoiceList` | one value out of several: a `RowGroup` with one `ListRow` per value, each `Radio` spoken «setting: value», and an optional `note` |

- One `Button` for every other action, at least `touchTarget` high: black on white with the native
  2 px ink border. Its `kind` sets its level; only a `destructive` button spans the width, a row's
  action is an `ActionRow`, and a screen's actions sit together: its one primary action, or the
  title bar's `action` ([#411](https://github.com/martonpaulo/ink-tools/issues/411)). The renders fail a full-width button of another kind, a
  `row` button outside a row, another button inside one, and two screen actions more than a row
  apart. While a finger is down, an ink bar lies along its bottom edge (`pressBar`), as the
  native button shows a press: one change, no animation ([#287](https://github.com/martonpaulo/ink-tools/issues/287)).
- Black fill marks the one primary action of a screen, such as Save or Start (`kind="primary"`).
- A control that cannot act, a `Button` or a tile, is a dashed outline with its label in `#444444`
  on paper, never a black fill (`shared.disabledOutline`, `shared.disabledText`), and a line next
  to it says why (interface rule 16, [#233](https://github.com/martonpaulo/ink-tools/issues/233)).
- A switch is a `Switch`. A `Button` with `selected` wears the selection border (`selectionStroke`,
  `selectionRadius`, owner, [#287](https://github.com/martonpaulo/ink-tools/issues/287)); it is the old switch
  that [#274](https://github.com/martonpaulo/ink-tools/issues/274) moves each plugin from.
- Every target, a button, switch, radio or checkbox, is at least `touchTarget` in each direction;
  `screenBreaks` checks it in each component's test.
- A button in a list row is `kind="row"`, `rowButtonWidth` wide, so the buttons of every row share a column.

## The «Loading…» box

While a no-view button works, the plugin shows the native loading box centred over the note: paper
with the 2 px ink border, the ⓘ and «Loading…», nothing dimmed around it (owner,
[#103](https://github.com/martonpaulo/ink-tools/issues/103), [#287](https://github.com/martonpaulo/ink-tools/issues/287)).

- `createWorking` in `src/working.ts` owns it. A plugin makes one with its ports (`showPluginView`,
  `closePluginView`, a toast, its log and two toast lines), and runs each no-view action through
  `working.run`. The strip opens the plugin view at the press, with no timer, since a JS timer may
  not fire while no view is open.
- The run closes the view on success. A failure clears the strip and keeps the view open on the
  Error state, with the error's message as its reason, until Close calls `working.dismiss()`
  ([#255](https://github.com/martonpaulo/ink-tools/issues/255)). A run past `WORKING_TIMEOUT_MS` clears the strip with the timeout toast, and a
  failure after it has only the failure toast, since the view is closed.
- `showAfterMs` delays the strip for a fast action, such as an Image Editing edit (2 s).
- `handOver` keeps the view open when the action opens the plugin's own screen, such as Settings
  for a missing permission.
- The root component renders `<WorkingStrip working={working} />` while `useWorking` is true; it
  draws the box, or the Error state of a held failure. The box is static, with no spinner, because
  each frame costs an e-ink refresh. The rest of the view is transparent.
  Opened from Settings, the screen behind shows around the box ([`docs/supernote.md`](../../docs/supernote.md#what-a-plugin-can-show-while-a-no-view-action-runs)); over a note it is still to test.

## Needs, Error and Close

Every tool reports what it needs after a check and what failed after a failure in one way
([#245](https://github.com/martonpaulo/ink-tools/issues/245), [#255](https://github.com/martonpaulo/ink-tools/issues/255)). `src/problem.ts` owns the value, `src/ProblemView.tsx` the views,
`src/TitleBar.tsx` the one Close, its ×.

- A `Problem` is what is missing or failed, the reason when known, and one fix: `{label, run}`
  for an action the tool runs, or `{steps}` for what only the owner can do.
- `Needs` shows a check's result: what is missing, why the tool needs it, and the fix as one
  primary button or numbered steps.
- `ErrorView` shows what failed, the reason, the fix, and Retry when the caller gives `onRetry`.
  It is an alert and stays until the owner closes it.
- `LoadingView` is a full view that loads, as the native Plugins list loads: its title bar, then
  the static loading mark and «Loading…» centred under it ([#287](https://github.com/martonpaulo/ink-tools/issues/287)).
  Its `text` names a longer wait in place of «Loading…», such as Puzzles' «Preparing the puzzle…»
  ([#595](https://github.com/martonpaulo/ink-tools/issues/595)).
- Close is the `TitleBar`'s × at the leading edge of the title bar, in every full view these
  states included ([#274](https://github.com/martonpaulo/ink-tools/issues/274)); Back does what it does.

## The Back key

PluginHost leaves a plugin's full view open on Back, and on the Manta's PluginHost the key never
reaches the view: it hosts plugin views outside an Activity, so React Native never emits
`hardwareBackPress` ([`docs/supernote.md` › Plugins](../../docs/supernote.md#plugins),
[#204](https://github.com/martonpaulo/ink-tools/issues/204)). Every full view therefore keeps a visible Close, the title bar's ×. Each view still
registers its exit with `useBackKey`, which costs nothing and works on a host that sends the key.

- `onBack` does what the view's own close or cancel button does: close the view, cancel a
  dialog, stop a receive.
- While work runs, `onBack` does nothing; `WorkingStrip` already takes the key and ignores it.
- The key always ends at the hook, so the host's default never runs on top of it.
- A test catches the handlers with `catchBackKey` from `@ink-tools/ui-kit/backKeyTest` and
  presses the key as React Native does, newest handler first.

## Raw text

Code, JSON and logs show only in `CodeBlock`, never in a plain `Text`
([#405](https://github.com/martonpaulo/ink-tools/issues/405)):

- an ink-bordered box about half the window high (`codeBlockHeight`);
- it scrolls up and down only: a long line wraps inside the box, nothing runs past its sides and
  there is no sideways bar; its one bar stays drawn at the box's edge (`persistentScrollbar`), so
  nothing flashes on e-ink (owner, 2026-11-26);
- «Copy», a secondary button at the box's top right, puts the whole text on the clipboard with
  React Native's clipboard module and confirms it in a short toast (`copyToClipboard`); a block
  with no lines has no Copy;
- `fit` sizes the box to its lines, for the one command a `Needs` fix names (`command`);
- the `code` text style: the system monospaced face (`monospace`), ink on paper, at the minimum
  size, so more of a line shows.

A screen in `renders/screens.tsx` lists the raw lines it is fed as `raw`, and the renders fail when
one of them, or any monospaced text, shows outside the block, and when a line of the block runs
past its side (`rawBreaks` in `renders/rules.ts`).
A screen shows the block only when it has lines to show. Headless Chromium hides scroll bars, so the renders show the box and its cut lines, not the bars;
the device round checks the vertical scroll, the wrapped lines and Copy.
