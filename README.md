<div align="center">

<img src="design/icon.svg" width="96" height="96" alt="">

# Supernote Tools

Unofficial tools for Supernote e-ink tablets: a calendar-sync plugin, a handwriting-to-picture plugin, and an ADB control CLI.

</div>

A monorepo of independent subprojects of four kinds: device **plugins** that run inside the
Supernote's plugin host, a sideloaded **tablet app**, a **Mac CLI** and a planned **Mac app**. Each
keeps its own `AGENTS.md`, versioning and releases. Plugins and the tablet app use SemVer with a
numbered beta: a test build reads `0.2.0-beta.3` on GitHub and `0.2.0 beta 3` on the tablet
([#155](https://github.com/martonpaulo/supernote-tools/issues/155)).

| Subproject | Kind | What it is |
| :--- | :--- | :--- |
| [`plugins/lookup/`](plugins/lookup/) | plugin | Write a word by hand, lasso it, and insert an illustration, a photo, a short definition or a translation; «Choose Image» opens the results to pick one. It replaces Ink2Pic. **Beta, device round pending** — see [#45](https://github.com/martonpaulo/supernote-tools/issues/45). |
| [`plugins/bridge/`](plugins/bridge/) | plugin | A settings-only plugin with to-do, calendar and digest modules, each opt in. **Scaffolded** — see its open issues. |
| [`plugins/retouch/`](plugins/retouch/) | plugin | Lasso a picture on the page and make it readable on e-ink with one tap: Enhance, Lighter, Darker, Undo and Restore original. **Built, device round pending** — see [#136](https://github.com/martonpaulo/supernote-tools/issues/136). |
| [`plugins/relay/`](plugins/relay/) | plugin | Send the current page or a lasso selection as a picture to an iPhone or a Mac over LocalSend, with one tap, and receive text or a picture into the open note. **Built, device round pending** — see [#98](https://github.com/martonpaulo/supernote-tools/issues/98), [#49](https://github.com/martonpaulo/supernote-tools/issues/49). |
| [`plugins/probe/`](plugins/probe/) | plugin | A developer-only plugin for quick on-device experiments. Never shipped to users. |
| [`plugins/ink2pic/`](plugins/ink2pic/) | plugin | Insert a matching picture for a lassoed word. **Retired** and uninstalled from the tablet: Lookup replaces it ([#45](https://github.com/martonpaulo/supernote-tools/issues/45)). It gets no new work. |
| [`plugins/lingo/`](plugins/lingo/) | plugin | Insert the translation of a lassoed word. **Retiring**: translation is now Lookup's «Insert translation» ([#158](https://github.com/martonpaulo/supernote-tools/issues/158)); the folder goes once that button passes on the tablet ([#161](https://github.com/martonpaulo/supernote-tools/issues/161)). |
| [`apps/lingo-app/`](apps/lingo-app/) | tablet app | Lingo: switch the handwriting recognition language of the whole tablet with one tap, from a floating button or its sidebar entry. **Test build, device round pending** — see [#157](https://github.com/martonpaulo/supernote-tools/issues/157). |
| [`cli/snadb/`](cli/snadb/) | Mac CLI | Control a Supernote over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root. |
| Supernote Editor | Mac app | Read and edit `.note` files on the Mac without breaking the format. **Planned**, not yet a folder — see [#48](https://github.com/martonpaulo/supernote-tools/issues/48). |
| [`packages/`](packages/) | shared code | Shared, provider-agnostic building blocks the plugins bundle: `sn-adapter`, `sync-core`, `ink-core`, `picture-search` and `ui-kit`. |

Proposed, not built: **Typeset**, a plugin that turns each handwritten word into typed text in a
chosen font, with no lasso; it waits on the owner's choice
([#144](https://github.com/martonpaulo/supernote-tools/issues/144), [the research](docs/research/2026-11-live-handwriting-to-text.md)).

**This is unofficial.** Not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its
owner, used here only to name the device. No root, no modified firmware, no exploits.

## History

`ink2pic` and `supernote-adb` were separate repositories, moved here with their full Git history on
2026-11-13 (`martonpaulo/ink2pic`, `martonpaulo/supernote-adb`, now archived).

## License

[MIT](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
