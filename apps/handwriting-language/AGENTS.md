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
  corner and stays where it is dragged, saved as fractions of the screen so it stays on screen
  when the screen turns (`ButtonGesture`, `ButtonPlace`); Settings' «Reset Button Position» puts it
  back. It shows only where the owner writes, or always, or never (the setting), and comes back
  after a restart of the tablet or an update of the app unless hidden.
- **B, the app's screen** (`SettingsActivity`, the one launcher entry, «Handwriting Language»,
  with its icon `res/drawable/ic_launcher.xml`): the sidebar lists it by itself and opens it
  ([#246](https://github.com/martonpaulo/ink-tools/issues/246)). It is drawn with the Supernote's
  native controls, as the plugins' ui-kit draws them ([#275](https://github.com/martonpaulo/ink-tools/issues/275)):
  the black title bar with × to close at the leading edge (Back closes it too) and the title
  centred on its full width, the native type sizes in regular weight, the active
  language as a row with the primary button «Switch Language» at its trailing edge, the floating
  button's three choices as radio rows and «Reset Button Position», a switch row («ON»/«OFF») for
  each installed language in the cycle, each missing permission with the button to its system
  screen and the command that grants it, and the command that turns on writing detection when it
  is off. An error shows in bold beside the control whose action failed. Each section is one group,
  as ui-kit's `RowGroup` draws it: the group gap, the grey caption, its rows with a thin line
  only between two of them, and its note right under the last row; permissions and errors follow
  under the group. A language shows only its
  name, never its code such as `pt_BR`, which stays in the log and the preferences (owner,
  [#275](https://github.com/martonpaulo/ink-tools/issues/275)). The one-tap switch with nothing on screen is gone (owner,
  2026-11-25).

## Target surface

The owner's choice after trying both on the tablet ([#151](https://github.com/martonpaulo/supernote-tools/issues/151), [#157](https://github.com/martonpaulo/supernote-tools/issues/157)), built in
[#195](https://github.com/martonpaulo/ink-tools/issues/195) and waiting for its device check:

- The floating button shows only where the owner writes: while the handwriting keyboard is open,
  or while a handwriting screen is in front (Note pages `NoteInsidePagesActivity`, Digest
  `KnowledgeActivity`, To-Do `TaskActivity`, Email `HomeActivity`); hidden elsewhere. One setting
  keeps it always visible or always hidden instead. The rule is `ButtonRule`; while the service is
  off the button shows everywhere, so the switch still works.
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

Two special permissions, granted once over ADB (no network permission, no other app's data):

```sh
adb shell appops set com.supernotetools.lingo MANAGE_EXTERNAL_STORAGE allow
adb shell appops set com.supernotetools.lingo SYSTEM_ALERT_WINDOW allow
```

Writing detection, once, also over ADB (this command replaces any other enabled accessibility
service; the settings screen shows it while the service is off):

```sh
adb shell settings put secure enabled_accessibility_services com.supernotetools.lingo/.WritingWatcher
adb shell settings put secure accessibility_enabled 1
```

The app writes only inside `/sdcard/.data/dictionary/default/`, and only a name that matches
`^[a-z]{2}_[A-Z]{2}$` and has its pack installed.

## Build and test

No Gradle: the same light toolchain as the plugins' native code (`javac`, D8, `aapt2`, then
`zipalign` and `apksigner`), installed by `scripts/toolchain.sh` into `.toolchain/` with pinned
SHA-1 checks, or taken from `ANDROID_HOME` on a CI runner. A JDK is found by `scripts/host-tools.cjs`.

```sh
node scripts/build.cjs --test   # JVM tests of the button rule, the cycle and the file switch
node scripts/build.cjs          # build/outputs/lingo-app-<version>.apk, signed and verified
```

- The gate (`gates.json` › `handwriting-language`, CI `validate-handwriting-language.yml`) runs both.
- `javac -Werror`: a new warning fails the build.
- Logic with no Android import goes in `ButtonGesture`, `ButtonPlace`, `ButtonRule`, `LanguageCycle` or `LanguageFiles` and gets a JVM test;
  the Android classes stay thin.
- All visible copy is in `Copy.java`; the native controls (title bar, list row, switch, radio
  button, caption, button) in `Ink.java`, drawn only from `Tokens`: `scripts/build.cjs` writes that
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
  `0.1.0-beta.7` gives the `versionName` `0.1.0 beta 7` (derived by `scripts/plugin-version.cjs`);
  `versionCode` rises on every build sent to the tablet and never resets. A tag, when one is cut,
  is `handwriting-language-v<version>`.
- No release workflow yet: a test build is handed over as a file for the device round.
- The APK is signed with a debug key created in `.toolchain/lingo-app-debug.keystore`, outside Git and unique
  to each checkout. An APK from another checkout or from CI has another key, so the tablet needs
  `adb uninstall com.supernotetools.lingo` before it (which drops the app's settings and grants).
- The applicationId changed with the name (`com.supernotetools.dialect` to
  `com.supernotetools.lingo`, [#160](https://github.com/martonpaulo/supernote-tools/issues/160)): Android installs the new id beside the old app, so
  uninstall Dialect first (`adb uninstall com.supernotetools.dialect`), or both write the language
  file. The settings and the two `appops` grants do not carry over; grant them again.
- The applicationId `com.supernotetools.lingo` stays on purpose, so the installed app keeps its settings
  and grants ([#179](https://github.com/martonpaulo/ink-tools/issues/179)). A new app takes `com.martonpaulo.inktools.<app>`.
