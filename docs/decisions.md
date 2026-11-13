# Supernote Tools decisions

The history of consequential decisions. Each current rule lives where the last column says; this
page is the only home of decision history.

## Decision index

| Date | Decision | What it replaced | Where the rule lives |
| :--- | :--- | :--- | :--- |
| 2026-11-13 | Build `supernote-tools` as a monorepo; move `ink2pic` and `supernote-adb` in with full Git history; archive the original repositories and make them private, each with a move notice | three separate repositories | [`README.md`](../README.md#history), [`AGENTS.md`](../AGENTS.md#project-identity-and-policy) |
| 2026-11-13 | Closed issues stay in the archived repositories so commit `(#N)` references keep resolving; only open issues were migrated | transferring every issue | this index |
| 2026-11-13 | CI, versioning and releases are per subproject; the root carries shared policy and a route map | a single-project layout | [`AGENTS.md`](../AGENTS.md#project-identity-and-policy) |
| 2026-11-13 | Research tools and projects that already exist — plugins, sideloaded Supernote apps, GitHub code, CLIs, services — before building anything new | nothing | [`AGENTS.md`](../AGENTS.md#scope-reuse-and-implementation) |
| 2026-11-13 | Calendar Bridge signs in with its **own** Google account (device-code flow, OAuth client `supernote-tools`), not the Supernote Calendar app's stored session; the device framework guard blocks a plugin from reading any other app's data at every path including native `Os.open` | reusing the Supernote Calendar app's Google session | [`calendar-bridge/AGENTS.md`](../plugins/calendar-bridge/AGENTS.md); private workbench research note |
| 2026-11-13 | Calendar Bridge writes aggregated events into the native Calendar as `tag=task` rows (the native Google sync reads only `tag=event`), expanding recurrences per day | nothing | [`calendar-bridge/AGENTS.md`](../plugins/calendar-bridge/AGENTS.md) |
| 2026-11-13 | Ink2Pic becomes lasso-only, dropping last-word recognition; a separate image-edit plugin is future work; sticker-vs-image is to be tested on the device | last-word recognition; one plugin doing search and editing | [`issue #32`](https://github.com/martonpaulo/supernote-tools/issues/32), [`ROADMAP.md`](../ROADMAP.md) |
