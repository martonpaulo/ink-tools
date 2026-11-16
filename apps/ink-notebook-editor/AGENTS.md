# Ink Notebook Editor — agent guidance

Scoped guidance for `apps/ink-notebook-editor/`. Inherits the repository root `../../AGENTS.md`. A
`CLAUDE.md` symlink points at this file.

## What it is

A macOS app that reads and edits `.note` notebook files on the Mac without breaking the format,
like editing a PDF ([#48](https://github.com/martonpaulo/ink-tools/issues/48)). The scope is in
[`docs/plugin-scope.md` › Ink Notebook Editor](../../docs/plugin-scope.md#ink-notebook-editor);
the folder's place in the monorepo is in [`docs/architecture.md`](../../docs/architecture.md).
No code yet: this folder holds the plan until the first delivery starts.

## Scope

- Open a `.note` file on the Mac and show every page faithfully.
- Edit it without loss: insert images, add text blocks, reorder pages.
- Write the file back so the tablet still opens it correctly.

## Out of scope

- OCR or handwriting-to-text.
- Handwriting input on the Mac.
- Sharing or exporting to other people; it is not a priority.

## First delivery: a faithful reader

1. Search first for existing `.note` parsers, such as `supernotelib`, and record what each one reads
   and what it gets wrong; reuse one when it is faithful, and say which gap forces new code
   (`skd-build-or-reuse`).
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

Until code exists, the root `docs` gate covers this folder (`gates.json`). The first code change
adds the app's own gate and workflow, and a row for it in the root `ci-pipelines` divergence.
