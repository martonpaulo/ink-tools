<div align="center">

<img src="design/icon.svg" width="96" height="96" alt="">

# Supernote Tools

Unofficial tools for Supernote e-ink tablets: a calendar-sync plugin, a handwriting-to-picture plugin, and an ADB control CLI.

</div>

A monorepo of independent subprojects. Each keeps its own `AGENTS.md`, versioning and releases.

| Subproject | What it is |
| :--- | :--- |
| [`plugins/bridge/`](plugins/bridge/) | A settings-only plugin with to-do, calendar and digest modules, each opt in. **Scaffolded** — see its open issues. |
| [`plugins/ink2pic/`](plugins/ink2pic/) | Write a word by hand, lasso it, and insert a matching picture from Openclipart or Wikimedia Commons. Keyless, no phone needed. |
| [`plugins/lingo/`](plugins/lingo/) | Write a word by hand, lasso it, and insert its translation; each language pair opt in. **Scaffolded** — see [#46](https://github.com/martonpaulo/supernote-tools/issues/46). |
| [`plugins/lookup/`](plugins/lookup/) | Write a word by hand, lasso it, and insert a picture, a photo or a short definition; the next step of Ink2Pic, installed beside it. **Scaffolded** — see [#110](https://github.com/martonpaulo/supernote-tools/issues/110). |
| [`plugins/relay/`](plugins/relay/) | Send the current page or a lasso selection as a picture to an iPhone or a Mac over LocalSend, with one tap. **Built, device round pending** — see [#98](https://github.com/martonpaulo/supernote-tools/issues/98). |
| [`plugins/probe/`](plugins/probe/) | A developer-only plugin for quick on-device experiments. Never shipped to users. |
| [`packages/`](packages/) | Shared, provider-agnostic building blocks for the plugins: `sn-adapter`, `sync-core` and `ink-core`. Built and tested; no plugin uses them yet. |
| [`cli/snadb/`](cli/snadb/) | Control a Supernote over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root. |

**This is unofficial.** Not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its
owner, used here only to name the device. No root, no modified firmware, no exploits.

## History

`ink2pic` and `supernote-adb` were separate repositories, moved here with their full Git history on
2026-11-13 (`martonpaulo/ink2pic`, `martonpaulo/supernote-adb`, now archived).

## License

[MIT](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
