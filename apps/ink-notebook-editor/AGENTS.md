# Ink Notebook Editor — agent guidance

Scoped guidance for `apps/ink-notebook-editor/`. Inherits the repository root `../../AGENTS.md`. A
`CLAUDE.md` symlink points at this file.

## What it is

A macOS app that reads and edits `.note` notebook files on the Mac without breaking the format,
like editing a PDF ([#48](https://github.com/martonpaulo/ink-tools/issues/48)). The scope is in
[`docs/plugin-scope.md` › Ink Notebook Editor](../../docs/plugin-scope.md#ink-notebook-editor);
the folder's place in the monorepo is in [`docs/architecture.md`](../../docs/architecture.md).
The reader exists, the app does not yet: the order is the Plan of [#48](https://github.com/martonpaulo/ink-tools/issues/48), with sub-issues [#261](https://github.com/martonpaulo/ink-tools/issues/261) to [#264](https://github.com/martonpaulo/ink-tools/issues/264).

## Scope

- Open a `.note` file on the Mac and show every page faithfully.
- Edit it without loss: insert images, add text blocks, reorder pages.
- Write the file back so the tablet still opens it correctly.

## Out of scope

- OCR or handwriting-to-text.
- Handwriting input on the Mac.
- Sharing or exporting to other people; it is not a priority.

## First delivery: a faithful reader

1. Reuse, decided in [#261](https://github.com/martonpaulo/ink-tools/issues/261): `NoteFormat/` is a Swift port of
   `supernote-tool`'s reader (Apache-2.0, [NOTICE](NOTICE.md)). A Mac app cannot ship its Python
   runtime, and no Swift or macOS reader exists. Its page 1 of each public sample of
   `supernote-typescript` matched `supernote-tool`'s PNG pixel for pixel, but for the page white (255
   here, as `supernote-tool` gives). The sample with no `LAYERPROTOCOL` fails with a named error, as it
   fails in `supernote-tool`.
2. Make the test notebooks: blank and template notes with `inkctl note new`, pages with an inserted
   picture and a text box through a plugin, and the handwriting notes already under `Note/Tests/` on
   the tablet. Never use the owner's own notebooks as fixtures.
3. Build a reader and check it page by page against the tablet's own rendering of each test
   notebook.

Editing and write-back follow only once the reader is faithful.

## Name

The name is brand-free: «Ink Notebook Editor». «for Supernote notebooks» may appear only in a
description, never in the name, the bundle identifier or the icon
([`docs/decisions.md`](../../docs/decisions.md)).

## Validation

The gate `ink-notebook-editor` runs `swift test` in `NoteFormat/` (`gates.json`), in CI on a macOS
runner (`.github/workflows/validate-ink-notebook-editor.yml`, one of the per-subproject workflows of
the root `ci-pipelines` divergence). A reader change keeps every parse and decode failure a `NoteFormatError`, never a blank
page, and adds its test in `NoteFormat/Tests/`.
