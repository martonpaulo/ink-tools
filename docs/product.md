# Ink Tools — product definition

Type: product definition. Current rules only; decision history lives in `docs/decisions.md`.

## What it is

A monorepo of independent, unofficial tools for Supernote e-ink tablets. Each subproject stands
alone, with its own `AGENTS.md`, versioning and releases. They come in four kinds:

- **Plugins**, which run inside the tablet's plugin host on `sn-plugin-lib`:
  - **Word Lookup** (`lookup`) turns a lassoed handwritten word into an inserted illustration, photo, short
    definition or translation. It replaces **ink2pic**, which is retired and uninstalled from the
    tablet ([#45](https://github.com/martonpaulo/ink-tools/issues/45)), and the **lingo** plugin, which is retiring now that translation is Lookup's
    «Translate ES→PT» buttons ([#174](https://github.com/martonpaulo/ink-tools/issues/174), [#158](https://github.com/martonpaulo/ink-tools/issues/158), [#159](https://github.com/martonpaulo/ink-tools/issues/159)).
  - **Account Sync** (`bridge`) syncs the owner's to-dos and his Google, Apple and ICS calendars with the native
    Supernote apps.
  - **Image Editing** (`retouch`) makes a picture on the page readable on e-ink.
  - **Device Transfer** (`relay`) moves pictures and text between the tablet and the owner's iPhone and Mac over
    LocalSend.
  - **Plugin Diagnostics** (`probe`) is a developer-only plugin for device experiments; it still
    shows as «Probe» until [#194](https://github.com/martonpaulo/ink-tools/issues/194).
  - **Real-Time Conversion** (`typeset`, being built) turns each handwritten word into typed text
    with no lasso, from its sidebar button «Real-Time Text», with an undo of the last conversion
    ([#144](https://github.com/martonpaulo/ink-tools/issues/144), [#184](https://github.com/martonpaulo/ink-tools/issues/184)).
- **A tablet app**, sideloaded with `adb install` because a plugin cannot do the job: **Handwriting Language** (the Lingo app,
  `apps/lingo-app`) switches the handwriting recognition language of the whole tablet with one tap
  ([#157](https://github.com/martonpaulo/ink-tools/issues/157), [#160](https://github.com/martonpaulo/ink-tools/issues/160)).
- **A Mac CLI**: **inkctl** drives the tablet over Wi-Fi ADB.
- **A Mac app**, planned: **Ink Notebook Editor** reads and edits Supernote `.note` files on the Mac
  ([#48](https://github.com/martonpaulo/ink-tools/issues/48)).

In beta, not yet on the tablet: **Real-Time Conversion** (`plugins/real-time-conversion/`), a plugin that turns each handwritten
word into typed text with no lasso, from its sidebar button «Real-Time Text» ([#144](https://github.com/martonpaulo/ink-tools/issues/144)).

«Supernote» is Ratta's trademark, so a tool's name, icon and look carry no brand. The brand appears
only as a referential use, to say what the tools work with: «Unofficial tools for Supernote e-ink
tablets», «for Supernote notebooks» in a description
([#175](https://github.com/martonpaulo/ink-tools/issues/175), [#177](https://github.com/martonpaulo/ink-tools/issues/177)).

Each tool shows a feature name in Supernote's own wording, and its buttons read like the tablet's
(«New Sticker»): a verb and a noun in title case. A name says what the tool can do, not which
window it opens: «Image Editing», not «Image Editor». Packages and `pluginID`s keep the short
internal names above; a `pluginID` is random, never shown and never changes, so the tablet keeps
a plugin's settings and grants across a rename ([#176](https://github.com/martonpaulo/ink-tools/issues/176)). Folders, gates and new tags take
the feature names with [#194](https://github.com/martonpaulo/ink-tools/issues/194); until it lands they keep the short names. What each one is for is in [`plugin-scope.md`](plugin-scope.md).

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
