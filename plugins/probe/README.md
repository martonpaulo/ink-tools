# Probe

A permanent, developer-only Supernote plugin for quick on-device experiments. It is not shipped to
users and has no release; its `.snplg` is a build artifact only.

Same runtime and pinned versions as [`../ink2pic`](../ink2pic): React Native 0.79.2 and `sn-plugin-lib`
0.2.3. It registers only the plugin Settings entry (like [`../bridge`](../bridge)), so it never shows inside a note.

## The loop

1. Edit `probeBody` in `src/probe.ts`. It is the one place for a one-off probe and runs when Probe opens.
2. Build: `npm install && npm run build` writes `build/outputs/Probe.snplg`. CI uploads the same file as an artifact.
3. Install it with the `supernote` CLI, or `adb`, then open Probe in the plugin Settings.
4. Read the result in the view, or in logcat: `adb logcat -s ReactNativeJS | grep SNPROBE`.

Check before you trust a result: run `npm run validate` (lint, typecheck, tests).
