# Ink Notebook Editor: each feature at the highest dependency level that serves

Status: research for the owner's question of 2026-11-26, after the note format study of
[#362](https://github.com/martonpaulo/ink-tools/issues/362)
([`2026-11-note-format.md`](2026-11-note-format.md)). The levels and the rule are in
[`architecture.md` › Layer rules](../architecture.md#layer-rules): level 1 is the highest.

## Contents

- [Answer in short](#answer-in-short)
- [The three ways to change a note](#the-three-ways-to-change-a-note)
- [Per feature](#per-feature)
- [What it means for the later features](#what-it-means-for-the-later-features)
- [Recommendation](#recommendation)

## Answer in short

- Reading stays on the Mac at level 2 (the note format): no level-1 way gives the Mac the pages,
  the elements and the recognition of a note, and the tablet's own picture of a page leaves the
  pictures out ([`supernote.md` › Note file format](../supernote.md#note-file-format)).
- Every edit made while the tablet is connected stays on the tablet's file API (route T, level 1,
  [#313](https://github.com/martonpaulo/ink-tools/issues/313)), but one: a page move.
- A page move stays Mac-written (route B, level 2), now for a second reason: the file API can only
  copy and delete a page, which gives it a new `PAGEID`, and a link names its target page by
  `PAGEID`; the tablet's own move and `NoteWriter.movePage` both keep it.
- An edit made with no tablet should wait as a queued level-1 operation
  ([#360](https://github.com/martonpaulo/ink-tools/issues/360)) and be drawn on the Mac at once from the
  in-memory preview. The Mac writer of [#362](https://github.com/martonpaulo/ink-tools/issues/362) (level 2, with level-5 parts) is kept for
  what cannot wait for the tablet: a note that only Supernote Cloud carries
  ([#363](https://github.com/martonpaulo/ink-tools/issues/363)), and a new note made away from the tablet that must exist as a file before
  the tablet is near ([#339](https://github.com/martonpaulo/ink-tools/issues/339)).

## The three ways to change a note

| Way | Level | Breaks when | What it needs |
| :--- | :--- | :--- | :--- |
| Route T: the helper in Device Link calls the tablet's file API ([#312](https://github.com/martonpaulo/ink-tools/issues/312)) | 1 | the plugin API changes, with notice | the tablet connected |
| Queue: route T operations kept on the Mac and sent on the next connection ([#360](https://github.com/martonpaulo/ink-tools/issues/360)) | 1 | as route T; and a note changed on the tablet meanwhile refuses the queue on its base hash | nothing now; the tablet later |
| Route B: the Mac writes the bytes ([#362](https://github.com/martonpaulo/ink-tools/issues/362)), then a push, the mirror ([#432](https://github.com/martonpaulo/ink-tools/issues/432)) or Supernote Cloud ([#363](https://github.com/martonpaulo/ink-tools/issues/363)) carries them | 2, with level-5 parts: the outline the lasso needs, the tablet's acceptance rules, its caches ([#441](https://github.com/martonpaulo/ink-tools/issues/441)) and its recognition ([#440](https://github.com/martonpaulo/ink-tools/issues/440)) | any firmware update that changes the format; silently for the level-5 parts | the firmware watch ([#318](https://github.com/martonpaulo/ink-tools/issues/318)) and an effect test per element kind |

## Per feature

| Feature | Mac alone (format, level 2) | Through the tablet (level 1) | Choice |
| :--- | :--- | :--- | :--- |
| View, zoom, thumbnails, page grid | reads the bitmaps | `generateNotePng` per page; leaves pictures out, needs the tablet | Mac |
| Find, Copy as Text, OCR, export | reads recognition and draws pages | no call returns recognition | Mac |
| Follow the open note, live session | — | the helper reports the page | tablet |
| Select, move, resize, rotate, flip, delete, copy, paste | could write records with their outlines | `modifyElements`, `insertElements`, `deleteElements` | tablet; queue without it |
| Undo, redo | — | the inverse operation, or Revert to Backup | tablet |
| Pages add, delete, duplicate | could write page blocks | `insertNotePage`, `removeNotePage` | tablet; queue without it |
| Pages move, reorder | `NoteWriter.movePage` keeps the `PAGEID`, as the tablet's own move does | copy and delete: a new `PAGEID`, links to the page break | Mac (route B), recorded exception |
| Picture, text box | could write the record and its pixels; a text box must be drawn in a tablet font | `insertElements` | tablet; queue without it |
| Headings, keywords, links | could write the footer blocks; a link names path, `FILE_ID` and `PAGEID` | the lasso calls Lasso Actions already uses for Headings ([#252](https://github.com/martonpaulo/ink-tools/issues/252)); keywords and links not yet tried | tablet where a call exists; else the writer, under the watch |
| Template of a page, PDF background | could write the stored bitmap | `insertNotePage` with a template | tablet |
| Layers | could write layer blocks | no call known yet | Mac reads; editing layers waits for a call or the writer |
| New note | a byte-equal new note but its IDs ([#362](https://github.com/martonpaulo/ink-tools/issues/362)) | `createNote` | tablet; Mac only when the file must exist before the tablet is near |
| Edit through Supernote Cloud | the writer, then an upload with the file's MD5 | — | Mac, the one recorded exception for cloud notes |
| Backups, conflicts | Mac copies; conflicts matched by `PAGEID` | the tablet keeps its own copy and merges a sync conflict page by page by `PAGEID` | both; keep every `PAGEID` |

## What it means for the later features

- [#339](https://github.com/martonpaulo/ink-tools/issues/339), a new note: with the tablet connected, `createNote` (level 1). With no tablet, queue the
  creation and show the empty note at once; write the file on the Mac only when the owner asks for
  it to go through Supernote Cloud.
- [#360](https://github.com/martonpaulo/ink-tools/issues/360), edit with no tablet: becomes the default way to edit away from the tablet. It
  keeps every edit at level 1, and its refusal on a changed base is the conflict rule of
  [#317](https://github.com/martonpaulo/ink-tools/issues/317).
- [#363](https://github.com/martonpaulo/ink-tools/issues/363), edit through Supernote Cloud: the one place the writer edits an existing note. It
  needs, besides the writer: the cloud client (a private service, an adapter of its own), the MD5 of
  the bytes it uploads, every `PAGEID` and `FILE_ID` kept, recognition marked stale
  ([#440](https://github.com/martonpaulo/ink-tools/issues/440)) and the tablet's caches measured ([#441](https://github.com/martonpaulo/ink-tools/issues/441)).
- [#432](https://github.com/martonpaulo/ink-tools/issues/432), the `~/Supernote` mirror: it moves files, it never edits a note. An editor edit
  still goes through the write path; a mirror sync that would replace a note the queue or the
  tablet changed keeps both copies.
- Supernote Cloud in general: it syncs whole files checked by MD5 and size; it knows nothing of
  pages, so it cannot carry an edit, only a file the writer made.

## Recommendation

1. Keep reading at level 2 and every connected edit at level 1, with the page move as the one
   recorded route-B edit; record the `PAGEID` reason beside the existing one in
   `apps/ink-notebook-editor/AGENTS.md`.
2. Build the queue of [#360](https://github.com/martonpaulo/ink-tools/issues/360) before the writer's element kinds: it gives editing away
   from the tablet at level 1.
3. Build the writer of [#362](https://github.com/martonpaulo/ink-tools/issues/362) in the order its two users need: a new note, then
   strokes, then elements; give it the firmware watch probe of
   [#318](https://github.com/martonpaulo/ink-tools/issues/318): make a new note on the tablet and compare it, IDs masked, with the writer's.
4. Start [#363](https://github.com/martonpaulo/ink-tools/issues/363) only after [#440](https://github.com/martonpaulo/ink-tools/issues/440) and
   [#441](https://github.com/martonpaulo/ink-tools/issues/441), so a cloud edit never shows stale words or an old page.
