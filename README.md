<div align="center">

<img src="design/icon.svg" width="96" height="96" alt="">

# Ink Tools

Unofficial tools for Supernote e-ink tablets: device plugins, a tablet app, a Mac CLI and a planned Mac notebook editor.

</div>

A monorepo of independent subprojects of four kinds: device **plugins** that run inside the
tablet's plugin host, a sideloaded **tablet app**, a **Mac CLI** and a planned **Mac app**. Each
keeps its own `AGENTS.md`, versioning and releases; plugins and the tablet app use SemVer with a
numbered beta.

| Tool | Kind | What it does | Status |
| :--- | :--- | :--- | :--- |
| **Word Lookup**<br><sub>[`plugins/word-lookup/`](plugins/word-lookup/)</sub> | plugin | Write a word by hand, lasso it, and insert an illustration, a photo, a short definition or a translation; «Choose Image» opens the results to pick one. | 🟡 Beta |
| **Real-Time Conversion**<br><sub>[`plugins/real-time-conversion/`](plugins/real-time-conversion/)</sub> | plugin | While «Real-Time Text» is on, each handwritten word becomes typed text at its place, with no lasso; drawings stay handwriting, and «Undo Conversion» brings the last word back. | 🟡 Beta |
| **Smart Shapes**<br><sub>[`plugins/smart-shapes/`](plugins/smart-shapes/)</sub> | plugin | Draw a triangle, circle, square, rectangle or arrow and hold the pen still at the end: it becomes a clean shape; letters stay handwriting. | 🟡 Beta |
| **Account Sync**<br><sub>[`plugins/account-sync/`](plugins/account-sync/)</sub> | plugin | Sync to-dos, calendars and a digest with your accounts, each module opt in. | 🔵 In progress |
| **Image Editing**<br><sub>[`plugins/image-editing/`](plugins/image-editing/)</sub> | plugin | Lasso a picture on the page and make it readable on e-ink with one tap. | 🔵 In progress |
| **Device Transfer**<br><sub>[`plugins/device-transfer/`](plugins/device-transfer/)</sub> | plugin | Send the page or a lasso selection to an iPhone or a Mac over LocalSend, and receive text or a picture into the open note. | 🟡 Beta |
| **Handwriting Language**<br><sub>[`apps/handwriting-language/`](apps/handwriting-language/)</sub> | tablet app | Switch the handwriting recognition language of the whole tablet with one tap. | 🟡 Beta |
| Ink Tools Bridge<br><sub>[`apps/inktools-bridge/`](apps/inktools-bridge/)</sub> | tablet app | Lets `inkctl` install, enable and permit plugins with no screen, through PluginHost's settings service. Developer-only. | ⚫ Internal |
| **inkctl**<br><sub>[`cli/inkctl/`](cli/inkctl/)</sub> | Mac CLI | Control the tablet over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root. | 🟢 Working |
| **Ink Notebook Editor**<br><sub>[`apps/ink-notebook-editor/`](apps/ink-notebook-editor/)</sub> | Mac app | Read and edit `.note` notebooks on the Mac without breaking the format. | ⚪ Planned |
| Plugin Diagnostics<br><sub>[`plugins/plugin-diagnostics/`](plugins/plugin-diagnostics/)</sub> | plugin | Quick on-device experiments for developers. Never shipped. | ⚫ Internal |
| Shared code<br><sub>[`packages/`](packages/)</sub> | packages | `sn-adapter`, `sync-core`, `ink-core`, `picture-search` and `ui-kit`, bundled by the plugins. | ⚫ Internal |

**This is unofficial.** Not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its
owner, used here only to name the device. No root, no modified firmware, no exploits.

## License

[MIT](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
