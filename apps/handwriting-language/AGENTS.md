# Lingo app — agent guidance

Scoped guidance for `apps/handwriting-language/`. Inherits the repository root `../../AGENTS.md`. A `CLAUDE.md`
symlink points at this file.

## What it is

A small sideloaded Android app, not a plugin ([#157](https://github.com/martonpaulo/supernote-tools/issues/157), the owner's choice in
[#151](https://github.com/martonpaulo/supernote-tools/issues/151)), that switches the tablet's
handwriting recognition language for every app. Its internal name is «Lingo» (owner,
[#160](https://github.com/martonpaulo/supernote-tools/issues/160)); it was «Dialect» until `0.1.0-beta.1`. The tablet shows the feature name «Handwriting
Language» and «Handwriting Language Settings» ([#176](https://github.com/martonpaulo/supernote-tools/issues/176)). The folder, gate, workflow
and tag prefix say `handwriting-language` ([#194](https://github.com/martonpaulo/ink-tools/issues/194)).
Two surfaces ship in one build:

- **A, the floating button** (`OverlayService`): a box that shows the active language (`PT`, `EN`,
  `ES`); one tap moves to the next, a long press opens the app's screen, a drag moves it
  ([#244](https://github.com/martonpaulo/ink-tools/issues/244)). It starts at the top trailing
  corner. A drag ends against the nearest screen edge, fully on screen, `space` from it ([#415](https://github.com/martonpaulo/ink-tools/issues/415)), keeping its place along
  that edge (`ButtonPlace.snap`, also applied when a saved place is read, so an older middle or
  off-screen place snaps; no animation, [#275](https://github.com/martonpaulo/ink-tools/issues/275)). The place is saved as fractions of the screen so it stays on an edge
  when the screen turns (`ButtonGesture`, `ButtonPlace`); Settings' «Reset Button Position» puts it
  back. It shows only where the owner writes, or always, or never (the setting), and comes back
  after a restart of the tablet or an update of the app unless hidden.
- **B, the app's screen** (`SettingsActivity`, the one launcher entry, «Handwriting Language»,
  with its icon `res/drawable/ic_launcher.xml`): the sidebar lists it by itself and opens it
  ([#246](https://github.com/martonpaulo/ink-tools/issues/246)). It is drawn with the Supernote's
  native controls, as the plugins' ui-kit draws them ([#275](https://github.com/martonpaulo/ink-tools/issues/275)):
  the black title bar with the drawn × to close at the leading edge (Back closes it too) and the
  title centred on its full width, the native text style of each role in regular weight, the
  active language as a value row with «Switch to Next Language» as an action row of its group
  ([#272](https://github.com/martonpaulo/ink-tools/issues/272)), the floating button's three
  choices as radio rows with a short name and a detail under it and «Reset Button Position» as an
  action row of that group, a switch row (the native pill with «ON» or «OFF» beside it) for each
  installed language in the cycle, a chevron row that opens Settings › Handwriting Recognition
  Language, the floating button hidden while the screen is in front (`ButtonRule`), each missing permission with
  the button to its system screen and the command that grants it, and the command that turns on writing detection when it
  is off. An error shows in bold beside the control whose action failed. It is a plain sentence with the
  next step, from `Copy`; the detail stays in the `LingoApp` log line, an `InternalFailure` log for a failed read or write of
  the language folder ([#280](https://github.com/martonpaulo/ink-tools/issues/280), [#294](https://github.com/martonpaulo/ink-tools/issues/294)). A tap redraws only its own rows; the
  page is rebuilt when it shows again or an error or note comes or goes
  ([#281](https://github.com/martonpaulo/ink-tools/issues/281)). Each section is one group,
  as ui-kit's `RowGroup` draws it: the caption, smaller and grey, at the bottom of its box, its rows of the
  native height with the light dotted line between two of them, its note under the last row,
  and the solid line after the group; permissions and errors follow under the group. The page
  keeps the native side margin. A language shows only its
  name, never its code such as `pt_BR`, which stays in the log and the preferences (owner,
  [#275](https://github.com/martonpaulo/ink-tools/issues/275)). The one-tap switch with nothing on screen is gone (owner,
  2026-11-25).

## Target surface

The owner's choice after trying both on the tablet ([#151](https://github.com/martonpaulo/supernote-tools/issues/151), [#157](https://github.com/martonpaulo/supernote-tools/issues/157)), built in
[#195](https://github.com/martonpaulo/ink-tools/issues/195) and waiting for its device check:

- The floating button shows only where the owner writes: while the handwriting keyboard is open,
  or while a handwriting screen is in front (Note pages `NoteInsidePagesActivity`, Digest
  `KnowledgeActivity`, To-Do `TaskActivity`, Email `HomeActivity`) with no plugin view (PluginHost's
  window, read from `getWindows()`, [#415](https://github.com/martonpaulo/ink-tools/issues/415)) over it; hidden elsewhere. One setting keeps it always visible
  or hidden instead. The rule is `ButtonRule`; with the service off it shows everywhere.
- Detection is an `AccessibilityService` in this app (`WritingWatcher`), enabled once over ADB, that reacts to window
  events only, with no timer: a `TYPE_INPUT_METHOD` window in `getWindows()` (about 140 ms after
  the keyboard opens) or a listed foreground activity. An `inkctl snapshot` restarts the service,
  which then reads the windows again. Measured facts: `../../docs/supernote.md` › Handwriting
  recognition language.
- The sidebar entry stays: the tablet lists one entry per app by itself, and it opens the app's
  screen ([#246](https://github.com/martonpaulo/ink-tools/issues/246)), as a long press on the
  floating button does. The build fails unless the APK has its icon and exactly one launcher entry.
- No other tool shows the active language: the button already does.

## How the switch works

The device facts live in [`../../docs/supernote.md`](../../docs/supernote.md#handwriting-recognition-language)
and the study [`../../docs/research/2026-11-handwriting-language.md`](../../docs/research/2026-11-handwriting-language.md).
In short: the active language is one empty file named with its code in
`/sdcard/.data/dictionary/default/`; recognition reads it on each call.

- `LanguageFiles.set` creates the new file first, then deletes every other code file, so the folder
  is never empty (an empty folder reads as `en_US`). A file whose name is not a code is left alone.
- Only an installed pack (a code folder in `/sdcard/.data/dictionary/resources/`) can be set.
- After the write, `Switcher` broadcasts `hw_type_change`, as the Settings app does.
- The cycle order is fixed (`LanguageCycle.DEFAULT`: `pt_BR`, `en_US`, `es_ES`, then the other
  installed codes alphabetically); the settings screen chooses which codes are in it.
- Each tap logs one line with the tag `LingoApp`:
  `surface=overlay from=pt_BR to=en_US ms=6`, or `surface=launcher error=…`.

## Permissions

Two special permissions (no network permission, no other app's data), each granted on the
system screen its button opens, with no computer ([#494](https://github.com/martonpaulo/ink-tools/issues/494)); the README's developer section grants them over ADB.
Writing detection, once: Settings › Accessibility › Handwriting Language › Use Handwriting
Language, which the settings screen opens; or the two ADB commands of the [README](README.md#build-from-source),
which keep the other services ([#489](https://github.com/martonpaulo/ink-tools/issues/489)).

The app writes only inside `/sdcard/.data/dictionary/default/`, and only a name that matches
`^[a-z]{2}_[A-Z]{2}$` and has its pack installed.

## Build and test

No Gradle: the same light toolchain as the plugins' native code (`javac`, D8, `aapt2`, then
`zipalign` and `apksigner`), installed by `scripts/toolchain.sh` into `.toolchain/` with pinned
SHA-1 checks, or taken from `ANDROID_HOME` on a CI runner. A JDK is found by `../../packages/native-build/host-tools.cjs`, the one JDK locator ([#295](https://github.com/martonpaulo/ink-tools/issues/295)).

```sh
node scripts/build.cjs --test   # JVM tests of the button rule, the cycle, the file switch and the look check
node scripts/build.cjs          # build/outputs/lingo-app-<version>.apk, signed and verified
```

- The gate (`gates.json` › `handwriting-language`, CI `validate-handwriting-language.yml`) runs both, with `javac -Werror`: a new warning fails the build. It does not run the renders:
  `RENDER_EVIDENCE=<dir> node scripts/renders.cjs` draws the real screen off screen, with no device, on Robolectric's native graphics (JVM; first run downloads about 400 MB into `.toolchain/renders/`): five states at three widths, `renders/ScreenRenders.java`, asked for by the root `AGENTS.md` › Interface paths ([#285](https://github.com/martonpaulo/ink-tools/issues/285)); its font is not the tablet's. `node scripts/look-check.cjs --screen NAME --ours PNG --out SHEET.png` measures a render against the native values and draws the side-by-side sheet ([`native-catalog.md`](../../packages/ui-kit/native-catalog.md#look-check), [#299](https://github.com/martonpaulo/ink-tools/issues/299)).
- Logic with no Android import goes in `ButtonGesture`, `ButtonPlace`, `ButtonRule`, `LanguageCycle` or `LanguageFiles` and gets a JVM test;
  the Android classes stay thin.
- All visible copy is in `Copy.java`; the native controls (title bar, list row, switch, radio
  button, caption, button, small filled button, the lines) and the text roles (`Ink.Role`) in `Ink.java`, drawn only from `Tokens`: `scripts/build.cjs` writes that
  class before `javac` from ui-kit's `packages/ui-kit/src/tokens.json` with
  `packages/ui-kit/android-tokens.cjs`, the one source the plugins read too, so a token changes
  there alone; `TokensTest` fails when `Tokens` differs from it
  ([#275](https://github.com/martonpaulo/ink-tools/issues/275)). The launcher label lives in the manifest that
  `scripts/build.cjs` writes.
- No XML layouts: the views are built in code. The two resources are the icon,
  `res/drawable/ic_launcher.xml` (a vector in the native outline style, generated by `scripts/icons.py`, [#246](https://github.com/martonpaulo/ink-tools/issues/246), [#271](https://github.com/martonpaulo/ink-tools/issues/271)), and `WritingWatcher`'s configuration, which
  `scripts/build.cjs` writes and compiles, since window reading can be declared only there
  ([#195](https://github.com/martonpaulo/ink-tools/issues/195)).

## Versioning and signing

- SemVer with a numbered beta, as the root `AGENTS.md` › Product versioning sets for plugins
  ([#155](https://github.com/martonpaulo/supernote-tools/issues/155)): `app.json` `version`
  `0.1.0-beta.14` gives the `versionName` `0.1.0 beta 14` (derived by `scripts/plugin-version.cjs`);
  `versionCode` rises on every build sent to the tablet and never resets. A tag, when one is cut,
  is `handwriting-language-v<version>`.
- A push to `main` that changes `app.json` publishes the `handwriting-language-v<version>` prerelease with
  its APK (`prerelease-handwriting-language.yml`), signed with the release key of the
  `INKTOOLS_LINGO_KEYSTORE_BASE64` and `_PASSWORD` secrets; with no key the workflow fails and publishes
  nothing ([#494](https://github.com/martonpaulo/ink-tools/issues/494), `docs/security.md` › Android signing keys).
- A local build is signed with a debug key in `.toolchain/lingo-app-debug.keystore`, outside Git and unique
  to each checkout, so the tablet needs an uninstall (which drops the app's settings and grants) between
  builds of two keys.
- The applicationId changed with the name (`com.supernotetools.dialect` to
  `com.supernotetools.lingo`, [#160](https://github.com/martonpaulo/supernote-tools/issues/160)): Android installs the new id beside the old app, so
  uninstall Dialect first (`adb uninstall com.supernotetools.dialect`), or both write the language
  file. The settings and the two `appops` grants do not carry over; grant them again.
- The applicationId `com.supernotetools.lingo` stays on purpose, so the installed app keeps its settings
  and grants ([#179](https://github.com/martonpaulo/ink-tools/issues/179)). A new app takes `com.martonpaulo.inktools.<app>`.
