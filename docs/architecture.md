# Architecture

How the tools in this monorepo are named and layered, and why. Current rules live here; the decision
history is in [`decisions.md`](decisions.md).

## Contents

- [Why layers](#why-layers)
- [The layers](#the-layers)
- [Shared packages](#shared-packages)
- [The plugins (on device)](#the-plugins-on-device)
- [The host tools](#the-host-tools)
- [What this means for the cloud agent](#what-this-means-for-the-cloud-agent)

## Why layers

Two things under the plugins change outside our control, so neither may be hardcoded in feature code:

1. **Supernote's internal APIs.** Content-provider authorities and columns, the `tag=task` write
   rule, the To-Do and Digest database schemas, and the Supernote Cloud endpoints are all
   undocumented and can change with a firmware update. They were found by reverse engineering, not a
   contract.
2. **The external services.** Today to-do syncs with Todoist and the calendar with Google; tomorrow
   it could be another task app or another calendar. The dictionary and translation back-ends are
   likewise swappable.

So every plugin is built in layers, and the volatile parts live behind interfaces that can be
updated or swapped without touching the feature logic. **Every plugin's features are opt in/out in
its own Settings** — a user turns on only the modules, sources and language pairs they want.

## The layers

```
  Feature logic (per module/mode, each opt in/out)
        |                                   |
   Provider layer                     Device adapter layer
   (external services)                (Supernote internals)
        |                                   |
   Todoist, Google, iCloud/CalDAV,     content providers, DB schemas,
   ICS, dictionary/translation APIs    cloud endpoints, handwrite/lasso/insert hooks
```

- **Device adapter layer (`sn-adapter`).** The single place that knows Supernote internals. It
  exposes typed operations (read/write calendar events, read/write To-Do, read/write Digest, insert
  on a page) over a **descriptor** — authorities, column maps and rules as *data*, not code — so a
  firmware change is a descriptor update, ideally shippable without a full plugin release.
  **Adapt on/off:** on start the adapter probes that the descriptor still matches the device (the
  provider answers, the columns exist). On a mismatch it reports the feature unavailable and the
  plugin **disables that module** rather than writing against a changed schema and corrupting data.
- **Provider layer.** Each external service sits behind an interface (`CalendarProvider`,
  `TaskProvider`, `DictionaryProvider`, …). Google, iCloud (CalDAV) and ICS are three
  `CalendarProvider` implementations; Todoist is one `TaskProvider`. Adding a service is a new
  implementation, not a change to the feature.
- **Feature logic.** Diffing, recurrence expansion, mapping, word recognition and orchestration —
  pure, testable, unaware of both the device internals and the concrete service. This is what the
  cloud agent can build and unit-test without a device or a live account.

## Shared packages

```
supernote-tools/
  packages/
    sn-adapter/     # Supernote-internals adapter + updatable descriptor + adapt-on/off probe
    sync-core/      # diff, recurrence expansion, mapping, module orchestration (provider-agnostic)
    ink-core/       # handwrite -> recognise -> lasso -> insert-on-page (shared by lookup/lingo/retouch)
  plugins/
    bridge/         # to-do + calendar + digest, each module and provider opt in/out
    lookup/         # write a word -> insert a picture or a definition (each mode opt in/out)
    lingo/          # write a word -> insert its translation; language pairs opt in/out
    retouch/        # edit an image on the page
    probe/          # permanent on-device investigation plugin
  cli/
    snadb/          # Supernote ADB control CLI (formerly supernote-adb)
  apps/
    <macOS note editor, name TBD>   # edit Supernote .note files on the Mac
```

## The plugins (on device)

- **`bridge`** — brings external services onto the device. Three modules, each opt in/out: **to-do**
  (Todoist <-> native To-Do), **calendar** (Google / iCloud / ICS <-> native Calendar), **digest**
  (Panoram Saved -> native Digest, pending feasibility). Each provider is a separate toggle. One
  plugin, not a bundle of separate plugins.
  - **Settings-only, no note surface.** `bridge` is pure configuration plus background sync; it has
    nothing to do with a note's canvas. The plugin API supports this: `ink2pic/index.js` registers
    the note buttons (`registerButton(..., ['NOTE'], ...)`) and the plugin's Settings entry
    (`registerConfigButton()` + `startConfigQueue()`) **independently**. `bridge` registers only the
    config button and no NOTE buttons, so it appears only in the plugin settings, never in notes.
    (API-confirmed from ink2pic; to confirm on device via `probe`.)
  - **Open question — background lifecycle.** The config listener only fires when the owner opens
    Settings. Periodic sync with the view closed needs a background trigger or a kept-alive plugin;
    whether PluginHost allows that is unconfirmed and is the first thing `probe` must answer before
    the `bridge` design commits to it.
  - **Google sign-in cannot use the device-code flow.** Google's OAuth flow for limited-input
    devices allows only `openid`, `email`, `profile`, two Drive scopes and two YouTube scopes; no
    Calendar scope (read 2026-11-14,
    [#64](https://github.com/martonpaulo/supernote-tools/issues/64)). `startDeviceCode` in
    `packages/sync-core` would get `invalid_scope`. The replacement waits on the owner's choice in
    [#64](https://github.com/martonpaulo/supernote-tools/issues/64):
    - **Sign in on the Mac, hand the token to the tablet** (recommended): the installed-app flow
      with a loopback redirect, which allows the Calendar scopes, runs on the Mac (a `snadb`
      command); the refresh token goes to the plugin's private storage over ADB.
    - **Sign in in a browser on the tablet**, with a loopback redirect to the plugin: needs a
      browser on the device and a local listener, both unconfirmed.
    - **Read only, no sign-in:** Google Calendar's secret iCal address through the ICS provider
      ([#30](https://github.com/martonpaulo/supernote-tools/issues/30)); writing back
      ([#29](https://github.com/martonpaulo/supernote-tools/issues/29)) is then impossible.

    Any OAuth route: while the OAuth client's consent screen is in «Testing», Google's refresh
    tokens expire after 7 days; «In production» without verification keeps them, behind an
    «unverified app» warning.
- **`lookup`** — write a word, lasso it, insert a **picture** or a **definition**. Merges today's
  `ink2pic` with the planned `ink2def`; each mode opt in/out.
- **`lingo`** — write a word, lasso it, insert its **translation**. One plugin; each **language pair**
  (e.g. `zh-pt`, `es-pt`) is opt in/out, and more pairs can be added over time.
- **`retouch`** — edit an image already on the page (the old "image-edit plugin is future work" note).
- **`probe`** — a minimal plugin for on-device investigation (provider reachability, permission
  checks), reused whenever a device question comes up.

`lookup`, `lingo` and `retouch` share `ink-core` (the handwrite -> recognise -> lasso -> insert-on-page
gesture). `bridge`'s three modules share `sync-core`. All of them are to go through `sn-adapter` for
any Supernote-internal access. Today no plugin imports a package yet: `ink2pic` calls `sn-plugin-lib`
through its own `src/sdk/`, and `bridge` calls `PluginManager` directly
([#76](https://github.com/martonpaulo/supernote-tools/issues/76)). `ink2pic` as it stands today is the seed of `ink-core` + the picture mode
of `lookup`, and keeps shipping until the merge lands.

## The host tools

- **`snadb`** — control a Supernote over Wi-Fi ADB with direct calls, JSON answers and stable exit
  codes, no root (formerly `supernote-adb`).
- **macOS note editor** (name to be decided) — edit Supernote `.note` files on the Mac. Planned; not
  yet a subproject.

More tools may follow; this layout leaves room under `plugins/`, `cli/` and `apps/`.

## What this means for the cloud agent

Build the pure layers (`sync-core`, `ink-core`, provider implementations) and unit-test them with no
device and no secrets. The `sn-adapter` descriptor is filled from the private reverse-engineering
notes. Anything that needs the physical tablet or a live account is verified by the owner on the
Mac, not faked in the cloud.
