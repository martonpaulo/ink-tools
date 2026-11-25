<div align="center">

<img src="design/icon.svg" width="96" height="96" alt="">

# Ink Tools

Unofficial tools for Supernote e-ink tablets: device plugins, a tablet app, a Mac CLI and a planned Mac notebook editor.

</div>

A monorepo of independent subprojects. Each keeps its own `AGENTS.md`, versioning and releases;
plugins and the tablet apps use SemVer with a numbered beta.

## Plugins

Run inside the tablet's plugin host.

<table>
  <tr><th width="170">Plugin</th><th width="400">What it does</th><th width="150">Folder</th><th width="120">Status</th></tr>
  <tr><td><b>Word Lookup</b></td><td>Write a word by hand, lasso it, and insert an illustration, a photo, a short definition or a translation; «Choose Image» opens the results to pick one.</td><td><a href="plugins/word-lookup/"><code>word-lookup/</code></a></td><td>🟡&nbsp;Beta</td></tr>
  <tr><td><b>Real-Time Conversion</b></td><td>While «Real-Time Text» is on, each handwritten word becomes typed text at its place, with no lasso; drawings stay handwriting, and «Undo Conversion» brings the last word back.</td><td><a href="plugins/real-time-conversion/"><code>real-time-conversion/</code></a></td><td>🟡&nbsp;Beta</td></tr>
  <tr><td><b>Smart Shapes</b></td><td>Draw a triangle, circle, square, rectangle or arrow and hold the pen still at the end: it becomes a clean shape; letters stay handwriting.</td><td><a href="plugins/smart-shapes/"><code>smart-shapes/</code></a></td><td>🟡&nbsp;Beta</td></tr>
  <tr><td><b>Device Transfer</b></td><td>Send the page or a lasso selection to an iPhone or a Mac over LocalSend, and receive text or a picture into the open note.</td><td><a href="plugins/device-transfer/"><code>device-transfer/</code></a></td><td>🟡&nbsp;Beta</td></tr>
  <tr><td><b>Account Sync</b></td><td>Sync to-dos, calendars and a digest with your accounts, each module opt in.</td><td><a href="plugins/account-sync/"><code>account-sync/</code></a></td><td>🔵&nbsp;In&nbsp;progress</td></tr>
  <tr><td><b>Image Editing</b></td><td>Lasso a picture on the page and make it readable on e-ink with one tap.</td><td><a href="plugins/image-editing/"><code>image-editing/</code></a></td><td>🔵&nbsp;In&nbsp;progress</td></tr>
  <tr><td>Plugin Diagnostics</td><td>Quick on-device experiments for developers. Never shipped.</td><td><a href="plugins/plugin-diagnostics/"><code>plugin-diagnostics/</code></a></td><td>⚫&nbsp;Internal</td></tr>
</table>

## Tablet apps

Sideloaded Android apps.

<table>
  <tr><th width="170">App</th><th width="400">What it does</th><th width="150">Folder</th><th width="120">Status</th></tr>
  <tr><td><b>Handwriting Language</b></td><td>Switch the handwriting recognition language of the whole tablet with one tap.</td><td><a href="apps/handwriting-language/"><code>handwriting-language/</code></a></td><td>🟡&nbsp;Beta</td></tr>
  <tr><td>Ink Tools Bridge</td><td>Lets <code>inkctl</code> install, enable and permit plugins with no screen, through PluginHost's settings service. Developer-only.</td><td><a href="apps/inktools-bridge/"><code>inktools-bridge/</code></a></td><td>⚫&nbsp;Internal</td></tr>
</table>

## Mac CLI

<table>
  <tr><th width="170">Tool</th><th width="400">What it does</th><th width="150">Folder</th><th width="120">Status</th></tr>
  <tr><td><b>inkctl</b></td><td>Control the tablet over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root.</td><td><a href="cli/inkctl/"><code>inkctl/</code></a></td><td>🟢&nbsp;Working</td></tr>
</table>

## Mac app

<table>
  <tr><th width="170">App</th><th width="400">What it does</th><th width="150">Folder</th><th width="120">Status</th></tr>
  <tr><td><b>Ink Notebook Editor</b></td><td>Read and edit <code>.note</code> notebooks on the Mac without breaking the format.</td><td><a href="apps/ink-notebook-editor/"><code>ink-notebook-editor/</code></a></td><td>⚪&nbsp;Planned</td></tr>
</table>

## Shared code

<table>
  <tr><th width="170">Package</th><th width="400">What it does</th><th width="150">Folder</th><th width="120">Status</th></tr>
  <tr><td>Shared code</td><td><code>sn-adapter</code>, <code>sync-core</code>, <code>ink-core</code>, <code>picture-search</code> and <code>ui-kit</code>, bundled by the plugins.</td><td><a href="packages/"><code>packages/</code></a></td><td>⚫&nbsp;Internal</td></tr>
</table>

**This is unofficial.** Not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its
owner, used here only to name the device. No root, no modified firmware, no exploits.

## License

[CC BY-NC-SA 4.0](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
