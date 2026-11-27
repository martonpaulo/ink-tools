# Handwriting Language

A sideloaded Android app for the Supernote that switches the handwriting recognition language of
the whole tablet with one tap: from a small floating button where you write, or from its entry in
the sidebar. It works with the languages already installed on the tablet. Lingo is its
internal name ([#176](https://github.com/martonpaulo/supernote-tools/issues/176)).

Status: test build for device rounds ([#157](https://github.com/martonpaulo/supernote-tools/issues/157)); its version is `app.json`'s `version`. It was called Dialect until
`0.1.0 beta 1` ([#160](https://github.com/martonpaulo/supernote-tools/issues/160)).

## Install

```sh
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

The floating button shows while the handwriting keyboard is open or a note, Digest, To-Do or Email
is in front; drag it anywhere. Tap «Handwriting Language» in the sidebar, or long-press the
button, to open the app: it shows the active language with «Switch to Next Language», where the button
shows (only where you write, always, or hidden) and the languages in the cycle.

How it works and how to change it: [`AGENTS.md`](AGENTS.md).
