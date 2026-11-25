<div align="center">

<img src="design/icon.svg" width="96" height="96" alt="">

# Ink Tools

Unofficial tools for Supernote e-ink tablets: device plugins, a tablet app, a Mac CLI and a planned Mac notebook editor.

</div>

A monorepo of independent subprojects. Each keeps its own `AGENTS.md`, versioning and releases;
plugins and the tablet apps use SemVer with a numbered beta.

## Plugins

Run inside the tablet's plugin host.

| Plugin | What it does | Status |
| :--- | :--- | :--- |
| **Word Lookup**<br><sub>[`plugins/word-lookup/`](plugins/word-lookup/)</sub> | Write a word by hand, lasso it, and insert an illustration, a photo, a short definition or a translation; «Choose Image» opens the results to pick one. | 🟡<br>Beta |
| **Real-Time Conversion**<br><sub>[`plugins/real-time-conversion/`](plugins/real-time-conversion/)</sub> | While «Real-Time Text» is on, each handwritten word becomes typed text at its place, with no lasso; drawings stay handwriting, and «Undo Conversion» brings the last word back. | 🟡<br>Beta |
| **Smart Shapes**<br><sub>[`plugins/smart-shapes/`](plugins/smart-shapes/)</sub> | Draw a triangle, circle, square, rectangle or arrow and hold the pen still at the end: it becomes a clean shape; letters stay handwriting. | 🟡<br>Beta |
| **Device Transfer**<br><sub>[`plugins/device-transfer/`](plugins/device-transfer/)</sub> | Send the page or a lasso selection to an iPhone or a Mac over LocalSend, and receive text or a picture into the open note. | 🟡<br>Beta |
| **Account Sync**<br><sub>[`plugins/account-sync/`](plugins/account-sync/)</sub> | Sync to-dos, calendars and a digest with your accounts, each module opt in. | 🔵<br>In progress |
| **Image Editing**<br><sub>[`plugins/image-editing/`](plugins/image-editing/)</sub> | Lasso a picture on the page and make it readable on e-ink with one tap. | 🔵<br>In progress |
| Plugin Diagnostics<br><sub>[`plugins/plugin-diagnostics/`](plugins/plugin-diagnostics/)</sub> | Quick on-device experiments for developers. Never shipped. | ⚫<br>Internal |

## Tablet apps

Sideloaded Android apps.

| App | What it does | Status |
| :--- | :--- | :--- |
| **Handwriting Language**<br><sub>[`apps/handwriting-language/`](apps/handwriting-language/)</sub> | Switch the handwriting recognition language of the whole tablet with one tap. | 🟡<br>Beta |
| Ink Tools Bridge<br><sub>[`apps/inktools-bridge/`](apps/inktools-bridge/)</sub> | Lets `inkctl` install, enable and permit plugins with no screen, through PluginHost's settings service. Developer-only. | ⚫<br>Internal |

## Mac CLI

| Tool | What it does | Status |
| :--- | :--- | :--- |
| **inkctl**<br><sub>[`cli/inkctl/`](cli/inkctl/)</sub> | Control the tablet over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root. | 🟢<br>Working |

## Mac app

| App | What it does | Status |
| :--- | :--- | :--- |
| **Ink Notebook Editor**<br><sub>[`apps/ink-notebook-editor/`](apps/ink-notebook-editor/)</sub> | Read and edit `.note` notebooks on the Mac without breaking the format. | ⚪<br>Planned |

## Shared code

| Package | What it does | Status |
| :--- | :--- | :--- |
| Shared code<br><sub>[`packages/`](packages/)</sub> | `sn-adapter`, `sync-core`, `ink-core`, `picture-search` and `ui-kit`, bundled by the plugins. | ⚫<br>Internal |

**This is unofficial.** Not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its
owner, used here only to name the device. No root, no modified firmware, no exploits.

## License

[CC BY-NC-SA 4.0](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
