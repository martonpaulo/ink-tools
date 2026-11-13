<div align="center">

# Supernote Tools

Unofficial tools for Supernote e-ink tablets.

</div>

A monorepo of independent subprojects. Each keeps its own `AGENTS.md`, versioning and releases.

| Subproject | What it is |
| :--- | :--- |
| [`plugins/calendar-bridge/`](plugins/calendar-bridge/) | A plugin that syncs the owner's Google, Apple and ICS calendars with the native Supernote Calendar, two-way where the source allows. **In planning** — see its open issues. |
| [`plugins/ink2pic/`](plugins/ink2pic/) | Write a word by hand, lasso it, and insert a matching picture from Openclipart or Wikimedia Commons. Keyless, no phone needed. |
| [`cli/supernote-adb/`](cli/supernote-adb/) | Control a Supernote over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root. |

**This is unofficial.** Not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its
owner, used here only to name the device. No root, no modified firmware, no exploits.

## History

`ink2pic` and `supernote-adb` were separate repositories, moved here with their full Git history on
2026-11-13 (`martonpaulo/ink2pic`, `martonpaulo/supernote-adb`, now archived).

## License

[MIT](LICENSE) © 2026 Marton Paulo. Each subproject preserves its own `NOTICE.md` and third-party
notices.
