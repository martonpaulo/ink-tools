# PluginHost control: driving plugins from the Mac over adb, without the screen

Status: research for [#214](https://github.com/martonpaulo/ink-tools/issues/214), 2026-11-17.
Static analysis on the Mac; one read-only command was run on the owner's Manta. No state-changing
command was run from this lane (the tablet was held by another round).

Question: which non-visual (no UI tapping) routes exist to drive the Supernote Manta's plugin
system and notes from the Mac over `adb` — install or upgrade a `.snplg`, set permissions to
«Always Allow», enable or disable a plugin, trigger a plugin button, open or redraw a note, and
read plugin or note state.

Targets, pulled read-only from the owner's Manta (serial withheld, build
`Chauvet.E103.2610191001.2559_release`) and decompiled with `jadx`:

- `com.ratta.supernote.pluginhost` (PluginHost), `versionName` 1.00.2610150, `versionCode`
  1002610150, `targetSdk` 35, runs as `android.uid.system`. APK SHA-256
  `7ca3419e608bbc6049cacfa4d86e0ecb616aae0cab1e511ed3c0eb559837a37f`.
- `com.ratta.settings` (SupernoteSetting): the plugin Settings UI and the plugin client library
  `com.ratta.supernote.pluginclient`.
- `com.ratta.supernote.note` (SupernoteNote).

Decompiled vendor code stays in the session scratch and is never committed; each citation gives the
decompiled file and line. Marks, as in [`../supernote.md`](../supernote.md): **[source]** read in
the decompiled app; **[measured]** on the tablet; **[inference]** reasoned, not run.

## Contents

- [Answer in short](#answer-in-short)
- [1. Read plugin state (proven, read-only)](#1-read-plugin-state-proven-read-only)
- [2. Install, enable and permissions: the AIDL service](#2-install-enable-and-permissions-the-aidl-service)
- [3. The exported components, and why most are dead ends](#3-the-exported-components-and-why-most-are-dead-ends)
- [4. Trigger the handwriting Sticker side button by intent](#4-trigger-the-handwriting-sticker-side-button-by-intent)
- [5. Log tags, debug flag, host reload](#5-log-tags-debug-flag-host-reload)
- [What a device round must confirm](#what-a-device-round-must-confirm)
- [Sources](#sources)

## Answer in short

- **Reading plugin state needs no UI and no helper.** The exported `PluginsContentProvider` answers
  a read-only `content query` for the whole plugin list — `pluginID`, name, version, `enable`,
  `bundlePath`, `pluginPath`, `md5` and `usesPermissions` (with each permission's `status`). This
  was run on the tablet. **[measured]**
- **Install, enable/disable and permission changes have no `adb` one-liner.** Every mutation goes
  through the AIDL binder `IPluginSetting`, exposed by the exported service `PluginSettingService`.
  `am`/`content`/`service call` cannot drive an app AIDL binder, and `installPlugin` needs a live
  callback binder. The route is a tiny signed helper app that binds the service and is triggered by
  `am`. The service has **no permission guard**, so any app on the device can bind it. **[source]**
- **The `installPlugin(path, callback)` call reads an arbitrary filesystem path** (`new File(path)`),
  so a `.snplg` already at `/sdcard/MyStyle/X.snplg` installs or upgrades with no copy into private
  storage. **[source]**
- **Triggering a plugin button by intent works only for the hardcoded handwriting Sticker plugin**
  (`pluginID a5db6166e8fe8e17`), through the exported `PluginHostService`. There is no general
  intent to press any plugin's sidebar, lasso or Run Command button. **[source]**
- **No intent to open a note or force a page redraw** was found in PluginHost; note/page control is
  not part of the plugin host surface.

## 1. Read plugin state (proven, read-only)

`PluginsContentProvider` is exported with no permission
(`jadx-ph-res/resources/AndroidManifest.xml:87`, `authorities="com.ratta.supernote.pluginhost"`).
Its `query` serves the `plugin` table read-only; `insert`, `update` and `delete` on the plugin URIs
throw `UnsupportedOperationException` (`provider/PluginsContentProvider.java:70-73,170-199`).
**[source]**

List every plugin with version and enable state: **[measured]**

```sh
adb -s <serial> shell content query \
  --uri content://com.ratta.supernote.pluginhost/plugins \
  --projection pluginID:name:versionName:versionCode:enable
```

One plugin's full row, including `usesPermissions` with each `status` (2 = Always Allow): **[measured]**

```sh
adb -s <serial> shell content query \
  --uri content://com.ratta.supernote.pluginhost/plugins/<pluginID>
```

Observed columns: `id, name, versionName, versionCode, pluginID, pluginKey, author, jsMainPath,
bundlePath, soPath, iconPath, pluginPath, num, enable, isSystemPlugin, desc, md5, isBackground,
configButton, nativeCodePackage, reactPackages, usesPermissions` (`provider/PluginsContentProvider.java`
column constants, confirmed on the tablet). `usesPermissions` is JSON, e.g.
`[{"name":"plugin.permission.FILE:READ","status":2},{"name":"plugin.permission.FILE:WRITE","status":2}]`.
**[measured]**

This lets `inkctl` verify an install, an upgrade, an enable toggle or an «Always Allow» grant
without opening Settings, which is the single biggest device-round cost today
(`cli/inkctl/README.md`: "Installing a plugin uses the tablet's screen").

## 2. Install, enable and permissions: the AIDL service

The exported service `PluginSettingService` returns an `IPluginSetting.Stub` binder from `onBind`
(`services/PluginSettingService.java:378-382`). In the manifest it is `exported="true"` with **no
`android:permission`** (`jadx-ph-res/resources/AndroidManifest.xml:56-59`), so any app that binds it
can call every method. **[source]**

The interface descriptor is `com.ratta.supernote.plugincorelib.IPluginSetting`
(`plugincorelib/IPluginSetting.java:20`). The mutating methods and their transaction codes
(`plugincorelib/IPluginSetting.java:87-113`): **[source]**

| Method | Transaction | Arguments | Effect |
| --- | --- | --- | --- |
| `installPlugin(String path, IPluginInstallCallback cb)` | 1 | absolute `.snplg` path + callback binder | installs or upgrades |
| `setPluginEnable(PluginInfo plugin, IPluginSetCallback cb)` | 6 | `PluginInfo` (uses `enable` + `pluginID`) | enables if `enable` true, else disables |
| `updatePluginPermissions(String pluginID, List<PluginPermission> perms)` | 9 | each `PluginPermission{name,status}` | sets each permission's status |
| `uninstallPlugin(PluginInfo plugin, IPluginUninstallCallback cb)` | 5 | `PluginInfo` | uninstalls |

Where each lands: **[source]**

- Install: `PluginSettingService.installPlugin` →
  `PluginInstallManager.installPlugin(path, 0, false, cb)` (`services/PluginSettingService.java:53-56`;
  `install/PluginInstallManager.java:216-217`). The core reads the path with `new File(path)`
  directly (`install/PluginInstallManager.java:425-520`), so a path under `/sdcard` works. Success
  logs `PluginInstallManager: installPlugin: success, pluginName=..., pluginZipPath=..., isUpgrade=...`
  (`install/PluginInstallManager.java:321`), matching the line in the brief; failure logs at `:361`.
- Enable/disable: `setPluginEnable` → `PluginManager.enablePlugin` / `disablePlugin`
  (`services/PluginSettingService.java:220-228`; `manager/PluginManager.java:267,302`), which set
  `PluginEntity.enable` and update the plugin's buttons.
- Permission: `updatePluginPermissions` →
  `PluginPermissionManager.grantPermission(app, perm, status)` (`services/PluginSettingService.java:231-247`;
  `security/PluginPermissionManager.java:622-633`). Status constants:
  `STATUS_ALWAYS = 2`, `STATUS_WHILE_USING = 1`, `STATUS_DENIED = 0`, `STATUS_CANCELLED = -1`
  (`security/PluginPermissionManager.java:46-49`). Setting an entry's `status` to 2 is «Always Allow».

`installPlugin` links a death recipient to the callback binder
(`install/PluginInstallManager.java:446-461`) and reports progress and success through it, so the
caller must be a live process holding an `IPluginInstallCallback.Stub`. This is why `am`,
`content call` or `service call` cannot do it: a real bound client is required. **[inference, from source]**

The route to drive this over `adb` is a tiny signed helper app (filed as the P1 issue below): it
binds `PluginSettingService`, implements the callback binders, and exposes the four calls to an
`am broadcast` / `am start-service` trigger with extras. `inkctl` then calls the helper.

## 3. The exported components, and why most are dead ends

From `jadx-ph-res/resources/AndroidManifest.xml`: **[source]**

- `PluginSettingService`, `PluginHostService`, `PluginStickerService`: exported services (AIDL
  binders). Only reachable by binding; see sections 2 and 4.
- `PluginsContentProvider`: exported, read-only query (section 1).
- `PluginReceiver`, action `com.ratta.supernote.plugin.action.DEBUG`: exported, but `onReceive`
  reads `bundle_path` and `plugin_id` extras and **does nothing with them** — dead code
  (`receiver/PluginReceiver.java:11-16`). No install path here. **[source]**
- `StubActivity` (launcher), `TestActivity`, `ProxyActivity`: no install/enable intent handling.
- The provider's `insert` on `content://.../files/<name>` writes a byte array into PluginHost's
  private `files/plugins/<name>` (`provider/PluginsContentProvider.java:70-116`). It only drops a
  file; it does not register or extract a plugin, so it is not an install on its own. **[source]**

`installSystemPlugin()` installs with `isSystem=true, isUpgrade=true` but reads only from the APK's
own `assets/plugins` and runs on host upgrade, not from `/sdcard`
(`services/PluginHostService.java:681-712`). Not a user route. **[source]**

## 4. Trigger the handwriting Sticker side button by intent

`PluginHostService` is exported with no permission (`jadx-ph-res/resources/AndroidManifest.xml:60-63`).
Its `onStartCommand` handles `action=android.intent.action.VIEW` with string extra `action=plugin`,
and then presses the side button of the **hardcoded** handwriting Sticker plugin
(`pluginID a5db6166e8fe8e17`) only (`services/PluginHostService.java:379-396`). **[source]**

```sh
adb -s <serial> shell am start-foreground-service \
  -n com.ratta.supernote.pluginhost/.services.PluginHostService \
  -a android.intent.action.VIEW --es action plugin
```

There is **no general intent** to press an arbitrary plugin's sidebar, lasso or Run Command button:
those arrive through the `IPluginCore` binder callbacks `sendPluginButtonEvent` /
`pressConfigButton`, from a bound plugin client (`services/PluginHostService.java:187-257`), not
from `am`. Today `inkctl lasso` already presses the Probe plugin's Run Command through the screen;
a general button trigger would also need the helper app of section 2. This candidate is low value
(one plugin) and was not run.

## 5. Log tags, debug flag, host reload

- Log tags for watching a round over `adb logcat`: `PluginInstallManager` (install/upgrade),
  `PluginContainerService` (this is `PluginHostService`'s tag), `PluginSettingService`,
  `PluginsContentProvider`, `PluginManager`, `PluginPermissionManager`. A React Native plugin logs
  under `ReactNativeJS`, confirming `cli/inkctl/README.md`. **[source]**
- `BuildConfig.DEBUG = false` (`BuildConfig.java:7`); no build-time debug route. **[source]**
- The host restarts its own process to release native dex mappings after a native plugin upgrade or
  uninstall (`install/PluginInstallManager.java:332-352`, `Process.killProcess(myPid)`); there is
  no "reload one plugin without host restart" entry point. A JS-only plugin install does not force a
  restart. **[inference, from source]**

## What a device round must confirm

1. Run the handwriting Sticker trigger of section 4 and confirm from `adb logcat -s
   PluginContainerService:I` that it logs `onStartCommand pluginAction:plugin` and fires the button.
2. Once the helper app of the P1 issue exists: install a `.snplg` from `/sdcard`, flip enable, and
   set a permission to «Always Allow», each verified by the read-only query of section 1.

## Sources

- Decompiled PluginHost 1.00.2610150 (`jadx`, sources and resources), session scratch only.
- `provider/PluginsContentProvider.java`, `services/PluginSettingService.java`,
  `services/PluginHostService.java`, `install/PluginInstallManager.java`,
  `manager/PluginManager.java`, `security/PluginPermissionManager.java`,
  `plugincorelib/IPluginSetting.java`, `receiver/PluginReceiver.java`,
  `jadx-ph-res/resources/AndroidManifest.xml`.
- `content query` output on the owner's Manta, 2026-11-17.
