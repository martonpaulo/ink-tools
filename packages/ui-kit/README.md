# ui-kit: Settings UI conventions

The Settings look every plugin shares ([#50](https://github.com/martonpaulo/supernote-tools/issues/50)). Every Ink Tools surface follows the
Supernote's own native controls, one shared component each (owner, 2026-11-25,
[#273](https://github.com/martonpaulo/ink-tools/issues/273)); the measured catalog of those controls is
[#272](https://github.com/martonpaulo/ink-tools/issues/272). The tokens live in
[`src/metrics.ts`](src/metrics.ts), the repeated styles in [`src/styles.ts`](src/styles.ts) and the one
button in [`src/Button.tsx`](src/Button.tsx); a test refuses text under the minimum size and a
control under the touch target ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)). The e-ink rules behind these conventions are in
[`docs/supernote.md` › Designing for the screen](../../docs/supernote.md#designing-for-the-screen).

## Contents

- [Layout](#layout)
- [Type](#type)
- [Grey as colour](#grey-as-colour)
- [Controls](#controls)
- [The «Loading…» strip](#the-loading-strip)
- [Needs, Error and Close](#needs-error-and-close)
- [The Back key](#the-back-key)

## Layout

- One screen is one column on white paper: a title, then sections, then the actions at the
  trailing edge of the last row, as OK sits in the system dialogs (`shared.actions`).
- A screen opens with the `TitleBar`; a setting is one `ListRow`: its name, an optional value or
  hint under it, and its control at the trailing edge.
- Every gap is the one spacing step, `SPACE_MM` (screen padding, section gap, control gap, row padding);
  a screen adds no spacing value of its own.
- Several pages of Settings are a `NavList` in a left pane, or a page opened from a row with a
  `Chevron` and left with the title bar's ‹, as the system Settings does.

## Type

- Two sizes only: the title (`fontLarge`) and the body (`fontBody`) for names, values and
  buttons; nothing under `minFont`.
- A section heading is body size, bold, in the context grey (`shared.heading`); a hint or a
  current value is body size in the context grey (`shared.hint`). No italic, no handwritten font.

## Grey as colour

The screen shows 16 greys, so «some colour» (the owner, 2026-11-14) means a few greys used as
accents, each with a fixed role, never as the only cue:

| Grey | Role |
| :--- | :--- |
| `#000000` | text, borders, the primary button's fill |
| `#444444` | section headings, hints and values: 9.7:1 on paper (`metrics.context`); a disabled control's label and dashed border |
| `#aaaaaa` | a strong fill: the band behind a screen title, a count badge |
| `#cccccc` | a highlight: the row being changed |
| `#eeeeee` | a soft panel: a block of help text, an empty state |
| `#ffffff` | paper |

A grey that marks a state also changes a shape or a word: a selected toggle shows its bar, a
disabled control its label. Lighter greys than `#444444` never carry text a person must read; the
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
| `TitleBar` | the black band: × to close (`onClose`), ‹ to go back (`onBack`), the title centred, and `paneTitle` over a left pane |
| `NavList` | the left navigation list: an optional icon and a label per item, a dotted separator, the open item marked by an ink bar at its trailing edge |
| `ListRow` | a title, an optional grey subtitle, a solid separator, a `leading` slot (the ✓) and a `trailing` slot (its control); with `onPress` the whole row is one button |
| `Switch` | a bordered box that reads «ON», filled black, or «OFF», on paper; role `switch` |
| `Radio` | an ink ring, with a filled dot when `checked`; role `radio` |
| `CheckMark` | the ✓ on the leading side of a chosen row; unchecked, the same width empty |
| `Chevron` | the › that says a row opens a page |
| `SectionCaption` | a grey caption over the rows it names, such as «Installed Languages» |
| `SearchField` | a bordered field with a drawn magnifier and a grey placeholder, its spoken name |
| `Pager` | \|‹ ‹ page/total › ›\|, the current page underlined; a button that would leave the range is disabled |
| `IconButton` | `remove` (⊖), `delete` (a trash) and `download` (an arrow over a tray), each with its spoken name |
| `Button` with `primary` | the small filled black button, such as «Scan» |

- One `Button` for every other action, at least `touchTarget` high: black on white with an ink border.
- Black fill marks the one primary action of a screen, such as Save or Start.
- A control that cannot act, a `Button` or a tile, is a dashed outline with its label in `#444444`
  on paper, never a black fill (`shared.disabledOutline`, `shared.disabledText`), and a line next
  to it says why (interface rule 16, [#233](https://github.com/martonpaulo/ink-tools/issues/233)).
- A switch is a `Switch`. A `Button` with `selected`, the bar under its label, is the old switch
  that [#274](https://github.com/martonpaulo/ink-tools/issues/274) moves each plugin from.
- Every target, a button, switch, radio or checkbox, is at least `touchTarget` in each direction;
  `screenBreaks` checks it in each component's test.
- A button in a list row takes `rowButtonWidth`, so the buttons of every row share a column.

## The «Loading…» strip

While a no-view button works, the plugin shows one dark strip across the top of the note that
reads «Loading…» (owner, [#103](https://github.com/martonpaulo/ink-tools/issues/103)).

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
  draws the strip, or the Error state of a held failure. The strip is static text
  with no spinner, because each frame costs an e-ink refresh. The rest of the view is transparent.
  Whether the host shows the note through it is open: the next device round checks it.

## Needs, Error and Close

Every tool reports what it needs after a check and what failed after a failure in one way
([#245](https://github.com/martonpaulo/ink-tools/issues/245), [#255](https://github.com/martonpaulo/ink-tools/issues/255)). `src/problem.ts` owns the value, `src/ProblemView.tsx` the views,
`src/CloseButton.tsx` the one Close.

- A `Problem` is what is missing or failed, the reason when known, and one fix: `{label, run}`
  for an action the tool runs, or `{steps}` for what only the owner can do.
- `Needs` shows a check's result: what is missing, why the tool needs it, and the fix as one
  primary button or numbered steps.
- `ErrorView` shows what failed, the reason, the fix, and Retry when the caller gives `onRetry`.
  It is an alert and stays until the owner closes it.
- `LoadingView` is a full view that loads, in the strip's words.
- Close is one outlined «Close» at the trailing edge of the title line (`TitleRow`) until these
  views take the `TitleBar`'s × ([#273](https://github.com/martonpaulo/ink-tools/issues/273)); Back does what it does.

## The Back key

PluginHost leaves a plugin's full view open on Back, and on the Nomad's PluginHost the key never
reaches the view: it hosts plugin views outside an Activity, so React Native never emits
`hardwareBackPress` ([`docs/supernote.md` › Plugins](../../docs/supernote.md#plugins),
[#204](https://github.com/martonpaulo/ink-tools/issues/204)). Every full view therefore keeps a visible «Close». Each view still
registers its exit with `useBackKey`, which costs nothing and works on a host that sends the key.

- `onBack` does what the view's own close or cancel button does: close the view, cancel a
  dialog, stop a receive.
- While work runs, `onBack` does nothing; `WorkingStrip` already takes the key and ignores it.
- The key always ends at the hook, so the host's default never runs on top of it.
- A test catches the handlers with `catchBackKey` from `@ink-tools/ui-kit/backKeyTest` and
  presses the key as React Native does, newest handler first.
