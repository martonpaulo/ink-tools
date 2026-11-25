# Ink Tools Bridge — agent guidance

Scoped guidance for `apps/inktools-bridge/`. Inherits the repository root `../../AGENTS.md`. A
`CLAUDE.md` symlink points at this file.

## What it is

A small sideloaded Android app with no screen ([#215](https://github.com/martonpaulo/ink-tools/issues/215)). It lets `inkctl` install, enable,
disable and permit plugins without the tablet's screen. PluginHost exports an AIDL service,
`com.ratta.supernote.pluginhost/.services.PluginSettingService` (`IPluginSetting`), with no
permission guard, but `adb` cannot call an app's binder: `installPlugin` reports through a callback
binder PluginHost links a death recipient to, so a live process must hold it. This app is that
process. The study is [`../../docs/research/2026-11-pluginhost-control.md`](../../docs/research/2026-11-pluginhost-control.md).

The folder, gate, workflow and tag say `inktools-bridge`, its feature name, as every subproject
folder does ([#194](https://github.com/martonpaulo/ink-tools/issues/194)). The package is `com.martonpaulo.inktools.bridge`, the owner's rule for
new apps; never rename it.

## The trigger

One ordered broadcast per call. `am` waits for it and prints the result code and data, which
`inkctl` reads (`BRIDGE_RESULTS` in `cli/inkctl/src/inkctl`):

```sh
adb shell am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op ping
adb shell am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op install --es path /sdcard/MyStyle/X.snplg
adb shell am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op enable --es pluginID ID
adb shell am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op allow --es pluginID ID --es perm plugin.permission.FILE:READ,plugin.permission.FILE:WRITE --ei status 2
```

- `-f 32` is `FLAG_INCLUDE_STOPPED_PACKAGES`: an app never opened is «stopped» and gets no
  broadcast without it.
- Ops: `ping`, `install`, `enable`, `disable`, `uninstall`, `allow` (`Command`). `allow` sets
  `status`, by default 2, «Always Allow».
- Result codes (`Outcome`): 1 ok, 2 failed, 3 usage, 4 PluginHost unreachable, 5 no callback in
  50 s. 0 is never used: `am` prints `result=0` when no receiver ran, so `inkctl` reads it as an
  absent bridge.
- The data is one line: the word, then PluginHost's callback and its arguments, such as
  `ok onSuccess PluginInfo{…}` or `failed onFailed PluginError{…}`.
- Each call logs under the tag `InkToolsBridge`.

## How a call is made

- `HostCalls` owns the wire: the descriptor, the transaction codes (`installPlugin` 1,
  `uninstallPlugin` 5, `setPluginEnable` 6, `updatePluginPermissions` 9) and the argument order,
  written as AIDL writes them. Its JVM test pins every one.
- The body of a `PluginInfo` or a `PluginPermission` is written by PluginHost's own class:
  `HostClasses` loads PluginHost's code (`createPackageContext` with `CONTEXT_INCLUDE_CODE`), finds
  the classes from the `IPluginSetting` method signatures, sets only the fields [#215](https://github.com/martonpaulo/ink-tools/issues/215) names
  (`pluginID`, `enable`; `name`, `status`) and calls their `writeToParcel`. So no decompiled
  layout is copied into this repository, and a PluginHost update that reorders fields still works.
- The callback is a plain `Binder` under PluginHost's callback descriptor. Its method names come
  from PluginHost's generated `Stub` constants (`Callbacks`); without them, code 1 is success.
- No `.aidl` file is compiled: the four calls are written by hand, which keeps the build to
  `javac` and D8 and lets the JVM tests check the encoding.

## Security

- The receiver is exported for the shell and guarded by `android.permission.DUMP`, which the shell
  holds and no installed app can get. So the bridge adds no route for another app; PluginHost's
  service is already open to every app.
- The app asks for no permission. PluginHost opens the `.snplg` path itself, so only a path under
  `/sdcard` is accepted, and an id or a permission name holds no shell character.
- Loading PluginHost's code into this process is the price of its exact parcel layout; the app
  never runs other PluginHost code.

## Build and test

The Lingo app's toolchain, reused, not copied: `../handwriting-language/scripts/toolchain.sh` (pinned
build-tools and platform) and `../handwriting-language/scripts/host-tools.cjs` (the JDK finder).

```sh
node scripts/build.cjs --test   # JVM tests (call encoding, command parsing, field access), signing-key choice
node scripts/build.cjs          # build/outputs/inktools-bridge-<version>.apk, signed and verified
```

- The gate (`gates.json` › `inktools-bridge`, CI `validate-inktools-bridge.yml`) runs both, also
  when the Lingo app's toolchain changes.
- `javac -Werror`: a new warning fails the build. The build fails when the APK's package is not
  `com.martonpaulo.inktools.bridge`, when it has no icon, or when it has a launcher entry (the
  Handwriting Language build's `badgingProblems`, tested in `scripts/badging.test.cjs`).
- The one resource is the icon, `res/drawable/ic_launcher.xml`, a vector in the Ink Tools style
  ([#260](https://github.com/martonpaulo/ink-tools/issues/260)): the app has no screen, but
  Settings › Apps › Customize Sidebar lists every app package with its icon.
- Logic with no Android import goes in `HostCalls`, `Command`, `Outcome`, `Fields` or
  `Callbacks` and gets a JVM test; `Bridge`, `HostClasses` and `CommandReceiver` stay thin.

## Versioning and signing

- SemVer with a numbered beta, as root `AGENTS.md` › Product versioning sets: `app.json` `version`
  gives the `versionName`; `versionCode` rises on every build sent to the tablet.
- `prerelease-inktools-bridge.yml` publishes `inktools-bridge-v<version>` with the APK when a push
  to `main` changes `app.json` and the tag does not exist yet.
- The stable key ([#223](https://github.com/martonpaulo/ink-tools/issues/223)): `build.cjs` signs with the PKCS12 keystore that
  `INKTOOLS_BRIDGE_KEYSTORE` names, alias `inktools-bridge`, password in
  `INKTOOLS_BRIDGE_KEYSTORE_PASSWORD`, passed to apksigner by name (`env:`), never as an argument.
  The prerelease workflow decodes the `INKTOOLS_BRIDGE_KEYSTORE_BASE64` repository secret into
  `RUNNER_TEMP`, outside the checkout, and removes it after the build. So each prerelease updates
  the last one with `adb install -r`. A keystore without its password, or a missing file, fails the
  build.
- Without the stable key, the APK is signed with a debug key made in `.toolchain/`, outside Git, and
  the prerelease prints a notice. Each checkout and each CI run then has another key, so the tablet
  needs `adb uninstall com.martonpaulo.inktools.bridge` before a build from another key, and once
  when it moves to the stable key. The validate workflow never reads the secrets, so it always uses
  the debug key.
- The owner makes the stable key once on the Mac and stores it with `gh secret set`; the keystore
  itself stays in the encrypted disk image the credential naming rule names, never in Git.

## Device check

Run on the tablet on 2026-11-17 ([#215](https://github.com/martonpaulo/ink-tools/issues/215), [#214](https://github.com/martonpaulo/ink-tools/issues/214)): `inkctl plugin list`, `install`, `enable`,
`disable` and `allow` worked through the bridge, each proven by `inkctl plugin list` and the
single-plugin row. Their times are in `../../docs/supernote.md` › Plugins. An install can answer
`failed` and still land ([#225](https://github.com/martonpaulo/ink-tools/issues/225)), so the plugin list, not the answer, is the proof.
