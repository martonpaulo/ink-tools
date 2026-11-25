# Ink2Pic product definition

Status: current, 2026-11-06. The research and plan behind it are in [`brief.md`](brief.md).

## Contents

- [What it is](#what-it-is)
- [Who it is for](#who-it-is-for)
- [The job](#the-job)
- [What it does](#what-it-does)
- [What it will never do](#what-it-will-never-do)
- [How you know it worked](#how-you-know-it-worked)
- [Constraints](#constraints)
- [Limits the owner set](#limits-the-owner-set)
- [Alternatives considered](#alternatives-considered)
- [Evidence on hand](#evidence-on-hand)
- [Accepted evidence gaps](#accepted-evidence-gaps)
- [Agent process rules](#agent-process-rules)

## What it is

Ink2Pic is a Supernote plugin: you write a word by hand, lasso it, and choose a picture of that
thing from the web, and the picture lands in your note.

## Who it is for

A Supernote Manta owner who studies or takes notes on the device and wants a picture of a real
thing (soup, a tree, a historical person) on the page, without a phone or a computer.

## The job

Put a fitting picture into the current note in a few seconds. Today the device has no way to do
this. The workarounds need a phone or computer, a manual import tap, or give a full-page template
background that cannot move ([brief section 13](brief.md#13-history-of-options-considered-and-rejected)).

## What it does

- Turns a lassoed handwritten word into a search, with the text editable before searching.
- Shows pictures from keyless public sources (Openclipart, Wikimedia Commons, with Wikidata naming
  a word's typical pictures, and OpenMoji symbols, which also work offline once saved), the most
  typical picture of the word first, six per page.
- Inserts the chosen picture with one tap, already sized and converted for the 16-gray screen.
- Keeps every inserted picture, with its license and attribution, in a library that works offline.
- Inserts a short Portuguese or Spanish definition of the lassoed word as a text box below it,
  from Wiktionary, with its own lasso button «Insert definition», shown only once the person turns
  it on in Settings ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)).
- Shows first the picture chosen in the grid for a word, the next time ([#34](https://github.com/martonpaulo/supernote-tools/issues/34)).
- Lets the person set, from the plugin's own Settings entry, the query languages and their order
  (default: the system language, then English; [#68](https://github.com/martonpaulo/ink2pic/issues/68)), the picture size, where it goes (below, beside, or in place
  of the word, deleted only on their tap), style, sources, data saver, and empty the Library tab;
  every other default is today's behaviour ([#70](https://github.com/martonpaulo/ink2pic/issues/70)).

## What it will never do

| Non-goal | Reason | Reopened when |
| :--- | :--- | :--- |
| Run or depend on a backend, proxy or Worker | The owner rejected any service to maintain | Never, by the owner's choice |
| Need a companion phone app | Everything happens on the Supernote | Never, by the owner's choice |
| Use sources that need an API key or account | Install must stay one file with no sign-up | A keyless source stops working and no keyless replacement exists |
| Ship a heavy component: a machine-learning model or runtime, or a large library, on the device | The owner wants the plugin light: search quality comes from rules, light pixel measures and better sources (owner, 2026-11-06) | Never, by the owner's choice |
| Localize the UI, or use a translation service | English is a requirement for the screens; queries in Portuguese, Spanish and Chinese are understood through Wikidata's own labels and the CLDR keywords of the OpenMoji index instead (owner, 2026-11-06, D4, [#67](https://github.com/martonpaulo/ink2pic/issues/67)) | Never, by the owner's choice |
| Create native `.snstk` sticker collections | Importing one always needs a manual tap | The SDK gains an import call without a tap |
| Put settings in the main flow | Defaults must make adjustment unnecessary | A device test shows a default that fails for real use |
| Support iOS or first-generation A5 / A6 | PluginHost runs on Android devices; the target is Manta | Nomad or A5X / A6X: when the owner has such a device to test on |

## How you know it worked

The MVP definition of done in [brief section 9.5](brief.md#95-definition-of-done-for-the-mvp):
on firmware 3.31.45, lasso a handwritten English word, tap, see results, tap one, and the picture is
in the note and the plugin is closed, in at most 3 taps and no keyboard. Saved pictures still
insert offline. No source or network failure is silent. No timing baseline exists yet; the first
device builds measure one.

## Constraints

- Device: Supernote Manta (A5 X2), firmware Chauvet 3.31.45, 1920 x 2560 px, 16 gray levels.
- Runtime locked by PluginHost: React Native 0.79.2, React 19.0.0, `sn-plugin-lib` 0.2.3 pinned
  exactly. Do not upgrade them separately.
- TypeScript everywhere; native Java only for what JavaScript provably cannot do
  ([brief section 6](brief.md#6-native-code-decision)).
- HTTPS only: PluginHost blocks cleartext HTTP.
- Wikimedia requires a descriptive User-Agent; it points to this public repository.
- The agent cannot reach the device. The owner runs every device test
  ([brief section 18](brief.md#18-device-test-protocol)).

## Limits the owner set

| Limit | Value | Set |
| :--- | :--- | :--- |
| Time to page 1 of a search | About 2 s on a good Wi-Fi | Owner, 2026-11-06 ([#65](https://github.com/martonpaulo/ink2pic/issues/65)) |
| Time to insert a picture | About 1.5 s on a good Wi-Fi | Owner, 2026-11-06 |
| Extra requests when a search finds nothing or fewer than one page | At most 3 | Owner, 2026-11-06 ([#71](https://github.com/martonpaulo/ink2pic/issues/71), [#84](https://github.com/martonpaulo/ink2pic/issues/84)) |
| Weight on the device | No machine-learning model or runtime, no large library | Owner, 2026-11-06 |

## Alternatives considered

New-project gate, 2026-11-06, verdict «build»:

- The owner's own projects (`own_projects.py` over `~/proj` and every `martonpaulo` repository):
  no project does this job.
- GitHub (`gh search repos supernote plugin image`): `wolfsolver/supernote-image-insert-plugin`
  (broken on 3.31.45), `jpmoo/embedimage` and `Keplex/supernote-pic2note` (local files only, no
  search). Reopened if one of them adds a keyless web search.
- Every other option the research weighed is in [brief section 13](brief.md#13-history-of-options-considered-and-rejected).
- Not checked: app stores and package registries, because Supernote plugins ship only as
  `.snplg` files.

## Evidence on hand

The research brief, [`brief.md`](brief.md). No device test has run yet, so there are no
screenshots, timings or file sizes; each item marked TO TEST in the brief stays unproven until a
device test records it in `docs/device-tests.md`.

## Accepted evidence gaps

- Accessibility: no accessibility test runs inside PluginHost, and the Supernote has no screen
  reader to test with. The view code is the evidence: labels, touch targets of at least 10 mm,
  and contrast, as [brief section 8.4](brief.md#84-results-screen-e-ink-rules) sets them.

## Agent process rules

Moved from `AGENTS.md`, which links here and gives them the same force ([#150](https://github.com/martonpaulo/supernote-tools/issues/150)).

### Long-running operations

Long-running work follows the `skd-project-standards` skill's `references/long-running-operations.md`. A delegation brief states its concurrency budget; without one, the delegated agent spawns no sub-agents. Delegate only bounded, independent work that cannot race on shared writes; the parent keeps scope, verification and every mutation.

### Before editing

1. Check Git status and the current branch.
2. Search for the behavior, callers, tests, contracts, and nearby patterns; read only the chunks the change needs.
3. Distinguish verified facts, reasonable inferences, and unknowns, and define the source of truth before changing data or state.
4. When the project records an upstream or reference project, consult it before planning. When
   this project solves the problem differently, document the divergence and its reason.
5. Make a short plan only for complex, risky, ambiguous, or multi-file work.

### Durable project learning

At wrap-up, propose recording a learning only when it is verified, specific to this project, likely
to recur, and not already recorded, as the `skd-project-standards` skill's `references/durable-learning.md`
defines. A command that failed twice for the same cause qualifies: record the cause and working form.
End each finding, here or in `martonpaulo/skill-deck` for one about Skill Deck itself, as
`skd-github-publishing-conventions` section 15 defines.

### Output shape and asking the owner

Shape every message and ask the owner as Skill Deck's global rules define (`global/AGENTS.md`, which `skd sync` links into every agent); the four kinds of request are in the `skd-grilling` skill's `references/attention-cards.md`. Do every action your tools allow instead of handing it to the owner; hand over only what the owner alone can do, as those rules list.

### Artifacts and processes

- Temporary is the default; retention is an explicit exception. Remove only temporary files the current task created, keeping deliverables and failure evidence, never pre-existing artifacts, fixtures, baselines, or logs, and never version caches, logs, coverage, or build output.
- Stop only processes the session started, never the user's pre-existing ones.

### Git and releases

- Follow the recorded branch, commit, push, and version policies; leave unrelated changes untouched.
- Use English Conventional Commits, one per concern: `feat: add the export button (#54)`.
- Before a commit, push, published text or release upload, apply `skd-github-publishing-conventions` section 2.
- If commit or push fails, report the exact failure.
- Under direct push to the default branch, a red default branch is fixed at once by a new commit, never left for later.
- Close a `completed` issue with the closing comment `skd-github-publishing-conventions` defines.
- Release or change a version only when the task and recorded policy authorize it, through `project-release`.

### Completion report

Lead with the outcome, in the output shape, and include:

- what changed and why, and the files touched;
- validation commands and results, with warnings, skips, and remaining risks;
- what running the application verified, and what remains unverified;
- each change to the owner's real state, and its restore with the diff result;
- each issue closed, with the resolving commit its closing comment names;
- each issue opened in the run;
- temporary artifacts kept or removed, commit, branch, push, and worktree status.
