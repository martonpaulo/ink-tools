# Retouch

A Supernote plugin: lasso a picture on the page and make it readable on e-ink with one tap.

**Status: built, device round pending** — see [#136](https://github.com/martonpaulo/supernote-tools/issues/136).

## What it does

- **Enhance**: grey that keeps colour contrast, a gamma step, sharpen and the 16 greys of the
  screen. A picture wider than the page is scaled down to the page width, never up.
- **Lighter** and **Darker**: one fixed gamma step each tap.
- **Undo** and **Restore original**: back one edit, or back to the picture as it was before Retouch.
- **Rotate 90°** clockwise, **Mirror** left to right, **Flip** top to bottom, and **Invert**, which
  turns a dark-mode screenshot into paper and keeps colour.
- Each edit is a lasso button and a switch in the plugin's Settings.

## Built on

React Native + `sn-plugin-lib`, like `../lingo`, with a native Java module built by
`scripts/native-build.cjs`. The grey and e-ink steps come from `../../packages/picture-search`.

```bash
npm ci
npm run validate   # lint, types, Jest and the JVM tests
npm run build      # build/outputs/Retouch.snplg, with the Android SDK the toolchain script finds
```
