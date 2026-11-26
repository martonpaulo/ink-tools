# Security

The monorepo's security rules that every subproject shares. The retired picture plugin's answer to
each item of the application-security standard is archived in
[`research/plugin-brief/security.md`](research/plugin-brief/security.md) ([#288](https://github.com/martonpaulo/ink-tools/issues/288)).

## Dependency audit

The weekly `Scan` workflow runs [`scripts/npm_audit.py`](../scripts/npm_audit.py) in every plugin and
in `packages/`. It runs `npm audit --omit=dev` and fails on every advisory, whatever its severity,
except the ones [`audit-exceptions.json`](../audit-exceptions.json) names
([#154](https://github.com/martonpaulo/ink-tools/issues/154)).

- A dependency gets fixed by an upgrade first: a patch release, then an `overrides` entry, only when
  React Native 0.79.2 and the build stay unchanged. PluginHost on the tablet fixes that React Native
  version.
- An exception is allowed only when no fixed version fits React Native 0.79.2. It names one advisory
  and the package it reaches, with its reason.
- Every exception today is in the React Native build tooling (the CLI and Metro). That code runs on
  the developer's machine and in CI on the project's own files. It is never packaged in a `.snplg`
  and never runs on the tablet.
- Remove an exception as soon as a fix fits. When React Native moves past 0.79.2, re-run the audit
  and remove each entry it no longer reports.

To check one subproject on the Mac:

```bash
python3 scripts/npm_audit.py plugins/lasso-actions
```

## Native file paths

The shared native file and image modules of `packages/picture-search` touch only the plugin's own
folders (owner, 2026-11-26, [#302](https://github.com/martonpaulo/ink-tools/issues/302)): its private
folder, `EXPORT` and its own folder under `MyStyle`, plus a folder of its own the plugin names, such
as Account Sync's sign-in drop folder. `SafePaths.Roots` refuses every other path with
`OUTSIDE_ROOTS`, after it refuses an empty, `.` or `..` segment with `BAD_PATH` and resolves every
link, so a link out of a folder is refused too. Each plugin's package names its folders; the
registry item `pluginhost.file-sandbox` holds the device's folder names.

## Wi-Fi ADB after a restart

The route the owner chose for [#1](https://github.com/martonpaulo/ink-tools/issues/1) (Inbox D74 A, 2026-11-25) keeps Wi-Fi ADB on
across restarts, with no USB cable:

- Only the Ink Tools Helper holds `WRITE_SECURE_SETTINGS`, granted once by the owner with
  `adb shell pm grant` over the cable. Its boot receiver runs only on boot and writes only
  `adb_wifi_enabled`.
- The exposure the owner accepted: the Manta's ADB asks no computer for authorization
  (`ro.adb.secure` is 0, firmware Chauvet.E103.2610191001.2559), so while Wireless debugging is on,
  any computer on the home Wi-Fi can read and delete every note and install apps. It is on from each
  boot until it is turned off in Settings › Developer options.
- `inkctl` follows a port from `adb mdns services` only when the row's address is exactly the stored
  one, so another device's announcement cannot redirect its commands. The run log masks the new
  address as it masks the stored one.
- To close it: turn Wireless debugging off, and revoke the grant with
  `adb shell pm revoke com.martonpaulo.inktools.bridge android.permission.WRITE_SECURE_SETTINGS`.

## Android signing keys

The Ink Tools Helper prerelease signs its APK with one stable key, so each build updates the last
one on the tablet ([#223](https://github.com/martonpaulo/ink-tools/issues/223)). The rule and the fallback are in
[`apps/ink-tools-helper/AGENTS.md`](../apps/ink-tools-helper/AGENTS.md#versioning-and-signing).

- The keystore and its password are two repository secrets, `INKTOOLS_BRIDGE_KEYSTORE_BASE64` and
  `INKTOOLS_BRIDGE_KEYSTORE_PASSWORD`. Only `prerelease-ink-tools-helper.yml` reads them, in the
  env of its build step. It runs on a push to `main` or by hand, never on a pull request, so a
  fork never reaches them. No validate workflow reads a stored secret.
- The keystore is decoded under `RUNNER_TEMP`, outside the checkout, and removed after the build.
  The password reaches apksigner by variable name, never on a command line or in the log.
- It is a test key for a sideloaded developer app, not a release key. A leaked key lets someone
  sign an APK that updates the bridge, which still needs `adb` on the tablet. To rotate it, make a
  new keystore, set both secrets again and uninstall the bridge once on the tablet.
- The Lingo app has no prerelease: its CI build is never installed, so its per-run debug key needs
  no secret.

## Account Sync sign-in secrets

Account Sync's sign-in secrets wait on the Mac in the login Keychain, service `ink-tools`, and reach
the tablet only through `inkctl secret set <provider>`, which reads standard input. Each account is
the secret's name and each item's comment is its description: what uses it, where the value lives,
how to rotate it ([#277](https://github.com/martonpaulo/ink-tools/issues/277)). `inkctl` writes the Google comments itself.

| Account | What uses it | To rotate |
| :--- | :--- | :--- |
| `ACCOUNT_SYNC_TODOIST_TOKEN` | Todoist tasks, through `inkctl secret set todoist`; the test project of `inkctl sandbox todoist` ([#297](https://github.com/martonpaulo/ink-tools/issues/297)) | Regenerate it in Todoist Settings › Integrations › Developer, store it here, send it again. |
| `ACCOUNT_SYNC_ICLOUD_APPLE_ID` | The iCloud CalDAV sign-in, through `inkctl secret set icloud` | It changes only with the Apple ID; store the new one here, send it again. |
| `ACCOUNT_SYNC_ICLOUD_PASSWORD` | The iCloud CalDAV sign-in (an app-specific password), through `inkctl secret set icloud`, which takes `<Apple ID>:<password>` from the two items on one line ([#30](https://github.com/martonpaulo/ink-tools/issues/30)) | Revoke it at account.apple.com, create a new one, store it here, send it again. |
| `ACCOUNT_SYNC_GOOGLE_OAUTH_CLIENT` | `inkctl google login` and `inkctl secret set google-client` | Create a new «Desktop app» client in the Google Cloud console, store its JSON here, delete the old client the same day. |
| `ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN` | Written by `inkctl google login`, sent by `inkctl secret set google`; with `calendar.app.created`, `inkctl sandbox google` makes and deletes only the calendars it made ([#297](https://github.com/martonpaulo/ink-tools/issues/297)) | Revoke it at myaccount.google.com/permissions, then run `inkctl google login`. The Google app is published, so the token does not expire after 7 days ([#372](https://github.com/martonpaulo/ink-tools/issues/372)); the consent screen shows «Google hasn't verified this app», and the app is capped at 100 users. |
