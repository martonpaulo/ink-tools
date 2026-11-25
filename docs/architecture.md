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
- **The device side has five levels, by how fragile they are** (owner, 2026-11-25; the rule for
  choosing among them is «The highest dependency level that serves» below):

  | Level | What | Breaks when | Impact |
  | :--- | :--- | :--- | :--- |
  | 1 | `sn-plugin-lib`, public Android API, our own code | rarely, with Ratta's notice | the person |
  | 2 | Internal data: content providers, private files and folders, the `.note` format | any firmware update; the probe sees it | the person |
  | 3 | Internal vendor code and screens: classes, activities, deep links, broadcasts, the host binder | any firmware update; a call fails | the person |
  | 4 | Screen automation: `inkctl` finds controls by text and id | any interface change; a step fails | our tests only |
  | 5 | Behaviour learned from decompiled code (Back key routing, pen units, the Calendar and To-Do reading rules) | silently | the person |

- **Target: one registry of internals, four adapters** ([#294](https://github.com/martonpaulo/ink-tools/issues/294)). Every internal lives in one
  registry, data and not code, with one JSON Schema: per item its level, impact, owning tool,
  reason when below level 1, evidence (decompiled class or method, app versionCode, date), the path
  to a higher level, when it was last verified, and its probe. It lives in
  [`registry/`](../registry/schema.json): the schema, the header with the ratchet's ceiling per level
  (a ceiling only goes down), and one file per device area in `registry/items/`;
  `scripts/registry.py` checks it in the `registry` gate and writes `sn-adapter`'s `descriptor.json`
  from its three provider items. Readers for TypeScript, Java, Python
  and Swift are generated from the schema with a staleness check. There are four Supernote adapters,
  one per runtime, sharing the registry and the common rules, not code: TypeScript (`sn-adapter`,
  the plugins), Java (the apps and the plugins' native code), Python (`inkctl`) and Swift (Ink
  Notebook Editor). Inside each, one module per level the runtime needs; a module exists only when a
  tool needs it. Each operation is a port named in our words (`writeTask`, `setLanguage`,
  `readPage`) with one implementation per level, and the registry names the active one: moving a
  part to a higher level adds the new implementation beside the old one, the port's shared contract
  tests run on both, and the old one leaves once the new passes; no tool changes. Before acting, a
  module checks its item's status and kill switch; after acting, it reads back. Plugins reach the
  internal providers through their native Java. A boundary check fails on a vendor name
  (`com.ratta.`, a provider URI, a vendor class, a private path) written outside the registry.
- **Target: the firmware watch** ([#293](https://github.com/martonpaulo/ink-tools/issues/293)). It runs one probe per registry item when the
  environment fingerprint changes (`Build.FINGERPRINT`, every vendor app's `versionCode`, the
  registry version; versions are labels, never gates), in the InkTools Bridge app and when `inkctl`
  connects, since a plugin may never see a first start. Each item reads `ok`, `broken` or
  `unprobed` (no safe probe, with its reason and accepted risk; probes only read or make a provable
  no-op). Each module has a kill switch in the registry, with a review date: off stops the module
  and says so. One card per run lists what broke, updated by a stable id, and each run feeds a
  compatibility table per fingerprint. Recorded fixtures per fingerprint run in CI against the
  adapters. Prior art: [`research/2026-11-architecture-prior-art.md`](research/2026-11-architecture-prior-art.md).
- **No fallback for a Supernote internal.** A broken internal stops its module and says so; it never
  takes a hidden second path. Outside services may keep a second source, such as the offline then
  online dictionary or a second translator (owner, 2026-11-25).
- **One owner per value** ([#295](https://github.com/martonpaulo/ink-tools/issues/295)). Device facts live in the registry, visual values in
  `ui-kit` tokens, copy in each tool's copy module, cross-language contracts in one shared file,
  plugin identity in `PluginConfig.json`; the DRY guard reads TypeScript, Java, Python and Swift,
  and the same value in two places passes only with a registered owner.
- **No hand-written queries or column names.** Code asks for an operation (`completedTasks()`,
  `writeEvent(event)`); only `sn-adapter` knows the authority, the table and the column names, and
  those come from `descriptor.json`, which `scripts/registry.py` writes from the registry, not
  from strings in the code.
- **Imports go one way.** Feature logic never imports `sn-plugin-lib`, names a content provider or
  imports a service client; `scripts/boundaries.py` enforces it in the `boundaries` gate and in CI
  ([#101](https://github.com/martonpaulo/ink-tools/issues/101)). `plugins/plugin-diagnostics` is exempt: it
  exists to call internals directly.
- **The highest dependency level that serves.** As with high-level and low-level languages,
  level 1 is the highest and level 5 the lowest. Use the highest level that delivers the outcome at
  acceptable cost and quality (owner, [#287](https://github.com/martonpaulo/ink-tools/issues/287)). The levels, from the highest to the lowest and so the most fragile: 1, the
  official `sn-plugin-lib` or our own code; 2, the device's internal data, such as its content
  providers; 3, the vendor's internal code and screens, such as a class loaded from another app;
  4, screen automation; 5, behaviour learned from decompiled code, which changes silently and is
  the most fragile. Impact is marked apart: level 4 affects only our tests, the others affect the
  person. Every part below level 1 records why no higher level serves and has a probe in the
  firmware watch ([#293](https://github.com/martonpaulo/ink-tools/issues/293)), so it never breaks silently. Move a part up when we touch it or when the
  watch flags it, never as a rewrite campaign; before moving a part to a higher level, check why
  it was built its way (a decision, an issue, a need the higher path lacks) and record that check. The lower the level and the higher the impact, the
  stronger the reason must be; level 5 only when nothing else works, always with an effect test. Our own
  code is level 1 but not free: rebuilding a whole feature the device already does well can cost
  more than using the native one under a probe. The controls are level 1: our own measured copies,
  built on the ideas learned from the vendor UI library ([`packages/ui-kit/README.md`](../packages/ui-kit/README.md)).
- **A failure reads as a sentence.** Every firmware or internal failure shows the person one
  friendly sentence that says what failed and what to do next, never a class name; the log carries
  every detail an agent needs: the class or provider, the method, the firmware version, the app
  versions, the exception's class and message, and the stack trace (owner, [#287](https://github.com/martonpaulo/ink-tools/issues/287)).
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
    ink-core/       # handwrite -> recognise -> lasso -> insert-on-page (shared by Word Lookup, Device Transfer, Image Editing)
    picture-search/ # the picture search core and its pure-Java pixel measures (for Word Lookup and Image Editing)
    ui-kit/         # the Settings look: tokens, shared styles, Button (imported by every plugin)
  plugins/
    account-sync/   # to-do + calendar + digest, each module and provider opt in/out
    word-lookup/    # write a word -> insert a picture, a definition or a translation (each mode and pair opt in/out)
    device-transfer/ # send a page or a lasso selection to an iPhone or a Mac over LocalSend
    image-editing/  # lasso a picture on the page -> Enhance, Lighter, Darker, Undo, Restore original
    plugin-diagnostics/ # permanent on-device investigation plugin
  cli/
    inkctl/          # the ADB control CLI (formerly supernote-adb, then inkctl)
  apps/
    handwriting-language/ # sideloaded tablet app: switch the handwriting language tablet-wide
    inktools-bridge/ # sideloaded helper app: lets inkctl install, enable and permit plugins
    ink-notebook-editor/ # macOS app, Ink Notebook Editor: a read-only .note reader for now
```

## The plugins (on device)

Each plugin is named here by its display name ([product › Display names](product.md#display-names)).
Older code names stay in npm packages, `pluginKey`, log prefixes, data folders and older issues:

| Display name | Folder | Code name |
| :--- | :--- | :--- |
| Account Sync | `plugins/account-sync/` | `bridge` (npm package, `BridgeFilesPackage`) |
| Word Lookup | `plugins/word-lookup/` | `lookup` |
| Device Transfer | `plugins/device-transfer/` | `relay` |
| Image Editing | `plugins/image-editing/` | `retouch` |
| Plugin Diagnostics | `plugins/plugin-diagnostics/` | `probe` |
| Real-Time Conversion | `plugins/real-time-conversion/` | `RealTimeConversion` (`pluginKey`) |
| Smart Shapes | `plugins/smart-shapes/` | `SmartShapes` (`pluginKey`) |

«Bridge» alone never names the helper app: that is the Ink Tools bridge app,
[`apps/inktools-bridge/`](#the-tablet-apps).

- **Account Sync** — brings external services onto the device. Three modules, each opt in/out: **to-do**
  (Todoist <-> native To-Do), **calendar** (Google / iCloud / ICS <-> native Calendar), **digest**
  (Panoram Saved -> native Digest, pending feasibility). Each provider is a separate toggle. One
  plugin, not a bundle of separate plugins.
  - **Settings-only, no note surface.** Account Sync is pure configuration plus background sync; it has
    nothing to do with a note's canvas. The plugin API supports this: a note plugin's `index.js` (Word Lookup's, for one) registers
    the note buttons (`registerButton(..., ['NOTE'], ...)`) and the plugin's Settings entry
    (`registerConfigButton()` + `startConfigQueue()`) **independently**. Account Sync registers only the
    config button and no NOTE buttons, so it appears only in the plugin settings, never in notes.
    (API-confirmed from the first note plugin; to confirm on device via Plugin Diagnostics.)
  - **A change made on both sides between two syncs** ([#87](https://github.com/martonpaulo/ink-tools/issues/87), owner D14 A): on both
    modules the later change wins, and a tie goes to the service. To-Do compares the two
    `modified` times (`packages/sync-core/src/tasks.ts`). Calendar compares the tablet row's
    `lastModifiedTime` with the source's change time (Google's `updated`); a source that has none,
    such as ICS, wins (`pushCalendarEdits` in `packages/sync-core/src/push.ts`). The losing
    version goes into the module run's warnings, which Settings and the log show: a task's title, an
    event's title, start and notes (`conflictWarnings`).
  - **Turning a module or a provider off** ([#89](https://github.com/martonpaulo/ink-tools/issues/89), owner D15 A): every row Account Sync wrote
    stays on the tablet, and sync stops updating it. A module that is off offers one
    «Remove what Account Sync wrote» button in Settings, which asks once more before it deletes. It
    removes only what Account Sync wrote (`packages/sync-core/src/cleanup.ts`): on **calendar**, every
    `tag=task` row; on **to-do**, the tasks Account Sync imported from the service (a link with
    `origin: 'service'`), soft-deleted, never a task the owner wrote on the tablet and never the
    service's copy; **digest** writes nothing yet. A provider has no button of its own: its rows go
    with the module's.
  - **Open question — background lifecycle.** The config listener only fires when the owner opens
    Settings. Periodic sync with the view closed needs a background trigger or a kept-alive plugin;
    whether PluginHost allows that is unconfirmed and is the first thing Plugin Diagnostics must answer before
    the Account Sync design commits to it.
  - **Google sign-in cannot use the device-code flow.** Google's OAuth flow for limited-input
    devices allows only `openid`, `email`, `profile`, two Drive scopes and two YouTube scopes; no
    Calendar scope (read 2026-11-14,
    [#64](https://github.com/martonpaulo/ink-tools/issues/64)). `packages/sync-core`
    therefore has no device-code sign-in ([#124](https://github.com/martonpaulo/ink-tools/issues/124)). **Account Sync signs in on the Mac and gets the token
    over ADB** (owner D39 A, [#64](https://github.com/martonpaulo/ink-tools/issues/64)): a `inkctl` command runs Google's
    installed-app flow with a loopback redirect, which allows the Calendar scopes, in the Mac's
    browser; the refresh token then goes to Account Sync's private plugin folder the way every sign-in
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
- **Word Lookup** — write a word, lasso it, insert an **illustration**, a **photo**, a **definition**
  or a **translation**; each mode opt in/out, and each language pair opt in/out under the
  translation. A new plugin with its own `pluginID` (owner D40, [#110](https://github.com/martonpaulo/ink-tools/issues/110)); it replaced the
  first picture plugin, which is retired, uninstalled from the tablet ([#45](https://github.com/martonpaulo/ink-tools/issues/45)) and removed
  from the repository ([#288](https://github.com/martonpaulo/ink-tools/issues/288)).
- **Device Transfer** — sends the current page or a lasso selection as a PNG to an iPhone or a Mac over
  LocalSend v2, and will receive from them ([#98](https://github.com/martonpaulo/ink-tools/issues/98), [#49](https://github.com/martonpaulo/ink-tools/issues/49)). Its network half is a native
  Java module, as Plugin Diagnostics' listener is.
- **Image Editing** — edit an image already on the page: lasso it and tap Enhance, Lighter, Darker, Undo or
  Restore original ([#136](https://github.com/martonpaulo/ink-tools/issues/136)). Its pixel work is a native Java module that reuses
  `picture-search`'s `Decolor` and `EinkPixels`.
- **Plugin Diagnostics** — a minimal plugin for on-device investigation (provider reachability,
  permission checks), reused whenever a device question comes up.
- **Real-Time Conversion** — turns handwriting into a text box as each word ends, with an Undo
  Conversion ([#144](https://github.com/martonpaulo/ink-tools/issues/144)); its guidance is
  [`plugins/real-time-conversion/AGENTS.md`](../plugins/real-time-conversion/AGENTS.md).
- **Smart Shapes** — a stroke held still at its end becomes a clean triangle, circle, square,
  rectangle or arrow, as the native Smart Straight Line does ([#253](https://github.com/martonpaulo/ink-tools/issues/253)); its guidance is
  [`plugins/smart-shapes/AGENTS.md`](../plugins/smart-shapes/AGENTS.md).

Word Lookup, Device Transfer and Image Editing share `ink-core` (the handwrite -> recognise -> lasso -> insert-on-page
gesture). Account Sync's three modules share `sync-core`. All of them are to go through `sn-adapter` for
any Supernote access. Every plugin's Settings look comes from `ui-kit`
([#93](https://github.com/martonpaulo/ink-tools/issues/93)): Metro bundles it from `packages/` into each `.snplg`, and
`sn-adapter`, `ink-core` and `picture-search` the same way. Every plugin calls `sn-plugin-lib` only
through `sn-adapter`'s official tier ([#101](https://github.com/martonpaulo/ink-tools/issues/101)). The first picture plugin was the seed of `ink-core` and of Word Lookup's picture modes; it is retired and removed ([#288](https://github.com/martonpaulo/ink-tools/issues/288)), and Word Lookup
finds stickers, pictures and text (owner D45, [#125](https://github.com/martonpaulo/ink-tools/issues/125)). Its picture search core and pixel
measures are `packages/picture-search`.

## The tablet apps

- **Lingo** (`apps/handwriting-language/`) — a sideloaded Android app, not a plugin, that switches the
  handwriting recognition language of the whole tablet from a floating button or its sidebar entry
  ([#157](https://github.com/martonpaulo/ink-tools/issues/157), [#160](https://github.com/martonpaulo/ink-tools/issues/160)). It is plain Java with no plugin host, so it does not use `sn-adapter` or
  `ink-core`; its pure cycle and file switch are unit-tested on the JVM.
- **Ink Tools Bridge** (`apps/inktools-bridge/`) — a sideloaded helper app with no screen that binds
  PluginHost's exported `PluginSettingService` and runs one install, enable, disable, uninstall or
  permission change per `am broadcast` from `inkctl` ([#215](https://github.com/martonpaulo/ink-tools/issues/215)). `adb` cannot hold the callback binder
  PluginHost answers through, so a live app process must. Plain Java; its call encoding is
  unit-tested on the JVM.

## The host tools

- **`inkctl`** — control a Supernote over Wi-Fi ADB with direct calls, JSON answers and stable exit
  codes, no root (formerly `supernote-adb`, then `snadb`, which still runs as a shim,
  [#173](https://github.com/martonpaulo/ink-tools/issues/173)).
- **Ink Notebook Editor** (`apps/ink-notebook-editor/`, formerly the working name `desk`) — a macOS app that reads and edits Supernote `.note` files on the Mac ([#48](https://github.com/martonpaulo/ink-tools/issues/48)). It opens a note read-only, from a file or from the tablet through `inkctl`, and pages through it ([#262](https://github.com/martonpaulo/ink-tools/issues/262)); editing follows.

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

A cloud session's work reaches `main` by `git merge --no-ff` of its hand-off branch, never by
cherry-pick: GitHub's compare counts commit IDs, so a cherry-picked commit still shows the branch
as ahead. Parallel cloud sessions race on a plugin's version: bump it right before landing, never
at the start of the work (lessons of the 2026-11-16 night rounds, [#214](https://github.com/martonpaulo/ink-tools/issues/214)).
