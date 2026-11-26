# Ink Tools Bridge

A developer-only helper app for the Supernote, with no screen. It lets `inkctl` on a Mac install,
enable, disable and permit plugins without touching the tablet, through PluginHost's own settings
service ([#215](https://github.com/martonpaulo/ink-tools/issues/215)).

Status: test build `0.1.0 beta 2`. On the tablet, beta 1 listed plugins and set permissions; beta 2 fixes the callback descriptors that made install, enable and disable time out.

## Install

```sh
node scripts/build.cjs
adb install build/outputs/inktools-bridge-0.1.0-beta.2.apk
adb shell am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op ping
```

The last line answers `result=1, data="ok bridge 0.1.0 beta 2"`. Then `inkctl plugin install`,
`enable`, `disable` and `allow` use it by themselves.

## Wi-Fi ADB after a restart

Planned for the next test build, not built or run on the tablet yet ([#1](https://github.com/martonpaulo/ink-tools/issues/1)). Android turns
Wireless debugging (`adb_wifi_enabled`) off at every boot and opens a new port each time (measured
on a Manta, firmware Chauvet.E103.2610191001.2559). A boot receiver in the Bridge sets
`adb_wifi_enabled` to 1 again, and `inkctl` finds the new port over mDNS. Writing that setting needs
`WRITE_SECURE_SETTINGS`, which the owner grants once over the USB cable:

```sh
adb shell pm grant com.martonpaulo.inktools.bridge android.permission.WRITE_SECURE_SETTINGS
```

Without the grant, the receiver does nothing and logs one line under `InkToolsBridge`. While
Wireless debugging is on, any computer on the same Wi-Fi can use the tablet's ADB: see
[`docs/security.md`](../../docs/security.md#wi-fi-adb-after-a-restart).

How it works and how to change it: [`AGENTS.md`](AGENTS.md).
