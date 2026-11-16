# Live handwriting to text: research and proposal

Status: research, 2026-11-16, for [#144](https://github.com/martonpaulo/supernote-tools/issues/144). No code; the build follows in sub-issues once the owner picks the proposal.

Marks, as in [`../supernote.md`](../supernote.md): [official] the vendor's documents or the `sn-plugin-lib` 0.2.3 type definitions; [measured] seen on the owner's Manta; [reported] a user's or a reviewer's account; [inference] reasoned, not seen.

## Contents

- [The owner's goal](#the-owners-goal)
- [1. What exists](#1-what-exists)
- [2. What sn-plugin-lib 0.2.3 allows](#2-what-sn-plugin-lib-023-allows)
- [3. How it would work](#3-how-it-would-work)
- [4. Beyond the core, ranked](#4-beyond-the-core-ranked)
- [5. Name](#5-name)
- [6. Device questions](#6-device-questions)
- [Sources](#sources)

## The owner's goal

Each handwritten word turns into typed text in a font he chose, soon after he writes it, with no lasso, while a mode is on. Anti-goals: a word converts before it is finished or before its accent; the pen lags or the screen flashes; drawings, arrows and scribbles become text. Decided: one sidebar button turns the mode on and off; native features first.

## 1. What exists

### On the Supernote

| Feature | What it does | Fit for the goal |
| :--- | :--- | :--- |
| Real-Time Recognition note | A note type chosen at creation (Chauvet 2.7.21 and later); the handwriting is recognized in the background as you write and shown on a Recognition Results page, exported as TXT or DOCX. The language is fixed when the note is made. No layers, more battery use [official; layers and battery: reported] | Recognition is native and live, but the page keeps the handwriting: nothing becomes typed text on the page [official] |
| Export as TXT or DOCX from a standard note | Recognizes the note's handwriting into a file [official] | Off the page |
| Text box | Typed with the keyboard or the handwriting keyboard; a font menu, with help in the menu on how to import a custom font [official] | The target element: typed text on the page, with a font |
| Custom fonts | Documented for EPUB books: a `Fonts` folder inside `Document`, then «User-defined» in the reader's display settings [official]; whether text boxes read the same folder is not stated [inference: likely, from the text box menu's import help] | The font choice may come from the device's own list |
| Lasso, then «Recognize as Digest, New Event or New Task» | Lassoed text goes to other apps [official] | Not a text box on the page |

No Supernote feature replaces handwriting with typed text on the page as you write. The closest native pieces are the Real-Time Recognition engine, which a plugin reaches only through `recognizeElements`, and the text box.

### Other plugins

The reuse check of [#138](https://github.com/martonpaulo/supernote-tools/issues/138) and a web search on 2026-11-16 found no Supernote plugin that converts handwriting on pen-up. The plugins known to this project insert pictures (`supernote-image-insert-plugin`, `embedimage`, [`plugin-scope.md`](../plugin-scope.md#retouch)). The `fharper/awesome-supernote` list holds sync tools for Obsidian and Joplin, not on-device plugins [reported, from its index pages; this session could not read the repository].

### Other tablets

| Device | Live? | What happens to the handwriting | Source |
| :--- | :--- | :--- | :--- |
| iPad, Scribble (iPadOS 14 and later) | Yes: in any text field, the handwriting becomes typed text as you write, on the device; scratch out to delete, circle to select | Replaced at once | [official] Apple |
| iPad, Notes «Convert to Text» | No: select, then convert a block | Replaced | [reported] Goodnotes |
| Boox Notes, AI text recognition | No: lasso the handwriting, tap AI; firmware 4.0 replaces it with text | Replaced | [official] Boox help |
| reMarkable | No: the selection tool replaces handwriting with text on the page; «Convert to text» in document settings keeps the handwriting and makes text beside it | Replaced or kept | [official] reMarkable |
| Kindle Scribe | No: «Convert to text» exports a .txt by email, after a preview you can edit | Kept; text leaves the page | [official] Amazon |

Only Scribble is live, and it works because the target is a text field: the system knows where text goes, and anything else is drawing. That is the model for this plugin: while the mode is on, the page acts like a text field, and the user turns the mode off to draw.

## 2. What sn-plugin-lib 0.2.3 allows

| Need | Call | Status |
| :--- | :--- | :--- |
| Know a stroke ended, with no lasso | `PluginManager.registerEventListener('event_pen_up', order, listener)`: the only event the docs list; its message is the `Element[]` just written | [official]; whether it arrives while the plugin view is closed is open, Ink2Pic's spike removed its listeners on close ([brief](../../plugins/ink2pic/docs/brief.md#811-the-last-word)) |
| Follow the pen between strokes | `registerMotionListener(order, listener)`: `MotionEvent` with `action` 0 down, 1 up, 2 move, `toolType` 2 for the pen | [official]; same open point |
| A stroke's place and time | Elements carry no time and no rect; the rect comes from `stroke.points`, in page pixels | [official, Ink2Pic's brief] |
| Word ends | Pauses inside a word (130 to 656 ms) and between words (578 to 1122 ms) overlap on the owner's tablet, so a timer alone cannot find the end of a word; position can (Ink2Pic's «Lasso last word» grouping) | [measured, Ink2Pic build 15, [#75](https://github.com/martonpaulo/ink2pic/issues/75)] |
| Recognize the word | `recognizeElements(elements, size)`; the device's handwriting language, no language parameter; 0.9 to 1.7 s per call | [official]; time [measured, [#19](https://github.com/martonpaulo/supernote-tools/issues/19)] |
| Put typed text on the page | `insertText` puts a text box on the page | [measured, [#115](https://github.com/martonpaulo/supernote-tools/issues/115)] |
| Remove the word's strokes in the same step | `batchUpdatePageElements(deleteNumList, elements, page, layer)`: deletes, then inserts, in one call | [official]; replaces a picture in place [measured, [#130](https://github.com/martonpaulo/supernote-tools/issues/130)]; with strokes and a text box, open |
| A chosen font | The `TextBox` element has `fontPath`, `fontSize`, `textRect`, `textAlign`, `textBold`, `textItalics`, `textEditable` | [official type]; which `fontPath` values the host accepts, and whether a font from `Document/Fonts` works, is open |
| Is the page writable now | `PluginCommAPI.canHandwrite()` | [official] |
| A sidebar on/off button | `registerButton(1, ['NOTE'], …)`: type 1 is the sidebar; `setButtonState` can show on or off | [official] |
| Keep the original | A deleted stroke is gone from the page; the plugin can keep its points in its own file, or the note's Undo may bring it back | [inference]; open |

## 3. How it would work

**Mode.** One sidebar button, «Type as I write», on or off ([#144](https://github.com/martonpaulo/supernote-tools/issues/144) decision). On: the plugin listens for pen-up. Off: it removes its listener at once, so a drawing is never touched. NOTE only.

**The word-end rule.** A word is converted only when it is certainly finished:

1. At each pen-up, the plugin adds the stroke to the open word if it sits on the word's line and nearer than the word gap; the gap is a ratio of the writer's own letter height and letter gaps, as Ink2Pic's grouping measured ([brief](../../plugins/ink2pic/docs/brief.md#811-the-last-word)).
2. A stroke a word gap to the right, or on a new line, closes the previous word; that word goes to recognition.
3. The last word of a pause closes after an idle time with no pen-down, about 2 s [inference, to tune on the device], longer than the longest pause inside a word measured (656 ms).
4. A short stroke above or on the open word (an accent, an i-dot, a tilde) joins it, also after the word closed, so «não» and «café» convert whole. A closed word waits one more short time before conversion for this [inference].

**What stays handwriting.**

- Recognition gives an empty or low-confidence answer [inference: `recognizeElements` returns only a string, so «low confidence» is an answer that is not a word of the device language's alphabet, or is one character for a long stroke].
- Strokes much taller than the line's letters, a long single stroke (an arrow, an underline, a box) or a stroke with many self-crossings stay [inference, ratios to the letter height].
- Anything written while the mode is off.
- Anti-goal check: a drawing converts only if it looks like a word on a line of words; the user turns the mode off to draw, as Scribble expects a text field.

**Replace.** One `batchUpdatePageElements` call removes the word's strokes and inserts one text box at the word's rect, in the chosen font, size matched to the letter height. Words on one line join the same text box when the previous word's box ends just before, so a line reads as one line of text [inference].

**Font.** Settings list the fonts the host's text box offers; the first build uses the default font, and a chosen font follows once the device round confirms which `fontPath` works.

**Pen speed and screen.** Recognition and replacement run after pen-up, off the pen's path; the plugin never draws while the pen is down. Each conversion is one page change, so one partial refresh per word; a line converted at once when the user pauses costs one refresh instead of several [inference]. Anti-goal check: no lag, as nothing runs during a stroke; flashes are limited to one partial refresh per converted group.

**Anti-goals, one by one.**

| Anti-goal | How the design avoids it |
| :--- | :--- |
| A word converts before it is finished or before its accent | Position closes a word, not time alone; the idle close is longer than any measured pause inside a word; accents join a word after it closes |
| The pen lags or the screen flashes | Nothing runs during a stroke; one page change per word or per line |
| Drawings, arrows and scribbles convert | Mode off while drawing; shape rules keep tall, long or crossing strokes; an answer that is not a word keeps the strokes |

## 4. Beyond the core, ranked

1. **Undo the last conversion** (a sidebar tap or a scratch-out on the text): puts the strokes back. Highest value: it makes a wrong conversion cheap, which the owner's minutes and lists need.
2. **Convert the whole line on a pause** instead of word by word: fewer refreshes, and recognition of a line is often better than of a word [inference].
3. **Font and size in Settings**, with a sample line: the owner's «fonte escolhida por mim».
4. **A short list of corrections** (a word always recognized wrong becomes the right one): for names in minutes.
5. **Lists**: a «-» or «•» at a line's start becomes a list item [inference: a text box has no list type, so a typed «•»].

## 5. Name

The project's plugins are one plain word for what they do: `lookup`, `lingo`, `relay`, `retouch`, `bridge`.

| Name | Why |
| :--- | :--- |
| **`typeset`** (recommended) | Says what happens to the page: handwriting becomes set type; one word, an English verb like `relay` and `retouch` |
| `scribe` | The writer who copies; clashes with Kindle Scribe |
| `clean` | The owner's «clean page»; too generic |
| `ink2type` | Echoes Ink2Pic; the project moved away from that pattern (Lookup replaces Ink2Pic, [#45](https://github.com/martonpaulo/supernote-tools/issues/45)) |

## 6. Device questions

A check card draft for the Mac round, each answered with a small probe build:

1. Does `event_pen_up` reach the plugin while no plugin view is open, after a sidebar button turned the mode on? And `registerMotionListener`?
2. Does the pen-up message carry the stroke just written, with its points readable at once?
3. Can `batchUpdatePageElements` delete strokes and insert a text box in one call, with no flash beyond one partial refresh?
4. Which `fontPath` values does a text box accept: the menu's fonts, a TTF in `Document/Fonts`, a TTF in `MyStyle/<plugin>`?
5. How long does `recognizeElements` take for one word against a line of five words?
6. Does the note's own Undo bring back strokes a plugin deleted?
7. Does the plugin's pen-up work keep the pen's ink speed unchanged while writing fast?

## Sources

- Supernote, [Handwriting Recognition](https://support.supernote.com/handwriting-recognition) (Real-Time Recognition notes, Chauvet 2.7.21, export TXT or DOCX).
- Supernote, [Text Box](https://support.supernote.com/text-box) (font menu, custom font help, handwriting keyboard).
- Supernote, [How to import custom fonts to EPUB ebooks](https://support.supernote.com/1898355-how-to-import-custom-fonts-to-epub-ebooks) (`Document/Fonts`).
- Supernote plugin docs, [recognizeElements](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-comm-api/recognize-elements.md) and [canHandwrite](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-comm-api/can-handwrite.md); `sn-plugin-lib` 0.2.3 type definitions (`PluginManager`, `PluginCommAPI`, `Element`, `PluginEvent`).
- Sacha Chua, [Tweaking my writing workflow using SuperNote's new handwriting recognition](https://sachachua.com/blog/2023/01/tweaking-my-writing-workflow-using-supernote-s-new-handwriting-recognition/) (accuracy, report).
- Apple, [Enter text with Scribble on iPad](https://support.apple.com/guide/ipad/aside/ipad355ab2a7/ipados).
- Goodnotes, [How to convert handwriting to text on iPad](https://www.goodnotes.com/blog/handwriting-to-text-ipad) (Scribble is for in-the-moment entry).
- Boox, [Handwritten Notes](https://help.boox.com/hc/en-us/articles/10701578837268-Handwritten-Notes) (AI text recognition by lasso).
- reMarkable, [Convert handwritten notes into text](https://support.remarkable.com/articles/Knowledge/Convert-handwritten-notes-into-text).
- Amazon, [Convert Handwritten Notes to Text on Kindle Scribe](https://digprjsurvey.amazon.com/csad/help/node/TxYYWu3ZLZPBSTgp9H).
- [fharper/awesome-supernote index](https://awesome.ecosyste.ms/lists/fharper%2Fawesome-supernote).

This session read the vendor pages through search results only: `support.supernote.com` and `docs.supernote.com` were outside its network. Each [official] Supernote point above should be read once on the page itself in the device round.
