# Bridge — agent guidance

Scoped guidance for `plugins/account-sync/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Scaffolded** ([#27](https://github.com/martonpaulo/supernote-tools/issues/27)): settings-only plugin shell (Settings entry, no note button), build to
`Bridge.snplg`, `npm run validate` green. Modules land with their own issues: sn-adapter ([#43](https://github.com/martonpaulo/supernote-tools/issues/43)),
calendar ([#28](https://github.com/martonpaulo/supernote-tools/issues/28), [#29](https://github.com/martonpaulo/supernote-tools/issues/29), [#30](https://github.com/martonpaulo/supernote-tools/issues/30)), to-do ([#44](https://github.com/martonpaulo/supernote-tools/issues/44)), Settings ([#40](https://github.com/martonpaulo/supernote-tools/issues/40)). Layers: `../../docs/architecture.md`; shared
code in `../../packages/`. Every size and colour of a screen comes from `@ink-tools/ui-kit`, never a literal, and each screen's test runs its `screenBreaks` size rule ([#93](https://github.com/martonpaulo/supernote-tools/issues/93)). Validate with `npm run validate`. CI consolidation: [#38](https://github.com/martonpaulo/supernote-tools/issues/38).

## What it is

A Supernote device plugin (React Native + `sn-plugin-lib`, pinned as the PluginHost runtime fixes
them, like every plugin here) that syncs Google, iCloud (CalDAV) and ICS calendars with the **native**
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
  - `plugin.permission.FILE:DELETE`: the sign-in drop file in `SECRET_DROP_FOLDER`, shared storage,
    deleted once its secret is moved in ([#116](https://github.com/martonpaulo/ink-tools/issues/116)). Without it the host refused the delete
    (`has no DELETE permission`, beta 7), so the secret stayed in shared storage.
  - No `FILE:WRITE`: the private folder needs none (beta 7 saved the moved secret there with only
    `FILE:READ`), and Bridge writes nothing in shared storage. `__tests__/secretStore.test.ts`
    checks that the permissions cover every file call the secrets mover makes.
- **Settings storage** ([#40](https://github.com/martonpaulo/ink-tools/issues/40)): `settings.json` in the folder `getPluginDirPath()` returns, read
  and written through `BridgeFiles`, picture-search's file module under Bridge's name, built by
  `scripts/native-build.cjs` as Lookup's is. No file is the default settings; an unreadable one is
  an error on the screen, never a silent reset.
- **Device probe** ([#43](https://github.com/martonpaulo/ink-tools/issues/43)): `BridgeProviders`, a Java module beside `BridgeFiles`, is sn-adapter's
  `DeviceReader` over ContentResolver (`src/deviceReader.ts`); every URI and column comes from the
  descriptor. The probe never inserts: its test write is an update selected by `id = -1`, which
  matches no row; a refused update is «cannot write». Only a sync pass probes, only the modules
  that are on, and a module it clears is not probed again while the host lives; the load pass and a
  Settings open never probe, and Settings shows the last pass's answer. A module it does not clear
  stays blocked with the reason.
- **Sync runner** ([#28](https://github.com/martonpaulo/ink-tools/issues/28), [#44](https://github.com/martonpaulo/ink-tools/issues/44)): `src/sync.ts` runs sync-core's `runBridgeSync`, one
  pass when PluginHost loads Bridge (`index.js`), one every `AUTO_SYNC_MINUTES` while the host
  lives, and the same runner behind Settings' «Sync now». The load pass moves the sign-in drops in
  and runs nothing, since it never probes. The Calendar and To-Do are written through
  `BridgeProviders`' query, insert, update and delete (`src/deviceRows.ts`, `src/deviceStores.ts`);
  a Calendar event is removed by `status='cancelled'`, never a delete, which that provider ignores. The Google OAuth client is its own file,
  `google-client.secret`, from `inkctl secret set google-client` ([#200](https://github.com/martonpaulo/ink-tools/issues/200)); iCloud reads the `icloud` sign-in, `<Apple ID>:<app-specific password>`, finds its calendars by CalDAV discovery from `services.json`'s `icloudCalDav` each pass and gets the CalDAV writer; ICS reads the `icsFeeds` addresses in `settings.json`, read-only ([#30](https://github.com/martonpaulo/ink-tools/issues/30)). No Settings field adds a feed yet. Not yet run on the tablet.
  A module's first pass only pulls: tablet-only items stay local unless its «Send tablet-only items»
  switch is on ([#207](https://github.com/martonpaulo/ink-tools/issues/207), an assumption the owner may override).
- **Digest writer** ([#42](https://github.com/martonpaulo/ink-tools/issues/42)): `src/digestStore.ts` writes `DigestEntry` items into the
  tablet's Digest over the same `BridgeProviders` calls, counted by identifier, then inserted or
  updated, never deleted (the provider refuses a plugin's delete); paths and rules are in
  `../../docs/research/2026-11-digest-provider.md`. No Saved source, «Saved» collection or Settings
  switch calls it yet. Not yet run on the tablet.
- **Sign-in secrets** ([#90](https://github.com/martonpaulo/supernote-tools/issues/90), owner D16 A): one file per provider (`secretFileName` in
  `packages/sync-core/src/secrets.ts`) in Bridge's private plugin folder. Settings shows only the
  last four characters and a «Sign out» per provider, confirmed once more, that deletes the file.
  **Todoist** API token, **iCloud** app-specific password and **Google** refresh token (its
  sign-in is [#64](https://github.com/martonpaulo/supernote-tools/issues/64)) all come from the Mac with `inkctl secret set <provider>`
  ([#116](https://github.com/martonpaulo/ink-tools/issues/116)). `adb` cannot write the private folder, so the value arrives as a one-shot drop
  file in `SECRET_DROP_FOLDER` (`src/secretStore.ts`, hidden, unsynced, allowed by the plugin file
  guard); each sync pass, at start and on «Sync now», moves it in and deletes the drop file at once
  (an assumption the owner may override, [`docs/decisions.md`](../../docs/decisions.md#decision-index)). Not yet run on the
  tablet. A file in `MyStyle/` is never a route, as it syncs to Supernote Cloud ([#23](https://github.com/martonpaulo/supernote-tools/issues/23)).
- **On the Mac, the secrets wait in the login Keychain** (owner, 2026-11-16, [#30](https://github.com/martonpaulo/supernote-tools/issues/30), [#44](https://github.com/martonpaulo/supernote-tools/issues/44)): service
  `ink-tools`, one account per secret, named and described in
  [Account Sync sign-in secrets](../../docs/security.md#account-sync-sign-in-secrets) ([#277](https://github.com/martonpaulo/ink-tools/issues/277)).
  An agent pipes each one from there into `inkctl secret set <provider>`, which reads standard
  input ([#116](https://github.com/martonpaulo/supernote-tools/issues/116)); no secret goes into an argument or a file.
- **Google sign-in client** ([#124](https://github.com/martonpaulo/supernote-tools/issues/124)): the OAuth client created for the device-code flow is of the «TVs and
  Limited Input devices» type, which has no redirect URIs, so the loopback sign-in of
  `inkctl google login` needs a new client of the «Desktop app» type in the same Google Cloud
  project; the owner creates it. While the consent screen stays in «Testing», each refresh
  token lasts 7 days and the owner signs in again; publishing the app is a ROADMAP item.
- The private design and reverse-engineering notes live in the workbench research folder.

## Reuse

Scaffold and patterns come from the first plugin, removed in [#288](https://github.com/martonpaulo/ink-tools/issues/288) (same runtime, build and release shape).
