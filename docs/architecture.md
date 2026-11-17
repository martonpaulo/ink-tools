# Architecture

How the tools in this monorepo are named and layered, and why. Current rules live here; the decision
history is in [`decisions.md`](decisions.md).

## Contents

- [Why layers](#why-layers)
- [The layers](#the-layers)
- [Shared packages](#shared-packages)
- [The plugins (on device)](#the-plugins-on-device)
- [The tablet apps](#the-tablet-apps)
- [The host tools](#the-host-tools)
- [Device builds](#device-builds)
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

### Layer rules

The owner's rules for keeping each part replaceable (2026-11-14, as Panoram's
[ADR 0001](https://github.com/martonpaulo/panoram/blob/main/docs/adr/0001-source-neutral-kit.md)
does for its sources):

- **Our own model, in our words.** Feature logic reads and writes only this repository's types (a
  task, an event, a picture result), never a service's or the device's shapes. Each adapter
  translates at its edge.
- **Every outside service is an adapter.** Todoist is one `TaskProvider`; moving to Google Tasks is
  a new implementation, and a field one service lacks is decided then, not built in advance.
- **The device side has two tiers, by how often they break:**

  | Tier | What | Changes when |
  | :--- | :--- | :--- |
  | Official plugin API | `sn-plugin-lib`: lasso, insert, page and file calls | rarely, with Ratta's notice |
  | Internals | content providers and their tables (calendar, To-Do, Digest), found by reverse engineering | any firmware update, without notice |

  Each tier sits in its own module of `sn-adapter`, so a firmware update points at one place and
  the adapt-on/off probe turns off only the module whose tier changed.
- **No hand-written queries or column names.** Code asks for an operation (`completedTasks()`,
  `writeEvent(event)`); only `sn-adapter` knows the authority, the table and the column names, and
  those come from `descriptor.json`, not from strings in the code.
- **Imports go one way.** Feature logic never imports `sn-plugin-lib`, names a content provider or
  imports a service client; `scripts/boundaries.py` enforces it in the `boundaries` gate and in CI
  ([#101](https://github.com/martonpaulo/ink-tools/issues/101)). `plugins/plugin-diagnostics` is exempt: it
  exists to call internals directly.
- **No `URL` getter on the tablet.** React Native's `URL` throws on `protocol`, `host` and the
  rest, so tablet code parses with `parseUrl` of `sync-core`; the `url` rule of
  `scripts/boundaries.py` covers every plugin, `plugins/plugin-diagnostics` included
  ([#209](https://github.com/martonpaulo/ink-tools/issues/209)).

## Shared packages

```
ink-tools/
  packages/
    sn-adapter/     # Supernote adapter: official sn-plugin-lib tier + internals tier (descriptor, adapt-on/off probe)
    sync-core/      # diff, recurrence expansion, mapping, module orchestration (provider-agnostic)
    ink-core/       # handwrite -> recognise -> lasso -> insert-on-page (shared by lookup/relay/retouch)
    picture-search/ # the picture search core and its pure-Java pixel measures (from ink2pic, for lookup)
    ui-kit/         # the Settings look: tokens, shared styles, Button (imported by every plugin)
  plugins/
    account-sync/   # to-do + calendar + digest, each module and provider opt in/out
    word-lookup/    # write a word -> insert a picture, a definition or a translation (each mode and pair opt in/out)
    ink2pic/        # retired: lookup replaced it
    device-transfer/ # send a page or a lasso selection to an iPhone or a Mac over LocalSend
    image-editing/  # lasso a picture on the page -> Enhance, Lighter, Darker, Undo, Restore original
    plugin-diagnostics/ # permanent on-device investigation plugin
  cli/
    inkctl/          # the ADB control CLI (formerly supernote-adb, then inkctl)
  apps/
    handwriting-language/ # sideloaded tablet app: switch the handwriting language tablet-wide
    ink-notebook-editor/ # planned macOS app, Ink Notebook Editor: docs only, no code yet
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
  - **A change made on both sides between two syncs** ([#87](https://github.com/martonpaulo/ink-tools/issues/87), owner D14 A): on both
    modules the later change wins, and a tie goes to the service. To-Do compares the two
    `modified` times (`packages/sync-core/src/tasks.ts`). Calendar compares the tablet row's
    `lastModifiedTime` with the source's change time (Google's `updated`); a source that has none,
    such as ICS, wins (`pushCalendarEdits` in `packages/sync-core/src/push.ts`). The losing
    version goes into the module run's warnings, which Settings and the log show: a task's title, an
    event's title, start and notes (`conflictWarnings`).
  - **Turning a module or a provider off** ([#89](https://github.com/martonpaulo/ink-tools/issues/89), owner D15 A): every row Bridge wrote
    stays on the tablet, and sync stops updating it. A module that is off offers one
    «Remove what Bridge wrote» button in Settings, which asks once more before it deletes. It
    removes only what Bridge wrote (`packages/sync-core/src/cleanup.ts`): on **calendar**, every
    `tag=task` row; on **to-do**, the tasks Bridge imported from the service (a link with
    `origin: 'service'`), soft-deleted, never a task the owner wrote on the tablet and never the
    service's copy; **digest** writes nothing yet. A provider has no button of its own: its rows go
    with the module's.
  - **Open question — background lifecycle.** The config listener only fires when the owner opens
    Settings. Periodic sync with the view closed needs a background trigger or a kept-alive plugin;
    whether PluginHost allows that is unconfirmed and is the first thing `probe` must answer before
    the `bridge` design commits to it.
  - **Google sign-in cannot use the device-code flow.** Google's OAuth flow for limited-input
    devices allows only `openid`, `email`, `profile`, two Drive scopes and two YouTube scopes; no
    Calendar scope (read 2026-11-14,
    [#64](https://github.com/martonpaulo/ink-tools/issues/64)). `packages/sync-core`
    therefore has no device-code sign-in ([#124](https://github.com/martonpaulo/ink-tools/issues/124)). **Bridge signs in on the Mac and gets the token
    over ADB** (owner D39 A, [#64](https://github.com/martonpaulo/ink-tools/issues/64)): a `inkctl` command runs Google's
    installed-app flow with a loopback redirect, which allows the Calendar scopes, in the Mac's
    browser; the refresh token then goes to Bridge's private plugin folder the way every sign-in
    secret does, `inkctl secret set google` ([#116](https://github.com/martonpaulo/ink-tools/issues/116)). The plugin only refreshes
    access tokens. Not chosen: a browser on the tablet with a loopback redirect to the plugin (the
    browser and the local listener are unconfirmed), and read-only Google through its secret iCal
    address and the ICS provider ([#30](https://github.com/martonpaulo/ink-tools/issues/30)), which makes writing back
    ([#29](https://github.com/martonpaulo/ink-tools/issues/29)) impossible.

    Any OAuth route: while the OAuth client's consent screen is in «Testing», Google's refresh
    tokens expire after 7 days; «In production» without verification keeps them, behind an
    «unverified app» warning. The app stays in «Testing» for now (owner, 2026-11-16,
    [#124](https://github.com/martonpaulo/ink-tools/issues/124)). The loopback flow needs an OAuth client of the «Desktop app» type:
    the existing client is a «TVs and Limited Input devices» one, with no redirect URIs.
- **`lookup`** — write a word, lasso it, insert an **illustration**, a **photo**, a **definition**
  or a **translation**; each mode opt in/out, and each language pair opt in/out under the
  translation. A new plugin with its own `pluginID` (owner D40, [#110](https://github.com/martonpaulo/ink-tools/issues/110)); it replaced `ink2pic`,
  which is retired and uninstalled from the tablet ([#45](https://github.com/martonpaulo/ink-tools/issues/45)).
- **`relay`** — sends the current page or a lasso selection as a PNG to an iPhone or a Mac over
  LocalSend v2, and will receive from them ([#98](https://github.com/martonpaulo/ink-tools/issues/98), [#49](https://github.com/martonpaulo/ink-tools/issues/49)). Its network half is a native
  Java module, as `probe`'s listener is.
- **`retouch`** — edit an image already on the page: lasso it and tap Enhance, Lighter, Darker, Undo or
  Restore original ([#136](https://github.com/martonpaulo/ink-tools/issues/136)). Its pixel work is a native Java module that reuses
  `picture-search`'s `Decolor` and `EinkPixels`.
- **`probe`** — a minimal plugin for on-device investigation (provider reachability, permission
  checks), reused whenever a device question comes up.

`lookup`, `relay` and `retouch` share `ink-core` (the handwrite -> recognise -> lasso -> insert-on-page
gesture). `bridge`'s three modules share `sync-core`. All of them are to go through `sn-adapter` for
any Supernote access. Every plugin's Settings look comes from `ui-kit`
([#93](https://github.com/martonpaulo/ink-tools/issues/93)): Metro bundles it from `packages/` into each `.snplg`, and
`sn-adapter`, `ink-core` and `picture-search` the same way. `ink2pic`, `bridge`, `lookup`, `relay` and `retouch` call `sn-plugin-lib` only
through `sn-adapter`'s official tier ([#101](https://github.com/martonpaulo/ink-tools/issues/101)). `ink2pic` was the seed of `ink-core` and of `lookup`'s picture modes; it is retired, and `lookup`
finds stickers, pictures and text (owner D45, [#125](https://github.com/martonpaulo/ink-tools/issues/125)). Its picture search core and pixel
measures are `packages/picture-search`.

## The tablet apps

- **Lingo** (`apps/handwriting-language/`) — a sideloaded Android app, not a plugin, that switches the
  handwriting recognition language of the whole tablet from a floating button or its sidebar entry
  ([#157](https://github.com/martonpaulo/ink-tools/issues/157), [#160](https://github.com/martonpaulo/ink-tools/issues/160)). It is plain Java with no plugin host, so it does not use `sn-adapter` or
  `ink-core`; its pure cycle and file switch are unit-tested on the JVM.

## The host tools

- **`inkctl`** — control a Supernote over Wi-Fi ADB with direct calls, JSON answers and stable exit
  codes, no root (formerly `supernote-adb`, then `snadb`, which still runs as a shim,
  [#173](https://github.com/martonpaulo/ink-tools/issues/173)).
- **Ink Notebook Editor** (`apps/ink-notebook-editor/`, formerly the working name `desk`) — a macOS app that reads and edits Supernote `.note` files on the Mac. Planned; the folder holds its
  `AGENTS.md` and no code yet ([#48](https://github.com/martonpaulo/ink-tools/issues/48)).

More tools may follow; this layout leaves room under `plugins/`, `cli/` and `apps/`.

## Device builds

A device build is the `.snplg` asset of a plugin's CI prerelease, never a local build on the Mac
([#203](https://github.com/martonpaulo/ink-tools/issues/203)). Each `prerelease-<plugin>.yml` runs the plugin's gate, builds the package (with its
native `app.npk` where the plugin has one) and publishes `<Plugin>-<version>.snplg` under the tag
`<plugin>-v<version>`. A Mac downloads it with:

```bash
gh release download <tag> --repo martonpaulo/ink-tools --pattern '*.snplg'
```

## What this means for the cloud agent

Build the pure layers (`sync-core`, `ink-core`, provider implementations) and unit-test them with no
device and no secrets. The `sn-adapter` descriptor is filled from the private reverse-engineering
notes. Anything that needs the physical tablet or a live account is verified by the owner on the
Mac, not faked in the cloud.
