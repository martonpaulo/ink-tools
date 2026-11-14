# Probe — agent guidance

Scoped guidance for `plugins/probe/`. Inherits the repository root `../../AGENTS.md`. A `CLAUDE.md`
symlink points at this file.

## What it is

A permanent developer-only Supernote plugin (#39) for one-off on-device experiments: read content
providers, test writes, check framework guards, log to logcat. Same runtime and pinned versions as
`../ink2pic`. Never shipped to users; its `.snplg` is a CI artifact, not a release.

## Rules

- A probe goes only in `probeBody` (`src/probe.ts`). Reset it to the default body before landing, so
  `main` always holds the harmless default.
- Lines are logged with the tag `SNPROBE`. Never log a secret or a person's data.
- Validate with `npm run validate`. A result found on the device goes to the issue or a research
  note, never kept as a claim without the device run.
