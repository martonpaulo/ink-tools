<div align="center">

# Supernote Tools

Unofficial tools for Supernote e-ink tablets: a calendar-sync plugin, a handwriting-to-picture plugin, and an ADB control CLI.

</div>

A monorepo of independent subprojects. Each keeps its own `AGENTS.md`, versioning and releases.

| Subproject | What it is |
| :--- | :--- |
| [`plugins/bridge/`](plugins/bridge/) | A settings-only plugin with to-do, calendar and digest modules, each opt in. **Scaffolded** — see its open issues. |
| [`plugins/ink2pic/`](plugins/ink2pic/) | Write a word by hand, lasso it, and insert a matching picture from Openclipart or Wikimedia Commons. Keyless, no phone needed. |
| [`plugins/probe/`](plugins/probe/) | A developer-only plugin for quick on-device experiments. Never shipped to users. |
| [`packages/`](packages/) | Shared, provider-agnostic building blocks the plugins use: `sn-adapter`, `sync-core` and `ink-core`. |
| [`cli/snadb/`](cli/snadb/) | Control a Supernote over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root. |

**This is unofficial.** Not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its
owner, used here only to name the device. No root, no modified firmware, no exploits.

## History

`ink2pic` and `supernote-adb` were separate repositories, moved here with their full Git history on
2026-11-13 (`martonpaulo/ink2pic`, `martonpaulo/supernote-adb`, now archived).

## License

[MIT](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
