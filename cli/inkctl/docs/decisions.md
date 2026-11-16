# Decisions

## Decision index

| Date | Source | What changed | What it replaced | Where the rule lives |
| :--- | :--- | :--- | :--- | :--- |
| 2026-11-10 | Owner | The command became its own public project, with fresh history. | A script inside Skill Deck. | [`product.md`](product.md#boundaries) |
| 2026-11-10 | Owner | The name is `supernote-adb`, and the command stays `supernote`. | No project name. | `AGENTS.md` |
| 2026-11-14 | Owner | The name and the command became `snadb`, in the monorepo ([#72](https://github.com/martonpaulo/supernote-tools/issues/72)). | `supernote-adb` and `supernote`. | `AGENTS.md` |
| 2026-11-16 | Owner | The name and the command became `inkctl`, a brand-free name of the «ctl» family of tools that control a device; `snadb` stays as a shim that prints one deprecation line and forwards, and `~/.config/snadb/address` is still read ([#173](https://github.com/martonpaulo/supernote-tools/issues/173)). | `snadb`, and `Supernote ADB` as the display name. | `AGENTS.md` |
| 2026-11-10 | Owner | Only research from public sources is versioned here. | Notes kept only on the author's computer. | [`research/`](research/) |
| 2026-11-10 | Owner | Concepts, code or integration from `supernote-mcp` and `inkbridge` are in scope. | No reuse direction. | [`product.md`](product.md#reuse) |
| 2026-11-10 | Owner | The project keeps a recorded set of routines. | Only the setup defaults. | [`routines.md`](routines.md) |
| 2026-11-10 | Owner | An official firmware update is in scope; a modified firmware stays out. | No firmware change at all. | [`product.md`](product.md#what-it-will-never-do) |
| 2026-11-10 | Owner | Calendar and Todoist sync run on Task Hub, outside this project. | A sync job considered for this project. | [`product.md`](product.md#boundaries) |
| 2026-11-10 | Owner | No MCP server over this command for now. The idea kept: touch the tablet only when called, which this command already does ([#2](https://github.com/martonpaulo/supernote-adb/issues/2)). | MCP server considered from `supernote-mcp`. | [`product.md`](product.md#reuse) |
| 2026-11-10 | Owner | No `Transport` seam: ADB is the only route, so a split would have one member ([#2](https://github.com/martonpaulo/supernote-adb/issues/2)). | `Transport` seam considered from `inkbridge`. | [`product.md`](product.md#reuse) |
| 2026-11-10 | Owner | The annotation round trip stays out. The concept kept: transcription belongs to the caller ([#2](https://github.com/martonpaulo/supernote-adb/issues/2)). | Annotation round trip considered from `inkbridge`. | [`product.md`](product.md#reuse) |
