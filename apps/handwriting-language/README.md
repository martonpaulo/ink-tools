# Handwriting Language

A sideloaded Android app for the Supernote that switches the handwriting recognition language of
the whole tablet with one tap, from its entry in the sidebar. It works with the languages already installed on the tablet. Lingo is its
internal name ([#176](https://github.com/martonpaulo/supernote-tools/issues/176)).

Status: test build for device rounds ([#157](https://github.com/martonpaulo/supernote-tools/issues/157)); its version is `app.json`'s `version`. It was called Dialect until
`0.1.0 beta 1` ([#160](https://github.com/martonpaulo/supernote-tools/issues/160)).

## Install

With no computer, once a `handwriting-language-v…` prerelease is on the
[releases page](https://github.com/martonpaulo/ink-tools/releases) (the first one waits for its signing key):

1. On the tablet, turn on Settings › Security & Privacy › Sideloading.
2. On a phone, download the release's `lingo-app-….apk`, then send it to the tablet with Device Link,
   or upload it in the phone's browser to the address the tablet's Browse & Access shows.
3. On the tablet, open the file and tap Install.
4. Open Handwriting Language from the sidebar. A missing All files access permission shows a button that
   opens its system screen.

A build from source signed by another key needs Handwriting Language uninstalled first.

Tap «Handwriting Language» in the sidebar to open the app: it shows the active language with «Switch to
Next Language» and the languages in the cycle.

The floating button is off ([#617](https://github.com/martonpaulo/ink-tools/issues/617), owner, 2026-11-28): the build leaves out its
code (`OverlayService`, `WritingWatcher`, `BootReceiver`), so the app asks for no overlay or accessibility
permission. The code stays in `src/`. To turn it back on, build with
`node scripts/build.cjs --floating-button` (or `LINGO_FLOATING_BUTTON=1`) and grant the two permissions as below.

How it works and how to change it: [`AGENTS.md`](AGENTS.md).


## Build from source

For development, with a computer and ADB:

```sh
# The default build has neither of the two permissions below; they are for a `--floating-button` build.
adb uninstall com.supernotetools.dialect   # only when the old Dialect build is installed
node scripts/build.cjs
adb install build/outputs/lingo-app-0.1.0-beta.14.apk
adb shell appops set com.supernotetools.lingo MANAGE_EXTERNAL_STORAGE allow
adb shell appops set com.supernotetools.lingo SYSTEM_ALERT_WINDOW allow
adb shell '
k=enabled_accessibility_services
v=$(settings get secure $k)
s=com.supernotetools.lingo/.WritingWatcher
case ":$v:" in
*":${s%/*}/"*) ;;
:null:|::) settings put secure $k "$s" ;;
*) settings put secure $k "$v:$s" ;;
esac'
adb shell settings put secure accessibility_enabled 1
adb shell am force-stop com.ratta.supernote.launcher   # the sidebar lists the app again after an install
```
