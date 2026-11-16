# Handwriting recognition language: switch fast, recognise many

Status: research, rewritten 2026-11-16 for [#151](https://github.com/martonpaulo/supernote-tools/issues/151) (successor of [#146](https://github.com/martonpaulo/supernote-tools/issues/146)), with the owner's tablet and the decompiled firmware in hand. No code shipped; a build follows once the owner picks a direction. Visual summary for the decision: [Handwriting Language Switch](https://claude.ai/artifact/Gn2mWD21UYyGjgRC88EsfM).

Marks, as in [`../supernote.md`](../supernote.md): **[measured]** on the owner's tablet (Supernote Nomad, firmware `Chauvet.E103.2610191001.2559`, Android 11); **[source]** read in the decompiled firmware apps or the framework, with file and line; **[official]** the vendor's documents or the `sn-plugin-lib` 0.2.3 sources; **[inference]** reasoned, not run. Decompiled vendor code lives only in the session scratch and is never committed (`cli/snadb/AGENTS.md`), so citations give the class and line, not the code.

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
- [Sources](#sources)

## Answer in short

- **Where the language is stored:** a single empty file whose name is the language code, in `/sdcard/.data/dictionary/default/`. The owner's tablet holds one file, `pt_BR` [measured]. The Settings app switches the language by deleting that file and creating a new one, then broadcasting `hw_type_change` [source]. There is no `Settings.System`/`Global`/`Secure` key, no system property and no "set active language" content provider; the file is the whole source of truth [source, measured].
- **Can a plugin switch it?** No. The value is a file under `/sdcard/.data/dictionary/`, which is outside the plugin file whitelist, so the host's own sandbox denies a plugin reading or writing it — the same denial already measured in [#23](https://github.com/martonpaulo/supernote-tools/issues/23). No broadcast, intent or provider sets the language instead; only the Settings app writes the file [source]. **This closes the question the earlier study left open: a plugin cannot change the device recognition language, and no tablet round can make it possible.**
- **What a plugin can do** (the host process runs as `android.uid.system`, so inter-app calls are not blocked, only file access is): open the Settings handwriting-language screen for the owner to tap [source], and recognise with its own bundled engine, independent of the device setting [inference].
- **Switching from the computer works.** Shell ADB can write that folder [measured], so a `snadb` command could switch the global language without any plugin. Recognition uses the new language on the next call [inference from per-call reads].
- **Many languages at once:** the device engine (MyScript iink) uses one language per recognition [official, source]. The only way to recognise several languages on the same strokes inside a plugin is the plugin's own engine (Google ML Kit Digital Ink, Esperanto included). Esperanto is not one of the device's 66 languages and is dropped by owner decision.

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
| Keyboard handwriting (the IME) | `Recognition.binderEvent()` sets `recognizer.lang = getDefaultLang()` once, at IME start | Only after the **IME restarts**: the IME registers `hw_type_change` but its receiver ignores that action (it acts only on `system_dialog`), so the broadcast triggers no live reload | [source] `Recognition:92`, `PinyinIME` receiver lines 214/263 |

So a language change applies to Note-app lasso convert and to a plugin's `recognizeElements` on the very next call, with no reopen, but keyboard handwriting keeps the old language until the keyboard process restarts.

## 3. What a plugin can and cannot do

The plugin host `com.ratta.supernote.pluginhost` runs as `sharedUser=android.uid.system` (uid 1000) with `WRITE_SETTINGS` granted [measured, `dumpsys package`]. A plugin's own native code is loaded into that process with `DexClassLoader` [official SDK]. Two different limits apply:

- **File access is sandboxed in-process.** The framework class `android.os.PluginSecurityManager` (decompiled from `framework.jar`) checks every file path against a whitelist while a plugin's code runs. `checkFileAccess` throws `SecurityException` for any path under `/storage/emulated/0/` that is not whitelisted. The whitelist is `Document, EXPORT, INBOX, MyStyle, Note, SCREENSHOT`, plus `/storage/emulated/0/InkHub/temp` and `/storage/emulated/0/.data/plugin` added at host start [source `PluginSecurityManager`; `PluginApplication:112`]. `/storage/emulated/0/.data/dictionary` is **not** in it, so a plugin cannot read or write the language file. The same denial is measured in [#23](https://github.com/martonpaulo/supernote-tools/issues/23) for a different `/sdcard` path.
- **Inter-app calls are not sandboxed**, and the host's system uid bypasses the usual export checks. So a plugin's native code can `startActivity`, `sendBroadcast` and query a provider that its permission allows [inference from the sandbox scope and uid].

| Need | Possible from a plugin? | Mark |
| :--- | :--- | :--- |
| Read or write the language file | **No** — outside the file whitelist | [source] whitelist; [measured] the same guard in [#23](https://github.com/martonpaulo/supernote-tools/issues/23) |
| Set the language by broadcast / intent / provider | **No** — nothing but the Settings app's file write changes it; `hw_type_change` only notifies, and no receiver switches the language on it | [source] no setter exists |
| Open the Settings handwriting-language screen for the owner to tap | **Yes** (system-uid `startActivity`); this lights up the screen and leaves the note | [inference] from uid; activity confirmation is a device step (§ 9) |
| Pass a language to `recognizeElements` | **No** — the API has no language parameter, and the host always uses the global file | [official, source] |
| Load the device's MyScript engine directly | **No** — `libMyScript*.so` live in the Note/keyboard app lib dirs, outside the file whitelist and in another app's data | [measured] lib locations; [source] sandbox |
| Recognise with the plugin's **own** bundled engine | **Yes** — independent of the device setting | [inference] |

The earlier study guessed that a plugin's native code "might" write the setting depending on a tablet round. The firmware now answers it: the setting is a file in a non-whitelisted folder, and the file sandbox denies it. No per-call language API is exposed to plugins either.

## 4. Switching from the computer (snadb)

Shell ADB (uid 2000, groups include `sdcard_rw`) can create and delete files in `/sdcard/.data/dictionary/` [measured: a probe file was written and removed]. So a host-side `snadb` command could switch the global handwriting language with no plugin and no sandbox limit:

1. Delete the current `/sdcard/.data/dictionary/default/<old>` and create `/sdcard/.data/dictionary/default/<new>` (create first, then delete, to avoid an empty folder that would reset to `en_US`).
2. Optionally broadcast `hw_type_change` so the Settings/keyboard UI refreshes its label.

The next Note-app recognition or plugin `recognizeElements` then uses the new language [inference from § 2]. This only switches among the **installed** packs (§ 7); a new language first needs its resource pack, which the Settings app downloads. This path needs the computer and the cable, so it fits a desk session, not a quick in-note switch.

## 5. Many languages at once

The device engine loads one language resource per recognition [official, source]. Each installed `conf/<lang>.conf` also adds `mul/mul-lk-english_secondary_1.res` with `EnableAlienCharacters`, which is MyScript's "secondary English" for isolated English words only [measured conf files]. For anything beyond that:

| Method | How | Cost | Esperanto | Mark |
| :--- | :--- | :--- | :--- | :--- |
| Device engine, switch and repeat | Switch the language (only from the computer, § 4, or the Settings screen), recognise again | A switch per language; keyboard needs a restart | No (not installed, not among the 66) | [source], [official] |
| Plugin with its own engine (Google ML Kit Digital Ink) | Native code feeds the strokes to one recognizer per language and picks the best | ~20 MB per language model, downloaded once; API 23+ (the tablet is 11) | **Yes** (`eo`) | [official] ML Kit; model download without Google Play services is a device step (§ 9) |
| Host tool over snadb | Pull the `.note`, recognise on the Mac with any engine | Not live; needs the Mac | Engine's choice | [inference] |

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

Fast switching **without leaving the note**, using the device engine from a plugin, is not possible (§ 3). The options that are:

1. **A `snadb lang <code>` command** (host side). Switches the global language instantly from the computer, no plugin, no sandbox limit [mechanism measured, § 4]. For the owner at a desk. What the owner sees: nothing on the tablet until the next recognition, which then comes out in the new language. Proven: the file write and the per-call read. Not proven: the exact first-call timing after a switch (pen step).
2. **A plugin sidebar button that opens the Settings handwriting-language screen.** On-tablet, official, uses the real setting; the owner taps the language and returns. A few taps, and it leaves the note. What the owner sees: the Settings language list. Proven: the host's system uid can start activities. Not proven: the exact activity name and that it starts from a plugin (device step, § 9).
3. **A plugin with its own recognizer (Google ML Kit Digital Ink).** The only way to switch language instantly inside a note from the tablet, and the only Esperanto path; but it is a second engine (~20 MB per language, a model download) that ignores the device's own languages. The owner asked to drop ML Kit unless it is needed; it is the only on-tablet instant path, so it is listed for the owner to weigh, not recommended by default. Not proven: model download without Google Play services, and per-call time on the tablet (device step, § 9).

Esperanto is dropped (not among the device languages; only option 3 would reach it). No option depends on Ratta.

A shared `packages/` module should own "recognise in language X" if more than one plugin needs it, so Lookup, Lingo and Ink2Pic share one path [inference].

## 9. Pen-only or further-device steps left

Collected so they run in one round, not one by one:

1. **First-call timing after a switch** (option 1): with the pen, switch the language from the computer, then lasso-convert a word and read how long the first recognition takes versus a warm one (needs a pen lasso).
2. **Settings-screen button** (option 2): confirm the exact handwriting-language activity name and that a plugin can start it (a small on-device probe; the probe's native step builds only on Linux/CI, see Findings).
3. **ML Kit on the tablet** (option 3): whether the Esperanto model downloads without Google Play services, its RAM use, and the time for one word (a probe build plus a pen lasso).

## Sources

- Device, [measured] 2026-11-16: `adb shell ls /sdcard/.data/dictionary` and `.../default`, `.../resources`, `.../conf`; `settings list system|global|secure`; `getprop`; `dumpsys package com.ratta.supernote.pluginhost`; a write probe in `/sdcard/.data/dictionary`; the `.note` header of a test note.
- Firmware `Chauvet.E103.2610191001.2559`, [source] decompiled on the owner's Mac (jadx 1.5.6; not committed): `SupernoteNote` (`com.supernote.iink.RecognitionController`, `LanguageUtils`; `com.ratta.supernote.pluginclient.*`; `com.ratta.supernote.note.*`), `SupernoteSetting` (`com.ratta.settings.input.HWLanguageSetting`, `com.ratta.settings.utils.LanguageUtils`), `PluginHost` (`com.ratta.supernote.pluginhost.plugin.impl.HostCommImpl`, `PluginApplication`), `keyboard` (`com.android.inputmethod.keyboard.Recognition`, `PinyinIME`, `LanguageUtils`), and `framework.jar` (`android.os.PluginSecurityManager`). Native libraries `libiink.so`, `libMyScript*.so` (keyboard), `librecgnition.so` (Note/Setting/Document).
- Supernote, [Handwriting Recognition](https://support.supernote.com/handwriting-recognition) and [Keyboard](https://support.supernote.com/keyboard) (66 languages, one at a time, Live-note language fixed at creation).
- Supernote plugin API, [`recognizeElements`](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-comm-api/recognize-elements) (no language parameter).
- MyScript, [Available languages](https://help.myscript.com/notes/overview/available-languages/) and [mixed languages](https://developer-support.myscript.com/support/discussions/topics/16000029964).
- Google, [ML Kit Digital Ink base models](https://developers.google.com/ml-kit/vision/digital-ink-recognition/base-models) (over 300 languages, `eo`) and [Android guide](https://developers.google.com/ml-kit/vision/digital-ink-recognition/android) (~20 MB per language, API 23).
