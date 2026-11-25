# Probe — agent guidance

Scoped guidance for `plugins/plugin-diagnostics/`. Inherits the repository root `../../AGENTS.md`. A `CLAUDE.md`
symlink points at this file.

## What it is

A permanent developer-only Supernote plugin ([#39](https://github.com/martonpaulo/supernote-tools/issues/39)) for one-off on-device experiments: read content
providers, test writes, check framework guards, log to logcat. Same runtime and pinned versions as
`../ink2pic`. Never shipped to users; its `.snplg` is a build output, not a release. Its display
name is «Plugin Diagnostics», applied with the folder rename of [#194](https://github.com/martonpaulo/ink-tools/issues/194); `pluginID` never changes.

## Rules

- A probe goes only in `probeBody` (`src/probe.ts`). Reset it to the default body before landing, so
  `main` always holds the default: the runtime keys and the native Digest-provider probe ([#59](https://github.com/martonpaulo/supernote-tools/issues/59)).
- The command helper is a permanent part, outside `probeBody` ([#148](https://github.com/martonpaulo/ink-tools/issues/148)): the note sidebar button «Run Command»
  (`src/register.ts`) reads inkctl's command file `MyStyle/Probe/command.json` (`ProbeCommandFile`,
  only that folder), runs it through `src/helper.ts` (insert strokes, lasso a rect or the last
  element, read the lassoed strokes, jump to a page and read it back; render a page to PNG, place a
  picture from `MyStyle/Probe/`, add a text box, insert a page with a system template, [#261](https://github.com/martonpaulo/ink-tools/issues/261)) and logs `SNPROBE answer <id> <n>/<count> <json>` under
  `ReactNativeJS`. `cli/inkctl/src/inkctl` owns the other side; change both together. The helper
  only executes: text to strokes and every refusal live in the CLI. The probe view runs the probe
  on «Run Probe», never on mount, because a «Run Command» press mounts the view's component too.
- Lines are logged with the tag `SNPROBE`. Never log a secret or a person's data.
- Validate with `npm run validate`. A result found on the device goes to the issue or a research
  note, never kept as a claim without the device run.
- The native module is `native/src/com/probe/providers/`; its targets (URIs, marker columns, the Calendar's and
  To-Do's NOT NULL columns and the row key, [#208](https://github.com/martonpaulo/ink-tools/issues/208), [#217](https://github.com/martonpaulo/ink-tools/issues/217)) mirror
  `packages/sn-adapter/src/internals/descriptor.json`, and `ProbeTargetsTest` keeps them equal to it; a descriptor
  change runs this gate. Whether an insert wrote a row is sn-adapter's `InsertAnswer`, shared with Account Sync. It only reads, and inserts one row marked
  `SNPROBE dry insert` that it reverts at once; it never logs a row's value. `npm run build` must give
  a `Probe.snplg` that holds `app.npk` (native step), never a JS-only package.
