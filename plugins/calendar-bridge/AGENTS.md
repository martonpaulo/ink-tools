# Calendar Bridge — agent guidance

Scoped guidance for `plugins/calendar-bridge/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Pre-source.** The subproject is in planning; its full identity, Git/release policy and scaffold are
settled by its first issue (`area: calendar-bridge`, the setup issue), which runs `project-setup` and
`skd-project-scaffolding` for this folder. Until then, follow the root policy and the issues.

## What it is

A Supernote device plugin (React Native + `sn-plugin-lib`, pinned as the PluginHost runtime fixes
them, like `../ink2pic`) that syncs Google, iCloud (CalDAV) and ICS calendars with the **native**
Supernote Calendar via the `com.ratta.supernote.calendar.provider` content provider.

## Load-bearing facts (from device investigation, 2026-11-13)

- A plugin runs as the system user but **cannot** read another app's data dir — the framework guard
  blocks `File`, SQLite and native `Os.open`. So Calendar Bridge uses its **own** Google login, not
  the Supernote Calendar app's stored session.
- The calendar content provider is reachable with no plugin permission; events live in `data_info`
  with columns `id, calendarId, eventId, tag, state, readOnly, isAllDay, isSelf, title, content,
  startTime, endTime, startDate, endDate, lastModifiedTime, status, recurrence, recurringEventId,
  originalStartTime, originalStartDate`.
- Write aggregated events as `tag=task` rows (the native Google sync reads only `tag=event`, so our
  rows are shown but never re-synced or duplicated). Expand recurrences into per-day rows.
- The four plugin permissions are `FILE:READ`, `FILE:WRITE`, `FILE:DELETE`, `INTERNET`. Network is
  gated but grantable.
- The private design and reverse-engineering notes live in the workbench research folder.

## Reuse

Scaffold and patterns come from `../ink2pic` (same runtime, build and release shape).
