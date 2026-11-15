# Bridge

A settings-only Supernote plugin with to-do, calendar and digest modules, each opt in. The calendar
module syncs your calendars with the **native** Supernote Calendar, the real one the device already
shows, not a separate calendar inside a plugin.

**Status: scaffolded.** Settings-only shell; the modules are tracked in this repository's issues.

## What it will do

- Sign in with its **own** Google account and read every Google calendar. You sign in once on
  the Mac with a `snadb` command, which hands the token to the tablet; Google's device-code flow
  does not allow the Calendar scopes ([#64](https://github.com/martonpaulo/supernote-tools/issues/64)).
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
