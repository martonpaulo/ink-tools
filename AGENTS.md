# Project Working Agreements

## Project identity and policy

- Display name: `Ink Tools` (renamed from Supernote Tools on 2026-11-16, [#177](https://github.com/martonpaulo/ink-tools/issues/177))
- Code name: `InkTools`
- Slug: `ink-tools`
- Identifier name: `inktools`
- Benefit-first description: Unofficial tools for Supernote e-ink tablets: device plugins, a tablet app, a Mac CLI and a planned Mac notebook editor. «Supernote» names the device only, as compatibility.
- Repository: `martonpaulo/ink-tools` (public; GitHub redirects the old `martonpaulo/supernote-tools`)
- Public identifiers: GitHub repository and the `inkctl` CLI; the Ink2Pic and Bridge plugins. Not a package or registry product.
- Display names ([#176](https://github.com/martonpaulo/ink-tools/issues/176)): each tool shows a feature name in Supernote's own wording and its buttons read like the tablet's (a verb and a noun in title case): `lookup` is Word Lookup, `retouch` Image Editing, `relay` Device Transfer, `bridge` Account Sync, `real-time-conversion` Real-Time Conversion, the Lingo app (`apps/lingo-app`) Handwriting Language, the planned Mac app Ink Notebook Editor, the CLI `inkctl` ([#173](https://github.com/martonpaulo/ink-tools/issues/173)). A name carries no brand. Display names live only in `PluginConfig.json` `name`, the visible copy and the docs; folders, npm packages, gates, workflows, tag prefixes, `pluginID`, `pluginKey`, log prefixes and data folders keep the short internal names.
- Landing page: None. The repository README is the public surface.
- License: `MIT`
- Copyright: 2026 Marton Paulo
- Development language: English.
- Product copy: English only; developer-facing. Each subproject's product copy follows its own policy.
- Branch policy: Work on `main` only, with no branch protection; create or switch branches only when the owner asks.
- Commit policy: Commit each coherent task once it is complete and its subproject's validation passes; only the change's files, one concern per commit; issue commits end with `(#<issue number>)`.
- Push policy: Push each validated commit to `origin/main` automatically; a cloud session pushes `main` for a `runs: cloud` issue whose gates ran there. Cloud setup command: `bash scripts/cloud-setup.sh`.
- Product versioning: Every plugin but Ink2Pic uses SemVer with a numbered beta ([#155](https://github.com/martonpaulo/ink-tools/issues/155)): `package.json`, the Git tag `<plugin>-v<version>` and the GitHub prerelease read `0.2.0-beta.3` for a test build and `0.2.0` for a release; the tablet's `versionName` in `PluginConfig.json` is derived from it (`0.2.0 beta 3`, `0.2.0`), which `scripts/plugin-version.cjs` checks; `versionCode` is a hidden integer that rises on every build and never resets. A fix after a release raises PATCH; a new feature raises MINOR and starts again at beta 1. No `-dev.N` suffix. The Lingo app follows the same rule, its version in `apps/lingo-app/app.json` and its tag `lingo-app-v<version>` ([#157](https://github.com/martonpaulo/ink-tools/issues/157), [#160](https://github.com/martonpaulo/ink-tools/issues/160)). Ink2Pic, being retired, keeps its last scheme (`0.1.0-dev.19`); inkctl is unversioned; the monorepo itself is unversioned.
- Merge policy: merge commits, so every branch commit reaches `main`.
- Commit subject: a commit made for an issue ends with `(#<issue number>)`, never the pull request's.
- Delete branches after merge: disabled
- Release, signing, and secret-storage policy: Per subproject: Ink2Pic and Bridge each ship a GitHub prerelease carrying their `.snplg`; inkctl is distributed as source; the Lingo app hands its signed test APK over as a file, with no release yet. No monorepo-wide release.
- Skills baseline revision: `4a54af70a4f197df7cb610e1aad847fbdb4dc0d3`
- Skills baseline applied: `2026-11-13`
- Skills baseline divergence `ci-pipelines` at `a8860162fcbfea13bef7d090447a9ae08aa83ccb`: this is a monorepo of independent subprojects; CI lives at the repository root, one `validate-<subproject>.yml` per subproject with a `paths:` filter and its subproject as the working directory, plus one `prerelease-<plugin>.yml` per plugin (`bridge`, `ink2pic`, `probe`, `relay`), `lab.yml` (the Ink2Pic search lab, started by hand on GitHub's runner, never on push and never on the owner's Mac, [#108](https://github.com/martonpaulo/ink-tools/issues/108)), `scan.yml` (the weekly npm audit, the text check and issue links on each change to the root documents, [#77](https://github.com/martonpaulo/ink-tools/issues/77), and the adapter boundaries of `scripts/boundaries.py` on each change to a package or a plugin, [#101](https://github.com/martonpaulo/ink-tools/issues/101)) and one `dependabot.yml` ([#38](https://github.com/martonpaulo/ink-tools/issues/38)). The root `gates.json`, read by `scripts/gates.py`, maps each subproject's paths to its gate, so `land.py finish` picks them ([#75](https://github.com/martonpaulo/ink-tools/issues/75)).
- Skills baseline divergence `single-project-layout` at `a8860162fcbfea13bef7d090447a9ae08aa83ccb`: the repository holds several independent subprojects under `plugins/bridge/`, `plugins/ink2pic/`, `plugins/lingo/` (retiring: translation moved to Lookup, [#159](https://github.com/martonpaulo/ink-tools/issues/159)), `plugins/lookup/`, `plugins/probe/`, `plugins/real-time-conversion/`, `plugins/relay/`, `plugins/retouch/`, `packages/`, `cli/inkctl/`, `apps/ink-notebook-editor/` (the planned macOS app, docs only until code exists, [#48](https://github.com/martonpaulo/ink-tools/issues/48)) and `apps/lingo-app/` (the Lingo app, a sideloaded Android app, not a plugin, named `lingo-app` so it never shares the Lingo plugin's gate, workflow or tag prefix, [#160](https://github.com/martonpaulo/ink-tools/issues/160): a plugin cannot write the handwriting language file, [#157](https://github.com/martonpaulo/ink-tools/issues/157)), each with its own gate, and the plugins, the app and the CLI each with their own `AGENTS.md`, versioning and release policy; the root file carries shared policy and a route map.

Change an identifier or policy recorded above only through an explicit task describing the migration and its effects.

## Route map

Before editing under a path, read the file its row names. A module with rules of its own keeps them in its own `AGENTS.md` of at most 150 lines, beside a `CLAUDE.md` symlink, and has a row here; this file stays at most 200 lines.

| Path | Read first |
| :--- | :--- |
| `plugins/<name>/`: `plugins/bridge/`, `plugins/ink2pic/`, `plugins/lingo/`, `plugins/lookup/`, `plugins/probe/`, `plugins/real-time-conversion/`, `plugins/relay/`, `plugins/retouch/` | that plugin's own `AGENTS.md` (device plugins on sn-plugin-lib) and `docs/supernote.md` (device facts; add each new one there) |
| `cli/<name>/`: `cli/inkctl/` | that tool's own `AGENTS.md` (host-side tools) |
| `apps/<name>/`: `apps/lingo-app/`, `apps/ink-notebook-editor/` | that app's own `AGENTS.md` (the sideloaded Android app, the planned macOS app) and `docs/supernote.md` (device facts) |
| `packages/` | `packages/README.md` and `docs/architecture.md` (shared packages) |
| `templates/` | `docs/product.md` (note templates; created when the first one lands) |
| `docs/` | `docs/product.md` |

## Instruction hierarchy and sources of truth

- Follow the direct task, the most specific scoped instructions, this file, then general agreements. Read applicable instructions before editing.
- Code is evidence of current behavior, `AGENTS.md` is normative for process, and an approved specification for desired behavior. Expose divergence among them; never resolve it silently.
- When two sources disagree (issues, comments, this file, the agent's memory, the owner's current instruction), a newer trusted statement is the recommended side, never the decided one. Ask the owner before acting on either side and record the answer in the newer issue; `skd-agent-context-validation` owns the precedence.
- Keep one canonical source per rule, as the `skd-project-standards` skill's `references/documentation-standard.md` defines; issues, code and tests cite a rule's ID, never its text.
- Do not turn analysis, research, or a read-only audit into implementation without authorization.
- The owner calls `issue-*`, `project-*` and `bench-checkpoint` by name; every other skill is internal: offer one in plain words, never by name.
- Be direct and evidence-based: state assumptions, risks, tradeoffs, blockers. Ask only about a material decision you cannot discover safely; otherwise make explicit, reversible assumptions.
- Give concise progress updates during long-running work.

## Long-running operations

Long-running work follows the `skd-project-standards` skill's `references/long-running-operations.md`. A delegation brief states its concurrency budget; without one, the delegated agent spawns no sub-agents. Delegate only bounded, independent work that cannot race on shared writes; the parent keeps scope, verification and every mutation.

## Before editing

1. Check Git status and the current branch.
2. Search for the behavior, callers, tests, contracts, and nearby patterns; read only the chunks the change needs.
3. Distinguish verified facts, reasonable inferences, and unknowns, and define the source of truth before changing data or state.
4. When the project records an upstream or reference project, consult it before planning. When
   this project solves the problem differently, document the divergence and its reason.
5. Make a short plan only for complex, risky, ambiguous, or multi-file work.

## Scope, reuse, and implementation

- **Research before building.** Before creating anything new here, search for tools and projects
  that already do it — device plugins, sideloaded Android apps (especially ones built for the
  Supernote), GitHub code, CLIs, services. Prefer reusing or basing on an existing one; we build new
  only because nothing existing satisfies what we want, and we say which gap forces it. Study the device and third-party software with `rea`/Ghidra and the decompiled apps
  before designing against them. (`skd-build-or-reuse` and `skd-software-analysis` own the method.)
- Preserve behavior outside the task and unrelated or uncommitted user changes.
- Follow the patterns this project already repeats. When a change would break a recorded pattern or establish a new one, stop and ask first, naming the existing pattern, the proposed one, and why the existing one does not fit.
- When a change sets or fixes a pattern, the same delivery adds the cheapest automatic check that guards it: a lint or type rule, a test over the repository, a gate script. A check larger than the fix becomes its own issue, linked from the change ([martonpaulo/skill-deck#732](https://github.com/martonpaulo/skill-deck/issues/732)).
- Prefer the smallest correct, readable, reversible solution that is cheap to operate.
- Keep one owner and one source of truth for each business rule, state, default, and copy value, outside presentation and adapter layers. Derive values instead of storing synchronized copies; model invalid states explicitly.
- Deliver large changes in reviewable, executable increments. Implement errors, states, accessibility, and tests with the behavior.
- Never return a success-shaped default (zero, an empty list, `ok`) for a value that failed or is missing; show or raise the failure. A result that is really empty stays empty ([#758](https://github.com/martonpaulo/skill-deck/issues/758)).

## Data, security, and destructive operations

- Distinguish canonical data, reconstructible cache, transient state, and preferences. Persist or synchronize only data that must survive or cross devices; a cache never becomes a source of truth.
- Use stable application-owned identifiers, and validate data at input and persistence boundaries.
- Change a relational schema only through an explicit, tested, versioned migration, never manually in production. Use transactions or atomic writes when partial failure could leave inconsistent state.
- Request only necessary permissions and scopes. Keep credentials, keys, signing material, personal data, and sensitive payloads out of the repository and logs.
- Use structured subprocess arguments and validate destinations, redirects, and untrusted inputs.
- Apply the `skd-project-standards` skill's `references/security-standard.md` to every change, plan and audit that touches a surface it covers; `docs/security.md` records each item's answer.
- Resolve an exact target before deletion, overwrite, interruption, or another hard-to-recover action. A clear request authorizes its exact resolved operation; ask again when the target is ambiguous, loss is difficult to recover, or effects exceed the named scope.
- Prefer recoverable deletion. Never perform broad cleanup without explicit authorization. Never force-push, except to purge sensitive data from a remote branch's history, on the owner's approval of that exact push, as the `skd-github-publishing-conventions` skill's section 2 defines.

## Product interface and accessibility

- Prefer native platform components and established patterns; custom UI must provide clear product value.
- Before changing an interface, a style, or a visual asset, name what the product should communicate and how it should feel, from the product definition and brand decisions, and judge visual and copy choices by that intent. When none is recorded, state the one you infer and ask before a consequential visual change.
- Define the layout and the loading, empty, error, disabled, and destructive states that apply. Include keyboard navigation, focus, screen-reader labels, scalable text, contrast, reduced motion, and non-color status cues in the same change.
- Build every interface to the `skd-project-standards` skill's `references/interface-standard.md`; an explicit owner request to do otherwise wins and is recorded where this project records decisions.
- Before showing an interface change to the owner, compare it side by side with its reference and take its sizes and colours from that reference, measured, as the `skd-project-standards` skill's `references/reference-comparison.md` defines. Interface reference: a reference app: the native platform for an app that runs on it, the web for a web app or page.
- Accessibility evidence: the view code, reviewed in each change; `docs/product.md` records the accepted gap under `## Accepted evidence gaps`. Manual screen-reader passes are not run and never block completion, as the `issue-capture` skill defines ([martonpaulo/skill-deck#266](https://github.com/martonpaulo/skill-deck/issues/266)).
- Keep visible copy centralized and localized. Keep expensive work out of render paths and hot loops. Measure before claiming a performance problem.

## Code, comments, and documentation

- Write code, comments, commits, filenames, tests, configuration, and developer documentation in English; product copy follows the localization strategy. Write human-facing English in plain international English that non-native readers understand: precise verbs, no idioms, short sentences.
- Prefer clear types and simple control flow.
- Comment non-obvious constraints, linking official documentation when a workaround must stay visible.
- Update the smallest canonical documentation section when a durable contract changes; never create empty documentation.
- A divergence answer goes in the newer issue's Clarify. A decision that changes a durable rule rewrites the document that owns it, which keeps only the current rule with a short `#N` link, and adds one row to the `## Decision index` of `docs/decisions.md`, the only home of decision history. An ADR is the owning document only for architecture. No issue, wiki page or long-lived comment serves as a decision register.
- Each limit the owner sets is one row of the product definition's `## Limits the owner set`, in the same commit; a relaxed limit keeps its row as «replaced» ([martonpaulo/skill-deck#738](https://github.com/martonpaulo/skill-deck/issues/738)).
- README: the recorded `Display name` is the H1. Links to the live project are allowed. The rest
  follows the `skd-project-standards` skill's `references/public-surface-style.md`.
- Every fenced code block you create or materially edit has an explicit language identifier.
- Never mark an API, a flag or a behaviour `implemented` without running it. Fix or drop a broken script; never ship it documented as working.
- Every issue or pull request reference in Markdown prose is a link to the issue's URL; code,
  quoted lines and quoted commit subjects stay as written. The `project-setup` skill's
  `assets/issue_links.py` checks it in the gate.
- Preserve third-party licenses and notices in `NOTICE.md`. Maintain `CHANGELOG.md` when the project has public releases.

## Durable project learning

At wrap-up, propose recording a learning only when it is verified, specific to this project, likely
to recur, and not already recorded, as the `skd-project-standards` skill's `references/durable-learning.md`
defines. A command that failed twice for the same cause qualifies: record the cause and working form.
End each finding, here or in `martonpaulo/skill-deck` for one about Skill Deck itself, as
`skd-github-publishing-conventions` section 15 defines.

## Output shape and asking the owner

Shape every message and ask the owner as Skill Deck's global rules define (`global/AGENTS.md`, which `skd sync` links into every agent); the four kinds of request are in the `skd-grilling` skill's `references/attention-cards.md`. Do every action your tools allow instead of handing it to the owner; hand over only what the owner alone can do, as those rules list.

Project process rules (owner, 2026-11-16, [`docs/decisions.md`](docs/decisions.md#decision-index)):

- Every Ink Tools decision is asked and answered on the vision artifact (<https://claude.ai/artifact/KtFTFK5Wu46RZ2K7y8rDty>, store `choices`); the Inbox carries only actions.
- Tablet test rounds are batched: the agent drives every step over `inkctl`, and the owner does only the pen steps.
- An issue whose code landed and whose only open lines need the tablet stays open with `status: needs-device-check`, and its agent-driven checks join the next batched round.

## Configuration and repository hygiene

- Ignore secrets, local environments, logs, caches, and build output. Keep `.env.example` with every variable and a safe placeholder, and secrets only in the platform's secure store. Nothing new in `~` (`project-layout.md`).
- Add CI, dependency updates, release workflows, and signing only when distribution or risk requires them.
- The Validate workflow has no `pull_request_target` trigger and reads no stored secret, so it runs on a fork; the `validate-trust` check of `check_repository_conventions.py` fails either ([martonpaulo/skill-deck#801](https://github.com/martonpaulo/skill-deck/issues/801)).
- Workflows: one per subproject at the root, path-filtered, as the divergence `ci-pipelines` records: a `validate-<subproject>.yml` per subproject, a `prerelease-<plugin>.yml` for `bridge`, `ink2pic`, `probe` and `relay`, `lab.yml` and `scan.yml`. A workflow added outside the `project-setup` skill's `references/ci-pipelines.md` is a recorded exception. A Node repository's `validate` script runs exactly what CI runs. Do not add an image-optimisation bot.
- The agent rules live in `AGENTS.md`, the one real file; `CLAUDE.md` is a symlink to it. Do not create `GEMINI.md`, `.gemini/rules/agents.md`, or any other alias, and never commit `.claude/settings.local.json`.
- Change the repository `homepage` only as the `project-setup` skill's `references/github-settings.md` describes.

## Tests and validation

- Add or update focused tests for changed behavior, regressions, persistence, migrations, security, and critical accessibility, at stable seams.
- Every test, fixture, example and demo or default data holds synthetic data only: no real person's name, address, email, username or account, least of all the owner's. Person-shaped data comes from one shared list in the project, in its order; add a person there, never at the call site.
- With more than one gate, choose them with the gate selector (the `project-setup` skill's `assets/gates.py`, rules in `gates.json`): it prints the gates the changed paths need, cheapest first, and every gate for a path no rule names; CI uses the same selector.
- Run the smallest check while iterating. Before each commit, run the full suite and repository validation when the full suite takes about 90 seconds or less; otherwise run the suites that cover a change or list its directory, let CI run the full suite, read its result before reporting done with the `skd-github-publishing-conventions` skill's `scripts/ci_result.py <sha>`, and require zero failures and zero warnings. Use a real integration only when local tests cannot prove the contract.
- When a change alters behavior, run the real application with its native diagnostics and observe the changed behavior. Green tests are not seeing it run.
- Before investigating or reporting a suspected defect, read `docs/answered-suspicions.md`; after measuring one that is not a defect, add its row there, as the `project-setup` skill's `references/product-definition.md` defines.
- Report skips, blockers, residual risk, what was verified manually, and what remains unverified.
- A piped check reports the last command's status: `npm run lint | tail -3` exits 0 when lint fails. Run a gating check unpiped or with `set -o pipefail`. A check whose exit code you did not observe has not run.
- Local browser tests follow the `project-setup` skill's `references/browser-test-harness.md`.
- Repository-wide rules live in one discovery-based checker that accepts `--root` and is tested over fixtures, never in scattered one-off scripts.
- The gate runs unchanged copies of the `project-setup` skill's `assets/text_check.py` (no invisible character, every relative link and anchor resolves, a long `docs/` file opens with a Contents list) and, with shell suites, `assets/run_suites.sh` (an unknown command fails, GNU grep first, `VERBOSE=0|1` the one output switch); the `text-check` and `suite-runner` rules of `check_repository_conventions.py` check both ([martonpaulo/skill-deck#797](https://github.com/martonpaulo/skill-deck/issues/797)). In shell, no backslash escape in a `grep` pattern, no `$?` read after a pipeline, and no numeric compare of captured output before checking it is a number.
- With code, the gate runs an unchanged copy of the `project-setup` skill's `assets/dry_check.py` over a root `dry-check.json`: no new magic value, repeated block, twin rule without an owner, or rule written in a second document; its counts only go down (`references/dry-checks.md`, the `dry-gate` rule, [martonpaulo/skill-deck#722](https://github.com/martonpaulo/skill-deck/issues/722)).

## Artifacts and processes

- Temporary is the default; retention is an explicit exception. Remove only temporary files the current task created, keeping deliverables and failure evidence, never pre-existing artifacts, fixtures, baselines, or logs, and never version caches, logs, coverage, or build output.
- Stop only processes the session started, never the user's pre-existing ones.

## Git and releases

- Follow the recorded branch, commit, push, and version policies; leave unrelated changes untouched.
- Use English Conventional Commits, one per concern: `feat: add the export button (#54)`.
- Before a commit, push, published text or release upload, apply `skd-github-publishing-conventions` section 2.
- If commit or push fails, report the exact failure.
- Under direct push to the default branch, a red default branch is fixed at once by a new commit, never left for later.
- Close a `completed` issue with the closing comment `skd-github-publishing-conventions` defines.
- Release or change a version only when the task and recorded policy authorize it, through `project-release`.

## Completion report

Lead with the outcome, in the output shape, and include:

- what changed and why, and the files touched;
- validation commands and results, with warnings, skips, and remaining risks;
- what running the application verified, and what remains unverified;
- each change to the owner's real state, and its restore with the diff result;
- each issue closed, with the resolving commit its closing comment names;
- each issue opened in the run;
- temporary artifacts kept or removed, commit, branch, push, and worktree status.
