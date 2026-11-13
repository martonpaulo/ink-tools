# Calendar Bridge

A Supernote plugin that syncs the owner's calendars with the **native** Supernote Calendar — not a
separate calendar inside a plugin, the real one the device already shows.

**Status: in planning.** The design is settled and the build is tracked in this repository's issues
(label `area: calendar-bridge`). No application code yet.

## What it will do

- Sign in with its **own** Google account (device-code flow) and read every Google calendar.
- Connect iCloud (CalDAV) and subscribe to ICS feeds.
- Write all of them into the native Calendar through the `com.ratta.supernote.calendar.provider`
  content provider, as `tag=task` rows (which the native Google sync ignores, so no duplication).
- Carry edits made on the tablet back to the source calendar (Google, iCloud), two-way where the
  source allows; ICS subscriptions are read-only.

## Why a plugin, and why its own login

Reuse of the Supernote Calendar app's stored Google session was investigated and **ruled out**: the
device's framework guard blocks a plugin from reading any other app's data, at every file path
including native `Os.open`. A plugin with its own Google login needs none of that and is robust
against firmware changes. The full investigation (privacy-sensitive) lives in the private workbench
research notes.

## Built on

React Native + `sn-plugin-lib`, like `../ink2pic`. Setup is the first issue.
