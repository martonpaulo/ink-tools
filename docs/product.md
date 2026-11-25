# Ink Tools — product definition

Type: product definition. Current rules only; decision history lives in `docs/decisions.md`.

## Contents

- [What it is](#what-it-is)
- [Who it is for](#who-it-is-for)
- [The job](#the-job)
- [What it does](#what-it-does)
- [What it will never do](#what-it-will-never-do)
- [How we know it worked](#how-we-know-it-worked)
- [Constraints](#constraints)
- [Accepted evidence gaps](#accepted-evidence-gaps)
- [Display names](#display-names)
- [Product versioning](#product-versioning)

## What it is

A monorepo of independent, unofficial tools for Supernote e-ink tablets. Each subproject stands
alone, with its own `AGENTS.md`, versioning and releases. They come in four kinds:

- **Plugins**, which run inside the tablet's plugin host on `sn-plugin-lib`:
  - **Word Lookup** (`plugins/word-lookup`) turns a lassoed handwritten word into an inserted illustration, photo, short
    definition or translation. It replaces the first picture plugin, retired and uninstalled from
    the tablet ([#45](https://github.com/martonpaulo/ink-tools/issues/45)) and removed from the repository ([#288](https://github.com/martonpaulo/ink-tools/issues/288)), and the **lingo** plugin, removed now that translation is Lookup's
    «Translate ES→PT» buttons ([#174](https://github.com/martonpaulo/ink-tools/issues/174), [#158](https://github.com/martonpaulo/ink-tools/issues/158), [#161](https://github.com/martonpaulo/ink-tools/issues/161)).
  - **Account Sync** (`plugins/account-sync`) syncs the owner's to-dos and his Google, Apple and ICS calendars with the native
    Supernote apps.
  - **Image Editing** (`plugins/image-editing`) makes a picture on the page readable on e-ink.
  - **Device Transfer** (`plugins/device-transfer`) moves pictures and text between the tablet and the owner's iPhone and Mac over
    LocalSend.
  - Planned: **Smart Pen** (Smart Shapes, Real-Time Text and gestures) and **Lasso Actions** (Lookup, Convert to Text, Headings and Collection, whose buttons are «Heading 1» to «Heading 4» and «Add to Collection», «Cut to Collection», «Paste Collection») will replace Smart Shapes, Real-Time Conversion and Word Lookup, one plugin per surface of use ([#304](https://github.com/martonpaulo/ink-tools/issues/304), [architecture](architecture.md#plugin-grouping)).
  - **Plugin Diagnostics** (`plugins/plugin-diagnostics`) is a developer-only plugin for device
    experiments.
  - **Real-Time Conversion** (`plugins/real-time-conversion`, being built) turns each handwritten word into typed text
    with no lasso, from its sidebar button «Real-Time Text», with an undo of the last conversion,
    and a whole lasso into one text box with its lasso button «Convert to Text»
    ([#144](https://github.com/martonpaulo/ink-tools/issues/144), [#184](https://github.com/martonpaulo/ink-tools/issues/184), [#250](https://github.com/martonpaulo/ink-tools/issues/250)).
  - **Smart Shapes** (`plugins/smart-shapes`, beta) turns a stroke held still at its end into a clean
    triangle, circle, square, rectangle or arrow, and never changes a figure under its minimum size
    ([#253](https://github.com/martonpaulo/ink-tools/issues/253)).
- **A tablet app**, sideloaded with `adb install` because a plugin cannot do the job: **Handwriting Language** (the Lingo app,
  `apps/handwriting-language`) switches the handwriting recognition language of the whole tablet with one tap
  ([#157](https://github.com/martonpaulo/ink-tools/issues/157), [#160](https://github.com/martonpaulo/ink-tools/issues/160)).
- **A Mac CLI**: **inkctl** drives the tablet over Wi-Fi ADB.
- **A Mac app**: **Ink Notebook Editor** reads and edits Supernote `.note` files on the Mac
  ([#48](https://github.com/martonpaulo/ink-tools/issues/48)).

In beta, not yet on the tablet: **Real-Time Conversion** (`plugins/real-time-conversion/`), a plugin that turns each handwritten
word into typed text with no lasso, from its sidebar button «Real-Time Text» ([#144](https://github.com/martonpaulo/ink-tools/issues/144)).

«Supernote» is Ratta's trademark, so a tool's name, icon and look carry no brand. The brand appears
only as a referential use, to say what the tools work with: «Unofficial tools for Supernote e-ink
tablets», «for Supernote notebooks» in a description
([#175](https://github.com/martonpaulo/ink-tools/issues/175), [#177](https://github.com/martonpaulo/ink-tools/issues/177)).

Each tool shows a feature name in Supernote's own wording, and its buttons read like the tablet's
(«New Sticker»): a verb and a noun in title case. A name says what the tool can do, not which
window it opens: «Image Editing», not «Image Editor». Each folder, gate, workflow and new tag prefix takes the feature name
([#194](https://github.com/martonpaulo/ink-tools/issues/194)); npm packages, `pluginID`s and data folders keep the short internal names. A `pluginID` is random, never shown and never changes, so the tablet keeps
a plugin's settings and grants across a rename ([#176](https://github.com/martonpaulo/ink-tools/issues/176)). What each one is for is in [`plugin-scope.md`](plugin-scope.md).

## Who it is for

The owner first, and Supernote power users who want capabilities Ratta does not ship, without
rooting or modifying the device.

## The job

Give a Supernote owner reliable, scriptable control over calendars, pictures, words and the device,
using only sanctioned, documented channels (Android content providers, the plugin SDK, ADB, and an
app installed the way Android allows).

## What it does

- lookup: recognises a lassoed word and inserts a picture from Openclipart, Wikimedia Commons or
  OpenMoji, a definition, or a translation for each language pair switched on. Pictures come set
  up as the owner uses them ([#105](https://github.com/martonpaulo/ink-tools/issues/105)): one small size, a style fixed by the button, and only Picture
  sources and Data saver to choose in Settings.
- bridge: aggregates every calendar into the native Calendar and carries edits back, within
  the limits the native app and the plugin sandbox impose.
- Lingo: replaces the one file that names the active recognition language and tells the tablet,
  as the Settings app does; lasso convert and plugin recognition read the new language.
- inkctl: exposes the tablet's intents, providers and files as direct calls with JSON output.

## What it will never do

- Root the device, modify firmware, or use exploits — the tools stay within sanctioned interfaces.
- Reach another app's private data — proven blocked by the device's framework guard (see
  bridge's design notes); the tools use open content providers and their own accounts.
- Impersonate Ratta or Supernote Cloud, or claim affiliation.

## How we know it worked

Each subproject's own tests and device checks. For bridge, a calendar event written by the
plugin appears in the native Calendar, and an edit on the tablet reaches the source calendar.

## Constraints

- The Supernote plugin runtime fixes React Native and `sn-plugin-lib` versions; plugins obey the
  framework file/network guard and the four plugin permissions (`FILE:READ/WRITE/DELETE`, `INTERNET`).
- The native Calendar app reads one Google account's primary calendar only; bridge works
  around this by writing aggregated events directly through the calendar content provider.

## Accepted evidence gaps

- Manual screen-reader passes are not run on the device plugins; the view code is the accessibility
  evidence, per the fleet rule.

## Display names

Decided in [#176](https://github.com/martonpaulo/ink-tools/issues/176): each tool shows a feature name in Supernote's own wording and its buttons read like the tablet's (a verb and a noun in title case): `plugins/word-lookup` is Word Lookup, `plugins/image-editing` Image Editing, `plugins/device-transfer` Device Transfer, `plugins/account-sync` Account Sync, `plugins/plugin-diagnostics` Plugin Diagnostics, `plugins/real-time-conversion` Real-Time Conversion, `plugins/smart-shapes` Smart Shapes, the Lingo app (`apps/handwriting-language`) Handwriting Language, the Mac app Ink Notebook Editor, the CLI `inkctl` ([#173](https://github.com/martonpaulo/ink-tools/issues/173)). Planned, not shipped yet ([#304](https://github.com/martonpaulo/ink-tools/issues/304)): **Smart Pen** (`plugins/smart-pen`, Smart Shapes, Real-Time Text and the gestures of [#270](https://github.com/martonpaulo/ink-tools/issues/270)) replaces Smart Shapes and Real-Time Conversion, and **Lasso Actions** (`plugins/lasso-actions`, Lookup, Convert to Text, the Headings group with «Heading 1» to «Heading 4», and the Collection group with «Add to Collection», «Cut to Collection», «Paste Collection») replaces Word Lookup; the developer tools become **Ink Tools Control** (command `inkctl`, unchanged), **Ink Tools Helper** (`apps/ink-tools-helper`, today Ink Tools Bridge) and **Ink Tools Probe** (`plugins/ink-tools-probe`, today Plugin Diagnostics) ([#303](https://github.com/martonpaulo/ink-tools/issues/303)); until each merge or rename lands, today's plugins ship under today's names, and the buttons keep their names. A name carries no brand. Display names live in `PluginConfig.json` `name`, the visible copy and the docs, and each subproject's folder, gate, workflow and new tag prefix use the feature name in kebab case ([#194](https://github.com/martonpaulo/ink-tools/issues/194)); npm packages, `pluginID`, `pluginKey`, log prefixes and data folders keep the short internal names, and tags made before the rename keep theirs.

## Product versioning

Every plugin uses SemVer with a numbered beta ([#155](https://github.com/martonpaulo/ink-tools/issues/155)): `package.json`, the Git tag `<plugin>-v<version>` and the GitHub prerelease read `0.2.0-beta.3` for a test build and `0.2.0` for a release; the tablet's `versionName` in `PluginConfig.json` derives from it (`0.2.0 beta 3`, `0.2.0`), checked by `scripts/plugin-version.cjs`; `versionCode` is a hidden integer that rises on every build and never resets, which `plugin-version.cjs --identity` checks over the Git history ([#295](https://github.com/martonpaulo/ink-tools/issues/295)). A fix after a release raises PATCH; a new feature raises MINOR and starts again at beta 1. No `-dev.N` suffix. The Lingo app follows the same rule, its version in `apps/handwriting-language/app.json` and its tag `handwriting-language-v<version>` ([#157](https://github.com/martonpaulo/ink-tools/issues/157), [#160](https://github.com/martonpaulo/ink-tools/issues/160)). inkctl and the monorepo are unversioned.
