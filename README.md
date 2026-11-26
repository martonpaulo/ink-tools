<div align="center">

<img src="design/icon.svg" width="96" height="96" alt="">

# Ink Tools

Unofficial tools for Supernote e-ink tablets: device plugins, a tablet app, a Mac control tool and a Mac notebook editor.

</div>

A monorepo of independent subprojects. Each keeps its own `AGENTS.md`, versioning and releases;
plugins and the tablet apps use SemVer with a numbered beta. A home page with the privacy policy,
at inktools.martonpaulo.com, is planned ([#371](https://github.com/martonpaulo/ink-tools/issues/371)).

<!-- tools:start: written by scripts/readme_figures.py from docs/tools.json -->

## Tools

For people who use the tablet.

<table>
  <tr><th>Name</th><th>What it does</th></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/smart-pen.png" width="48" height="48" alt=""></p><sub><sup>🟡</sup></sub>&nbsp;<b>Smart Pen</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=smart-pen&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>Smart Shapes</b>: draw a triangle, circle, square, rectangle or arrow and hold the pen still at the end; it becomes a clean shape, and letters stay handwriting.</li><li><b>Real-Time Text</b>: while it is on, each handwritten word becomes typed text at its place, with no lasso; drawings stay handwriting.</li><li><b>Undo Conversion</b>: brings the last converted word back as handwriting.</li><li><b>Gestures</b>: a finger double or triple tap picks a pen, the eraser or the lasso, as you map it. (planned)</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/lasso-actions.png" width="48" height="48" alt=""></p><sub><sup>🟡</sup></sub>&nbsp;<b>Lasso Actions</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=lasso-actions&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>Word Lookup</b>: lasso a handwritten word, then Insert Sticker (a clean illustration), Insert Image (a photo), Choose Image (pick from the results), Insert Definition, Insert Summary (three sentences from Wikipedia) or Translate, one button per language pair, such as «Translate ES→PT».</li><li><b>Convert to Text</b>: turn the whole lassoed handwriting into one text box.</li><li><b>Headings</b>: Heading 1 to Heading 4 turn a lassoed line into a heading of that level at the left margin, across the page.</li><li><b>Collection</b>: Add to Collection and Cut to Collection gather lasso selections; Paste Collection puts them together on another page.</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/image-editing.png" width="48" height="48" alt=""></p><sub><sup>🔵</sup></sub>&nbsp;<b>Image Editing</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=image-editing&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>Enhance</b>: make a lassoed picture readable on e-ink with one tap; Lighter and Darker adjust it.</li><li><b>Crop</b>: draw a rectangle with the pen around the part to keep.</li><li><b>Erase</b>: draw over the part to erase with the pen.</li><li><b>Remove background</b>: keep the subject and drop what is behind it.</li><li><b>Make sticker</b>: turn the picture into a sticker.</li><li><b>Document</b>: straighten a photographed page as a document.</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/device-transfer.png" width="48" height="48" alt=""></p><sub><sup>🟡</sup></sub>&nbsp;<b>Device Transfer</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=device-transfer&amp;expanded=true">plugin</a><br><sub><a href="https://github.com/martonpaulo/ink-tools/issues/369">being renamed Device Link</a></sub><br><br></td><td><br><ul><li><b>Send Page</b>: send the open page to an iPhone or a Mac over LocalSend.</li><li><b>Send Selection</b>: send a lasso selection, as typed text or as a picture; you choose on each send.</li><li><b>Receive</b>: receive text, a picture or a PDF into the open note.</li><li><b>Editor helper</b>: applies the Ink Notebook Editor&#x27;s edits from the Mac to the tablet&#x27;s notes. (planned)</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/account-sync.png" width="48" height="48" alt=""></p><sub><sup>🔵</sup></sub>&nbsp;<b>Account Sync</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=account-sync&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>To-Do</b>: sync the tablet&#x27;s to-dos with Todoist.</li><li><b>Calendar</b>: sync Google, iCloud and ICS calendars with the tablet&#x27;s calendar.</li><li><b>Digest</b>: sync the Digest both ways with your Telegram «Saved Messages». (planned)</li></ul><br></td></tr>
  <tr><td align="center"><br><sub><sup>⚪</sup></sub>&nbsp;<b>Puzzles</b><br><a href="https://github.com/martonpaulo/ink-tools/issues/376">plugin</a><br><br></td><td><br><ul><li><b>New game</b>: pick a game, a language and a difficulty; the game is a new page after the current one, its grid drawn as the page background, so erasing never removes it.</li><li><b>Show solution</b>: shows the answer over the plugin&#x27;s view, never on the page.</li><li><b>Check</b>: reads what you wrote and marks the wrong cells.</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/handwriting-language.png" width="48" height="48" alt=""></p><sub><sup>🟡</sup></sub>&nbsp;<b>Handwriting Language</b><br><a href="apps/handwriting-language/">app</a><br><br></td><td><br><ul><li><b>Switch Language</b>: switch the handwriting recognition language of the whole tablet with one tap.</li><li><b>Floating button</b>: a small button where you write, shown only while there is text or ink input.</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/apps/ink-notebook-editor.png" width="48" height="48" alt=""></p><sub><sup>🔵</sup></sub>&nbsp;<b>Ink Notebook Editor</b><br><a href="apps/ink-notebook-editor/">Mac app</a><br><br></td><td><br><ul><li><b>Open a note</b>: read a <code>.note</code> notebook on the Mac and page through it.</li><li><b>Open from Tablet</b>: copy a note from the tablet over the cable through <code>inkctl</code> and open the copy.</li><li><b>Edit</b>: edit a note on the Mac without breaking the format, and send the edits back through Device Transfer. (planned)</li></ul><br></td></tr>
</table>

Status: <sub><sup>🟢</sup></sub>&nbsp;Working&emsp;<sub><sup>🟡</sup></sub>&nbsp;Beta&emsp;<sub><sup>🔵</sup></sub>&nbsp;In progress&emsp;<sub><sup>⚪</sup></sub>&nbsp;Planned&emsp;<sub><sup>🟣</sup></sub>&nbsp;Internal

## Developer tools

<table>
  <tr><th>Name</th><th>What it does</th></tr>
  <tr><td align="center"><br><sub><sup>🟢</sup></sub>&nbsp;<b>Ink Tools Control</b><br><a href="cli/inkctl/">CLI</a><br><br></td><td><br><ul><li><b>Control</b>: <code>inkctl</code> controls the tablet over Wi-Fi ADB or USB with direct calls, JSON answers and stable exit codes, without root.</li><li><b>Plugins</b>: install, enable, permit and uninstall plugins with no screen.</li><li><b>Notes and ink</b>: open notes, write synthetic ink, lasso and read the screen for tests.</li><li><b>Firmware watch</b>: on connect, check every device dependency and report what a firmware update broke. (planned)</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/inktools-bridge.png" width="48" height="48" alt=""></p><sub><sup>🟣</sup></sub>&nbsp;<b>Ink Tools Helper</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=inktools-bridge&amp;expanded=true">app</a><br><br></td><td><br><ul><li><b>Plugin settings</b>: lets <code>inkctl</code> install, enable and permit plugins with no screen.</li><li><b>Firmware watch</b>: at boot after a firmware change, check every device dependency and report what broke. (planned)</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/plugin-diagnostics.png" width="48" height="48" alt=""></p><sub><sup>🟣</sup></sub>&nbsp;<b>Ink Tools Probe</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=plugin-diagnostics&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>Run Command</b>: the sidebar button <code>inkctl</code> presses to write ink and lasso with no pen.</li><li><b>Probes</b>: quick on-device experiments for our tests. Never shipped.</li></ul><br></td></tr>
</table>

<!-- tools:end -->

## How it fits together

Each row is one tool: where its data comes from, the adapter it enters through, and where it lands
on the tablet. Outside services always enter through an adapter of ours, so replacing one is a new
adapter, not a change to the tool. On the tablet side, every tool goes through one Supernote
adapter per language, and all of them read the same registry of device dependencies.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="design/diagrams/tool-map-dark.svg">
  <img src="design/diagrams/tool-map-light.svg" alt="Tool map: for each tool, the outside world, the service adapter, the tool and its pure logic, the Supernote adapter and what it changes on the tablet, with the tool's dependency levels.">
</picture>

The circles above are dependency levels. Each level is as fragile as the part of the tablet it
depends on, and each part a tool depends on below level 1 has a written reason and a check that
runs after a firmware update, so it never breaks silently.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="design/diagrams/levels-dark.svg">
  <img src="design/diagrams/levels-light.svg" alt="The five dependency levels, from the official plugin API to observed device behaviour, with examples, when each breaks and where each is tested.">
</picture>

The diagrams and the tool tables are generated by `scripts/readme_figures.py` from
[`docs/tools.json`](docs/tools.json), the level table of [`docs/architecture.md`](docs/architecture.md#layer-rules)
and the [registry](registry/); a check fails when they fall behind.

**This is unofficial.** Not affiliated with, endorsed or reviewed by Ratta. The plugins ship here as
unofficial GitHub releases: install them at your own risk. "Supernote" is a trademark of its
owner, used here only to name the device. No root, no modified firmware, no exploits.

## License

[CC BY-NC-SA 4.0](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
