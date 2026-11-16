# Plugin scope — from the owner interview (2026-11-14)

What each not-yet-built plugin is for, grounded in the owner's real pains. This is the product
source of truth for scope; delivery issues cite it. Architecture (layers, packages) is in
[`architecture.md`](architecture.md); decision history in [`decisions.md`](decisions.md).

## Contents

- [The two pains driving everything](#the-two-pains-driving-everything)
- [lookup](#lookup)
- [lingo](#lingo)
- [Dictionary and translation engine (shared)](#dictionary-and-translation-engine-shared)
- [retouch](#retouch)
- [desk](#desk)
- [bridge](#bridge)
- [New: phone to open note](#new-phone-to-open-note)
- [relay](#relay)
- [Note templates](#note-templates)
- [Design direction](#design-direction)

## The two pains driving everything

The owner's top frictions with the Supernote today are **getting information in** and **getting
information out** — not organising or search. "Getting out" means pulling his own content off the
device into an editable, durable form on the Mac, **not** sharing it with other people.

## lookup

Evolution of `ink2pic`: write a word, lasso it, insert something. `lookup` is a new plugin with its
own `pluginID`, installed beside Ink2Pic until Ink2Pic is retired, and everything Ink2Pic does moves into it (owner D45, [#125](https://github.com/martonpaulo/supernote-tools/issues/125)); it does not carry Ink2Pic's
settings or picture library (owner D40 B, [#110](https://github.com/martonpaulo/supernote-tools/issues/110)). **It is the first plugin to ship
after `bridge`** (the owner's biggest daily pain). **Mode selection (interview 2026-11-14):** each
mode is its own **lasso button**, chosen before the search — not a post-hoc toggle: "insert
illustration" (vector/sticker/OpenMoji), "insert photo" (real photo), "insert text" (definition /
3-line bio / summary). Translation is the separate `lingo` plugin with its own lasso button. Pains
and scope:

- **Relevance is broken on real cases.** "café"/"coffee" returns a heart as the "best" picture;
  "Pedro Sánchez" returns awful results. Ranking and the portrait path must fix these (issues
  [#13](https://github.com/martonpaulo/supernote-tools/issues/13), [#15](https://github.com/martonpaulo/supernote-tools/issues/15), [#20](https://github.com/martonpaulo/supernote-tools/issues/20), [#24](https://github.com/martonpaulo/supernote-tools/issues/24)). Keep these as named regression cases.
- **Two modes.** An **illustration / vector / sticker** mode (line art, drawings, engravings,
  "Bababum-app" style, OpenMoji) and a **real-photo** mode (people, places). The owner chose a real
  split, not one blended list (relates to [#35](https://github.com/martonpaulo/supernote-tools/issues/35)).
- **Emoji / known labels.** Map common keywords to emoji via OpenMoji's own keywords: "happy" and
  "smile" insert a smiling face with no search. (new)
- **Remember my pick.** When the owner rejects the first suggestion for a word (e.g. "maçã") and
  picks another, that choice leads next time for the same word ([#34](https://github.com/martonpaulo/supernote-tools/issues/34)).
- **Temporary result cache.** Keep a search's results for a few seconds so going back to pick a
  different one is instant (the owner often dislikes the first choice and looks for another). (new)
- **Text / knowledge insert (third mode).** Beyond pictures: search a term and insert a short
  **definition** ("inteligência artificial"), a **3-line bio** ("Lula da Silva"), or a brief
  **topic summary**. Source: open/keyless encyclopedic extracts (Wikipedia/Wikidata summaries);
  current-events topics are harder and best-effort. This is distinct from — and wanted more than —
  a single-word dictionary definition, which stays low priority.

Not planned (product audit, owner, [#141](https://github.com/martonpaulo/supernote-tools/issues/141)): a button in the PDF and book selection toolbar
(lookup and lingo stay on the lasso in a note), and an AI summary of the written page, which needs a
paid provider key.

## lingo

Write a word, lasso it, insert its **translation**. Real uses: **learning a language**, **reading
foreign text** (ES/ZH) and annotating meaning, and **finding the right term** while writing in PT
without reaching for the phone. The owner lives between PT and ES, maybe ZH. Shares the
dictionary/translation engine with `lookup`'s definition mode (one provider interface). Pairs are
opt in/out.

Lingo stays on the word. Not planned (product audit, owner, [#141](https://github.com/martonpaulo/supernote-tools/issues/141)): the PDF and book
selection toolbar, a vocabulary list of the words it translated, and translating a paragraph or a
whole page.

## Dictionary and translation engine (shared)

Used by `lingo` and `lookup`'s definition mode, behind a `DictionaryProvider` interface. Decisions
(interview 2026-11-14):

- **Hybrid:** offline for common words, online fallback when a word is missing — the same shape as
  `lookup`'s image path.
- **Keyless, open sources:** Wiktionary / Wikidata and the like, no paid API key (the `ink2pic`
  philosophy). A paid provider (DeepL, Google) can be an opt-in later behind the same interface.
- **Priority pairs:** PT↔ES and PT↔ZH. Not EN, for now.
- **Monolingual definition is not a priority**, so `lookup`'s definition mode ranks below
  translation; `lingo` (translation) is the stronger need.
- **Not planned** (product audit, owner, [#141](https://github.com/martonpaulo/supernote-tools/issues/141)): pinyin and example sentences in the
  translation shown. Pinyin stays an input of the ZH button only
  ([#129](https://github.com/martonpaulo/supernote-tools/issues/129)).

## retouch

Edit an image already on the page, **invoked by lassoing the image**. Every choice costs one e-ink
refresh, so retouch shows finished options at once and the user taps one, like Ink2Pic's results
grid; it has no sliders and no live preview
([#47](https://github.com/martonpaulo/supernote-tools/issues/47)).

Status: `plugins/retouch/` holds Enhance, Lighter, Darker, Undo and Restore original
([#136](https://github.com/martonpaulo/supernote-tools/issues/136)), and Rotate 90°, Mirror, Flip and Invert
([#131](https://github.com/martonpaulo/supernote-tools/issues/131)), and Trim ([#132](https://github.com/martonpaulo/supernote-tools/issues/132)); their device round is still to come.

Essential:

- **Enhance for e-ink**, one tap: grey that keeps colour contrast, a gamma step, sharpen, the 16
  greys ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)).
- **Lighter** and **Darker** in fixed gamma steps
  ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)).
- **Undo** and **Restore original** ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)).
- **Style grid**: Photo (16 greys), Line art (contour, matching `lookup`'s illustration mode, with
  thicker lines as an option), Black and white (threshold), Dither (Floyd–Steinberg and Atkinson);
  every style can turn white transparent so the page template shows through; the last style shown
  first ([#133](https://github.com/martonpaulo/supernote-tools/issues/133)).
- Enhance scales a large picture down to the page width, never up, so the page stays fast
  ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)).
- **Crop with the pen** (draw the rectangle) and **trim white margins** automatically
  ([#132](https://github.com/martonpaulo/supernote-tools/issues/132)).

Very useful:

- Rotate 90°, mirror horizontal or vertical, invert (a dark-mode screenshot becomes paper)
  ([#131](https://github.com/martonpaulo/supernote-tools/issues/131)).
- **Document** mode: deskew, perspective correction, white background, black and white, for a
  photographed page from the phone ([#137](https://github.com/martonpaulo/supernote-tools/issues/137)).
- Erase with the pen, background removal, make a sticker
  ([#134](https://github.com/martonpaulo/supernote-tools/issues/134)).
- Open retouch on the picture Ink2Pic or Lookup just inserted
  ([#139](https://github.com/martonpaulo/supernote-tools/issues/139)).
- Later: apply one edit to every image on the page
  ([#140](https://github.com/martonpaulo/supernote-tools/issues/140)).

Limit: each edit finishes within 2 s on the Manta; a longer one shows the plugin's «Working…»
panel ([#103](https://github.com/martonpaulo/supernote-tools/issues/103)). Before building, existing
plugins, apps and libraries are checked for reuse
([#138](https://github.com/martonpaulo/supernote-tools/issues/138)).

**Reuse check (2026-11-15, [#138](https://github.com/martonpaulo/supernote-tools/issues/138)).** No Supernote plugin or app edits
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

- [#130](https://github.com/martonpaulo/supernote-tools/issues/130) native resize: reuse the host's lasso; a device check, no code.
- [#136](https://github.com/martonpaulo/supernote-tools/issues/136) scaffold and Enhance: base on Ink2Pic's insert flow and `Decolor.java`/`EinkPixels.java`; build the gamma and sharpen steps, a few lines of Java each, since no plugin does them.
- [#133](https://github.com/martonpaulo/supernote-tools/issues/133) styles: reuse `Contour.java` for Line art; build threshold and the two dithers in Java (each about 40 lines); Jimp's dither is an ordered dither for 16-bit colour [inference from its README], a style `retouch` does not plan.
- [#132](https://github.com/martonpaulo/supernote-tools/issues/132) crop and trim: build; image-insert-plugin crops with arrows, not with the pen, and has no trim.
- [#131](https://github.com/martonpaulo/supernote-tools/issues/131) rotate, mirror, invert: built as plain Java loops over the pixels in `Retouch.java`, a few lines each, so the JVM tests run them; Android's `Matrix` would do the same but only on the device, and a library adds nothing.
- [#134](https://github.com/martonpaulo/supernote-tools/issues/134) eraser and cutout: build the eraser; for background removal try MediaPipe's segmenter first, and keep a white-flood cutout as the fallback when it does not load or is too slow.
- [#137](https://github.com/martonpaulo/supernote-tools/issues/137) Document mode: base on OpenCV's perspective transform only if its size is acceptable; otherwise build deskew alone on the plain-Java measures.
- [#139](https://github.com/martonpaulo/supernote-tools/issues/139) and [#140](https://github.com/martonpaulo/supernote-tools/issues/140): build; they depend on this plugin's own flows.

Not planned: magic wand (imprecise with a pen; background removal covers it), brightness, contrast
and levels sliders, ordered and halftone dither and other error-diffusion styles, spread splitting,
forced white borders, OCR of the image. Resize stays only if the native lasso cannot already resize
an image ([#130](https://github.com/martonpaulo/supernote-tools/issues/130)).

## desk

A macOS app that **reads and edits** the owner's `.note` files **without breaking the format** —
like editing a PDF. Scope (interview 2026-11-14, revised):

- Open a `.note` on the Mac and see it faithfully.
- Edit it non-destructively: insert images, add text blocks, reorder pages.
- Write the file back so the Supernote still opens it correctly.

**Out of scope:** no OCR / handwriting-to-text, and no handwriting *input* on the Mac. Sharing or
export to other people is not a priority either. The value is a safe `.note` editor on a big screen.

The full editor is the goal from the start, not a viewer and exporter first on `supernotelib`
(product audit, owner, [#141](https://github.com/martonpaulo/supernote-tools/issues/141)).

## bridge

Settled: to-do + calendar + digest, each opt in/out, settings-only (no note surface). Input scope
is **only** those three — the owner does not want PDFs, read-later or other-app references pulled in
by `bridge`. See [`architecture.md`](architecture.md).

**Settings layout (interview 2026-11-14):** one section per module (To-Do / Calendar / Digest);
inside each, a toggle for the module and a toggle per provider (Todoist; Google / iCloud / ICS).

**To-Do runs on the tablet alone** ([#44](https://github.com/martonpaulo/supernote-tools/issues/44)): Bridge never depends on the Mac being on. The
community script that syncs Todoist through the Partner app on the Mac is not used (product audit,
owner, [#141](https://github.com/martonpaulo/supernote-tools/issues/141)).

## New: phone to open note

Not previously planned. The owner wants to **send content from his phone straight into the note
currently open** on the tablet, quickly. Chosen mechanism: **iOS Shortcuts + LocalSend** — a
Shortcut sends it over LocalSend to the tablet, and a plugin drops it in.

- **What he sends:** a text snippet, a photo/image, and — a distinct, larger need — **a scanned PDF
  (e.g. study flashcards / "fichas de estudo") to use as a note template**.
- **Placement:** the content arrives floating/selected and the owner positions it himself, the way
  `lookup` places an inserted picture.
- **Scan-to-template is its own capability**, beyond "drop into the open note": a scanned
  PDF becomes the **background of new blank pages** the owner writes on
  ([#143](https://github.com/martonpaulo/supernote-tools/issues/143), owner, [#141](https://github.com/martonpaulo/supernote-tools/issues/141)).

## relay

The plugin that moves pictures and text between the tablet and the owner's iPhone and Mac over
LocalSend; one plugin for both directions (owner D25 A). Its receive half is the phone-to-note need
above ([#49](https://github.com/martonpaulo/supernote-tools/issues/49)).

**Send half** ([#98](https://github.com/martonpaulo/supernote-tools/issues/98)):

- «Send page» in the note's sidebar sends the current page as a PNG; «Send selection» in the lasso
  toolbar sends only the selection. One tap, no view: the result is a short toast.
- The person picks the receiving device once in Relay's Settings; later sends go to it, pinned to
  the fingerprint it announced. A changed certificate is a failed send, never a silent re-pin.
- Not in scope: the whole note as a PDF, which the Supernote Partner app already exports (product
  audit, owner, [#141](https://github.com/martonpaulo/supernote-tools/issues/141)); a device without LocalSend; anything over the internet.
  A lasso selection as typed text is [#99](https://github.com/martonpaulo/supernote-tools/issues/99).

**Receive half** ([#49](https://github.com/martonpaulo/supernote-tools/issues/49)): receiving takes one tap on «Receive». Whether a listener can stay
open in the background is measured in the tablet round and decided after it (product audit, owner,
[#141](https://github.com/martonpaulo/supernote-tools/issues/141)). A scanned PDF as page backgrounds is [#143](https://github.com/martonpaulo/supernote-tools/issues/143).

## Note templates

Parked by the owner ([#141](https://github.com/martonpaulo/supernote-tools/issues/141)): nothing is built until he asks. A template here means
something simple, such as one generated sudoku page, not a large set.

## Design direction

The owner wants prettier Settings interfaces. `ink2pic`'s UI was good — simple, direct, minimal —
but could use some colour. Reference to study: `Laumss/sn-plugins` configuration UI. This is a
design direction for every plugin's Settings, within the e-ink constraints (16 greys).
The conventions, and what was borrowed from that reference (now Notipal), are in
[`packages/ui-kit/README.md`](../packages/ui-kit/README.md) ([#50](https://github.com/martonpaulo/supernote-tools/issues/50)).
On 2026-11-16 the owner named three more plugins whose Settings look he likes: SnapMark, PC Clipboard
and DocuCraft ([their traits](../packages/ui-kit/README.md#the-owners-picks-snapmark-pc-clipboard-docucraft)).
