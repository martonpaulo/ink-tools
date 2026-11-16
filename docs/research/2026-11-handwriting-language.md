# Handwriting recognition language: switch fast, recognise many

Status: research, 2026-11-16, for [#146](https://github.com/martonpaulo/supernote-tools/issues/146). No code; a build follows in sub-issues once the owner picks a direction. Visual summary for the decision: [Handwriting Language Switch](https://claude.ai/artifact/Gn2mWD21UYyGjgRC88EsfM).

Marks, as in [`../supernote.md`](../supernote.md): [official] the vendor's documents or the `sn-plugin-lib` 0.2.3 sources; [measured] seen on the owner's Manta; [reported] a user's or a reviewer's account; [inference] reasoned, not seen.

## Contents

- [Answer in short](#answer-in-short)
- [1. Where the language lives](#1-where-the-language-lives)
- [2. What a plugin can do](#2-what-a-plugin-can-do)
- [3. What exists](#3-what-exists)
- [4. Many languages at once](#4-many-languages-at-once)
- [5. Maximum number of languages](#5-maximum-number-of-languages)
- [6. Recommendation](#6-recommendation)
- [7. Device questions](#7-device-questions)
- [What this session could not do](#what-this-session-could-not-do)
- [Sources](#sources)

## Answer in short

- **Can a plugin change the recognition language?** Not through `sn-plugin-lib` 0.2.3: it has no call that reads or writes it, and `recognizeElements` takes no language [official, SDK sources]. The only way left is the plugin's own native Java code, which the host loads into its process; whether that code may write the setting depends on where the setting is stored and on the host's sandbox, which only a tablet round can show [inference]. **Exact blocker:** the storage of the value (a `Settings` key, a preferences file or a service) is unknown, and so is whether the plugin process may write it.
- **Many languages at once:** the device engine uses one language at a time [official]. A plugin can reach N languages only by switching N times (blocked as above) or by carrying its own engine; Google ML Kit Digital Ink has more than 300 languages, Esperanto included, about 20 MB each [official]. Esperanto is not one of the device's 66 languages [official].

## 1. Where the language lives

| Question | Answer | Mark |
| :--- | :--- | :--- |
| Which setting | Settings › Display & Input › Keyboard › «Handwriting»: pick one installed language, or «Add Language» to download a pack | [official] Keyboard help |
| How many active | «Only one handwriting recognition language can be selected and used at a time» | [official] Keyboard help |
| Which languages | 66 language codes, from `af_ZA` to `vi_VN`; Portuguese (Brazil, Portugal), English (5 variants), Spanish (Spain, Mexico, Colombia); **no Esperanto** | [official] Handwriting Recognition help |
| Engine | The 66 entries are the same list, item for item, as MyScript Notes' 66 recognition languages (with rare ones such as Cebuano, Malagasy, Tatar), and the codes have MyScript's form (`sr_Latn_RS`). Ratta names no engine | [inference]; lists [official] both vendors |
| Real-Time Recognition note | The language is chosen when the note is made (tap the underlined language) and «cannot be changed after the note is created» | [official] Handwriting Recognition help |
| Lasso convert, export TXT or DOCX, handwriting search, Word handwriting mode | Use recognition; the help does not say which language source each one reads | [official] features; source of the language open |
| `recognizeElements` | No language parameter; returns only the text | [official] SDK and API reference |
| `registerLangListener` | Reports the **system UI language** (`en`, `zh_CN`, `zh_TW`, `ja`), not the handwriting language | [official] API reference |
| Storage (system property, `Settings.System`/`Global`/`Secure`, content provider, file, service) | **Open**: needs a settings diff on the tablet or the decompiled Settings and Note apps (on the owner's Mac; this cloud session has neither, and their material may not be committed, `cli/snadb/AGENTS.md`) | open |
| Does a change apply at once | **Open**: an engine that loads one resource at a time must reload it; whether the Note app reloads on change or only on next open is unknown | [inference]; open |

## 2. What a plugin can do

`sn-plugin-lib` 0.2.3 was searched in full (TypeScript sources, Java sources, `plugincommonlib.aar` strings) for `lang`, `locale`, `recogn`, `Settings` and `myscript`:

| Need | What exists | Mark |
| :--- | :--- | :--- |
| Read or write the handwriting language | Nothing: no call, no event, no constant | [official] SDK sources |
| Recognise in a chosen language | `recognizeElements(elements, size)` has no language | [official] |
| Permissions | Four only: `FILE:READ`, `FILE:WRITE`, `FILE:DELETE`, `INTERNET`; no settings permission | [official] `PluginManager.d.ts` |
| A file in the whitelist | File calls reach only shared paths; a settings file sits under `/data`, outside it | [measured, [#23](https://github.com/martonpaulo/supernote-tools/issues/23)] whitelist; [inference] path |
| Own native code | The host loads a plugin's `app.npk` with `DexClassLoader` into its process; that code can call any Android API the process may call (`Settings.System.putString`, `startActivity`) | [official] `DexUtils.java`; what the process may call is open |
| Open the Settings page instead | Native code could start the keyboard settings screen, one tap from the note, if its activity is exported | [inference]; open |
| Strokes for an own engine | Strokes carry recognition points with x, y, flag and a timestamp (`RecognData`), the input an online engine needs | [official] `ConvertUtils.java` |
| A button that shows the active language | `registerButton(1, ['NOTE'], …)` for the sidebar; `modifyButtonRes` changes its icon, so one icon per language («PT», «EN», «ES») shows the active one | [official] |

Cheapest UI: **one sidebar button that cycles** through the owner's three or four languages and shows the active one on its icon. One button per language costs three or four sidebar slots; a toolbar entry is not in the SDK (lasso and sidebar only) [inference from the button types].

## 3. What exists

### On the Supernote

No shortcut: the language is changed only in Settings, or once per Real-Time Recognition note at creation [official]. No published plugin changes it: a GitHub search on 2026-11-16 for Supernote plugins (`Laumss/sn-plugins`, `Sparkinman/*`, `jpmoo/*`, `j-raghavan/*`, `apclark31/supernote-plugin-research`) and for `recognizeElements` with «language» found none [reported, search results]. `fharper/awesome-supernote` could not be read from this session (access refused).

### Other tablets

| Device | How the language is set | Many at once | Source |
| :--- | :--- | :--- | :--- |
| reMarkable | Settings › Language and keyboard › Handwriting conversion, one language | No [official, one setting] | reMarkable support, release 3.9 blog |
| Boox | Per recognition job: the AI button, then the language button, «More languages» downloads packs; languages beyond the UI's (Catalan) | One per job [official] | Boox help |
| iPad Scribble | Each keyboard language added is a Scribble language | Several keyboards; users report it falls back to English [reported] | MacRumors, Apple Community |
| Kindle Scribe | A recognition language in settings; Amazon asks it to match the notebook's language | One [official] | Amazon help |

The pattern elsewhere is the same as the Supernote: one language per recognition, chosen in settings or per job. Boox's per-job choice is the closest to part A.

## 4. Many languages at once

| Method | How | Cost | Limits | Mark |
| :--- | :--- | :--- | :--- | :--- |
| Device engine alone | One resource at a time; MyScript adds «secondary English» to other languages, for isolated English words only | None | One language, plus English words | [official] Supernote one-at-a-time; [official] MyScript support on secondary English; applies here [inference] |
| Device engine, multilingual resource | MyScript iink SDK 4.3 (January 2026) ships one Latin resource of about 18 MB that reads English, Spanish, French, Portuguese, German, Italian and Dutch in the same note | Only Ratta can ship it in firmware | 7 languages; no Esperanto | [official] MyScript blog; Ratta's adoption [inference, a request to Ratta] |
| Plugin: switch and recognise N times | Change the language, call `recognizeElements` on the same strokes, repeat, keep the answer whose words are in a dictionary (or a language-identification score) | N × 0.9 to 1.7 s, plus an engine reload per switch | Blocked until the setting is writable (§ 2); then the 66 device languages | [measured, [#19](https://github.com/martonpaulo/supernote-tools/issues/19)] time; rest [inference] |
| Plugin with its own engine (Google ML Kit Digital Ink) | Native code feeds the strokes' points and timestamps to one recognizer per language, then picks the best | About 20 MB per language model, downloaded once (`INTERNET`); Android API 23 or later (the tablet runs 11) | Over 300 languages, **Esperanto (`eo`) included**; one recognizer per language, so N calls; whether the model download works without Google Play services, and the time per call on the tablet, are open | [official] ML Kit docs; open points [inference] |
| Beyond a plugin: sideloaded app or keyboard (IME) | An Android app or input method with its own engine (ML Kit) | A separate app to install and keep | Same as ML Kit; a keyboard reaches text fields only, not lasso convert | [inference] |
| Beyond a plugin: host tool over `snadb` | Pull the `.note`, recognise on the Mac with any engine | Not live; needs the Mac | Engine's limit | [inference] |

MyScript itself says its technology «has not been designed for recognizing mixed languages» and advises one input route per language [official, MyScript support]. So for a page that mixes languages word by word, every method above except the multilingual resource recognises each word N times and picks.

## 5. Maximum number of languages

| Method | Maximum at once | What sets it | Mark |
| :--- | :--- | :--- | :--- |
| Device engine | 1 (+ English words) | Engine design: one resource loaded | [official] |
| Multilingual resource, if Ratta ships it | 7 | MyScript's resource | [official] MyScript |
| Switch and recognise N times | 2 to 3 for a lasso (3 × 1.7 s ≈ 5 s); 1 to 2 for live conversion ([#144](https://github.com/martonpaulo/supernote-tools/issues/144)) | Time per call; storage is no limit (32 GB, packs about 100 MB per language set) | time [measured]; packs [official, MyScript, legacy resources «slightly more than 100 MB»]; range [inference] |
| ML Kit in the plugin | 3 to 5 loaded together; more if loaded one by one | RAM (4 GB shared with the Note app and the host) against about 20 MB per model, then time per call × N | sizes [official]; RAM [official specs]; range [inference], to measure |
| Host tool | Unbounded in theory | The engine chosen | [inference] |

## 6. Recommendation

**Part A, fast switch.** First a device round (§ 7) to find where the value lives and whether the plugin process can write it. Then:

- If writable: a new plugin with one sidebar button that cycles through the owner's languages, its icon showing the active one, and a check that the next `recognizeElements` and lasso convert use it. Real-Time Recognition notes keep their own language; the plugin says so on its Settings page.
- If not writable: the fallback is a sidebar button that opens the keyboard settings screen in one tap, if that activity starts from the plugin; otherwise the only path is a request to Ratta for a language API or a native shortcut.

**Part B, many languages.** For Portuguese, English and Spanish, the switch-and-repeat path reuses the device engine, if part A is writable. For Esperanto, or for a page that mixes languages, the only path is an own engine: a probe plugin with Google ML Kit Digital Ink, measuring model download without Google Play services and time per call. Ask Ratta, in parallel, for MyScript's multilingual Latin resource (7 languages).

A shared module in `packages/` should own «recognise in language X», so Lookup, Lingo and Ink2Pic use the same path [inference]. That is why the switch is its own plugin, not a part of Lingo: Lingo translates, and the language is a need of every plugin.

**Names**, one plain word as `lookup`, `lingo`, `relay`, `retouch`, `bridge`:

| Name | Why |
| :--- | :--- |
| **`dialect`** (recommended) | Says what it changes; one English word; no clash with a device feature |
| `polyglot` | Fits part B (many languages); longer, and a claim more than a function |
| `tongue` | Short; reads oddly in English |
| `babel` | Known image for many languages; clashes with the JavaScript tool Babel, which this project builds with |

## 7. Device questions

A check card draft for the Mac round; 1 to 4 use `adb`, 5 to 8 a small probe build:

1. Run `adb shell settings list system`, `list global` and `list secure`, and `adb shell getprop`, before and after changing the handwriting language in Settings: which key changes, and to what value?
2. If no key changes: which file under `/data/data` of the Settings, Note or keyboard app changes (from the decompiled apps on the Mac), and which service the change calls?
3. After a change in Settings, does lasso convert in an open note use the new language at once, or only after the note is reopened?
4. Does a new Real-Time Recognition note default to the keyboard setting?
5. Can the probe's native code read and write that key (`Settings.System.getString`/`putString`), and does the host log a `PluginSec DENY`?
6. After the probe writes it, does the next `recognizeElements` use the new language, and how long does the first call after a switch take?
7. Can the probe's native code start the keyboard settings screen?
8. With ML Kit Digital Ink in the probe: does the Esperanto model download without Google Play services, how much RAM does it use, and how long does one word take?

## What this session could not do

- Read the decompiled firmware apps or run `rea` or Ghidra on them: the firmware and its jadx output are on the owner's Mac, not in this cloud checkout, and Ratta's firmware is about 1 GB. Point 1's storage question stays open for § 7.
- Read `fharper/awesome-supernote`: GitHub refused access from this session.

## Sources

- Supernote, [Handwriting Recognition](https://support.supernote.com/handwriting-recognition) (66 languages, Real-Time Recognition note language fixed at creation).
- Supernote, [Keyboard](https://support.supernote.com/keyboard) (Settings path, one language at a time).
- Supernote, [`recognizeElements`](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-comm-api/recognize-elements) and [`registerLangListener`](https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-manager/register-lang-listener).
- `sn-plugin-lib` 0.2.3 in `plugins/probe/node_modules/sn-plugin-lib`: `src/PluginManager.ts`, `src/sdk/PluginCommAPI.ts`, `android/src/main/java/com/ratta/supernote/pluginlib/utils/DexUtils.java` and `ConvertUtils.java`, `android/libs/plugincommonlib.aar`.
- Supernote, [Manta product page](https://supernote.com/products/supernote-a5-x2-manta) (32 GB storage); Notebookcheck, [A5 X2 Manta launch](https://www.notebookcheck.net/Supernote-A5-X2-Manta-launches-as-a-modular-alternative-to-Amazon-s-Kindle-Scribe-but-costs-more.931712.0.html) (memory: 4 GB).
- MyScript, [Available languages in MyScript Notes](https://help.myscript.com/notes/overview/available-languages/) (the same 66).
- MyScript, [Multilingual text recognition arrives in iink SDK 4.3](https://myscript.com/blog/multilingual-text-recognition-arrives-in-iink-sdk-4-3) (7 Latin languages, about 18 MB, legacy resources above 100 MB).
- MyScript developer support, [mixed languages](https://developer-support.myscript.com/support/discussions/topics/16000029964) (not designed for mixed languages, secondary English for isolated words, two pens).
- Google, [ML Kit Digital Ink base models](https://developers.google.com/ml-kit/vision/digital-ink-recognition/base-models) (over 300 languages, `eo`) and [Android guide](https://developers.google.com/ml-kit/vision/digital-ink-recognition/android) (about 20 MB per language, API 23, pre-context up to 20 characters).
- reMarkable, [Convert handwritten notes into text](https://support.remarkable.com/articles/Knowledge/Convert-handwritten-notes-into-text) and [release 3.9](https://remarkable.com/blog/release-3-9-handedness-and-headlines).
- Boox, [Handwritten text recognition with different languages](https://help.boox.com/hc/en-us/articles/360041643771) and [Language pack in Catalan](https://help.boox.com/hc/zh-tw/community/posts/38865047552788-Language-pack-in-catalan).
- MacRumors, [iPadOS 14.5 Scribble languages](https://www.macrumors.com/2021/02/19/ipados-14-5-scribble-language-support/); Apple Community, [Scribble always converts to English](https://origin-discussions2-us-dr-prz.apple.com/thread/256033945).
- Amazon, [Fix issues with handwriting recognition on Kindle Scribe](https://digprjsurvey.amazon.com/csad/help/node/TWTo0OyovlJ9jwOV0B).
