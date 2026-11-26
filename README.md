<div align="center">

<img src="design/icon.svg" width="96" height="96" alt="">

# Ink Tools

Unofficial tools for Supernote e-ink tablets: device plugins, a tablet app, a Mac control tool and a Mac notebook editor.

</div>

A monorepo of independent subprojects. Each keeps its own `AGENTS.md`, versioning and releases;
plugins and the tablet apps use SemVer with a numbered beta. A home page with the privacy policy,
at inktools.martonpaulo.com, is planned ([#371](https://github.com/martonpaulo/ink-tools/issues/371)).

<!-- credits:start: written by scripts/readme_figures.py from docs/tools.json -->

## Credits

A special thank-you to the authors of these Supernote projects. Ink Tools stands on their work: some of their code runs inside it, and some of their ideas shaped it.

### Code we use

- [supernote-tool](https://github.com/jya-dev/supernote-tool) by jya: the `.note` reader and RLE decoder, ported to Swift.
- [supernote-snap](https://github.com/CharlesCheval/supernote-snap) v0.9.0 by Charles Cheval: the Smart Shapes recognizer, hold detection and stroke guard.
- [supernote-pic2note](https://github.com/Keplex/supernote-pic2note) by Keplex: the native build pipeline without Gradle.
- [SuperFun](https://github.com/AgP42/SuperFun) by AgP42: the word-search theme word banks.

### Ideas we follow

- [Supernote-InkGames](https://github.com/wolfsolver/Supernote-InkGames) by wolfsolver: puzzles generated for the page, solved with the pen.
- [SuperFun](https://github.com/AgP42/SuperFun) by AgP42: a set of games inside one plugin.
- [Inkling](https://github.com/Laumss/Inkling) by Laumss: write a picture file, then insert it on the page.
- [sn-plugins](https://github.com/Laumss/sn-plugins) by Laumss: the Settings screen conventions in `ui-kit`.
- [supernote-mcp](https://github.com/ridget/supernote-mcp) by ridget: inkctl touches the tablet only when it is called.
- [inkbridge](https://github.com/CRSiegfried/inkbridge) by CRSiegfried: inkctl leaves transcription to whoever calls it.

Each project's licence, and what Ink Tools took from it, is in the `NOTICE.md` of the part that uses it.

<!-- credits:end -->

<!-- tools:start: written by scripts/readme_figures.py from docs/tools.json -->

## Tools

For people who use the tablet.

<table>
  <tr><th>Name</th><th>What it does</th></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/smart-pen.png" width="48" height="48" alt=""></p><sub><sup>🟡</sup></sub>&nbsp;<b>Smart Pen</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=smart-pen&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>Smart Shapes</b>: draw a triangle, circle, square, rectangle or arrow and hold the pen still at the end; it becomes a clean shape, and letters stay handwriting.</li><li><b>Real-Time Text</b>: while it is on, each handwritten word becomes typed text at its place, with no lasso; drawings stay handwriting.</li><li><b>Undo Conversion</b>: brings the last converted word back as handwriting.</li><li><b>Gestures</b>: a finger double or triple tap picks a pen, the eraser or the lasso, as you map it. (planned)</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/lasso-actions.png" width="48" height="48" alt=""></p><sub><sup>🟡</sup></sub>&nbsp;<b>Lasso Actions</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=lasso-actions&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>Word Lookup</b>: lasso a handwritten word, then Insert Sticker (a clean illustration), Insert Image (a photo), Choose Image (pick from the results), Insert Definition, Insert Summary (three sentences from Wikipedia) or Translate, one button per language pair, such as «Translate ES→PT».</li><li><b>Convert to Text</b>: turn the whole lassoed handwriting into one text box.</li><li><b>Headings</b>: Heading 1 to Heading 4 turn a lassoed line into a heading of that level at the left margin, across the page.</li><li><b>Collection</b>: Add to Collection and Cut to Collection gather lasso selections; Paste Collection puts them together on another page.</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/image-editing.png" width="48" height="48" alt=""></p><sub><sup>🔵</sup></sub>&nbsp;<b>Image Editing</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=image-editing&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>Enhance</b>: make a lassoed picture readable on e-ink with one tap; Lighter and Darker adjust it.</li><li><b>Crop</b>: draw a rectangle with the pen around the part to keep.</li><li><b>Erase</b>: draw over the part to erase with the pen.</li><li><b>Remove background</b>: keep the subject and drop what is behind it.</li><li><b>Make sticker</b>: turn the picture into a sticker.</li><li><b>Document</b>: straighten a photographed page as a document.</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/device-link.png" width="48" height="48" alt=""></p><sub><sup>🟡</sup></sub>&nbsp;<b>Device Link</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=device-link&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>Send Page</b>: send the open page to an iPhone or a Mac over LocalSend.</li><li><b>Send Selection</b>: send a lasso selection, as typed text or as a picture; you choose on each send.</li><li><b>Receive</b>: receive text, a picture or a PDF into the open note.</li><li><b>Editor helper</b>: applies the Ink Notebook Editor&#x27;s edits from the Mac to the tablet&#x27;s notes. (planned)</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/account-sync.png" width="48" height="48" alt=""></p><sub><sup>🔵</sup></sub>&nbsp;<b>Account Sync</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=account-sync&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>To-Do</b>: sync the tablet&#x27;s to-dos with Todoist.</li><li><b>Calendar</b>: sync Google, iCloud and ICS calendars with the tablet&#x27;s calendar.</li><li><b>Digest</b>: sync the Digest both ways with your Telegram «Saved Messages». (planned)</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/puzzles.png" width="48" height="48" alt=""></p><sub><sup>⚪</sup></sub>&nbsp;<b>Puzzles</b><br><a href="https://github.com/martonpaulo/ink-tools/issues/376">plugin</a><br><br></td><td><br><ul><li><b>New game</b>: pick a game, a language and a difficulty; the game is a new page after the current one, its grid drawn as the page background, so erasing never removes it.</li><li><b>Show solution</b>: shows the answer over the plugin&#x27;s view, never on the page.</li><li><b>Check</b>: reads what you wrote and marks the wrong cells.</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/handwriting-language.png" width="48" height="48" alt=""></p><sub><sup>🟡</sup></sub>&nbsp;<b>Handwriting Language</b><br><a href="apps/handwriting-language/">app</a><br><br></td><td><br><ul><li><b>Switch Language</b>: switch the handwriting recognition language of the whole tablet with one tap.</li><li><b>Floating button</b>: a small button where you write, shown only while there is text or ink input.</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/apps/ink-notebook-editor.png" width="48" height="48" alt=""></p><sub><sup>🔵</sup></sub>&nbsp;<b>Ink Notebook Editor</b><br><a href="apps/ink-notebook-editor/">Mac app</a><br><br></td><td><br><ul><li><b>Open a note</b>: read a <code>.note</code> notebook on the Mac and page through it.</li><li><b>Open from Tablet</b>: copy a note from the tablet over the cable through <code>inkctl</code> and open the copy.</li><li><b>Edit</b>: edit a note on the Mac without breaking the format, and send the edits back through Device Link. (planned)</li></ul><br></td></tr>
</table>

Status: <sub><sup>🟢</sup></sub>&nbsp;Working&emsp;<sub><sup>🟡</sup></sub>&nbsp;Beta&emsp;<sub><sup>🔵</sup></sub>&nbsp;In progress&emsp;<sub><sup>⚪</sup></sub>&nbsp;Planned&emsp;<sub><sup>🟣</sup></sub>&nbsp;Internal

## Developer tools

<table>
  <tr><th>Name</th><th>What it does</th></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/inkctl.png" width="48" height="48" alt=""></p><sub><sup>🟢</sup></sub>&nbsp;<b>Ink Tools Control</b><br><a href="cli/inkctl/">CLI</a><br><br></td><td><br><ul><li><b>Control</b>: <code>inkctl</code> controls the tablet over Wi-Fi ADB or USB with direct calls, JSON answers and stable exit codes, without root.</li><li><b>Plugins</b>: install, enable, permit and uninstall plugins with no screen.</li><li><b>Notes and ink</b>: open notes, write synthetic ink, lasso and read the screen for tests.</li><li><b>Firmware watch</b>: on connect, check every device dependency and report what a firmware update broke. (planned)</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/ink-tools-helper.png" width="48" height="48" alt=""></p><sub><sup>🟣</sup></sub>&nbsp;<b>Ink Tools Helper</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=ink-tools-helper&amp;expanded=true">app</a><br><br></td><td><br><ul><li><b>Plugin settings</b>: lets <code>inkctl</code> install, enable and permit plugins with no screen.</li><li><b>Firmware watch</b>: at boot after a firmware change, check every device dependency and report what broke. (planned)</li></ul><br></td></tr>
  <tr><td align="center"><br><p align="center"><img src="design/icons/readme/ink-tools-probe.png" width="48" height="48" alt=""></p><sub><sup>🟣</sup></sub>&nbsp;<b>Ink Tools Probe</b><br><a href="https://github.com/martonpaulo/ink-tools/releases?q=ink-tools-probe&amp;expanded=true">plugin</a><br><br></td><td><br><ul><li><b>Run Command</b>: the sidebar button <code>inkctl</code> presses to write ink and lasso with no pen.</li><li><b>Probes</b>: quick on-device experiments for our tests. Never shipped.</li></ul><br></td></tr>
</table>

<!-- tools:end -->

## How it fits together

Each row is one tool: where its data comes from, the adapter it enters through, and where it lands
on the tablet. Outside services always enter through an adapter of ours, so replacing one is a new
adapter, not a change to the tool. On the tablet side, every tool goes through one Supernote
adapter per language, and all of them read the same registry of device dependencies.

<!-- tool-map:start: written by scripts/readme_figures.py from docs/tools.json and registry/items -->

```mermaid
flowchart TB
  accTitle: Tool map: where each tool's data comes from and where it lands
  accDescr: Top to bottom: the outside services, the service adapters they enter through, the tools grouped by where they run (tablet plugins, tablet apps, Mac), the Supernote adapter of each runtime, the one registry of device dependencies they all read, and the tablet. Tools: Smart Pen; Lasso Actions; Image Editing; Device Link; Account Sync; Puzzles (planned); Handwriting Language; Ink Notebook Editor; Ink Tools Control; Ink Tools Helper.
  subgraph outside["Outside world"]
    o_wiktionary["Wiktionary<br/>Wikipedia"]
    o_wikimedia_commons["Wikimedia Commons<br/>Wikidata<br/>Openclipart<br/>OpenMoji"]
    o_apertium["Apertium"]
    o_localsend_app["LocalSend app<br/>on an iPhone or a Mac"]
    o_todoist["Todoist"]
    o_google_calendar["Google Calendar<br/>iCloud (CalDAV)<br/>ICS links"]
    o_telegram_saved_messages["Telegram Saved Messages"]
    o_note_files_on_the_mac["note files on the Mac"]
  end
  subgraph services["Service adapters"]
    s_dictionaryprovider["DictionaryProvider"]
    s_picture_sources["picture sources"]
    s_translator["translator"]
    s_localsend_v2_protocol["LocalSend v2 protocol"]
    s_taskprovider["TaskProvider"]
    s_calendarprovider["CalendarProvider"]
    s_digest_source["Digest source"]
  end
  subgraph g_plugins["Tablet plugins"]
    t_smart_pen["<b>Smart Pen</b><br/>ink-core: shapes and conversion"]
    t_lasso_actions["<b>Lasso Actions</b><br/>ink-core: write, recognise, insert<br/>picture-search: rank"]
    t_image_editing["<b>Image Editing</b><br/>picture-search: pixel measures"]
    t_device_link["<b>Device Link</b><br/>ink-core: page to PNG, receive and insert"]
    t_account_sync["<b>Account Sync</b><br/>sync-core: compare and decide"]
    t_puzzles["<b>Puzzles (planned)</b><br/>puzzle generator and word lists"]
  end
  subgraph g_apps["Tablet apps"]
    t_handwriting_language["<b>Handwriting Language</b><br/>the language cycle"]
    t_ink_tools_helper["<b>Ink Tools Helper</b><br/>the plugin settings calls"]
  end
  subgraph g_mac["Mac"]
    t_ink_notebook_editor["<b>Ink Notebook Editor</b><br/>NoteFormat: read and draw a note"]
    t_ink_tools_control["<b>Ink Tools Control</b><br/>inkctl<br/>over USB or Wi-Fi ADB"]
  end
  subgraph adapters["Supernote adapters"]
    a_ts["<b>sn-adapter</b><br/>TypeScript"]
    a_java["<b>Java reader</b>"]
    a_swift["<b>Swift reader</b>"]
    a_python["<b>Python reader</b>"]
  end
  registry["<b>Registry</b><br/>of device dependencies"]
  tablet["<b>Supernote tablet</b>"]
  o_wiktionary --> s_dictionaryprovider
  s_dictionaryprovider --> t_lasso_actions
  o_wikimedia_commons --> s_picture_sources
  s_picture_sources --> t_lasso_actions
  o_apertium --> s_translator
  s_translator --> t_lasso_actions
  o_localsend_app --> s_localsend_v2_protocol
  s_localsend_v2_protocol --> t_device_link
  o_todoist --> s_taskprovider
  s_taskprovider --> t_account_sync
  o_google_calendar --> s_calendarprovider
  s_calendarprovider --> t_account_sync
  o_telegram_saved_messages -.-> s_digest_source
  s_digest_source -.-> t_account_sync
  o_note_files_on_the_mac --> t_ink_notebook_editor
  g_plugins --> a_ts
  g_apps --> a_java
  t_ink_notebook_editor --> a_swift
  t_ink_tools_control --> a_python
  a_ts --> registry
  a_java --> registry
  a_swift --> registry
  a_python --> registry
  registry --> tablet
  classDef planned stroke-dasharray: 5 5
  class o_telegram_saved_messages,s_digest_source,t_puzzles planned
```

| Tool | Source | Adapter | On the tablet | Levels |
| :--- | :--- | :--- | :--- | :--- |
| Smart Pen | nothing from outside | sn-adapter | the page<br>strokes<br>shapes<br>text boxes | 1️⃣ 5️⃣ |
| Lasso Actions | Wiktionary<br>Wikipedia<br>Wikimedia Commons<br>Wikidata<br>Openclipart<br>OpenMoji<br>Apertium | DictionaryProvider<br>picture sources<br>translator<br>sn-adapter | the page<br>lasso<br>picture<br>sticker<br>text | 1️⃣ 2️⃣ 5️⃣ |
| Image Editing | nothing from outside | sn-adapter | the page<br>a lassoed picture | 1️⃣ 5️⃣ |
| Device Link | LocalSend app<br>on an iPhone or a Mac | LocalSend v2 protocol<br>sn-adapter | the page<br>notes<br>files | 1️⃣ 5️⃣ |
| Account Sync | Todoist<br>Google Calendar<br>iCloud (CalDAV)<br>ICS links<br>Telegram Saved Messages (planned) | TaskProvider<br>CalendarProvider<br>Digest source (planned)<br>sn-adapter | the tablet's own apps<br>To-Do<br>Calendar<br>Digest (planned) | 1️⃣ 2️⃣ 5️⃣ |
| Puzzles (planned) | nothing from outside | sn-adapter | a new page<br>the grid as its background | 1️⃣ |
| Handwriting Language | nothing from outside | Java reader | the handwriting language<br>the floating button | 2️⃣ 3️⃣ |
| Ink Notebook Editor | note files on the Mac | Swift reader | notes<br>through inkctl | 2️⃣ 5️⃣ |
| Ink Tools Control | nothing from outside | Python reader | screens<br>settings<br>notes<br>for tests and setup | 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ |
| Ink Tools Helper | nothing from outside | Java reader | plugin settings | 2️⃣ 3️⃣ 5️⃣ |

<!-- tool-map:end -->

The levels in the last column are dependency levels. Each level is as fragile as the part of the
tablet it depends on, and each part a tool depends on below level 1 has a written reason and a check that
runs after a firmware update, so it never breaks silently.

<!-- levels:start: written by scripts/readme_figures.py from docs/architecture.md and registry/items -->

Use the highest level that delivers the outcome at acceptable cost and quality.

| Level | Examples | When it breaks | Where it is tested | Registry items |
| :--- | :--- | :--- | :--- | ---: |
| 1️⃣ Official plugin API | lasso, insert a picture, pages, files, buttons, dialogs | rarely, with Ratta's notice; affects the person | Mac tests, with the simulated adapter | 1 |
| 2️⃣ Device data | Calendar, To-Do and Digest entries; the handwriting language; the note file format | any firmware update; the probe sees it; affects the person | a tablet probe of fields, paths and versions | 11 |
| 3️⃣ System screens and components | native switches and bars, the helper app, Settings shortcuts | any firmware update; a call fails; affects the person | a tablet probe that loads and checks each one | 7 |
| 4️⃣ Screen automation | find buttons by their text in Settings and in notes | any interface change; a step fails; affects only our tests | `inkctl doctor` before each test round | 3 |
| 5️⃣ Observed device behaviour | the Back key, pen units, how Calendar and To-Do read entries | **silently**; affects the person | an effect test: write, read back, compare | 24 |

Level 1 is the highest and the steadiest; level 5 is the lowest and changes with no error.

<!-- levels:end -->

The tool tables, the tool map and the level table are generated by `scripts/readme_figures.py` from
[`docs/tools.json`](docs/tools.json), the level table of [`docs/architecture.md`](docs/architecture.md#layer-rules)
and the [registry](registry/); a check fails when they fall behind.

## Before you install

<!-- risk-notice:start: written by scripts/risk_notice.py from docs/risk-notice.md -->
<p><strong>Ink Tools is unofficial.</strong> It is not made, affiliated with, endorsed or reviewed by Ratta. «Supernote» is a trademark of its owner and names the device only.</p>
<p>Some tools use parts of the tablet's software that Ratta does not document. A firmware update can change those parts and break a feature until a fix ships. The <a href="https://github.com/martonpaulo/ink-tools/issues/293" target="_blank" rel="noopener">firmware watch</a>, being built now, checks those parts after an update and reports what broke.</p>
<p>No tool needs root or modified firmware. Use these tools at your own risk, and keep a backup of your notes before you install or update one.</p>
<!-- risk-notice:end -->

The [install guide](docs/install.md) says how to install, update and remove a plugin, and which tools have a stable release.

## License

[CC BY-NC-SA 4.0](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
