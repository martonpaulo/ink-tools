# Dialect

A sideloaded Android app for the Supernote that switches the handwriting recognition language of
the whole tablet with one tap: from a small floating button over every app, or from its entry in
the sidebar. It works with the languages already installed on the tablet.

Status: test build `0.1.0 beta 1` for a device round ([#157](https://github.com/martonpaulo/supernote-tools/issues/157)).

## Install

```sh
node scripts/build.cjs
adb install build/outputs/dialect-0.1.0-beta.1.apk
adb shell appops set com.supernotetools.dialect MANAGE_EXTERNAL_STORAGE allow
adb shell appops set com.supernotetools.dialect SYSTEM_ALERT_WINDOW allow
```

Open «Dialect settings» to turn on the floating button and choose the languages in the cycle. Tap
«Dialect» in the sidebar to move to the next language with nothing on screen.

How it works and how to change it: [`AGENTS.md`](AGENTS.md).
