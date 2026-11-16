# Lingo app — agent guidance

Scoped guidance for `apps/lingo-app/`. Inherits the repository root `../../AGENTS.md`. A `CLAUDE.md`
symlink points at this file.

## What it is

A small sideloaded Android app, not a plugin ([#157](https://github.com/martonpaulo/supernote-tools/issues/157), the owner's choice in
[#151](https://github.com/martonpaulo/supernote-tools/issues/151)), that switches the tablet's
handwriting recognition language for every app. Its internal name is «Lingo» (owner,
[#160](https://github.com/martonpaulo/supernote-tools/issues/160)); it was «Dialect» until `0.1.0-beta.1`. The tablet shows the feature name «Handwriting
Language» and «Handwriting Language Settings» ([#176](https://github.com/martonpaulo/supernote-tools/issues/176)). The folder, gate, workflow
and tag say `lingo-app`, because `lingo` is the retiring Lingo plugin's in each of them.
Two surfaces ship in one build so one tablet round compares them:

- **A, the floating button** (`OverlayService`): a box at the right screen edge over every app that
  shows the active language (`PT`, `EN`, `ES`); one tap moves to the next. On or off in the settings
  screen, and back after a restart when on.
- **B, the launcher entry** (`SwitchActivity`, label «Lingo»): the sidebar lists it by itself; one
  tap moves to the next language with nothing on screen.

The settings screen (`SettingsActivity`, a second launcher entry «Handwriting Language Settings») shows the
active language, the floating button switch, the installed languages in the cycle and each missing
permission with the command that grants it.

## Target surface

The owner's choice after trying both on the tablet ([#151](https://github.com/martonpaulo/supernote-tools/issues/151), [#157](https://github.com/martonpaulo/supernote-tools/issues/157)), not built yet:

- The floating button shows only where the owner writes: while the handwriting keyboard is open,
  or while a handwriting screen is in front (Note pages `NoteInsidePagesActivity`, Digest
  `KnowledgeActivity`, To-Do `TaskActivity`, Email `HomeActivity`); hidden elsewhere. One setting
  keeps it always visible or always hidden instead.
- Detection is an `AccessibilityService` in this app, enabled once over ADB, that reacts to window
  events only, with no timer: a `TYPE_INPUT_METHOD` window in `getWindows()` (about 140 ms after
  the keyboard opens) or a listed foreground activity. An `inkctl snapshot` restarts the service,
  which then reads the windows again. Measured facts: `../../docs/supernote.md` › Handwriting
  recognition language.
- The sidebar entry stays: the tablet lists one entry per app by itself. The settings screen needs
  an entry the tablet shows, such as a long press on the floating button, since the second
  launcher entry never appears in the sidebar ([#160](https://github.com/martonpaulo/supernote-tools/issues/160)).
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

The app writes only inside `/sdcard/.data/dictionary/default/`, and only a name that matches
`^[a-z]{2}_[A-Z]{2}$` and has its pack installed.

## Build and test

No Gradle: the same light toolchain as the plugins' native code (`javac`, D8, `aapt2`, then
`zipalign` and `apksigner`), installed by `scripts/toolchain.sh` into `.toolchain/` with pinned
SHA-1 checks, or taken from `ANDROID_HOME` on a CI runner. A JDK is found by `scripts/host-tools.cjs`.

```sh
node scripts/build.cjs --test   # JVM tests of the cycle and the file switch, over a fake disk
node scripts/build.cjs          # build/outputs/lingo-app-<version>.apk, signed and verified
```

- The gate (`gates.json` › `lingo-app`, CI `validate-lingo-app.yml`) runs both.
- `javac -Werror`: a new warning fails the build.
- Logic with no Android import goes in `LanguageCycle` or `LanguageFiles` and gets a JVM test;
  the Android classes stay thin.
- All visible copy is in `Copy.java`; the e-ink look (black on white, a black outline, 64 dp
  targets, no animation) in `Ink.java`. The two launcher labels live in the manifest that
  `scripts/build.cjs` writes.
- No XML layouts or resources: the views are built in code, so the build needs no resource step.

## Versioning and signing

- SemVer with a numbered beta, as the root `AGENTS.md` › Product versioning sets for plugins
  ([#155](https://github.com/martonpaulo/supernote-tools/issues/155)): `app.json` `version`
  `0.1.0-beta.2` gives the `versionName` `0.1.0 beta 2` (derived by `scripts/plugin-version.cjs`);
  `versionCode` rises on every build sent to the tablet and never resets. A tag, when one is cut,
  is `lingo-app-v<version>`.
- No release workflow yet: a test build is handed over as a file for the device round.
- The APK is signed with a debug key created in `.toolchain/lingo-app-debug.keystore`, outside Git and unique
  to each checkout. An APK from another checkout or from CI has another key, so the tablet needs
  `adb uninstall com.supernotetools.lingo` before it (which drops the app's settings and grants).
- The applicationId changed with the name (`com.supernotetools.dialect` to
  `com.supernotetools.lingo`, [#160](https://github.com/martonpaulo/supernote-tools/issues/160)): Android installs the new id beside the old app, so
  uninstall Dialect first (`adb uninstall com.supernotetools.dialect`), or both write the language
  file. The settings and the two `appops` grants do not carry over; grant them again.
