# Probe — agent guidance

Scoped guidance for `plugins/ink-tools-probe/`. Inherits the repository root `../../AGENTS.md`. A `CLAUDE.md`
symlink points at this file.

## What it is

A permanent developer-only Supernote plugin ([#39](https://github.com/martonpaulo/supernote-tools/issues/39)) for one-off on-device experiments: read content
providers, test writes, check framework guards, log to logcat. Same runtime and pinned versions as
the other plugins. Never shipped to users; its `.snplg` is a build output, not a release. Its display
name is «Ink Tools Probe», applied with the folder rename of [#194](https://github.com/martonpaulo/ink-tools/issues/194); `pluginID` never changes.

## Rules

- A probe goes only in `probeBody` (`src/probe.ts`). Reset it to the default body before landing, so
  `main` always holds the default: the runtime keys and the native Digest-provider probe ([#59](https://github.com/martonpaulo/supernote-tools/issues/59)).
- The command helper is a permanent part, outside `probeBody` ([#148](https://github.com/martonpaulo/ink-tools/issues/148)): «Run Command», a note sidebar button and
  a lasso menu row for calls that need a lasso made by hand ([#249](https://github.com/martonpaulo/ink-tools/issues/249)) (`src/register.ts`), reads inkctl's command file `command.json` in its folder of the hidden `.data/plugin/inktools-probe/`, which Supernote Cloud does not sync ([#22](https://github.com/martonpaulo/ink-tools/issues/22)) (`ProbeCommandFile`,
  only that folder), runs it through `src/helper.ts` (insert strokes, lasso a rect or the last
  element, read the lassoed strokes, jump to a page and read it back; render a page to PNG, place a
  picture from that folder, add a text box, insert a page with a system template, [#261](https://github.com/martonpaulo/ink-tools/issues/261); save and insert a sticker, read and move the lasso box, list and delete a file in that folder or the plugin's own `collection/` folder, for Collection's device measures, [#249](https://github.com/martonpaulo/ink-tools/issues/249); move a page of a closed note in `Note/` by path through the file API, a new page with the old one's elements, then the old one removed, [#263](https://github.com/martonpaulo/ink-tools/issues/263); the MD5 of a note in `Note/` read through the file API, [#522](https://github.com/martonpaulo/ink-tools/issues/522)) and logs `SNPROBE answer <id> <n>/<count> <json>` under
  `ReactNativeJS`. A `batch` command runs a list of these in one press and answers each step; a `requireNote` step refuses, code 3, when the open note is outside the folder it names, so inkctl's test-note check needs no screen read ([#286](https://github.com/martonpaulo/ink-tools/issues/286)). After each command `src/command.ts` reads the file again every 270 ms for 120 s and runs a new id with no press; an id runs at most once, and a press of one already run logs its answer again ([#286](https://github.com/martonpaulo/ink-tools/issues/286)). `cli/inkctl/src/inkctl` owns the other side; change both together. The helper
  only executes: text to strokes and every refusal live in the CLI. The probe view runs the probe
  on «Run Probe», never on mount, because a «Run Command» press mounts the view's component too.
- «Run Probe» also runs by command, with no screen: `src/actions.ts` gives sn-adapter's action channel (`@ink-tools/sn-adapter/actions`) the `run-probe` action and the reader of `action.json` in the same folder ([#283](https://github.com/martonpaulo/ink-tools/issues/283)). At start, `ProbeLegacyFiles` removes the files older builds left in `MyStyle/Probe/` ([#148](https://github.com/martonpaulo/ink-tools/issues/148)).
- The view is drawn with `@ink-tools/ui-kit` ([#257](https://github.com/martonpaulo/ink-tools/issues/257)): the title bar's × closes it; a probe that throws `NeedError` (`src/probe.ts`) shows the Needs state with its steps, any other throw the Error state with Retry, and `run-probe` by command fails on either. Its copy is `src/copy.ts`.
- Lines are logged with the tag `SNPROBE`. Never log a secret or a person's data.
- Validate with `npm run validate`. A result found on the device goes to the issue or a research
  note, never kept as a claim without the device run.
- The native module is `native/src/com/probe/providers/`; its URIs and the command folder come from the
  registry through `Registry.java`, which `scripts/registry.py` writes, as `helper.ts` reads the command
  channel through `@ink-tools/sn-adapter/registry` ([#294](https://github.com/martonpaulo/ink-tools/issues/294)); its other targets (marker columns, the Calendar's and
  To-Do's NOT NULL columns and the row key, [#208](https://github.com/martonpaulo/ink-tools/issues/208), [#217](https://github.com/martonpaulo/ink-tools/issues/217)) mirror
  `packages/sn-adapter/src/internals/descriptor.json`, and `ProbeTargetsTest` keeps them equal to it; a descriptor
  change runs this gate. Whether an insert wrote a row is sn-adapter's `InsertAnswer`, shared with Account Sync. It only reads, and inserts one row marked
  `SNPROBE dry insert` that it reverts at once, except in the Calendar, whose write test is an update
  of `status` selected by row id `-1` that changes no row ([#213](https://github.com/martonpaulo/ink-tools/issues/213)); it never logs a row's value. `npm run build` must give
  a `Probe.snplg` that holds `app.npk` (native step), never a JS-only package.
