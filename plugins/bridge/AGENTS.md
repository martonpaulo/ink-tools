# Bridge — agent guidance

Scoped guidance for `plugins/bridge/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Scaffolded** ([#27](https://github.com/martonpaulo/supernote-tools/issues/27)): settings-only plugin shell (Settings entry, no note button), build to
`Bridge.snplg`, `npm run validate` green. Modules land with their own issues: sn-adapter ([#43](https://github.com/martonpaulo/supernote-tools/issues/43)),
calendar ([#28](https://github.com/martonpaulo/supernote-tools/issues/28), [#29](https://github.com/martonpaulo/supernote-tools/issues/29), [#30](https://github.com/martonpaulo/supernote-tools/issues/30)), to-do ([#44](https://github.com/martonpaulo/supernote-tools/issues/44)), Settings ([#40](https://github.com/martonpaulo/supernote-tools/issues/40)). Layers: `../../docs/architecture.md`; shared
code in `../../packages/`. Validate with `npm run validate`. CI consolidation: [#38](https://github.com/martonpaulo/supernote-tools/issues/38).

## What it is

A Supernote device plugin (React Native + `sn-plugin-lib`, pinned as the PluginHost runtime fixes
them, like `../ink2pic`) that syncs Google, iCloud (CalDAV) and ICS calendars with the **native**
Supernote Calendar via the `com.ratta.supernote.calendar.provider` content provider.

## Load-bearing facts (from device investigation, 2026-11-13)

- A plugin runs as the system user but **cannot** read another app's data dir — the framework guard
  blocks `File`, SQLite and native `Os.open`. So Bridge uses its **own** Google login, not
  the Supernote Calendar app's stored session.
- The calendar content provider is reachable with no plugin permission; events live in `data_info`
  with columns `id, calendarId, eventId, tag, state, readOnly, isAllDay, isSelf, title, content,
  startTime, endTime, startDate, endDate, lastModifiedTime, status, recurrence, recurringEventId,
  originalStartTime, originalStartDate`.
- Write aggregated events as `tag=task` rows (the native Google sync reads only `tag=event`, so our
  rows are shown but never re-synced or duplicated). Expand recurrences into per-day rows.
- The four plugin permissions are `FILE:READ`, `FILE:WRITE`, `FILE:DELETE`, `INTERNET`. Network is
  gated but grantable.
- Bridge declares only `INTERNET` and `FILE:READ` until a module writes a file ([#83](https://github.com/martonpaulo/supernote-tools/issues/83)); add `FILE:WRITE`
  with the first writer, such as the Settings storage of [#40](https://github.com/martonpaulo/supernote-tools/issues/40).
- The private design and reverse-engineering notes live in the workbench research folder.

## Reuse

Scaffold and patterns come from `../ink2pic` (same runtime, build and release shape).
