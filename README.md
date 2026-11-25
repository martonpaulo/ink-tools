<div align="center">

<img src="design/icon.svg" width="96" height="96" alt="">

# Ink Tools

Unofficial tools for Supernote e-ink tablets: device plugins, a tablet app, a Mac CLI and a Mac notebook editor.

</div>

A monorepo of independent subprojects. Each keeps its own `AGENTS.md`, versioning and releases;
plugins and the tablet apps use SemVer with a numbered beta.

## Tools

For people who use the tablet.

<table>
  <tr><th width="190">Name</th><th width="80">Type</th><th width="430">What it does</th><th width="120">Status</th></tr>
  <tr><td><img src="design/icons/planned/smart-pen/icon.png" width="48" height="48" alt=""><br><b>Smart Pen</b><br><code>plugins/smart-pen/</code></td><td>Plugin</td><td><ul><li><b>Smart Shapes</b>: draw a triangle, circle, square, rectangle or arrow and hold the pen still at the end; it becomes a clean shape, and letters stay handwriting.</li><li><b>Real-Time Text</b>: while it is on, each handwritten word becomes typed text at its place, with no lasso; drawings stay handwriting.</li><li><b>Undo Conversion</b>: brings the last converted word back as handwriting.</li><li><b>Gestures</b>: a finger double or triple tap picks a pen, the eraser or the lasso, as you map it (planned).</li></ul></td><td>🟡&nbsp;Beta</td></tr>
  <tr><td><img src="design/icons/planned/lasso-actions/icon.png" width="48" height="48" alt=""><br><b>Lasso Actions</b><br><code>plugins/lasso-actions/</code></td><td>Plugin</td><td><ul><li><b>Insert Sticker</b>: lasso a handwritten word and insert a clean illustration of it.</li><li><b>Insert Image</b>: insert a photo of the lassoed word.</li><li><b>Choose Image</b>: open the picture results and pick one.</li><li><b>Insert Definition</b>: write a short dictionary definition below the word.</li><li><b>Insert Summary</b>: write a three-sentence summary from Wikipedia below the term.</li><li><b>Translate</b>: write the word's translation, one button per language pair, such as «Translate ES→PT».</li><li><b>Convert to Text</b>: turn the whole lassoed handwriting into one text box.</li><li><b>Headings</b>: <b>Heading 1</b>, <b>Heading 2</b>, <b>Heading 3</b> and <b>Heading 4</b> turn a lassoed line into a heading of that level at the left margin (planned).</li><li><b>Collection</b>: <b>Add to Collection</b> and <b>Cut to Collection</b> gather lasso selections, <b>Paste Collection</b> puts them together on another page (planned).</li></ul></td><td>🟡&nbsp;Beta</td></tr>
  <tr><td><img src="plugins/image-editing/assets/icon.png" width="48" height="48" alt=""><br><b>Image Editing</b><br><a href="plugins/image-editing/"><code>plugins/image-editing/</code></a></td><td>Plugin</td><td><ul><li><b>Enhance</b>: make a lassoed picture readable on e-ink with one tap; Lighter and Darker adjust it.</li><li><b>Crop</b>: draw a rectangle with the pen around the part to keep.</li><li><b>Erase</b>: draw over the part to erase with the pen.</li><li><b>Remove background</b>: keep the subject and drop what is behind it.</li><li><b>Make sticker</b>: turn the picture into a sticker.</li><li><b>Document</b>: straighten a photographed page as a document.</li></ul></td><td>🔵&nbsp;In&nbsp;progress<br><a href="https://github.com/martonpaulo/ink-tools/releases?q=image-editing&amp;expanded=true">Download</a></td></tr>
  <tr><td><img src="plugins/device-transfer/assets/icon.png" width="48" height="48" alt=""><br><b>Device Transfer</b><br><a href="plugins/device-transfer/"><code>plugins/device-transfer/</code></a></td><td>Plugin</td><td><ul><li><b>Send Page</b>: send the open page to an iPhone or a Mac over LocalSend.</li><li><b>Send Selection</b>: send a lasso selection as a picture.</li><li><b>Send Text</b>: send lassoed handwriting as typed text.</li><li><b>Receive</b>: receive text, a picture or a PDF into the open note.</li></ul></td><td>🟡&nbsp;Beta<br><a href="https://github.com/martonpaulo/ink-tools/releases?q=device-transfer&amp;expanded=true">Download</a></td></tr>
  <tr><td><img src="plugins/account-sync/assets/icon.png" width="48" height="48" alt=""><br><b>Account Sync</b><br><a href="plugins/account-sync/"><code>plugins/account-sync/</code></a></td><td>Plugin</td><td><ul><li><b>To-Do</b>: sync the tablet's to-dos with Todoist.</li><li><b>Calendar</b>: sync Google, iCloud and ICS calendars with the tablet's calendar.</li><li><b>Digest</b>: sync the Digest with your accounts.</li></ul></td><td>🔵&nbsp;In&nbsp;progress<br><a href="https://github.com/martonpaulo/ink-tools/releases?q=account-sync&amp;expanded=true">Download</a></td></tr>
  <tr><td><img src="design/icons/apps/handwriting-language.png" width="48" height="48" alt=""><br><b>Handwriting Language</b><br><a href="apps/handwriting-language/"><code>apps/handwriting-language/</code></a></td><td>App</td><td><ul><li><b>Switch Language</b>: switch the handwriting recognition language of the whole tablet with one tap.</li><li><b>Floating button</b>: a small button where you write, shown only while there is text or ink input.</li></ul></td><td>🟡&nbsp;Beta</td></tr>
  <tr><td><img src="design/icons/apps/ink-notebook-editor.png" width="48" height="48" alt=""><br><b>Ink Notebook Editor</b><br><a href="apps/ink-notebook-editor/"><code>apps/ink-notebook-editor/</code></a></td><td>Mac app</td><td><ul><li><b>Open a note</b>: read a <code>.note</code> notebook on the Mac and page through it.</li><li><b>Open from Tablet</b>: copy a note from the tablet over the cable through <code>inkctl</code> and open the copy.</li><li><b>Edit</b>: edit a note without breaking the format (planned).</li></ul></td><td>🔵&nbsp;In&nbsp;progress</td></tr>
</table>

The tablet enables at most 10 plugins, so plugins group by surface of use; the rows show that target and Status shows today ([#304](https://github.com/martonpaulo/ink-tools/issues/304)).

## Developer tools

<table>
  <tr><th width="190">Name</th><th width="80">Type</th><th width="550">What it does</th></tr>
  <tr><td><b>Ink Tools CLI</b><br><a href="cli/inkctl/"><code>cli/inkctl/</code></a></td><td>CLI</td><td><ul><li><b>Control</b>: <code>inkctl</code> controls the tablet over Wi-Fi ADB or USB with direct calls, JSON answers and stable exit codes, without root.</li><li><b>Plugins</b>: install, enable, permit and uninstall plugins with no screen.</li><li><b>Notes and ink</b>: open notes, write synthetic ink, lasso and read the screen for tests.</li><li><b>Firmware watch</b>: on connect, probe every Supernote internal and report what a firmware update broke (planned).</li></ul></td></tr>
  <tr><td><b>Ink Tools Helper</b><br><code>apps/ink-tools-helper/</code></td><td>App</td><td><ul><li><b>Plugin settings</b>: lets <code>inkctl</code> install, enable and permit plugins through PluginHost's settings service.</li><li><b>Firmware watch</b>: at boot after a firmware change, probe every Supernote internal and report what broke (planned).</li></ul></td></tr>
  <tr><td><b>Ink Tools Probe</b><br><code>plugins/ink-tools-probe/</code></td><td>Plugin</td><td><ul><li><b>Run Command</b>: the sidebar button <code>inkctl</code> presses to write ink and lasso with no pen.</li><li><b>Probes</b>: quick on-device experiments against the tablet's providers. Never shipped.</li></ul></td></tr>
</table>

## Shared code

<table>
  <tr><th width="190">Name</th><th width="80">Type</th><th width="550">What it does</th></tr>
  <tr><td><b>sn-adapter</b><br><a href="packages/sn-adapter/"><code>packages/sn-adapter/</code></a></td><td>Package</td><td><ul><li><b>Official tier</b>: every <code>sn-plugin-lib</code> call, each returning a result.</li><li><b>Internals tier</b>: the content providers, read from a descriptor written from the registry.</li></ul></td></tr>
  <tr><td><b>sync-core</b><br><a href="packages/sync-core/"><code>packages/sync-core/</code></a></td><td>Package</td><td><ul><li><b>Sync</b>: diff, recurrence expansion, mapping and module orchestration for Account Sync.</li></ul></td></tr>
  <tr><td><b>ink-core</b><br><a href="packages/ink-core/"><code>packages/ink-core/</code></a></td><td>Package</td><td><ul><li><b>Handwriting</b>: handwrite, recognise, the lasso query and the placement on the page.</li><li><b>Dictionaries</b>: the dictionary interface with Wiktionary definitions, and the offline Chinese pinyin index.</li></ul></td></tr>
  <tr><td><b>picture-search</b><br><a href="packages/picture-search/"><code>packages/picture-search/</code></a></td><td>Package</td><td><ul><li><b>Picture search</b>: the sources, the ranking and the pixel measures behind the picture buttons.</li><li><b>Insert best picture</b>: the cached search, the stored thumbnails and the insert.</li></ul></td></tr>
  <tr><td><b>ui-kit</b><br><a href="packages/ui-kit/"><code>packages/ui-kit/</code></a></td><td>Package</td><td><ul><li><b>Native controls</b>: the Settings look every plugin shares, measured from the tablet's own screens.</li><li><b>Renders</b>: every plugin's Settings drawn as the tablet shows them, for checks.</li></ul></td></tr>
  <tr><td><b>native-build</b><br><a href="packages/native-build/"><code>packages/native-build/</code></a></td><td>Package</td><td><ul><li><b>Native build</b>: javac, D8 and aapt2 into the plugin's <code>app.npk</code>, shared by every plugin with native code.</li></ul></td></tr>
  <tr><td><b>Registry of internals</b><br><a href="registry/"><code>registry/</code></a></td><td>Package</td><td><ul><li><b>Registry</b>: every Supernote internal a tool reads, with its level, owner and probe.</li><li><b>Readers</b>: the generated TypeScript, Java, Python and Swift readers each tool uses.</li></ul></td></tr>
</table>

**This is unofficial.** Not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its
owner, used here only to name the device. No root, no modified firmware, no exploits.

## License

[CC BY-NC-SA 4.0](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
