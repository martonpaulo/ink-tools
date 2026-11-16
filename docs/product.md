# Supernote Tools — product definition

Type: product definition. Current rules only; decision history lives in `docs/decisions.md`.

## What it is

A monorepo of independent, unofficial tools for Supernote e-ink tablets. Each subproject stands
alone, with its own `AGENTS.md`, versioning and releases. They come in four kinds:

- **Plugins**, which run inside the tablet's plugin host on `sn-plugin-lib`:
  - **lookup** turns a lassoed handwritten word into an inserted illustration, photo, short
    definition or translation. It replaces **ink2pic**, which is retired and uninstalled from the
    tablet ([#45](https://github.com/martonpaulo/supernote-tools/issues/45)), and the **lingo** plugin, which is retiring now that translation is Lookup's
    «Translate ES→PT» buttons ([#174](https://github.com/martonpaulo/supernote-tools/issues/174), [#158](https://github.com/martonpaulo/supernote-tools/issues/158), [#159](https://github.com/martonpaulo/supernote-tools/issues/159)).
  - **bridge** syncs the owner's to-dos and his Google, Apple and ICS calendars with the native
    Supernote apps.
  - **retouch** makes a picture on the page readable on e-ink.
  - **relay** moves pictures and text between the tablet and the owner's iPhone and Mac over
    LocalSend.
  - **probe** is a developer-only plugin for device experiments.
- **A tablet app**, sideloaded with `adb install` because a plugin cannot do the job: **Lingo**
  switches the handwriting recognition language of the whole tablet with one tap
  ([#157](https://github.com/martonpaulo/supernote-tools/issues/157), [#160](https://github.com/martonpaulo/supernote-tools/issues/160)).
- **A Mac CLI**: **snadb** drives the tablet over Wi-Fi ADB.
- **A Mac app**, planned: **Supernote Editor** reads and edits `.note` files on the Mac
  ([#48](https://github.com/martonpaulo/supernote-tools/issues/48)). «Supernote» is Ratta's trademark:
  check the name with Ratta's brand rules before any public release or store listing
  ([#175](https://github.com/martonpaulo/supernote-tools/issues/175)).

Proposed, not decided: **typeset**, a plugin that turns each handwritten word into typed text with
no lasso ([#144](https://github.com/martonpaulo/supernote-tools/issues/144)). What each one is for is in [`plugin-scope.md`](plugin-scope.md).

## Who it is for

The owner first, and Supernote power users who want capabilities Ratta does not ship, without
rooting or modifying the device.

## The job

Give a Supernote owner reliable, scriptable control over calendars, pictures, words and the device,
using only sanctioned, documented channels (Android content providers, the plugin SDK, ADB, and an
app installed the way Android allows).

## What it does

- lookup: recognises a lassoed word and inserts a picture from Openclipart, Wikimedia Commons or
  OpenMoji, a definition, or a translation for each language pair switched on.
- bridge: aggregates every calendar into the native Calendar and carries edits back, within
  the limits the native app and the plugin sandbox impose.
- Lingo: replaces the one file that names the active recognition language and tells the tablet,
  as the Settings app does; lasso convert and plugin recognition read the new language.
- snadb: exposes the tablet's intents, providers and files as direct calls with JSON output.

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
