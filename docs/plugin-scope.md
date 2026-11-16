# Plugin scope — from the owner interview (2026-11-14)

What each not-yet-built plugin is for, grounded in the owner's real pains. This is the product
source of truth for scope; delivery issues cite it. Architecture (layers, packages) is in
[`architecture.md`](architecture.md); decision history in [`decisions.md`](decisions.md).

## Contents

- [The two pains driving everything](#the-two-pains-driving-everything)
- [lookup](#lookup)
- [Lingo app](#lingo-app)
- [Dictionary and translation engine (shared)](#dictionary-and-translation-engine-shared)
- [retouch](#retouch)
- [Ink Notebook Editor](#ink-notebook-editor)
- [bridge](#bridge)
- [New: phone to open note](#new-phone-to-open-note)
- [relay](#relay)
- [real-time-conversion](#real-time-conversion)
- [Note templates](#note-templates)
- [Design direction](#design-direction)

## The two pains driving everything

The owner's top frictions with the Supernote today are **getting information in** and **getting
information out** — not organising or search. "Getting out" means pulling his own content off the
device into an editable, durable form on the Mac, **not** sharing it with other people.

## lookup

Shown on the tablet as **Word Lookup** ([#176](https://github.com/martonpaulo/ink-tools/issues/176)).

Evolution of `ink2pic`: write a word, lasso it, insert something. `lookup` is a new plugin with its
own `pluginID` and everything Ink2Pic did moved into it (owner D45, [#125](https://github.com/martonpaulo/ink-tools/issues/125)); it does not carry
Ink2Pic's settings or picture library (owner D40 B, [#110](https://github.com/martonpaulo/ink-tools/issues/110)). Ink2Pic is retired and uninstalled
from the tablet; its folder gets no new work ([#45](https://github.com/martonpaulo/ink-tools/issues/45)). **It is the first plugin to ship after
`bridge`** (the owner's biggest daily pain). **Mode selection (interview 2026-11-14):** each mode
that inserts at once is its own **lasso button**, chosen before the search — not a post-hoc toggle:
«Insert Sticker» (vector/sticker/OpenMoji), «Insert Image» (real photo), «Insert Definition», «Insert Summary» (3-line bio / summary), and one «Translate ES→PT» button per direction (below).
The names follow the wording of Supernote's own lasso menu, a verb and a noun in title case (owner,
[#167](https://github.com/martonpaulo/ink-tools/issues/167)). «Choose Image» is the one
button that opens the results: its Illustrations and Photos tabs stay behind that one button, and
the one-button-per-mode rule covers the direct insert buttons only (owner, [#156](https://github.com/martonpaulo/ink-tools/issues/156)). Pains and scope:

- **Relevance is broken on real cases.** "café"/"coffee" returns a heart as the "best" picture;
  "Pedro Sánchez" returns awful results. Ranking and the portrait path must fix these (issues
  [#13](https://github.com/martonpaulo/ink-tools/issues/13), [#15](https://github.com/martonpaulo/ink-tools/issues/15), [#20](https://github.com/martonpaulo/ink-tools/issues/20), [#24](https://github.com/martonpaulo/ink-tools/issues/24)). Keep these as named regression cases.
- **Two modes.** An **illustration / vector / sticker** mode (line art, drawings, engravings,
  "Bababum-app" style, OpenMoji) and a **real-photo** mode (people, places). The owner chose a real
  split, not one blended list (relates to [#35](https://github.com/martonpaulo/ink-tools/issues/35)).
  Built as two lasso buttons, each with its Settings switch ([#111](https://github.com/martonpaulo/ink-tools/issues/111)): «Insert Sticker» searches
  Commons for drawings first, Openclipart and OpenMoji, and keeps only line art; «Insert Image»
  searches Commons with no drawings filter and keeps only photos and dark paintings, so a word with
  only clip art inserts no picture and says so.
- **Fixed presets** (owner, [#105](https://github.com/martonpaulo/ink-tools/issues/105)). Each picture button inserts at one small size, 200 px
  wide, and its style is the button's mode (drawings for «Insert Sticker», photos for «Insert
  Image», D33 A). Settings keeps only two picture options: each picture source on or off (the
  last one on stays on) and Data saver. The picture still goes below the word; the owner's «in place
  of the word» is the one preset not built yet.
- **Emoji / known labels.** Map common keywords to emoji via OpenMoji's own keywords: "happy" and
  "smile" insert a smiling face with no search. (new)
- **Remember my pick.** When the owner rejects the first suggestion for a word (e.g. "maçã") and
  picks another, that choice leads next time for the same word ([#34](https://github.com/martonpaulo/ink-tools/issues/34)).
- **Temporary result cache.** Keep a search's results for a few seconds so going back to pick a
  different one is instant (the owner often dislikes the first choice and looks for another). (new)
- **Text / knowledge insert (third mode).** Beyond pictures: search a term and insert a short
  **definition** ("inteligência artificial"), a **3-line bio** ("Lula da Silva"), or a brief
  **topic summary**. Source: open/keyless encyclopedic extracts (Wikipedia/Wikidata summaries);
  current-events topics are harder and best-effort. This is distinct from — and wanted more than —
  a single-word dictionary definition, which stays low priority. Built as «Insert Summary»
  ([#114](https://github.com/martonpaulo/ink-tools/issues/114)): the first 3 sentences of the best Wikipedia article's introduction, Portuguese
  first, then Spanish, below the word with its title and «(Wikipedia)»; on by default.
- **Translation («Translate ES→PT»).** Write a word, lasso it, insert its translation: one lasso
  button per direction switched on in Lookup's Settings, with no automatic direction. Any direction
  of the pairs can be chosen; ES→PT, ZH→PT and PT→ZH start on (owner, [#174](https://github.com/martonpaulo/ink-tools/issues/174), which replaced
  [#158](https://github.com/martonpaulo/ink-tools/issues/158)'s one button over every pair). It took over the Lingo plugin's job,
  and that plugin is retiring: it is uninstalled from the tablet and its folder removed once this
  button passes on the device ([#159](https://github.com/martonpaulo/ink-tools/issues/159), [#161](https://github.com/martonpaulo/ink-tools/issues/161)). Real uses: **learning a language**, **reading
  foreign text** (ES/ZH) and annotating meaning, and **finding the right term** while writing in PT
  without reaching for the phone. The owner lives between PT and ES, maybe ZH. Shares the
  dictionary/translation engine with the definition mode (one provider interface). Translation
  stays on the word.

Not planned (product audit, owner, [#141](https://github.com/martonpaulo/ink-tools/issues/141)): a button in the PDF and book selection toolbar
(lookup stays on the lasso in a note), an AI summary of the written page, which needs a paid
provider key, and, for translation, a vocabulary list of the words it translated and translating a
paragraph or a whole page.

## Lingo app

Shown on the tablet as **Handwriting Language**, with «Handwriting Language Settings» ([#176](https://github.com/martonpaulo/ink-tools/issues/176)).

A sideloaded Android app, not a plugin, under `apps/lingo-app/`: it switches the handwriting
recognition language of the whole tablet with one tap, so lasso convert, plugin recognition and the
handwriting keyboard read the next word in that language ([#157](https://github.com/martonpaulo/ink-tools/issues/157)). A plugin cannot do it: the
folder that names the active language is outside the plugin sandbox ([#151](https://github.com/martonpaulo/ink-tools/issues/151),
[the study](research/2026-11-handwriting-language.md)). The name Lingo moved here from the
translation plugin, which is retiring; the app was called Dialect before ([#160](https://github.com/martonpaulo/ink-tools/issues/160)).

- **The floating button, shown only where you write** (owner, [#151](https://github.com/martonpaulo/ink-tools/issues/151), after trying both
  surfaces on the tablet): a small button that shows the active language (`PT`, `EN`, `ES`) and
  moves to the next one, visible while the handwriting keyboard is open or a handwriting screen
  (Note, Digest, To-Do, Email) is in front; one setting keeps it always visible or always hidden.
  The app's sidebar entry also switches, with nothing on screen.
- **No language line in the other tools**: the plugins that recognise ink do not show the active
  language, since the floating button already does.
- **Installed languages only**: the cycle holds the tablet's installed language packs, by default
  `pt_BR`, `en_US`, `es_ES`; «Lingo settings» chooses which are in it.
- **Esperanto is out of scope**: it is not among the tablet's languages, and reaching it would need
  a second recognition engine (owner, [#151](https://github.com/martonpaulo/ink-tools/issues/151)).

## Dictionary and translation engine (shared)

Used by `lookup`'s definition and translation buttons (and the retiring Lingo plugin until it is removed), behind a `DictionaryProvider` interface. Decisions
(interview 2026-11-14):

- **Hybrid:** offline for common words, online fallback when a word is missing — the same shape as
  `lookup`'s image path.
- **Keyless, open sources:** Wiktionary / Wikidata and the like, no paid API key (the `ink2pic`
  philosophy). A paid provider (DeepL, Google) can be an opt-in later behind the same interface.
- **Priority pairs:** PT↔ES and PT↔ZH. Not EN, for now.
- **Monolingual definition is not a priority**, so `lookup`'s definition mode ranks below
  translation, the stronger need.
- **Not planned** (product audit, owner, [#141](https://github.com/martonpaulo/ink-tools/issues/141)): pinyin and example sentences in the
  translation shown. Pinyin stays an input of a ZH translation only
  ([#129](https://github.com/martonpaulo/ink-tools/issues/129)).

## retouch

Shown on the tablet as **Image Editing**; its buttons keep their names ([#176](https://github.com/martonpaulo/ink-tools/issues/176)).

Edit an image already on the page, **invoked by lassoing the image**. Every choice costs one e-ink
refresh, so retouch shows finished options at once and the user taps one, like Ink2Pic's results
grid; it has no sliders and no live preview
([#47](https://github.com/martonpaulo/ink-tools/issues/47)).

Status: `plugins/retouch/` holds Enhance, Lighter, Darker, Undo and Restore original
([#136](https://github.com/martonpaulo/ink-tools/issues/136)), and Rotate 90°, Mirror, Flip and Invert
([#131](https://github.com/martonpaulo/ink-tools/issues/131)), and Trim ([#132](https://github.com/martonpaulo/ink-tools/issues/132)); their device round is still to come.

Essential:

- **Enhance for e-ink**, one tap: grey that keeps colour contrast, a gamma step, sharpen, the 16
  greys ([#136](https://github.com/martonpaulo/ink-tools/issues/136)).
- **Lighter** and **Darker** in fixed gamma steps
  ([#136](https://github.com/martonpaulo/ink-tools/issues/136)).
- **Undo** and **Restore original** ([#136](https://github.com/martonpaulo/ink-tools/issues/136)).
- **Style grid**: Photo (16 greys), Line art (contour, matching `lookup`'s illustration mode, with
  thicker lines as an option), Black and white (threshold), Dither (Floyd–Steinberg and Atkinson);
  every style can turn white transparent so the page template shows through; the last style shown
  first ([#133](https://github.com/martonpaulo/ink-tools/issues/133)).
- Enhance scales a large picture down to the page width, never up, so the page stays fast
  ([#136](https://github.com/martonpaulo/ink-tools/issues/136)).
- **Crop with the pen** (draw the rectangle) and **trim white margins** automatically
  ([#132](https://github.com/martonpaulo/ink-tools/issues/132)).

Very useful:

- Rotate 90°, mirror horizontal or vertical, invert (a dark-mode screenshot becomes paper)
  ([#131](https://github.com/martonpaulo/ink-tools/issues/131)).
- **Document** mode: deskew, perspective correction, white background, black and white, for a
  photographed page from the phone ([#137](https://github.com/martonpaulo/ink-tools/issues/137)).
- Erase with the pen, background removal, make a sticker
  ([#134](https://github.com/martonpaulo/ink-tools/issues/134)).
- The picture Word Lookup just inserted stays lassoed, so Image Editing's buttons are one tap
  away; Lookup never opens Image Editing by itself (owner, replacing
  [#139](https://github.com/martonpaulo/ink-tools/issues/139); [#168](https://github.com/martonpaulo/ink-tools/issues/168)).
- «Enhance All Images» and «Undo All Images», in the lasso menu of any one picture, run Enhance or
  Undo on every picture of the page; a picture with ink across it is skipped, as the rect lasso
  would take the ink too ([#140](https://github.com/martonpaulo/ink-tools/issues/140)).

Limit: each edit finishes within 2 s on the Manta; a longer one shows the «Loading…» strip of
[Design direction](#design-direction) ([#103](https://github.com/martonpaulo/ink-tools/issues/103)). Before building, existing
plugins, apps and libraries are checked for reuse
([#138](https://github.com/martonpaulo/ink-tools/issues/138)).

**Reuse check (2026-11-15, [#138](https://github.com/martonpaulo/ink-tools/issues/138)).** No Supernote plugin or app edits
a picture already on the page. What exists:

| Name | What it does | License | On the Manta |
| :--- | :--- | :--- | :--- |
| [supernote-image-insert-plugin](https://github.com/wolfsolver/supernote-image-insert-plugin) | Picks a file under `/sdcard`, crops it with arrows and width and height controls, inserts it; A5 and A6 layouts | not stated in its README | yes, a plugin [inference from its README] |
| [embedimage](https://github.com/jpmoo/embedimage) | Picks a PNG from `Document/Images` and inserts it; no editing | not stated in its README | yes, a plugin [inference from its README] |
| [einktools screensaver maker](https://einktools.com/supernote-screensaver) | Web page: crops a photo to the screen, previews e-ink greys, exports a PNG | closed web service | no, a browser on another device |
| [Jimp](https://github.com/jimp-dev/jimp) | Pure JavaScript image library: crop, rotate, mirror, grey, invert, threshold, a dither plugin | MIT | untested in PluginHost's React Native; whole-image work in JS is slow [inference] |
| [OpenCV for Android](https://opencv.org/android/) and [jscanify](https://github.com/ColonelParrot/jscanify) | Deskew and perspective correction of a photographed page | Apache 2.0 (OpenCV 4.5 and later); jscanify MIT | Android 11 runs OpenCV's Java build [inference]; adds tens of MB to the `.snplg` [inference] |
| [MediaPipe Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/android) | On-device subject or person mask, for background removal | code Apache 2.0; each model has its own terms | to test: needs its native libraries in the plugin and fits the 2 s limit only on a small image [inference] |
| Ink2Pic's own pixel code (`packages/picture-search/native`: `Contour.java`, `Decolor.java`, `EinkPixels.java`) | Contour drawing, decolouring, e-ink measures in plain Java on `Bitmap` | MIT, this repository | yes, measured in Ink2Pic's device rounds |

Per delivery issue:

- [#130](https://github.com/martonpaulo/ink-tools/issues/130) native resize: reuse the host's lasso; a device check, no code.
- [#136](https://github.com/martonpaulo/ink-tools/issues/136) scaffold and Enhance: base on Ink2Pic's insert flow and `Decolor.java`/`EinkPixels.java`; build the gamma and sharpen steps, a few lines of Java each, since no plugin does them.
- [#133](https://github.com/martonpaulo/ink-tools/issues/133) styles: reuse `Contour.java` for Line art; build threshold and the two dithers in Java (each about 40 lines); Jimp's dither is an ordered dither for 16-bit colour [inference from its README], a style `retouch` does not plan.
- [#132](https://github.com/martonpaulo/ink-tools/issues/132) crop and trim: build; image-insert-plugin crops with arrows, not with the pen, and has no trim.
- [#131](https://github.com/martonpaulo/ink-tools/issues/131) rotate, mirror, invert: built as plain Java loops over the pixels in `Retouch.java`, a few lines each, so the JVM tests run them; Android's `Matrix` would do the same but only on the device, and a library adds nothing.
- [#134](https://github.com/martonpaulo/ink-tools/issues/134) eraser and cutout: build the eraser; for background removal try MediaPipe's segmenter first, and keep a white-flood cutout as the fallback when it does not load or is too slow.
- [#137](https://github.com/martonpaulo/ink-tools/issues/137) Document mode: base on OpenCV's perspective transform only if its size is acceptable; otherwise build deskew alone on the plain-Java measures.
- [#139](https://github.com/martonpaulo/ink-tools/issues/139) and [#140](https://github.com/martonpaulo/ink-tools/issues/140): build; they depend on this plugin's own flows.

Not planned: magic wand (imprecise with a pen; background removal covers it), brightness, contrast
and levels sliders, ordered and halftone dither and other error-diffusion styles, spread splitting,
forced white borders, OCR of the image. Resize stays only if the native lasso cannot already resize
an image ([#130](https://github.com/martonpaulo/ink-tools/issues/130)).

## Ink Notebook Editor

Named by the owner on 2026-11-16, a brand-free name; the working name was `desk` ([#175](https://github.com/martonpaulo/ink-tools/issues/175)).

A macOS app that **reads and edits** the owner's `.note` files **without breaking the format** —
like editing a PDF. Scope (interview 2026-11-14, revised):

- Open a `.note` on the Mac and see it faithfully.
- Edit it non-destructively: insert images, add text blocks, reorder pages.
- Write the file back so the Supernote still opens it correctly.

**Out of scope:** no OCR / handwriting-to-text, and no handwriting *input* on the Mac. Sharing or
export to other people is not a priority either. The value is a safe `.note` editor on a big screen.

The full editor is the goal from the start, not a viewer and exporter first on `supernotelib`
(product audit, owner, [#141](https://github.com/martonpaulo/ink-tools/issues/141)). It fetches and writes back the tablet's notes over the
cable through `inkctl`, with no ADB code of its own (owner, 2026-11-16,
[#48](https://github.com/martonpaulo/ink-tools/issues/48)).

## bridge

Shown on the tablet as **Account Sync**; a sync button, where one exists, says «Sync Accounts» ([#176](https://github.com/martonpaulo/ink-tools/issues/176)).

Settled: to-do + calendar + digest, each opt in/out, settings-only (no note surface). Input scope
is **only** those three — the owner does not want PDFs, read-later or other-app references pulled in
by `bridge`. See [`architecture.md`](architecture.md).

**Settings layout (interview 2026-11-14):** one section per module (To-Do / Calendar / Digest);
inside each, a toggle for the module and a toggle per provider (Todoist; Google / iCloud / ICS).

**To-Do sources** ([#44](https://github.com/martonpaulo/ink-tools/issues/44), owner, 2026-11-16): four Todoist sources reach the tablet's To-Do:
Inbox, Upcoming, Habits and the project Mirror. Upcoming is Todoist's view of dated tasks, not a
project: the dated tasks of the other projects, never a second copy of one already shown under
Inbox, Habits or Mirror.

**To-Do runs on the tablet alone** ([#44](https://github.com/martonpaulo/ink-tools/issues/44)): Bridge never depends on the Mac being on. The
community script that syncs Todoist through the Partner app on the Mac is not used (product audit,
owner, [#141](https://github.com/martonpaulo/ink-tools/issues/141)).

## New: phone to open note

Not previously planned. The owner wants to **send content from his phone straight into the note
currently open** on the tablet, quickly. Chosen mechanism: **iOS Shortcuts + LocalSend** — a
Shortcut sends it over LocalSend to the tablet, and a plugin drops it in.

- **What he sends:** a text snippet, a photo/image, and — a distinct, larger need — **a scanned PDF
  (e.g. study flashcards) to use as a note template**.
- **Placement:** the content arrives floating/selected and the owner positions it himself, the way
  `lookup` places an inserted picture.
- **Scan-to-template is its own capability**, beyond "drop into the open note": a scanned
  PDF becomes the **background of new blank pages** the owner writes on
  ([#143](https://github.com/martonpaulo/ink-tools/issues/143), owner, [#141](https://github.com/martonpaulo/ink-tools/issues/141)).

## relay

Shown on the tablet as **Device Transfer**, with the buttons «Send Page», «Send Selection» and «Receive» ([#176](https://github.com/martonpaulo/ink-tools/issues/176), [#172](https://github.com/martonpaulo/ink-tools/issues/172)).

The plugin that moves pictures and text between the tablet and the owner's iPhone and Mac over
LocalSend; one plugin for both directions (owner D25 A). Its receive half is the phone-to-note need
above ([#49](https://github.com/martonpaulo/ink-tools/issues/49)).

**Send half** ([#98](https://github.com/martonpaulo/ink-tools/issues/98)):

- «Send Page» in the note's sidebar sends the current page as a PNG; «Send Selection» in the lasso
  toolbar sends only the selection. One tap, no view: the result is a short toast.
- The person picks the receiving device once in Relay's Settings; later sends go to it, pinned to
  the fingerprint it announced. A changed certificate is a failed send, never a silent re-pin.
- Not in scope: the whole note as a PDF, which the Supernote Partner app already exports (product
  audit, owner, [#141](https://github.com/martonpaulo/ink-tools/issues/141)); a device without LocalSend; anything over the internet.
  Sending lassoed handwriting as typed text lives here, beside «Send Page»
  ([#99](https://github.com/martonpaulo/ink-tools/issues/99), owner, 2026-11-16).

**Receive half** ([#49](https://github.com/martonpaulo/ink-tools/issues/49), owner D42 B: our own, not Notipal):

- «Receive» in the note's sidebar makes the tablet a LocalSend device named «Supernote» for two
  minutes, one tap. The first text lands as a selected text box, the first PNG or JPEG as the
  host's floating picture; the person moves it. A HEIC photo is refused: the Shortcut converts it
  first.
- The receiver serves HTTPS with Relay's own X.509 v3 certificate, since iOS LocalSend refuses a
  v1 one (`UnsupportedCertVersion`, what the owner met with Notipal). The same certificate's
  fingerprint is the tablet's identity when it sends.
- Whether a listener can stay open in the background is measured in the tablet round and decided
  after it (product audit, owner, [#141](https://github.com/martonpaulo/ink-tools/issues/141)). A scanned PDF as page backgrounds is [#143](https://github.com/martonpaulo/ink-tools/issues/143).
- A received photo of a paper page is offered «Straighten as document», Image Editing's Document
  mode ([#137](https://github.com/martonpaulo/ink-tools/issues/137)), so it lands as a straight, white page (owner, 2026-11-16).

Device Transfer and Account Sync stay two plugins, each with a clear name; they share no flow
(owner, 2026-11-16).

## real-time-conversion

Shown as **Real-Time Conversion**, with the sidebar buttons «Real-Time Text» and «Undo Conversion» ([#176](https://github.com/martonpaulo/ink-tools/issues/176)); built in [`plugins/real-time-conversion/`](../plugins/real-time-conversion/), formerly the planned `typeset` (owner, 2026-11-16, [#184](https://github.com/martonpaulo/ink-tools/issues/184)).

A plugin that turns each handwritten word into typed text in a font the owner chose, soon after he
writes it, with no lasso, turned on and off from one sidebar button. The research proposes it and
the name ([`research/2026-11-live-handwriting-to-text.md`](research/2026-11-live-handwriting-to-text.md), [#144](https://github.com/martonpaulo/ink-tools/issues/144)). The owner chose to
build it as proposed, with an «Undo the last conversion» action; it is the next plugin to build (2026-11-16).

## Note templates

Parked by the owner ([#141](https://github.com/martonpaulo/ink-tools/issues/141)): nothing is built until he asks. A template here means
something simple, such as one generated sudoku page, not a large set.

## Design direction

The owner wants prettier Settings interfaces. `ink2pic`'s UI was good — simple, direct, minimal —
but could use some colour. Reference to study: `Laumss/sn-plugins` configuration UI. This is a
design direction for every plugin's Settings, within the e-ink constraints (16 greys).
The conventions, and what was borrowed from that reference (now Notipal), are in
[`packages/ui-kit/README.md`](../packages/ui-kit/README.md) ([#50](https://github.com/martonpaulo/ink-tools/issues/50)).
While a no-view action works, every plugin shows the same sign: one dark strip across the top of
the note that reads «Loading…», removed when the action ends (owner,
[#103](https://github.com/martonpaulo/ink-tools/issues/103)).
On 2026-11-16 the owner named three more plugins whose Settings look he likes: SnapMark, PC Clipboard
and DocuCraft ([their traits](../packages/ui-kit/README.md#the-owners-picks-snapmark-pc-clipboard-docucraft)).
