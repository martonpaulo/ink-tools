# Retouch

On the tablet this plugin is called **Image Editing**; `retouch` stays its folder and internal name ([#176](https://github.com/martonpaulo/supernote-tools/issues/176)).

A Supernote plugin: lasso a picture on the page and make it readable on e-ink with one tap.

**Status: built, device round pending** — see [#136](https://github.com/martonpaulo/supernote-tools/issues/136).

## What it does

- **Enhance**: grey that keeps colour contrast, a gamma step, sharpen and the 16 greys of the
  screen. A picture wider than the page is scaled down to the page width, never up.
- **Lighter** and **Darker**: one fixed gamma step each tap.
- **Undo** and **Restore original**: back one edit, or back to the picture as it was before Retouch.
- **Rotate 90°** clockwise, **Mirror** left to right, **Flip** top to bottom, and **Invert**, which
  turns a dark-mode screenshot into paper and keeps colour.
- **Trim**: cuts the white or clear margins around the picture, which keeps its place on the page.
- **Crop**: draw a rectangle on the picture with the pen, lasso the picture and the rectangle
  together, and press Crop. The picture keeps only the area inside the rectangle, in its place on
  the page, and the rectangle is erased. Undo brings the whole picture back.
- **Styles** opens a grid of the picture in every style at once: Photo (16 greys), Line art,
  Black and white, Dither and Clean dither (Atkinson). Tap one to use it. **White to transparent**
  lets the page template show through, and **Thicker lines** widens Line art's strokes. The style
  you chose last comes first next time.
- Each edit is a lasso button and a switch in the plugin's Settings.
- Each style is a switch in Settings too; with every style off, the Styles button goes.

## Built on

React Native + `sn-plugin-lib`, like `../lookup`, with a native Java module built by
`scripts/native-build.cjs`. The grey and e-ink steps come from `../../packages/picture-search`.

```bash
npm ci
npm run validate   # lint, types, Jest and the JVM tests
npm run build      # build/outputs/Retouch.snplg, with the Android SDK the toolchain script finds
```
