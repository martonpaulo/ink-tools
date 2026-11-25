# Plugin Diagnostics

The tablet shows it as «Plugin Diagnostics»; `probe` stays its internal name, and the folder is `plugin-diagnostics` ([#194](https://github.com/martonpaulo/ink-tools/issues/194) ([#176](https://github.com/martonpaulo/ink-tools/issues/176)).

A permanent, developer-only Supernote plugin for quick on-device experiments. It is not shipped to
users and has no release; its `.snplg` is a developer prerelease (`plugin-diagnostics-v<version>`; tags made before [#194](https://github.com/martonpaulo/ink-tools/issues/194) start with `probe-v`, workflow `prerelease-plugin-diagnostics.yml`, published when `PluginConfig.json` changes on `main`; raise `versionCode` for a new build), never a user release.

Same runtime and pinned versions as [`../ink2pic`](../ink2pic): React Native 0.79.2 and `sn-plugin-lib`
0.2.3. It registers the plugin Settings entry (like [`../account-sync`](../account-sync)) and one note sidebar button,
«Run Command», which `inkctl` presses to write ink and lasso with no pen (see below).

## The loop

1. Edit `probeBody` in `src/probe.ts`. It is the one place for a one-off probe and runs when you press
   «Run Probe» in Probe's view.
2. Build: `npm install && npm run build` writes `build/outputs/Probe.snplg`, with the native module
   (`app.npk`) inside. CI builds the same package and checks it holds `app.npk`. The build runs `bash buildPlugin.sh`
   (the JS package; it always skips its own Gradle step, because this plugin has no `android/` folder)
   and then `node scripts/native-build.cjs --package`, the light javac + D8 + aapt2 build that Ink2Pic
   uses, which adds `app.npk` and the `reactPackages` entry. `npm run test:native` runs its JVM tests.
3. Install it with `inkctl plugin install`, then open Probe in the plugin Settings and press «Run Probe».
4. Read the result in the view, or in logcat (see below).

Check before you trust a result: run `npm run validate` (lint, typecheck, tests).

## The command button for inkctl ([#148](https://github.com/martonpaulo/ink-tools/issues/148))

`inkctl ink write`, `ink strokes`, `ink save`, `lasso rect`, `lasso last-insert`, `note open --page`
and `fixture` push one JSON
command to `MyStyle/Probe/command.json`, press «Run Command» in the open note, and read the answer
Probe logs as `SNPROBE answer <id> <n>/<count> <json>` under `ReactNativeJS`. `src/helper.ts` runs
the command (`insertPageElements`, `lassoElements`, `getLastElement`, `getLassoElements`, `jumpToPage`,
then `getCurrentPageNum` as proof, [#220](https://github.com/martonpaulo/ink-tools/issues/220)); the CLI
owns every rule. The sticker and file ops (`saveSticker`, `insertSticker`, `readLassoRect`, `resizeLasso`,
`listFiles`, `deleteFile`) measure the host for Collection ([#249](https://github.com/martonpaulo/ink-tools/issues/249)) and have no inkctl command yet. The note calls need `FILE:READ` and `FILE:WRITE` on «Always Allow».

## The Digest-provider probe ([#59](https://github.com/martonpaulo/supernote-tools/issues/59))

The default probe asks one question for [#42](https://github.com/martonpaulo/supernote-tools/issues/42):
can a plugin reach the Digest (Knowledge) provider that `adb` is denied? The native module
`ProbeProviders` (`native/src/com/probe/providers/`) runs, for each target:

- a `ContentResolver.query`, and
- a dry `insert` of one row marked `SNPROBE dry insert`, then a `delete` that removes only rows
  carrying that marker.

Targets: `content://com.ratta.supernote.knowledge.provider` (root) and `.../digest`, plus the
known-open task (`tasks_table`) and calendar (`data_info`) providers as controls. If the controls
answer and the Digest provider does not, the cause is its `READ_KNOWLEDGE` / `WRITE_KNOWLEDGE`
permissions, not the plumbing. A control insert may be refused for missing columns; that is a
result, not a permission failure. Lines name the target and the outcome, never a row's value.

Read the result after you open Probe from the plugin Settings:

```bash
adb logcat -s SNPROBE
```

Each line reads `<target> <query|insert|delete-marked> OK <detail>`, `DENIED SecurityException: <message>`
or `FAILED <ExceptionClass>: <message>`. The revert deletes the new row, and every older marked row, by its
row id ([#213](https://github.com/martonpaulo/ink-tools/issues/213)); the Calendar's delete removes nothing on the tablet, so for `control-calendar` it sets `status` to `cancelled` instead, as Account Sync does ([#208](https://github.com/martonpaulo/ink-tools/issues/208)). A `LEFTOVER` line means a marked row may remain: delete the
rows whose marker column equals `SNPROBE dry insert`. After the three results the module logs a
`heartbeat` line every 5 seconds for about 30 seconds: close the plugin view and watch whether the lines
go on (the bridge background-lifecycle question).
