# Digest provider: how a plugin saves into the tablet's Digest

Status: research for [#42](https://github.com/martonpaulo/ink-tools/issues/42), 2026-11-17. Static
analysis only: the APK was read on the Mac and never run. One tablet round is still needed to
confirm the insert (see [What a device round must confirm](#what-a-device-round-must-confirm)).

Target: `SupernoteKnowledge` 1.00.153 (`versionCode` 100153), package
`com.ratta.supernote.knowledge`, pulled from the owner's Manta. SHA-256 of the APK:
`b5f1df9086d5fdc0bd5212fe6c5fc08b2308ef58fb0313a7937f865297db74b8`. It was decompiled with `jadx`
(sources, then resources for the manifest). Decompiled vendor code stays in the session scratch and
is never committed, so each citation gives the decompiled file and line, not the code.

Marks, as in [`../supernote.md`](../supernote.md): **[source]** read in the decompiled app;
**[measured]** on the tablet; **[inference]** reasoned, not run.

## Contents

- [Answer in short](#answer-in-short)
- [1. Who serves the authority](#1-who-serves-the-authority)
- [2. Permissions and the trusted-caller list](#2-permissions-and-the-trusted-caller-list)
- [3. Content URIs](#3-content-uris)
- [4. Tables and columns](#4-tables-and-columns)
- [5. The insert rules](#5-the-insert-rules)
- [6. What a Saved item becomes](#6-what-a-saved-item-becomes)
- [7. Pictures](#7-pictures)
- [8. Cloud sync](#8-cloud-sync)
- [9. The adapter's descriptor was wrong](#9-the-adapters-descriptor-was-wrong)
- [What a device round must confirm](#what-a-device-round-must-confirm)
- [Sources](#sources)

## Answer in short

- **The path the probe used does not exist.** The provider has no root path and no `digest` path.
  The Digest is the `knowledge` table of a Room database, and a new entry goes in through
  `content://com.ratta.supernote.knowledge.provider/knowledge/insert` [source]. That is why the
  2026-11-14 probe got `Unknown URI` [measured].
- **A plugin can insert.** PluginHost runs as `android.uid.system`, and the system uid holds every
  permission, so `READ_KNOWLEDGE` and `WRITE_KNOWLEDGE` pass [measured, [#42](https://github.com/martonpaulo/ink-tools/issues/42)]. `knowledge/insert` is
  not on the trusted-caller list, so any caller with the write permission may use it [source].
- **A plugin cannot delete.** `delete` refuses every caller outside five Ratta packages, before it
  even reads the URI. That is the `SecurityException` the probe saw [source, measured]. So a Digest
  entry we write stays until the owner removes it on the tablet; the sync is one-way and append-only,
  with updates.
- **No anchor is needed.** `source_type` 4 is «self add». The list shows such an entry with the
  string «custom source» instead of a file name and page [source]. A Saved item needs no note or
  PDF to anchor to, which removes the blocker of the 2026-11-13 comment on [#42](https://github.com/martonpaulo/ink-tools/issues/42).
- **An entry holds text only.** `content` (required, 1 to 15,000 characters), an optional comment
  (up to 2,000 characters), a collection, a source type, a source path and page, JSON `metadata`,
  and an optional handwriting `.mark` file. There is no image column [source].
- **Each entry can carry our own identifier.** A `unique_identifier` key in `metadata` is kept as
  given and can be looked up with `knowledge/by_unique_identifier/<id>` and
  `knowledge/count/by_unique_identifier/<id>`, and updated with `knowledge/update/by_unique_identifier`
  [source]. That gives the sync an idempotent key without a local map.
- **The native app syncs it.** Each insert queues an auto-sync task, so the entry reaches Supernote
  Cloud with no credential of ours [source].

## 1. Who serves the authority

The manifest declares two providers with the same authority: `KnowledgeContentProvider` and the
file-manager library's `FileManageProvider` (`AndroidManifest.xml:47-53` and `:295-299`) [source].
The second one's own code uses `com.ratta.supernote.inbox.provider`
(`explorer/provider/FileManageProvider.java:30`), so the duplicate is a manifest merge leftover
[inference]. `KnowledgeContentProvider` is the one the tablet serves: the probe's delete returned
its message «Permission denied: you are not authorized to invoke this interface.», which
`FileManageProvider` never throws (`FileManageProvider.java:79`, `:115`) [measured, source].

The app runs as `android:sharedUserId="android.uid.system"` (`AndroidManifest.xml:3`) [source].

## 2. Permissions and the trusted-caller list

- `READ_KNOWLEDGE` and `WRITE_KNOWLEDGE` are `protectionLevel="normal"`
  (`AndroidManifest.xml:16-20`) and guard the provider (`:49-50`) [source].
- `checkReadPermission` and `checkWritePermission` skip the check for a trusted caller, and
  otherwise call `checkCallingOrSelfPermission` (`KnowledgeContentProvider.java:228-238`) [source].
  The system uid passes it; the probe's query and insert reached the URI matcher [measured].
- `isTrustedCaller` compares `getCallingPackage()` with five packages: `com.supernote.document`,
  `com.ratta.supernote.note`, `com.ratta.settings`, `com.ratta.supernote.background` and
  `com.ratta.supernote.inkhub` (`KnowledgeContentProvider.java:251-263`) [source]. PluginHost,
  `com.ratta.supernote.pluginhost`, is not one of them.
- Refused to an untrusted caller even with the permission:
  - `insert` on `tags`, `knowledge/add_tags/#`, `knowledge_base/restore`, `knowledge/restore` and
    `knowledge_base/insert_with_unique_attribute` (`:285-287`);
  - every `delete` (`:549-551`);
  - `query` on `tags`, `knowledge/by_tag`, `knowledge/by_tag/#`, `knowledge/sync/state` and
    `knowledge/search/special_carousel` (`:644-646`);
  - `update` on `knowledge_base/restore`, `knowledge/restore` and codes 20021
    (`knowledge/update_all_to_add_state`, `knowledge/search/by_source_type`) (`:902-904`).

So a plugin can create entries and collections, read them, and update them, but cannot tag, delete
or restore [source].

## 3. Content URIs

All under `content://com.ratta.supernote.knowledge.provider/` (`KnowledgeContentProvider.java:89-126`)
[source]. The ones the sync uses are in bold.

| Path | Code | Untrusted caller |
| :--- | :--- | :--- |
| **`knowledge`** | 20000 | query (all live entries, raw table columns) |
| **`knowledge/insert`** | 20007 | insert |
| `knowledge/#` | 20001 | query |
| `knowledge/by_knowledge_base/*`, `knowledge/by_knowledge_base` | 20003, 20013 | query |
| **`knowledge/by_unique_identifier/*`** | 20014 | query |
| **`knowledge/count/by_unique_identifier/*`** | 20016 | query (one `count` column) |
| **`knowledge/update/by_unique_identifier`** | 20015 | update |
| `knowledge/update/by_id`, `knowledge/update_source_*` | 20008 to 20011 | update |
| `knowledge/by_source_path` | 20004 | query |
| `knowledge/search/by_keyword`, `knowledge/delete_synced_data` | 20020 | query (the same code serves both) |
| **`knowledge_base`** | 10000 | query, insert (a new collection from `name` and `description`) |
| **`knowledge_base/by_name`** | 10005 | query (name in `selectionArgs[0]`) |
| `knowledge_base/*`, `knowledge_base/by_id/#`, `knowledge_base/update` | 10003, 10004, 10006 | query, update |
| `tags`, `knowledge/by_tag*`, `knowledge/add_tags/#`, `*/restore`, `knowledge/sync/state`, `knowledge/search/special_carousel` | various | refused |

`knowledge/search/by_keyword` and `knowledge/delete_synced_data` share the code 20020, and
`knowledge/search/by_source_type` and `knowledge/update_all_to_add_state` share 20021
(`:121-124`): the matcher keeps the first path it was given, so the later ones behave as the earlier
[inference from `UriMatcher`].

## 4. Tables and columns

Room schema, `db/KnowledgeDB_Impl.java:42-53` [source]:

- `knowledge`: `id`, `service_id`, `content`, `knowledge_base_unique_attribute`, `source_type`,
  `source_path`, `source_page`, `metadata`, `comment_str`, `comment_hand_write_name`,
  `handwrite_inner_name`, `data_md5`, `last_sync_data_md5`, `handwrite_md5`,
  `last_sync_handwrite_md5`, `state`, `sync_state`, `creation_time`, `last_modified_time`,
  `sync_lock`, `pending_sync`, `sort_page`.
- `knowledge_base` (a Digest collection): `id`, `unique_attribute`, `service_id`, `name`,
  `base_desc`, `data_md5`, `last_sync_data_md5`, `state`, `sync_state`, `creation_time`,
  `last_modified_time`, `sync_lock`, `pending_sync`.
- `knowledge_tag`, `knowledge_tag_relation`, `temp_sync_data`.

`state` 1 marks a deleted entry; every list query adds `state != 1` [source].

The query `knowledge` returns the raw table columns above. The item and lookup queries
(`knowledge/#`, `by_unique_identifier`, `by_knowledge_base`) return a rebuilt cursor with twelve
columns: `id`, `content`, `knowledge_base_unique_attribute`, `source_type`, `source_path` (made
absolute), `source_page`, `metadata`, `comment_str`, `handwrite_path`, `handwrite_md5`,
`creation_time`, `last_modified_time` (`KnowledgeContentProvider.java:847-886`) [source].

The `digest` table the earlier note and the adapter named (`digest_content`,
`digest_related_file_full_path` and so on) is the old database `/sdcard/.data/Document/DIGEST/digest.db`
that the app migrates from (`db/DigestDatabaseHelper.java:14-56`) [source]. The provider never
serves it.

## 5. The insert rules

`insert` on `knowledge/insert`, `KnowledgeContentProvider.java:335-430` [source]:

| Key | Rule |
| :--- | :--- |
| `content` | Required, not empty, at most 15,000 characters (`:336-342`) |
| `knowledge_base_unique_attribute` | Optional; when given it must name an existing collection, else `SQLException` (`:343-350`); absent means the default collection |
| `source_type` | Optional integer, default 0; 1 document, 2 note, 3 system pasteboard, 4 self add (`knowledgelib/constants/KnowledgeFieldNameConstants.java:37-41`) |
| `source_path` | Optional; a path under `/sdcard/Document`, `Note`, `MyStyle`, `EXPORT`, `SCREENSHOT` or `INBOX` is stored relative (`KnowledgeFieldNameConstants.java:54-69`) |
| `source_page` | Optional text |
| `metadata` | Optional JSON text; a missing `unique_identifier` key is generated (`:353-361`) |
| `comment_str` | Optional, at most 2,000 characters (`:365-372`) |
| `handwrite_path` | Optional path to an existing `.mark` file, which the provider moves into its private `DIGEST_MARK` folder (`:375-399`) |
| `creation_time`, `last_modified_time` | Optional milliseconds; 0 or absent means now (`:404-425`) |

The row is written with `state` 2 and `sync_state` 0 (`:426`), and the result is
`knowledge/insert/<id>` (`:540-544`) [source]. Any other key is ignored.

`metadata` lookups use `LIKE '%"unique_identifier":"' || ? || '"%'`
(`db/KnowledgeDao_Impl.java:1829`, `:1853`) [source]. So our `metadata` must be compact JSON with no
space after the colon (JavaScript's `JSON.stringify` writes it so), and the identifier must hold no
`%` or `_`, which `LIKE` reads as wildcards [inference].

`update` on `knowledge/update/by_unique_identifier` takes the identifier in the key
`knowledge_unique_identifier` (`KnowledgeContentProvider.java:942-955`,
`activity/KnowledgeDetailWrapperActivity.java:25`) and the same content keys and limits as insert,
and queues a sync task when something changed [source].

## 6. What a Saved item becomes

The list draws the source line from `source_type`: 1 and 2 show the file name and page, any other
value shows the string `knowledge_source_customs` (`adapter/KnowledgeListAdapter.java:88-95`)
[source]. So a Saved item is written as:

```text
uri                              content://com.ratta.supernote.knowledge.provider/knowledge/insert
content                          the title, a blank line, then the excerpt or note (cut to 15,000)
comment_str                      the page's address (cut to 2,000)
source_type                      4
knowledge_base_unique_attribute  the «Saved» collection, made once through knowledge_base
metadata                         {"unique_identifier":"inktools-saved-<hex id>"}
creation_time                    the time the item was saved, in ms
```

Before each insert the sync asks `knowledge/count/by_unique_identifier/<id>`; a count above zero
means the item is already there, and an edit goes through `knowledge/update/by_unique_identifier`
[inference from the rules above]. An item removed from the Saved source stays in the Digest, as the provider
refuses deletes.

## 7. Pictures

No column holds an image, and `knowledge/insert` reads no image key [source]. The only non-text
part is the handwriting `.mark` file, a Supernote stroke file, not a picture. A Saved item's picture
therefore cannot be stored in the Digest. Its address can go in `comment_str` with the source. A
`source_type` 1 entry whose `source_path` points at a picture file might open that file, but the
list then names it as a document page; that is untested [inference].

## 8. Cloud sync

Each insert calls `AutoSyncTaskManager.addKnowledgeTask(id, 1)` (`KnowledgeContentProvider.java:427-429`),
which queues the upload when the owner's auto sync is on and holds it while a full sync runs
(`worker/AutoSyncTaskManager.java:192-210`) [source]. A collection made through `knowledge_base`
queues its own task (`KnowledgeContentProvider.java:561-563`) [source]. So the native app pushes our
entries to Supernote Cloud, as the 2026-11-13 note on [#42](https://github.com/martonpaulo/ink-tools/issues/42) expected.

## 9. The adapter's descriptor was wrong

`packages/sn-adapter/src/internals/descriptor.json` named the old `digest` table at the path
`digest`, which the provider does not serve. Two fixes landed with this note:

- The `digest` module now names the `knowledge` table (path `knowledge`, read) and the insert path
  `knowledge/insert`.
- The probe never test-writes the Digest. Its dry insert writes a marked row and deletes it again;
  the provider refuses that delete to a plugin, so every probe would leave a marker entry in the
  owner's Digest and in Supernote Cloud. The Digest's write check is the device round below until
  a check exists that writes nothing.

## What a device round must confirm

1. A plugin `query` on `knowledge` returns rows with the columns in section 4.
2. A plugin `insert` on `knowledge/insert` with the row in section 6 returns
   `knowledge/insert/<id>`, and the entry shows in the Digest list with «custom source».
3. `knowledge/count/by_unique_identifier/<id>` then returns 1.
4. After auto sync, the entry is in Supernote Cloud.
5. The owner deletes the test entry on the tablet (a plugin cannot).

## Sources

- `jadx` output of the APK above, in the session scratch: `KnowledgeContentProvider.java`,
  `KnowledgeFieldNameConstants.java`, `KnowledgeDB_Impl.java`, `KnowledgeDao_Impl.java`,
  `KnowledgeListAdapter.java`, `AutoSyncTaskManager.java`, `DigestDatabaseHelper.java`,
  `FileManageProvider.java`, `AndroidManifest.xml`.
- Probe round of 2026-11-14 on [#42](https://github.com/martonpaulo/ink-tools/issues/42) and [#39](https://github.com/martonpaulo/ink-tools/issues/39) [measured].
