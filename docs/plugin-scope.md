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
- [Design direction](#design-direction)

## The two pains driving everything

The owner's top frictions with the Supernote today are **getting information in** and **getting
information out** — not organising or search. "Getting out" means pulling his own content off the
device into an editable, durable form on the Mac, **not** sharing it with other people.

## lookup

Evolution of `ink2pic`: write a word, lasso it, insert something. **It is the first plugin to ship
after `bridge`** (the owner's biggest daily pain). **Mode selection (interview 2026-11-14):** each
mode is its own **lasso button**, chosen before the search — not a post-hoc toggle: "insert
illustration" (vector/sticker/OpenMoji), "insert photo" (real photo), "insert text" (definition /
3-line bio / summary). Translation is the separate `lingo` plugin with its own lasso button. Pains
and scope:

- **Relevance is broken on real cases.** "café"/"coffee" returns a heart as the "best" picture;
  "Pedro Sánchez" returns awful results. Ranking and the portrait path must fix these (issues
  #13, #15, #20, #24). Keep these as named regression cases.
- **Two modes.** An **illustration / vector / sticker** mode (line art, drawings, engravings,
  "Bababum-app" style, OpenMoji) and a **real-photo** mode (people, places). The owner chose a real
  split, not one blended list (relates to #35).
- **Emoji / known labels.** Map common keywords to emoji via OpenMoji's own keywords: "happy" and
  "smile" insert a smiling face with no search. (new)
- **Remember my pick.** When the owner rejects the first suggestion for a word (e.g. "maçã") and
  picks another, that choice leads next time for the same word (#34).
- **Temporary result cache.** Keep a search's results for a few seconds so going back to pick a
  different one is instant (the owner often dislikes the first choice and looks for another). (new)
- **Text / knowledge insert (third mode).** Beyond pictures: search a term and insert a short
  **definition** ("inteligência artificial"), a **3-line bio** ("Lula da Silva"), or a brief
  **topic summary**. Source: open/keyless encyclopedic extracts (Wikipedia/Wikidata summaries);
  current-events topics are harder and best-effort. This is distinct from — and wanted more than —
  a single-word dictionary definition, which stays low priority.

## lingo

Write a word, lasso it, insert its **translation**. Real uses: **learning a language**, **reading
foreign text** (ES/ZH) and annotating meaning, and **finding the right term** while writing in PT
without reaching for the phone. The owner lives between PT and ES, maybe ZH. Shares the
dictionary/translation engine with `lookup`'s definition mode (one provider interface). Pairs are
opt in/out.

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

## retouch

Edit an image already on the page, **invoked by lassoing the image**. Edit set so far (more tools
under review):

- Rotate 90°, mirror horizontal/vertical, invert (negative).
- Crop and resize.
- E-ink greyscale: grey levels, brightness/contrast, threshold/dither for the 16 greys.
- Magic-wand object cutout, background removal, eraser.
- Photo → line art (edge detection), for a drawing look that reads well on e-ink and matches
  `lookup`'s illustration mode.
- Deskew / perspective correction, for photographed or scanned images (helps the phone-scan flow).
- Dither / halftone styles (Floyd–Steinberg, ordered, halftone) beyond the simple threshold.
- Make sticker (cutout + transparent/white background) for reuse; sharpen / auto-enhance for
  legibility.

## desk

A macOS app that **reads and edits** the owner's `.note` files **without breaking the format** —
like editing a PDF. Scope (interview 2026-11-14, revised):

- Open a `.note` on the Mac and see it faithfully.
- Edit it non-destructively: insert images, add text blocks, reorder pages.
- Write the file back so the Supernote still opens it correctly.

**Out of scope:** no OCR / handwriting-to-text, and no handwriting *input* on the Mac. Sharing or
export to other people is not a priority either. The value is a safe `.note` editor on a big screen.

## bridge

Settled: to-do + calendar + digest, each opt in/out, settings-only (no note surface). Input scope
is **only** those three — the owner does not want PDFs, read-later or other-app references pulled in
by `bridge`. See [`architecture.md`](architecture.md).

**Settings layout (interview 2026-11-14):** one section per module (To-Do / Calendar / Digest);
inside each, a toggle for the module and a toggle per provider (Todoist; Google / iCloud / ICS).

## New: phone to open note

Not previously planned. The owner wants to **send content from his phone straight into the note
currently open** on the tablet, quickly. Chosen mechanism: **iOS Shortcuts + LocalSend** — a
Shortcut sends it over LocalSend to the tablet, and a plugin drops it in.

- **What he sends:** a text snippet, a photo/image, and — a distinct, larger need — **a scanned PDF
  (e.g. study flashcards / "fichas de estudo") to use as a note template**.
- **Placement:** the content arrives floating/selected and the owner positions it himself, the way
  `lookup` places an inserted picture.
- **Scan-to-template is probably its own capability**, beyond "drop into the open note": a scanned
  PDF becomes the **background of new blank pages** the owner writes on. Split it out when picked up.

## Design direction

The owner wants prettier Settings interfaces. `ink2pic`'s UI was good — simple, direct, minimal —
but could use some colour. Reference to study: `Laumss/sn-plugins` configuration UI. This is a
design direction for every plugin's Settings, within the e-ink constraints (16 greys).
