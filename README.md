<div align="center">

<img src="design/icon.svg" width="96" height="96" alt="">

# Ink Tools

Unofficial tools for Supernote e-ink tablets: device plugins, a tablet app, a Mac CLI and a planned Mac notebook editor.

</div>

A monorepo of independent subprojects of four kinds: device **plugins** that run inside the
tablet's plugin host, a sideloaded **tablet app**, a **Mac CLI** and a planned **Mac app**. Each
keeps its own `AGENTS.md`, versioning and releases. Plugins and the tablet app use SemVer with a
numbered beta: a test build reads `0.2.0-beta.3` on GitHub and `0.2.0 beta 3` on the tablet
([#155](https://github.com/martonpaulo/ink-tools/issues/155)).

| Tool | Kind | What it does | Status |
| :--- | :--- | :--- | :--- |
| **Word Lookup**<br><sub>[`plugins/lookup/`](plugins/lookup/)</sub> | plugin | Write a word by hand, lasso it, and insert an illustration, a photo, a short definition or a translation; «Choose Image» opens the results to pick one. | Beta 4, with translation ([#45](https://github.com/martonpaulo/ink-tools/issues/45)) |
| **Real-Time Conversion**<br><sub>[`plugins/real-time-conversion/`](plugins/real-time-conversion/)</sub> | plugin | While «Real-Time Text» is on, each handwritten word becomes typed text at its place, with no lasso; drawings stay handwriting, and «Undo Conversion» brings the last word back. | Beta 1, not yet on the tablet ([#144](https://github.com/martonpaulo/ink-tools/issues/144)) |
| **Account Sync**<br><sub>[`plugins/bridge/`](plugins/bridge/)</sub> | plugin | Sync to-dos, calendars and a digest with your accounts, each module opt in. | Being built |
| **Image Editing**<br><sub>[`plugins/retouch/`](plugins/retouch/)</sub> | plugin | Lasso a picture on the page and make it readable on e-ink with one tap. | 13 edits; style grid, crop and erase in progress ([#136](https://github.com/martonpaulo/ink-tools/issues/136)) |
| **Device Transfer**<br><sub>[`plugins/relay/`](plugins/relay/)</sub> | plugin | Send the page or a lasso selection to an iPhone or a Mac over LocalSend, and receive text or a picture into the open note. | Sends and receives; PDF receive fix in progress ([#98](https://github.com/martonpaulo/ink-tools/issues/98)) |
| **Real-Time Conversion**<br><sub>`typeset`, no folder yet</sub> | plugin | Turn each handwritten word into typed text in a chosen font, with no lasso, and undo the last conversion. | Planned, build next ([#144](https://github.com/martonpaulo/ink-tools/issues/144), [the research](docs/research/2026-11-live-handwriting-to-text.md)) |
| **Handwriting Language**<br><sub>[`apps/lingo-app/`](apps/lingo-app/)</sub> | tablet app | Switch the handwriting recognition language of the whole tablet with one tap. | Test build, device round pending ([#157](https://github.com/martonpaulo/ink-tools/issues/157)) |
| **inkctl**<br><sub>[`cli/inkctl/`](cli/inkctl/)</sub> | Mac CLI | Control the tablet over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root. | In use |
| **Ink Notebook Editor**<br><sub>[`apps/ink-notebook-editor/`](apps/ink-notebook-editor/)</sub> | Mac app | Read and edit `.note` notebooks on the Mac without breaking the format. | Planned; a faithful reader first ([#48](https://github.com/martonpaulo/ink-tools/issues/48)) |
| Probe<br><sub>[`plugins/probe/`](plugins/probe/)</sub> | plugin | Quick on-device experiments for developers. Never shipped. | Internal |
| Shared code<br><sub>[`packages/`](packages/)</sub> | packages | `sn-adapter`, `sync-core`, `ink-core`, `picture-search` and `ui-kit`, bundled by the plugins. | Internal |

Retired: [`plugins/ink2pic/`](plugins/ink2pic/) (Word Lookup replaces it) and
[`plugins/lingo/`](plugins/lingo/) (translation is now in Word Lookup, [#161](https://github.com/martonpaulo/ink-tools/issues/161)).

**This is unofficial.** Not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its
owner, used here only to name the device. No root, no modified firmware, no exploits.

## License

[MIT](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
