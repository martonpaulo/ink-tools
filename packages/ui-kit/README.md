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
- [Reference study: Notipal](#reference-study-notipal)

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
- A section heading is body size, bold, in the context grey; a hint or a current value is body
  size in the context grey. No italic, no handwritten font.

## Grey as colour

The screen shows 16 greys, so «some colour» (the owner, 2026-11-14) means a few greys used as
accents, each with a fixed role, never as the only cue:

| Grey | Role |
| :--- | :--- |
| `#000000` | text, borders, the primary button's fill |
| `#444444` | section headings, hints and values: 9.7:1 on paper |
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
- A switch is a `Button` with `selected`: the bar under its label, the box unchanged.
- A button in a list row takes `rowButtonWidth`, so the buttons of every row share a column.

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
