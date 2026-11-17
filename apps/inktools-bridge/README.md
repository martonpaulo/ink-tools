# Ink Tools Bridge

A developer-only helper app for the Supernote, with no screen. It lets `inkctl` on a Mac install,
enable, disable and permit plugins without touching the tablet, through PluginHost's own settings
service ([#215](https://github.com/martonpaulo/ink-tools/issues/215)).

Status: test build `0.1.0 beta 1`, not yet run on the tablet.

## Install

```sh
node scripts/build.cjs
adb install build/outputs/inktools-bridge-0.1.0-beta.1.apk
adb shell am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op ping
```

The last line answers `result=1, data="ok bridge 0.1.0 beta 1"`. Then `inkctl plugin install`,
`enable`, `disable` and `allow` use it by themselves.

How it works and how to change it: [`AGENTS.md`](AGENTS.md).
