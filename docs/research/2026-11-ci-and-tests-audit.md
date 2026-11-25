# CI and test-suite audit

Status: research, 2026-11-25. Two read-only audits: CI efficiency (the last 200 runs, 15:36–21:18 UTC) and test quality (every Jest, JVM, Python, shell and Swift suite). Fixes are tracked on [#301](https://github.com/martonpaulo/ink-tools/issues/301) (CI) and [#302](https://github.com/martonpaulo/ink-tools/issues/302) (tests).

## Contents

- [CI](#ci)
- [Tests](#tests)

## CI

Each push starts 7.3 runs on average (1 to 16), about 7 run minutes. No workflow triggers another; release tags never re-run validate; `cancel-in-progress` is safe.

1. Ink Notebook Editor CI never passed: the `xcode-27` image ships Xcode 27.1 and the workflow pinned 27.0. Fixed in eac9a1a.
2. Four prerelease workflows (word-lookup, image-editing, smart-shapes, real-time-conversion) run on every plugin or package change: 38 of 46 runs exited after the tag check, 8 rebuilt what validate had just built. Fix: trigger on `PluginConfig.json` only, or publish the validate job's `.snplg` artifact with `needs: validate`.
3. Path filters disagree with real dependencies and with `gates.json`: Account Sync misses `packages/sync-core` and `packages/ink-core` (CI and selector), the selector misses Account Sync's `picture-search` Java; `plugin-version.cjs` reaches 3 plugins only; the `icons`, `license` and `quick` gates never run in CI; the editor runs the macOS job for doc-only changes. `AGENTS.md` says CI uses the selector; it does not. Fix: the missing paths now, a check that workflow paths match `gates.json`, later one workflow fed by `gates.py`.
4. `npm ci` takes 30–50 s even with the npm cache (only `~/.npm` is cached); the 139 MB `react-android` aar is downloaded on every native build in 5 plugins. Fix: cache `node_modules` and `.toolchain`.
5. Each validate repeats the Markdown check `scan.yml` already runs.
6. `land.py finish` gates before the push and CI runs again: kept on purpose.
7. Smaller: `scan.yml` npm audit misses real-time-conversion and smart-shapes; prereleases have no concurrency group.

Expected saving: 7.3 → about 5.5 runs and 7.0 → about 4.5 run minutes per push.

Measured for [#301](https://github.com/martonpaulo/ink-tools/issues/301) from `gh api repos/martonpaulo/ink-tools/actions/runs` (push runs on `main`, run minutes as each run's end minus its start):

| Window | Pushes | Runs per push | Run minutes per push |
| :--- | ---: | ---: | ---: |
| The 50 pushes before the fix landed (2026-11-25, 16:43 to 23:10 UTC) | 50 | 4.5 | 3.9 |
| The 50 pushes after it | not yet measured | | |

That day's pushes were mostly documents, so the window before is already under the audit's 7.3; the row after is filled once 50 pushes have followed the landing.

## Tests

6 dead or unrun, about 40 weak, about 20 duplicated, 5 costly, about 15 important behaviours untested. Test time is small next to `npm ci` and builds.

1. Never run in CI: `test_license_check.py`, `test_icons.py`, `test_quick_check.py`, `license_check.py`, `icons.py --check`.
2. The sleep guard skips `packages/*/native-tests/` (`ThumbGateTest.java:28,38`).
3. Comments still claim coverage by Ink2Pic tests deleted in [#288](https://github.com/martonpaulo/ink-tools/issues/288); the Java package is still `com.ink2pic.files`.
4. Untested high-risk deletes: `insertPicture.ts` `removeTemporary`, `dropEarly`, `paths.ts` `isTemporaryDownload`.
5. Untested file and network rules: `SafePaths.checkPath` accepts any absolute path; Device Transfer `RelayModule` has no path guard; `Receiver.isLocalPeer` and the upload error paths.
6. Probe tests pass with the feature broken (`ProbeCommandFileTest` tests refusals only).
7. Hand-written lists of Java test classes: a new `*Test.java` would never run.
8. Slow suites on every change: Word Lookup lab tests (about 17 s), Account Sync `bundle.test.ts` (13 s, the build bundles again).
9. inkctl polls with a fixed 0.5 s sleep; an environment override would save about 15–25 s of its 93 s suite.
10. Values written twice across languages with no parity check: Bridge result codes, the language cycle, upload limits, the duplicate threshold.
11. Seven `pluginConfig.test.ts` copy `PluginConfig.json`; three `version.test.ts` repeat `scan.yml`.
12. Plugin tests that test package code (wrong layer); wrapper-only and self-checking tests (`sdk.test.ts` `describe.each`, `deviceRows.test.ts`, `Button.test.tsx` colours, `shape.test.ts` `expect(true)`).
