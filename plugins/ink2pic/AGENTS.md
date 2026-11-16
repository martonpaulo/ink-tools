# Project Working Agreements

## Project identity and policy

- Display name: `Ink2Pic`
- Code name: `Ink2Pic`
- Slug: `ink2pic`
- Identifier name: `ink2pic`
- Benefit-first description: Write a word by hand on your Supernote, lasso it, and insert a matching picture from Openclipart or Wikimedia Commons. Keyless, no phone needed.
- Repository: `martonpaulo/ink2pic` (public)
- Public identifiers: `pluginKey` and React Native `appName` `Ink2Pic`; `pluginID` generated once by the first build, committed in `PluginConfig.json` and never changed; shared-storage folder `MyStyle/Ink2Pic/`; HTTP User-Agent `Ink2Pic/<versionName> (+https://github.com/martonpaulo/ink2pic)`.
- Landing page: None. The repository README is the public surface.
- License: `MIT`
- Copyright: 2026 Marton Paulo
- Development language: English.
- Product copy: English only, a product requirement; no other locale. Every user-facing string lives in `src/ui/copy.ts` ([brief section 8.10](docs/brief.md#810-user-facing-copy)).
- Branch policy: work on `main` only, with no branch protection, because direct pushes to `main` are the workflow; create or switch branches only when the owner asks.
- Commit policy: commit each coherent task automatically once it is complete and `npm run validate` passes; only the change's files, one concern per commit.
- Push policy: push each validated commit to `origin/main` automatically, so a cloud session loses nothing; a cloud session pushes `main` too, only for a `runs: cloud` issue whose gates all ran there (owner decision, 2026-11-06). Cloud setup command: `bash scripts/cloud-setup.sh` (a cloud run's start).
- Product versioning: SemVer; `version` in `package.json` is the canonical `versionName` (the build copies it into `PluginConfig.json`), starting at `0.1.0`. `versionCode` in `PluginConfig.json` goes up by one on every build sent to the device, so each test report maps to exact code. Each build sent to the device for testing is a GitHub prerelease `v<versionName>-dev.<versionCode>` carrying `Ink2Pic-<versionName>-dev.<versionCode>.snplg`, made without asking (owner decision, 2026-11-06). A stable tag, a `CHANGELOG.md` entry and a stable GitHub release happen only when the owner asks, through `project-release`.
- Merge policy: merge commits, the only method the repository allows; pull requests are rare under the `main`-only policy.
- Commit subject: a commit made for an issue ends with `(#<issue number>)`, never the pull request's.
- Delete branches after merge: enabled
- Release, signing, and secret-storage policy: a release is a GitHub release carrying the `.snplg`, its file name holding the version (`Ink2Pic-0.1.0-dev.16.snplg`): a prerelease for each device test build, a stable release only on the owner's request. No signing and no release secrets: the device installs unsigned plugin packages.
- Skills baseline revision: `a024f770362823789293592392dc61596185c7fe`
- Skills baseline applied: `2026-11-06`
- Skills baseline divergence `package-manager` at `a024f770362823789293592392dc61596185c7fe`: npm, not pnpm, because the Supernote template's `buildPlugin.sh` calls `npx` and scans a flat `node_modules` for native code (owner decision, 2026-11-06).
- Skills baseline divergence `biome-config` at `a024f770362823789293592392dc61596185c7fe`: ESLint and Prettier from the Supernote React Native template stay, for their React Native rules (owner decision, 2026-11-06).

Change an identifier or policy recorded above only through an explicit task describing the migration and its effects.

## Route map

Before editing under a path, read the file its row names. A module with rules of its own keeps them in its own `AGENTS.md` of at most 150 lines, beside a `CLAUDE.md` symlink, and has a row here; this file stays at most 200 lines.

| Path | Read first |
| :--- | :--- |
| `index.js` | `docs/brief.md` |
| `App.tsx` | `docs/brief.md` |
| `docs/` | `docs/product.md` |

## Ink2Pic rules

- `docs/brief.md` holds the platform facts and the plan. Keep its tags (CONFIRMED, REPORTED, INFERENCE, TO TEST, DEFAULT); never raise an INFERENCE or TO TEST item to fact without running it. Update it in the same commit as the decision or device result that changes it.
- Device rounds (owner, 2026-11-06): the agent cannot reach the Supernote. Before a new build, resolve every issue that can be resolved without the device; send one build per round with everything ready and one check card of at most 8 steps with expected results, only after the owner answered the open one; record each report in `docs/device-tests.md` ([brief section 18](docs/brief.md#18-device-test-protocol)).
- Every device build declares in `uses-permissions`, and requests before its first file or note call, each permission its calls need, and logs every SDK call and request with its answer where the owner can read it ([#3](https://github.com/martonpaulo/ink2pic/issues/3)).
- Before writing or changing an `sn-plugin-lib` call, or fixing a device failure, read the recorded gotchas ([brief section 10.5](docs/brief.md#105-known-platform-gotchas-read-them-before-an-sdk-call)) and the official docs at `docs.supernote.com`.
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them. TypeScript first; Java only for what JavaScript provably cannot do. Every `sn-plugin-lib` call goes through `sn-adapter`'s official tier, `@supernote-tools/sn-adapter/official` ([#101](https://github.com/martonpaulo/supernote-tools/issues/101)). Never change `pluginID` after the first build.
- The search lab runs on CI, through the `Ink2Pic search lab` workflow ([lab README](lab/README.md#where-it-runs)), never on the owner's Mac. A lane on the Mac runs only the focused suites of what it changed; the full `npm run validate` runs in `Validate Ink2Pic` on push, and the lane reads its result with `ci_result.py` before closing ([#108](https://github.com/martonpaulo/supernote-tools/issues/108)).
- The template's `buildPlugin.sh` may run without asking, locally and in a cloud session (owner decision, 2026-11-06; [brief section 16.1](docs/brief.md#161-where-each-part-runs)).

## Agent skill paths

- Product definition: `docs/product.md`
- Research and plan: `docs/brief.md`
- Decision log: `docs/decisions.md`, the only home of decision history
- Device test reports: `docs/device-tests.md`, created with its first report
- Cloud rules: `docs/cloud.md`
- Handoffs: `.scratch/handoffs/handoff.md`; prototypes: `.scratch/prototypes/`. Never create an empty artifact directory.

## Instruction hierarchy and sources of truth

- Follow the direct task, the most specific scoped instructions, this file, then general agreements. Read applicable instructions before editing.
- Code is evidence of current behavior, `AGENTS.md` is normative for process, and an approved specification for desired behavior. Expose divergence among them; never resolve it silently.
- When two sources disagree (issues, comments, this file, the agent's memory, the owner's current instruction), a newer trusted statement is the recommended side, never the decided one. Ask the owner before acting on either side and record the answer in the newer issue; `skd-agent-context-validation` owns the precedence.
- Keep one canonical source per rule; other documents link to it.
- Do not turn analysis, research, or a read-only audit into implementation without authorization.
- The owner calls `issue-*` and `project-*` skills by name; `skd-*` skills are internal: offer one in plain words, never by name.
- Be direct and evidence-based: state assumptions, risks, tradeoffs, blockers. Ask only about a material decision you cannot discover safely; otherwise make explicit, reversible assumptions.
- Give concise progress updates during long-running work.

## Scope, reuse, and implementation

- Preserve behavior outside the task and unrelated or uncommitted user changes.
- Follow the patterns this project already repeats. When a change would break a recorded pattern or establish a new one, stop and ask first, naming the existing pattern, the proposed one, and why the existing one does not fit. Deviating is allowed; deviating silently is not.
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
- Before showing an interface change to the owner, compare it side by side with its reference and take its sizes and colours from that reference, measured, as the `skd-project-standards` skill's `references/reference-comparison.md` defines. Interface reference: a reference app: the Supernote's own system interface on firmware 3.31.45, the native platform the plugin runs on, with the e-ink rules of [brief section 8.4](docs/brief.md#84-results-screen-e-ink-rules).
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
- Never document an API, a flag or a behaviour without running it. Fix or drop a broken script; never ship it documented as working.
- Every issue or pull request reference in Markdown prose is a link to the issue's URL; code,
  quoted lines and quoted commit subjects stay as written. The `project-setup` skill's
  `assets/issue_links.py` checks it in the gate.
- Preserve third-party licenses and notices in `NOTICE.md`. Maintain `CHANGELOG.md` when the project has public releases.

## Configuration and repository hygiene

- Ignore secrets, local environments, logs, caches, and build output. Keep `.env.example` with every variable and a safe placeholder, and secrets only in the platform's secure store. Nothing new in `~` (`project-layout.md`).
- Add CI, dependency updates, release workflows, and signing only when distribution or risk requires them.
- The Validate workflow has no `pull_request_target` trigger and reads no stored secret, so it runs on a fork; the `validate-trust` check of `check_repository_conventions.py` fails either ([martonpaulo/skill-deck#801](https://github.com/martonpaulo/skill-deck/issues/801)).
- Workflows, at the repository root as the root `AGENTS.md` divergence `ci-pipelines` records: `Scan` (`.github/workflows/scan.yml`), `Validate Ink2Pic` (`.github/workflows/validate-ink2pic.yml`), `Prerelease Ink2Pic` (`.github/workflows/prerelease-ink2pic.yml`) and `Ink2Pic search lab` (`.github/workflows/lab.yml`). A workflow added outside the `project-setup` skill's `references/ci-pipelines.md` is a recorded exception: `Prerelease Ink2Pic` is one, because a cloud session can neither create a release nor push a tag: a push to `main` that changes `PluginConfig.json`, or a pushed `v*-dev.*` tag, publishes `v<versionName>-dev.<versionCode>` when it does not exist yet; the workflow checks the tag against `PluginConfig.json`, runs the gate, builds, and publishes the prerelease with the notes in `docs/releases/<tag>.md` ([#22](https://github.com/martonpaulo/ink2pic/issues/22)). A Node repository's `validate` script runs exactly what CI runs. Do not add an image-optimisation bot.
- The agent rules live in `AGENTS.md`, the one real file; `CLAUDE.md` is a symlink to it. Do not create `GEMINI.md`, `.gemini/rules/agents.md`, or any other alias, and never commit `.claude/settings.local.json`.
- Change the repository `homepage` only as the `project-setup` skill's `references/github-settings.md` describes.

## Tests and validation

- Add or update focused tests for changed behavior, regressions, persistence, migrations, security, and critical accessibility, at stable seams.
- Every test, fixture, example and demo or default data holds synthetic data only: no real person's name, address, email, username or account, least of all the owner's. Person-shaped data comes from one shared list in the project, in its order; add a person there, never at the call site.
- With more than one gate, choose them with the gate selector (the `project-setup` skill's `assets/gates.py`, rules in `gates.json`): it prints the gates the changed paths need, cheapest first, and every gate for a path no rule names; CI uses the same selector.
- Run the smallest relevant check while iterating. Before each commit, run the full suite and repository validation when the full suite takes about 90 seconds or less; otherwise run the suites that cover a change or list its directory, let CI run the full suite, read its result before reporting done with the `skd-github-publishing-conventions` skill's `scripts/ci_result.py <sha>`, and require zero failures and zero warnings. Use a real integration only when local tests cannot prove the contract.
- When a change alters behavior, run the real application with its native diagnostics and observe the changed behavior. Green tests are not seeing it run.
- Before investigating or reporting a suspected defect, read `docs/answered-suspicions.md`; after measuring one that is not a defect, add its row there, as the `project-setup` skill's `references/product-definition.md` defines ([martonpaulo/skill-deck#749](https://github.com/martonpaulo/skill-deck/issues/749)).
- Report skips, blockers, residual risk, what was verified manually, and what remains unverified.
- A piped check reports the last command's status: `npm run lint | tail -3` exits 0 when lint fails. Run a gating check unpiped or with `set -o pipefail`. A check whose exit code you did not observe has not run.
- Local browser tests follow the `project-setup` skill's `references/browser-test-harness.md`.
- Repository-wide rules live in one discovery-based checker that accepts `--root` and is tested over fixtures, never in scattered one-off scripts.
- The gate runs unchanged copies of the `project-setup` skill's `assets/text_check.py` (no invisible character, every relative link and anchor resolves, a long `docs/` file opens with a Contents list) and, with shell suites, `assets/run_suites.sh` (an unknown command fails, GNU grep first, `VERBOSE=0|1` the one output switch); the `text-check` and `suite-runner` rules of `check_repository_conventions.py` check both ([martonpaulo/skill-deck#797](https://github.com/martonpaulo/skill-deck/issues/797)). In shell, no backslash escape in a `grep` pattern, no `$?` read after a pipeline, and no numeric compare of captured output before checking it is a number.
- With code, the gate runs an unchanged copy of the `project-setup` skill's `assets/dry_check.py` over a root `dry-check.json`: no new magic value, repeated block, twin rule without an owner, or rule written in a second document; its counts only go down (`references/dry-checks.md`, the `dry-gate` rule, [martonpaulo/skill-deck#722](https://github.com/martonpaulo/skill-deck/issues/722)).

## Process rules

Long-running work, before editing, durable learning, asking the owner, artifacts, Git and the completion report follow [product › Agent process rules](docs/product.md#agent-process-rules); they bind as if written here ([#150](https://github.com/martonpaulo/supernote-tools/issues/150)).
