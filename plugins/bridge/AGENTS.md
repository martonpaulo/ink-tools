# Bridge — agent guidance

Scoped guidance for `plugins/bridge/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Scaffolded** ([#27](https://github.com/martonpaulo/supernote-tools/issues/27)): settings-only plugin shell (Settings entry, no note button), build to
`Bridge.snplg`, `npm run validate` green. Modules land with their own issues: sn-adapter ([#43](https://github.com/martonpaulo/supernote-tools/issues/43)),
calendar ([#28](https://github.com/martonpaulo/supernote-tools/issues/28), [#29](https://github.com/martonpaulo/supernote-tools/issues/29), [#30](https://github.com/martonpaulo/supernote-tools/issues/30)), to-do ([#44](https://github.com/martonpaulo/supernote-tools/issues/44)), Settings ([#40](https://github.com/martonpaulo/supernote-tools/issues/40)). Layers: `../../docs/architecture.md`; shared
code in `../../packages/`. Every size and colour of a screen comes from `@supernote-tools/ui-kit`, never a literal, and each screen's test runs its `screenBreaks` size rule ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)). Validate with `npm run validate`. CI consolidation: [#38](https://github.com/martonpaulo/supernote-tools/issues/38).

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
- **Permissions** ([#83](https://github.com/martonpaulo/ink-tools/issues/83)): each one Bridge declares names its user here;
  `__tests__/pluginConfig.test.ts` fails on one that is not listed.
  - `plugin.permission.INTERNET`: the calendar and to-do providers (Google, iCloud, ICS, Todoist).
  - `plugin.permission.FILE:READ`: the Settings file, `settings.json` in the private plugin folder
    ([#40](https://github.com/martonpaulo/ink-tools/issues/40)). Supernote's Plugin Permissions page says that folder needs no permission; it stays
    until a tablet round shows the read works without it.
  - No `FILE:WRITE`: the private folder needs none, and Bridge writes nothing in shared storage.
- **Settings storage** ([#40](https://github.com/martonpaulo/ink-tools/issues/40)): `settings.json` in the folder `getPluginDirPath()` returns, read
  and written through `BridgeFiles`, picture-search's file module under Bridge's name, built by
  `scripts/native-build.cjs` as Lookup's is. No file is the default settings; an unreadable one is
  an error on the screen, never a silent reset.
- **Sign-in secrets** ([#90](https://github.com/martonpaulo/supernote-tools/issues/90), owner D16 A): one file per provider (`secretFileName` in
  `packages/sync-core/src/secrets.ts`) in Bridge's private plugin folder. Settings shows only the
  last four characters and a «Sign out» per provider, confirmed once more, that deletes the file.
  Entry route per provider, the same for each: **Todoist** API token, **iCloud** app-specific
  password and **Google** refresh token (its sign-in is [#64](https://github.com/martonpaulo/supernote-tools/issues/64)) all come from the Mac with
  `inkctl secret set <provider>` ([#116](https://github.com/martonpaulo/ink-tools/issues/116)): built and tested against a fake `adb`,
  not yet run on the tablet; the probe round still measures the folder's path and whether ADB can
  write it. An on-tablet field and a file edited on
  a computer are later routes, writers of the same file; a file in `MyStyle/` is never one, as it
  syncs to Supernote Cloud ([#23](https://github.com/martonpaulo/supernote-tools/issues/23)).
- **On the Mac, the secrets wait in the login Keychain** (owner, 2026-11-16, [#30](https://github.com/martonpaulo/supernote-tools/issues/30), [#44](https://github.com/martonpaulo/supernote-tools/issues/44)): service
  `ink-tools`, accounts `account-sync-todoist-token`, `account-sync-icloud-apple-id`,
  `account-sync-icloud-password` and, once the Google sign-in runs, the Google refresh token.
  An agent pipes each one from there into `inkctl secret set <provider>`, which reads standard
  input ([#116](https://github.com/martonpaulo/supernote-tools/issues/116)); no secret goes into an argument or a file.
- **Google sign-in client** ([#124](https://github.com/martonpaulo/supernote-tools/issues/124)): the OAuth client created for the device-code flow is of the «TVs and
  Limited Input devices» type, which has no redirect URIs, so the loopback sign-in of
  `inkctl google login` needs a new client of the «Desktop app» type in the same Google Cloud
  project; the owner creates it. While the consent screen stays in «Testing», each refresh
  token lasts 7 days and the owner signs in again; publishing the app is a ROADMAP item.
- The private design and reverse-engineering notes live in the workbench research folder.

## Reuse

Scaffold and patterns come from `../ink2pic` (same runtime, build and release shape).
