# Supernote internals and hard-coded values: the 2026-11-25 inventories

Status: research, 2026-11-25. Two read-only audits of the repository. The lists drive
[#293](https://github.com/martonpaulo/ink-tools/issues/293) (firmware watch), [#294](https://github.com/martonpaulo/ink-tools/issues/294) (registry of internals) and
[#295](https://github.com/martonpaulo/ink-tools/issues/295) (one owner per value); each issue body carries the full list.

## Contents

- [Internals](#internals)
- [Hard-coded values](#hard-coded-values)

## Internals

44 dependencies on 43 distinct Supernote internals across 13 subprojects; 17 had no detector.
Not counted: Android public APIs, LocalSend, Google, Todoist and iCloud, ADB, and facts in
`docs/supernote.md` that no code uses.

| Where | Count | Main internals |
| :--- | :--- | :--- |
| `packages/sn-adapter` | 8 | Calendar provider columns and the Calendar app's reading rules (`tag=task`, cancelled for delete, `startDate` format, empty `eventId`); To-Do columns and row rules (`deleted`, `hasSync`, Inbox list, soft delete); Digest provider; pen-up digitizer units; at most 4 element reads at once; `unregisterButton` of an unknown id hangs |
| `packages/ui-kit` | 2 | No `hardwareBackPress` from PluginHost; tokens measured from `com.ratta.settings` |
| `packages/picture-search` | 2 | Cloud conflict folder name; PluginHost file sandbox rules |
| Account Sync | 2 | Sign-in drop folder; To-Do twin repair assumptions |
| Smart Shapes | 1 | `penType` 4 lasso, 16 pen |
| Real-Time Conversion | 1 | Pen-up uuid differs from `getElements`; `recognizeElements` takes page elements only |
| Image Editing | 3 | Back key through the overlay window; Crop and Erase element facts; inserted PNG copied into `.data/plugin/` |
| Device Transfer | 1 | `insertImage` floating selection committed later |
| Plugin Diagnostics | 2 | Provider probes; the `command.json` and `SNPROBE` helper channel |
| Handwriting Language | 4 | Language file in `/sdcard/.data/dictionary/default/`; `hw_type_change`; Settings deep link `HWLanguageSetting`; writing screens by activity name |
| InkTools Bridge | 4 | Private `PluginSettingService`; hard-coded interface numbers 1, 5, 6, 9 (5 is uninstall, never checked against the host); PluginHost classes by reflection; permission status values |
| inkctl | 12 | PluginHost plugin list provider; Note activity and extras; install and detail screens by text; Note screen ids; Calendar sync broadcast; To-Do sync trigger row; language folder; `MyStyle/fonts`; `ro.product.board`; Ratta's change-log page; log tags |
| Ink Notebook Editor | 2 | The `.note` format and version allow-list; `NoteWriter` byte edit |

Highest risk: the Bridge's unchecked interface numbers; the Calendar and To-Do reading rules and
the twin repair (rows hidden or a real task soft-deleted with no error); the language file and the
screen automation labels.

## Hard-coded values

52 values each tool writes for itself. The DRY guard missed them: `scripts/dry_check.py` reads no
Java and no Swift (`.swift` is listed with no reader), exempts UPPER_CASE constants, sees repeated
phrases only within one language, and `dry-check.json` has no twins rules; `scripts/boundaries.py`
skips inkctl.

| Category | Count |
| :--- | :--- |
| Device facts (page size in 4 tools, DPI 300 vs 299, pen ids, `TOP_PX`, Android API level) | 11 |
| Visual values outside tokens (page-text typography copied in 3 plugins and inkctl) | 6 |
| User copy outside copy modules | 7 |
| Timeouts, limits, URLs (LocalSend path and 64 KiB in TS and 4 Java files, Google API base and scopes) | 10 |
| The same value in several places (SDK button enums in 5 plugins, the Plugin Diagnostics ↔ inkctl contract, native module names) | 9 |
| Versions and ids by hand (`pluginKey` ×4 per plugin, stale README versions) | 5 |
| Other (pen ids and SDK enums past the `sdk` rule, host error codes) | 4 |

Already sound: `tokens.json` → `metrics.ts` and `android-tokens.cjs`; `plugin-version.cjs` for
versions; LocalSend port and protocol in `protocol.ts`; picture-search's own twins file.
