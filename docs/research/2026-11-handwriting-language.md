# Handwriting recognition language: switch fast, recognise many

Status: research, rewritten 2026-11-16 for [#151](https://github.com/martonpaulo/ink-tools/issues/151) (successor of [#146](https://github.com/martonpaulo/ink-tools/issues/146)), with the owner's tablet and its device data in hand. No code shipped; a build follows once the owner picks a direction. Visual summary for the decision: [Handwriting Language Switch](https://claude.ai/artifact/Gn2mWD21UYyGjgRC88EsfM).

Marks, as in [`../supernote.md`](../supernote.md): **[measured]** on the owner's tablet (Supernote Manta, firmware `Chauvet.E103.2610191001.2559`, Android 11); **[source]** device data from the firmware apps or the framework, with file and line; **[official]** the vendor's documents or the `sn-plugin-lib` 0.2.3 sources; **[inference]** reasoned, not run. Vendor material stays out of the repository (`cli/inkctl/AGENTS.md`), so citations give the class and line, not the code.

## Contents

- [Answer in short](#answer-in-short)
- [1. Where the language lives](#1-where-the-language-lives)
- [2. What reads it, and when a change takes effect](#2-what-reads-it-and-when-a-change-takes-effect)
- [3. What a plugin can and cannot do](#3-what-a-plugin-can-and-cannot-do)
- [4. Switching from the computer (snadb)](#4-switching-from-the-computer-snadb)
- [5. Many languages at once](#5-many-languages-at-once)
- [6. Per-note language and the .note file](#6-per-note-language-and-the-note-file)
- [7. Installed resources](#7-installed-resources)
- [8. Options we can build ourselves](#8-options-we-can-build-ourselves)
- [9. Pen-only or further-device steps left](#9-pen-only-or-further-device-steps-left)
- [10. Tablet round, 2026-11-16](#10-tablet-round-2026-11-16)
- [Sources](#sources)

## Answer in short

- **Where the language is stored:** a single empty file whose name is the language code, in `/sdcard/.data/dictionary/default/`. The owner's tablet holds one file, `pt_BR` [measured]. The Settings app switches the language by deleting that file and creating a new one, then broadcasting `hw_type_change` [source]. There is no `Settings.System`/`Global`/`Secure` key, no system property and no "set active language" content provider; the file is the whole source of truth [source, measured].
- **Can a plugin switch it?** Not through the normal plugin file API, but **yes through a route outside that API**, proven on the tablet. A plugin's ordinary Java file write is denied (`SecurityException ... outside whitelist`), but a probe found two routes that the in-process guard does not cover [measured, Probe `voc4oo2ysd7cdnkc`, 2026-11-16]: (a) a **child process** (`ProcessBuilder("sh", "-c", …)`) wrote the folder, and (b) the **system Documents provider** (`DocumentsContract.createDocument`, another process) wrote it. Reflection to the raw OS, the host main-looper thread and a plain new thread were all denied. So a plugin **can** switch the global language on the owner's own device, but only by shelling out or using another process — a route outside the plugin API that would likely fail Ratta's store review ([#6](https://github.com/martonpaulo/ink-tools/issues/6)), so it suits the owner's device, not a published plugin. A plugin's own in-process file I/O stays blocked.
- **Is the switch system-wide?** Yes. The same `default/<code>` file is read by **every** recognition app — Note, Digest/Document, Task, Email, Search and the keyboard all reference `/sdcard/.data/dictionary/default` and `getDefaultLang` [measured, static scan of each APK]. So one switch changes the language everywhere, not just in one note.
- **What a plugin can do** (the host process runs as `android.uid.system`, so inter-app calls are not blocked, only file access is): open the Settings handwriting-language screen for the owner to tap [source], and recognise with its own bundled engine, independent of the device setting [inference].
- **Switching from the computer works.** Shell ADB can write that folder [measured], so a `snadb` command could switch the global language without any plugin. Recognition uses the new language on the next call [inference from per-call reads].
- **Tablet round, 2026-11-16 (§ 10):** the Android pull-down does not exist on this device, so a Quick Settings tile is no surface [measured]. A sideloaded test app with all-files access switched the language from a **floating button** that stays over Note, Digest, To-Do, Email, Settings and the keyboard, and from its **launcher icon**, which the Supernote sidebar lists by itself [measured]. A plugin can float a button over every app too: SnapMark does it from inside the plugin host [measured]. The Note app's TXT export recognised the same word as «Maa», «magá» and «maçã» right after switching to `en_US`, `es_ES` and `pt_BR`, with no restart [measured]; the keyboard re-reads the language each time it opens [measured].
- **Many languages at once:** the device engine (MyScript iink) uses one language per recognition [official, source]. The only way to recognise several languages on the same strokes inside a plugin is the plugin's own engine (Google ML Kit Digital Ink).

## 1. Where the language lives

The engine is **MyScript iink**: the keyboard app ships `libiink.so` and `libMyScript*.so`, and the Note app drives `com.myscript.iink` classes (`Engine`, `OffscreenEditor`, `ContentPart`) [source, measured native libraries]. The 66 UI language codes match MyScript's list [official].

| Question | Answer | Mark |
| :--- | :--- | :--- |
| The stored value | One empty file in `/sdcard/.data/dictionary/default/`, named with the language code; the tablet holds `pt_BR` | [measured] `ls`; [source] `LanguageUtils.getDefaultLang()` returns `listFiles()[0].getName()` |
| Who writes it | The Settings app's handwriting-language screen: `HWLanguageSetting.changeDefault()` deletes the old file and creates the new one (`LanguageUtils.createDefaultLanguage`), then `sendBroadcast(Intent("hw_type_change"))` | [source] `HWLanguageSetting` lines ~285 and ~352 |
| A `Settings.System`/`Global`/`Secure` key | None: a full dump before any change shows only `default_input_method` and friends, nothing for the handwriting language | [measured] `settings list system|global|secure` |
| A system property | None related to the recognition language | [measured] `getprop` |
| A content provider | `content://com.ratta.supernote.settings.provider/lang_update` lists which language packs are **installed** (`value == 1`), not the active one; the active one is the file | [source] `LanguageUtils.queryLanguages` |
| Engine resource load | Per recognition, the Note app sets `configuration-manager.search-path` to `/sdcard/.data/dictionary/conf` (or `conf-lite`) and the editor's `lang` to the default language | [source] `RecognitionController.configureEngine`, `batchRecognition`, `lassoRecognition` |

## 2. What reads it, and when a change takes effect

Every recognition path reads `getDefaultLang()` (the file) freshly; none takes a language argument:

| Path | How it reads the language | Takes effect | Mark |
| :--- | :--- | :--- | :--- |
| Lasso convert / keyword / page recognition in the Note app | `RecognitionController.lassoRecognition` / `batchRecognition` call `getDefaultLang()` on each call and set the editor's `lang` | On the **next** recognition call; no note reopen needed | [source] `RecognitionController` lines 676, 178, 252 |
| Plugin `recognizeElements` | PluginHost forwards it to the Note app (`HostCommImpl.recognizeElements`), which runs `PluginRecognitionService` → `RecognitionController.lassoRecognition` → `getDefaultLang()`; no language parameter anywhere | On the **next** call | [source] `HostCommImpl:1752`, `PluginRecognitionService.recognizeStroke`, `PluginClientCommImpl:6543` |
| Keyboard handwriting (the IME) | `SkbContainer` rebuilds the handwriting board on every `onStartInputView` and calls `Recognition.binderEvent()`, which sets `recognizer.lang = getDefaultLang()`; the `hw_type_change` receiver itself ignores that action | The **next time the keyboard opens**, same process, no restart; a keyboard already open keeps the old language | [measured] log `SkbContainer key:en_US` and `binderEvent` at the next open, IME pid unchanged, label «English (United States)»; [source] `SkbContainer:121-141`, `Recognition:92` |
| Note app TXT export | Recognises every page at export time | On the **next export**: «Maa» (`en_US`), «magá» (`es_ES`), «maçã» (`pt_BR`) for the same strokes, 2.7 to 2.8 s each | [measured] 2026-11-16 |

So a language change applies to Note-app lasso convert, TXT export and a plugin's `recognizeElements` on the very next call, and to keyboard handwriting the next time the keyboard opens; nothing needs a restart. (An earlier version of this note said the keyboard needed a restart; the device log disproves it.)

## 3. What a plugin can and cannot do

The plugin host `com.ratta.supernote.pluginhost` runs as `sharedUser=android.uid.system` (uid 1000) with `WRITE_SETTINGS` granted [measured, `dumpsys package`]. A plugin's own native code is loaded into that process with `DexClassLoader` [official SDK]. Two different limits apply:

- **File access is sandboxed in-process, at the syscall layer.** The check lives in `libcore.io.BlockGuardOs` — the posix layer under **all** Java file I/O — which calls the firmware's `PluginSecurityManager` on `open`, `mkdir`, `unlink`, `rename` and on `UnixFileSystem.list`, but only while the current thread carries a plugin id (`getCurrentPluginId() != null`) [source `BlockGuardOs` lines 248/226/342/354, `UnixFileSystem:257`]. So a plugin's **own native `java.io.File` / `FileOutputStream`** is gated exactly like the JavaScript file API, not only the bridge. `checkFileAccess` throws `SecurityException` for any path under `/storage/emulated/0/` that is not whitelisted. The whitelist is `Document, EXPORT, INBOX, MyStyle, Note, SCREENSHOT`, plus `/storage/emulated/0/InkHub/temp` and `/storage/emulated/0/.data/plugin` added at host start [source `PluginSecurityManager`; `PluginApplication:112`]. `/storage/emulated/0/.data/dictionary` is **not** in it, so a plugin's ordinary in-process file I/O cannot read or write the language file. The same denial is measured in [#23](https://github.com/martonpaulo/ink-tools/issues/23) for a different `/sdcard` path.
- **Inter-app calls are not sandboxed**, and the host's system uid is not held to the usual export checks. So a plugin's native code can `startActivity`, `sendBroadcast`, query a provider and spawn a child process [measured below; the uid is `android.uid.system`].

**The guard runs only for a thread whose plugin id is set, and only inside the plugin's own process.** A probe tried five ways around it on the tablet [measured, Probe `voc4oo2ysd7cdnkc`, 2026-11-16]:

| Route | Result | Why |
| :--- | :--- | :--- |
| Ordinary plugin-thread `java.io` (baseline) | **denied** | the in-process guard, thread has the plugin id |
| **Child process** `ProcessBuilder("sh","-c", …)` | **WROTE** | a separate process is outside the in-process guard; no SELinux denial seen |
| **System Documents provider** `DocumentsContract.createDocument` | **WROTE** | another process (ExternalStorageProvider) does the write |
| Reflection to the raw `libcore.io` Os | denied (exception) | reflection to the raw delegate did not land a usable file handle |
| Host main-looper thread (`Handler(getMainLooper())`) | denied | the main thread carried a plugin id too |
| Plain `new Thread()` | denied | the plugin id is an `InheritableThreadLocal`, so the child thread inherits it |

So a plugin **can** switch the global language on the owner's device, by a child process or the system Documents provider. Both are routes outside the plugin file API: fine for the owner's own device, but a published plugin would likely fail store review ([#6](https://github.com/martonpaulo/ink-tools/issues/6)). Its button would also live only inside the Note app, though the switch itself is global (§ below).

| Need | From a plugin? | Mark |
| :--- | :--- | :--- |
| Read/write the language file, in-process | **No** — outside the whitelist | [measured] |
| Write it via a child process or the Documents provider | **Yes** — outside the plugin file API, owner-device only | [measured] |
| Set the language by broadcast / intent / a Ratta provider | **No** — only the file write changes it; `hw_type_change` just notifies | [source] |
| Open the Settings handwriting-language screen for the owner to tap | **Yes** — `startActivity` to `com.ratta.settings/.SettingsActivity` with `com.ratta.settings.input.HWLanguageSetting` | [source] the activity and action; [inference] from uid |
| Pass a language to `recognizeElements` | **No** — no language parameter; the host always uses the global file | [official, source] |
| Recognise with the plugin's **own** bundled engine | **Yes** — independent of the device setting | [inference] |

**Not shippable as a `.so` this round:** the host does load a plugin's native libraries (from an `<app.npk>_libs` folder, `PluginInstallManager.resolveNativeLibsPath`), so a JNI `.so` calling libc directly is a route in principle; but the light native toolchain (`javac`, `d8`, `aapt2`) has no NDK cross-compiler for an `aarch64` `.so`, so it was not built or tested here [source host loader; toolchain].

### One global file, every app

Note, Digest (Document), Task, Email, Search and the keyboard IME all reference `/sdcard/.data/dictionary/default` and `getDefaultLang` in their code [measured, static dex scan of each APK, 2026-11-16]. There is no per-app language. So switching the one file changes handwriting recognition **everywhere** — the owner's "works anywhere" is automatic; what differs between the options below is only where the *switch control* lives and how many taps it costs.

## 4. Switching from the computer (snadb)

Shell ADB (uid 2000, groups include `sdcard_rw`) can create and delete files in `/sdcard/.data/dictionary/`. The switch was run end to end and reversed: `pt_BR` → replaced with `es_ES` → restored to `pt_BR`, each with `am broadcast -a hw_type_change`, leaving the folder with the single original file [measured, 2026-11-16]. So a host-side `snadb` command could switch the global handwriting language with no plugin and no sandbox limit:

1. Delete the current `/sdcard/.data/dictionary/default/<old>` and create `/sdcard/.data/dictionary/default/<new>` (create first, then delete, to avoid an empty folder that would reset to `en_US`).
2. Optionally broadcast `hw_type_change` so the Settings/keyboard UI refreshes its label.

The next Note-app recognition or plugin `recognizeElements` then uses the new language [inference from § 2]. This only switches among the **installed** packs (§ 7); a new language first needs its resource pack, which the Settings app downloads. This path needs the computer and the cable, so it fits a desk session, not a quick in-note switch.

## 5. Many languages at once

The device engine loads one language resource per recognition [official, source]. Each installed `conf/<lang>.conf` also adds `mul/mul-lk-english_secondary_1.res` with `EnableAlienCharacters`, which is MyScript's "secondary English" for isolated English words only [measured conf files]. For anything beyond that:

| Method | How | Cost | Mark |
| :--- | :--- | :--- | :--- |
| Device engine, switch and repeat | Switch the language (only from the computer, § 4, or the Settings screen), recognise again | A switch per language; keyboard needs a restart | [source], [official] |
| Plugin with its own engine (Google ML Kit Digital Ink) | Native code feeds the strokes to one recognizer per language and picks the best | ~20 MB per language model, downloaded once; API 23+ (the tablet is 11) | [official] ML Kit; model download without Google Play services is a device step (§ 9) |
| Host tool over snadb | Pull the `.note`, recognise on the Mac with any engine | Not live; needs the Mac | [inference] |

MyScript states its engine "has not been designed for recognizing mixed languages" [official], so a page that mixes languages word by word needs a per-word, per-language pass under any method except a true multilingual resource (which only Ratta can ship in firmware, so it is not a path we can build).

## 6. Per-note language and the .note file

A `.note` file carries a `<FILE_RECOGN_LANGUAGE:...>` field in its header; a plain note reads `none` [measured on a test note]. For a Real-Time Recognition (Live) note, the language is written at creation: `NotePresenter` calls `setFileRecognLanguage(path, getDefaultLang())` when the note is created in that mode [source `NotePresenter:1900`, `CreateNoteUtils:83`]. The engine has a `CHANGE_LANG` task and `RecognitionController.changeLanguage()` that rebind the editor to a new `lang` [source], and `setFileRecognLanguage` can rewrite the field, so the per-note language **is** a writable file-format field, even though the device UI says a Live note's language "cannot be changed after the note is created" [official help]. A host-side tool could in principle rewrite the field in the `.note`; doing so safely (and whether the Note app re-recognises) is unverified.

## 7. Installed resources

`/sdcard/.data/dictionary/resources/` on the owner's tablet [measured]:

| Pack | Size | Pack | Size |
| :--- | :--- | :--- | :--- |
| `en_US` | 18 MB | `zh_CN` | 50 MB |
| `es_ES` | 17 MB | `zh_TW` | 10 MB |
| `pt_BR` | 15 MB | `ja_JP` | 12 MB |
| `math` | 18 MB | `mul` (English secondary) | 2.3 MB |
| `analyzer`, `document_layout`, `shape` | ~5 MB total | | |

So six text languages are installed (`en_US`, `es_ES`, `pt_BR`, `zh_CN`, `zh_TW`, `ja_JP`); the owner's three (PT, EN, ES) are all present. `conf/` holds `en_US`, `es_ES`, `pt_BR`, `zh_CN`; `conf-lite/` adds `ja_JP`. The other 60 of the 66 need a download in Settings. Total dictionary folder: 147 MB [measured].

## 8. Options we can build ourselves

The switch is one global file (§ 3), so every option below changes the language in all apps; they differ in where the control lives and how many taps it takes. Ranked by the owner's goal, works anywhere with one tap, after the tablet round of § 10:

1. **A sideloaded app with a floating button.** A tiny app with all-files access (`MANAGE_EXTERNAL_STORAGE`) and the overlay permission (`SYSTEM_ALERT_WINDOW`), both granted once over ADB with `appops`, draws a small «PT / EN / ES» button that stays on screen over every app; one tap cycles the language. No route outside an API: the app holds the permissions. Proven on the tablet: the button showed and switched over Note, Digest, To-Do, Email, Settings and the keyboard, in 6 to 7 ms, and the next TXT export came out in the new language [measured]. Not proven: the pen's own lasso convert and keyboard writing after a tap (§ 9); whether the button gets in the way of writing near it.
2. **The same app's icon in the Supernote sidebar.** The firmware lists a sideloaded app in the sidebar by itself; one tap runs the switch and closes. Two moves (open the sidebar, tap), no button on screen. Proven: the switch from the launcher entry (10 ms) and the sidebar listing [measured]. Not proven: the tap from the sidebar itself, since ADB cannot drive the side strip (§ 9).
3. **A plugin with a floating button.** A plugin's native code can add an overlay window from inside the plugin host, as SnapMark's «Floating capture button» does over every app [measured]; its tap would switch the file by the child-process route (§ 3). Same reach as option 1, installed as a plugin, but it rests on two things outside the plugin API (a private overlay and the child-process file write), so it fits the owner's device only ([#6](https://github.com/martonpaulo/ink-tools/issues/6)). Not built.
4. **A plugin button in the Note app.** A sidebar or lasso button; the switch is global, but the button lives only in Note (and the document reader), by the same route. Proven: the child-process write [measured]. Not built.
5. **The keyboard's own path (exists today).** From any text field: long-press the globe key, «Keyboard Settings», «Handwriting», «Language», the language: five taps, official, nothing to install [measured]. It leaves the app for Settings.
6. **A `snadb lang <code>` command** (from the computer, cable). Proven end to end (§ 4). For a desk session only.
7. **A plugin with its own recognizer (Google ML Kit Digital Ink).** Not needed now that options 1 to 3 exist; a fallback only.

**Dropped:** a Quick Settings tile. The device has no Android pull-down: the status bar and the shade are hidden, and a tile added by ADB is never bound [measured, § 10].

Esperanto is out of scope (owner decision): it is not among the device's 66 languages, so only option 7 could reach it. No option depends on Ratta.

A shared `packages/` module should own "recognise in language X" if more than one plugin needs it, so Lookup, Lingo and Ink2Pic share one path [inference].

## 9. Pen-only or further-device steps left

Collected so they run in one round; the exact steps are in the round plan's pen block (`.scratch/rounds/2026-11-16-big-round.md`, block G):

1. **Lasso convert and keyboard writing after a tap** (options 1 to 4): write «maçã», tap the button to `en_US`, lasso-convert it, tap back to `pt_BR`, convert again; in To-Do, open a new task, write «maçã» in the keyboard. The TXT export already proves the Note engine follows on the next call, and the keyboard log proves it reloads on the next open [measured]; the pen confirms the two paths the agent cannot drive.
2. **The sidebar tap** (option 2): open the sidebar with a finger on the side strip and tap the test app; the agent reads the file.
3. **ML Kit on the tablet** (option 7, only if chosen).

A plugin that switches the language by a child process or the Documents provider works outside the plugin file API: it is for the owner's own device only and would likely fail Ratta's store review ([#6](https://github.com/martonpaulo/ink-tools/issues/6)). The sideloaded app (options 1 and 2) needs no such route and is the cleaner "anywhere, one tap" path.

## 10. Tablet round, 2026-11-16

A throwaway test app (`com.supernotetools.hwlangtest`, built in the session scratch with Android build-tools 30.0.3 in a `linux/amd64` container, never committed) held a `TileService`, a launcher activity and an overlay service, each cycling `pt_BR` → `en_US` → `es_ES` by creating the new file, deleting the old one and broadcasting `hw_type_change`. It was installed with `adb install` and granted `MANAGE_EXTERNAL_STORAGE` and `SYSTEM_ALERT_WINDOW` with `appops set`. Everything was undone after (the «Restore» row).

| Test | Result | Mark |
| :--- | :--- | :--- |
| Quick Settings tile | `cmd statusbar add-tile` put it first in `sysui_qs_tiles`, but the `StatusBar` window is `GONE`, `NotificationShade` stays `INVISIBLE` after `cmd statusbar expand-settings`, a top swipe opens nothing, the `TileService` was never bound and `click-tile` did nothing | [measured] |
| Launcher icon | `am start` of the launcher activity switched `pt_BR` → `en_US` in 10 ms; Settings › Apps › Customize Sidebar listed «HW Lang Test» by itself, and dropped it on uninstall | [measured] |
| Floating button (sideloaded app) | Visible and tappable over Note, Digest, To-Do, Email, Settings, a plugin view and the open keyboard; each tap switched in 6 to 7 ms | [measured] screenshots kept in the session scratch only |
| Floating button (plugin) | SnapMark's «Floating capture button», switched on for the test, is a `TYPE_APPLICATION_OVERLAY` window of `com.ratta.supernote.pluginhost` (uid 1000) that stayed over Email with no plugin view open; `sn-plugin-lib` has no call for it (button types 1, 2, 3 only) | [measured]; [official] SDK |
| Keyboard | No language key: a tap on the globe toggles handwriting and typed keys; a long-press lists «Handwriting (Português (Brasil))», the typed layouts and «Keyboard Settings», which leads to the handwriting-language screen in three more taps. After a switch, the next opening shows the new language and its log runs `binderEvent` with it, in the same process | [measured] |
| Recognition without a pen | Note › Export & Share › Export › TXT recognises the page: «Maa» (`en_US`), «magá» (`es_ES`), «maçã» (`pt_BR`) for the same handwritten «maçã», 2.70 s, 2.79 s and 2.69 s, each right after a button tap; the export file lands in `EXPORT/`, which Supernote Cloud uploads | [measured] |
| Restore | `pt_BR` back; overlay stopped, tile removed, app uninstalled, SnapMark's floating button off and SnapMark disabled again, the three exports deleted; `settings list system/global/secure` and `pm list packages` equal the start, and `plugin ls` differs only by Ink2Pic, uninstalled on the owner's order the same day | [measured] diff |

## Sources

- Device, [measured] 2026-11-16: `adb shell ls /sdcard/.data/dictionary` and `.../default`, `.../resources`, `.../conf`; `settings list system|global|secure`; `getprop`; `settings get secure sysui_qs_tiles`; `dumpsys package com.ratta.supernote.pluginhost`; the `.note` header of a test note; a static dex scan of `SupernoteTask`, `SupernoteEmail`, `SupernoteKnowledge`, `SupernoteSearch` for the language file and `getDefaultLang`; the end-to-end file switch `pt_BR -> es_ES -> pt_BR`; and the Probe `voc4oo2ysd7cdnkc`, whose native code tried five file-write routes (child process and the Documents provider wrote; in-process `java.io`, reflection to the raw Os, the main-looper thread and a new thread were denied).
- Firmware `Chauvet.E103.2610191001.2559`, [source] device data, read on the owner's Mac (not committed): `SupernoteNote` (`com.supernote.iink.RecognitionController`, `LanguageUtils`; `com.ratta.supernote.pluginclient.*`; `com.ratta.supernote.note.*`), `SupernoteSetting` (`com.ratta.settings.input.HWLanguageSetting`, `com.ratta.settings.utils.LanguageUtils`), `PluginHost` (`com.ratta.supernote.pluginhost.plugin.impl.HostCommImpl`, `PluginApplication`), `keyboard` (`com.android.inputmethod.keyboard.Recognition`, `PinyinIME`, `LanguageUtils`), and `framework.jar` (`android.os.PluginSecurityManager`). Native libraries `libiink.so`, `libMyScript*.so` (keyboard), `librecgnition.so` (Note/Setting/Document).
- Supernote, [Handwriting Recognition](https://support.supernote.com/handwriting-recognition) and [Keyboard](https://support.supernote.com/keyboard) (66 languages, one at a time, Live-note language fixed at creation).
- Supernote plugin API, [`recognizeElements`](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-comm-api/recognize-elements) (no language parameter).
- MyScript, [Available languages](https://help.myscript.com/notes/overview/available-languages/) and [mixed languages](https://developer-support.myscript.com/support/discussions/topics/16000029964).
- Google, [ML Kit Digital Ink base models](https://developers.google.com/ml-kit/vision/digital-ink-recognition/base-models) (over 300 languages, `eo`) and [Android guide](https://developers.google.com/ml-kit/vision/digital-ink-recognition/android) (~20 MB per language, API 23).
