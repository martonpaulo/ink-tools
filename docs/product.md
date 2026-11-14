# Supernote Tools — product definition

Type: product definition. Current rules only; decision history lives in `docs/decisions.md`.

## What it is

A monorepo of independent, unofficial tools for Supernote e-ink tablets. Each subproject stands
alone, with its own `AGENTS.md`, versioning and releases:

- **bridge** — a device plugin that syncs the owner's Google, Apple and ICS calendars with
  the native Supernote Calendar.
- **ink2pic** — a device plugin that turns a handwritten word into an inserted picture.
- **snadb** — a command-line tool that drives the tablet over Wi-Fi ADB.

## Who it is for

The owner first, and Supernote power users who want capabilities Ratta does not ship, without
rooting or modifying the device.

## The job

Give a Supernote owner reliable, scriptable control over calendars, pictures and the device, using
only sanctioned, documented channels (Android content providers, the plugin SDK, ADB).

## What it does

- bridge: aggregates every calendar into the native Calendar and carries edits back, within
  the limits the native app and the plugin sandbox impose.
- ink2pic: recognises a lassoed word and inserts a matching Openclipart or Wikimedia Commons picture.
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
