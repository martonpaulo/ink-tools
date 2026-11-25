# Handwriting Language

A sideloaded Android app for the Supernote that switches the handwriting recognition language of
the whole tablet with one tap: from a small floating button where you write, or from its entry in
the sidebar. It works with the languages already installed on the tablet. Lingo is its
internal name ([#176](https://github.com/martonpaulo/supernote-tools/issues/176)).

Status: test build `0.1.0 beta 3` for a device round ([#157](https://github.com/martonpaulo/supernote-tools/issues/157)). It was called Dialect until
`0.1.0 beta 1` ([#160](https://github.com/martonpaulo/supernote-tools/issues/160)).

## Install

```sh
adb uninstall com.supernotetools.dialect   # only when the old Dialect build is installed
node scripts/build.cjs
adb install build/outputs/lingo-app-0.1.0-beta.3.apk
adb shell appops set com.supernotetools.lingo MANAGE_EXTERNAL_STORAGE allow
adb shell appops set com.supernotetools.lingo SYSTEM_ALERT_WINDOW allow
adb shell settings put secure enabled_accessibility_services com.supernotetools.lingo/.WritingWatcher
adb shell settings put secure accessibility_enabled 1
```

The floating button shows while the handwriting keyboard is open or a note, Digest, To-Do or Email
is in front. Long-press it to open «Handwriting Language Settings», which chooses where it shows
(only where you write, always, or hidden) and the languages in the cycle. Tap
«Lingo» in the sidebar to move to the next language with nothing on screen.

How it works and how to change it: [`AGENTS.md`](AGENTS.md).
