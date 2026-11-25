# ui-kit: Settings UI conventions

The Settings look every plugin shares ([#50](https://github.com/martonpaulo/supernote-tools/issues/50)). The tokens live in
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
- [The Back key](#the-back-key)
- [Reference study: Notipal](#reference-study-notipal)
- [The owner's picks: SnapMark, PC Clipboard, DocuCraft](#the-owners-picks-snapmark-pc-clipboard-docucraft)

## Layout

- One screen is one column on white paper: a title, then sections, then the actions at the
  trailing edge of the last row, as OK sits in the system dialogs (`shared.actions`).
- A setting is one list row (`shared.listRow`): its name, an optional value or hint under it, and
  its control at the trailing edge. Rows end with the dotted ink separator of the system Settings.
- Every gap is the one spacing step, `SPACE_MM` (screen padding, section gap, control gap, row padding);
  a screen adds no spacing value of its own.
- Several pages of Settings are tabs at the top, the open one marked with the selected bar,
  rather than a second screen reached by a back button.

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

- One `Button` for every action, at least `touchTarget` high: black on white with an ink border.
- Black fill marks the one primary action of a screen, such as Save or Start.
- A control that cannot act, a `Button` or a tile, is a dashed outline with its label in `#444444`
  on paper, never a black fill (`shared.disabledOutline`, `shared.disabledText`), and a line next
  to it says why (interface rule 16, [#233](https://github.com/martonpaulo/ink-tools/issues/233)).
- A switch is a `Button` with `selected`: the bar under its label, the box unchanged.
- A button in a list row takes `rowButtonWidth`, so the buttons of every row share a column.

## The «Loading…» strip

While a no-view button works, the plugin shows one dark strip across the top of the note that
reads «Loading…» (owner, [#103](https://github.com/martonpaulo/ink-tools/issues/103)).

- `createWorking` in `src/working.ts` owns it. A plugin makes one with its ports (`showPluginView`,
  `closePluginView`, a toast, its log and two toast lines), and runs each no-view action through
  `working.run`. The strip opens the plugin view at the press, with no timer, since a JS timer may
  not fire while no view is open.
- The run closes the view on success. A failure closes it, then shows the failure toast. A run
  past `WORKING_TIMEOUT_MS` clears the strip with the timeout toast.
- `showAfterMs` delays the strip for a fast action, such as an Image Editing edit (2 s).
- `handOver` keeps the view open when the action opens the plugin's own screen, such as Settings
  for a missing permission.
- The root component renders `WorkingStrip` while `useWorking` is true. The strip is static text
  with no spinner, because each frame costs an e-ink refresh. The rest of the view is transparent.
  Whether the host shows the note through it is open: the next device round checks it.

## The Back key

PluginHost leaves a plugin's full view open on Back ([`docs/supernote.md` › Plugins](../../docs/supernote.md#plugins)), so each
view registers its own exit with `useBackKey` ([#204](https://github.com/martonpaulo/ink-tools/issues/204)).

- `onBack` does what the view's own close or cancel button does: close the view, cancel a
  dialog, stop a receive.
- While work runs, `onBack` does nothing; `WorkingStrip` already takes the key and ignores it.
- The key always ends at the hook, so the host's default never runs on top of it.
- A test catches the handlers with `catchBackKey` from `@ink-tools/ui-kit/backKeyTest` and
  presses the key as React Native does, newest handler first.

## Reference study: Notipal

The reference the issue names, `Laumss/sn-plugins`, is now Notipal
([Not-Just-Supernote/sn-plugin-notipal](https://github.com/Not-Just-Supernote/sn-plugin-notipal), MIT),
read at `28bc67c` (2026-11-10). Its Settings panel is native Android views
(`android/app/src/main/java/me/laumss/notipal/panels/ConfigPanel.kt`).

Borrowed:

- Tabs across the top for the pages of Settings (Tools, Connections, About).
- A row of name, value under it in grey, and a small outlined button at the trailing edge.
- A bottom bar with outlined secondary buttons on the leading side and one filled primary button
  on the trailing side.
- An About page with the plugin's name large and bold and its version under it in grey.

Avoided:

- Hint and value text in `#666666` and `#777777`: 5.7:1 and 4.5:1 on white, under the 7:1 these
  conventions keep for text; `#444444` replaces both.
- Font sizes chosen per view (14, 15, 16.15, 17, 21.11, 22 sp): here the ramp has two.

## The owner's picks: SnapMark, PC Clipboard, DocuCraft

The owner finds the Settings pages of three third-party plugins pretty (Inbox general comment,
2026-11-16, with four photos of the tablet). What they share, read from the photos:

- The whole page sits on a light grey panel, not white paper, with the title bold at the leading
  edge and «Close» as an outlined button at the trailing edge of the same line (SnapMark, PC Clipboard).
- Each setting is a bold heading, one line of grey hint under it, then its choices as a row of
  outlined buttons; the chosen one is filled black with white text (SnapMark: «A new note each»,
  «Off», «Open the snap», «Keep», «Copy»).
- Pages are tabs as outlined buttons beside «Close», the open one filled black (PC Clipboard:
  Clipboard, Phone, Settings), or text tabs across the top with a bar under the open one (DocuCraft).
- One filled black primary button per section («Find my computer»); a text field with its action
  button inline on the same row («Connect»).
- The About page groups each link as a bordered card: a QR code at the leading edge, a bold title,
  a grey hint and the address (DocuCraft 0.2.16).

Open against these conventions: here a selected switch shows a bar under its label and keeps the
box unchanged ([Controls](#controls)), and the page is white paper ([Layout](#layout)); the picks
fill the chosen option black and use a grey page. Nothing changes until the owner chooses.

