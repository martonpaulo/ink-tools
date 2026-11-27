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
- [Repository layout](#repository-layout)
- [CI workflows](#ci-workflows)

## Why layers

Two things under the plugins change outside our control, so neither may be hardcoded in feature code:

1. **Supernote's internal APIs.** Content-provider authorities and columns, the `tag=task` write
   rule, the To-Do and Digest database schemas, and the Supernote Cloud endpoints are all
   undocumented and can change with a firmware update. They were learned from observed device behaviour, not a
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

The owner's rules for keeping each part replaceable (2026-11-14):

- **Our own model, in our words.** Feature logic reads and writes only this repository's types (a
  task, an event, a picture result), never a service's or the device's shapes. Each adapter
  translates at its edge.
- **Every outside service is an adapter.** Todoist is one `TaskProvider`; moving to Google Tasks is
  a new implementation, and a field one service lacks is decided then, not built in advance.
- **The device side has five levels, by how fragile they are** (owner, 2026-11-25; the rule for
  choosing among them is «The highest dependency level that serves» below):

  | Level | What | Breaks when | Impact | Public name | Public examples | Tested by |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | 1 | `sn-plugin-lib`, public Android API, our own code | rarely, with Ratta's notice | the person | Official plugin API | lasso, insert a picture, pages, files, buttons, dialogs | Mac tests, with the simulated adapter |
  | 2 | Internal data: content providers, private files and folders, the `.note` format | any firmware update; the probe sees it | the person | Device data | Calendar, To-Do and Digest entries; the handwriting language; the note file format | a tablet probe of fields, paths and versions |
  | 3 | Internal vendor code and screens: classes, activities, deep links, broadcasts, the host binder | any firmware update; a call fails | the person | System screens and components | native switches and bars, the helper app, Settings shortcuts | a tablet probe that loads and checks each one |
  | 4 | Screen automation: `inkctl` finds controls by text and id | any interface change; a step fails | our tests only | Screen automation | find buttons by their text in Settings and in notes | `inkctl doctor` before each test round |
  | 5 | Observed device behaviour that no API states (Back key routing, pen units, the Calendar and To-Do reading rules) | silently | the person | Observed device behaviour | the Back key, pen units, how Calendar and To-Do read entries | an effect test: write, read back, compare |

  The README's level table reads the last five columns: `scripts/readme_figures.py` writes it, with
  the registry's item count per level, so those columns hold only what the public README may say
  ([#407](https://github.com/martonpaulo/ink-tools/issues/407)).

- **Target: one registry of internals, four adapters** ([#294](https://github.com/martonpaulo/ink-tools/issues/294)). Every internal lives in one
  registry, data and not code, with one JSON Schema: per item its level, impact, owning tool,
  reason when below level 1, evidence (the vendor class or method, app versionCode, date), the path
  to a higher level, when it was last verified, and its probe. It lives in
  [`registry/`](../registry/schema.json): the schema, the header with the ratchet's ceiling per level
  (a ceiling only goes down), and one file per device area in `registry/items/`;
  `scripts/registry.py` checks it in the `registry` gate and writes `sn-adapter`'s `descriptor.json`
  from its three provider items. Readers for TypeScript, Java, Python
  and Swift are generated from the registry with a staleness check (`scripts/registry_readers.py`):
  `sn-adapter`'s `src/registry.generated.ts`, a `Registry.java` in each Android app, a block inside
  `cli/inkctl/src/inkctl` (a single file by design) and NoteFormat's `Registry.swift`; each holds
  only the items its tools read. There are four Supernote adapters,
  one per runtime, sharing the registry and the common rules, not code: TypeScript (`sn-adapter`,
  the plugins), Java (the apps and the plugins' native code), Python (`inkctl`) and Swift (Note
  Editor). Inside each, one module per level the runtime needs; a module exists only when a
  tool needs it. Each operation is a port named in our words (`writeTask`, `setLanguage`,
  `readPage`) with one implementation per level, and the registry names the active one: moving a
  part to a higher level adds the new implementation beside the old one, the port's shared contract
  tests run on both, and the old one leaves once the new passes; no tool changes. Before acting, a
  module checks its item's status and kill switch; after acting, it reads back. Built so far
  ([#293](https://github.com/martonpaulo/ink-tools/issues/293)): `sn-adapter`'s `port()` (`src/port.ts`), which
  Account Sync's Calendar, To-Do and Digest stores go through, with their contract tests in
  `__tests__/devicePorts.test.ts`; Handwriting Language's `LanguageFiles.port`; NoteFormat's
  `NoteReader` port, which `NoteFile(bytes:)` reads through, with the editor's own turned-off
  state; the Helper's `HostCalls.PluginCalls` port, picked by `pluginhost.setting-service`'s `active`, and its check of its three host-call items before a call; and inkctl's
  `COMMAND_ITEMS`, read before each command but `status`, `firmware` and `logs`. Plugins reach the
  internal providers through their native Java. A boundary check fails on a vendor name
  (`com.ratta.`, a provider URI, a vendor class, a private path) written outside the registry: the
  `vendor` rule of `scripts/boundaries.py`, over TypeScript, Java, Swift and inkctl's Python, with the
  generated readers and inkctl's registry block as the only places a name may stand.
- **Target: the firmware watch** ([#293](https://github.com/martonpaulo/ink-tools/issues/293)). It runs one probe per registry item when the
  environment fingerprint changes (`Build.FINGERPRINT`, every vendor app's `versionCode`, the
  registry version; versions are labels, never gates), in the Ink Tools Helper app and when `inkctl`
  connects, since a plugin may never see a first start. Each item reads `ok`, `broken` or
  `unprobed` (no safe probe, with its reason and accepted risk; probes only read or make a provable
  no-op). Each module has a kill switch in the registry, with a review date: off stops the module
  and says so. One card per run lists what broke, updated by a stable id, and each run feeds a
  compatibility table per fingerprint. Recorded fixtures per fingerprint run in CI against the
  adapters. Built so far: the Helper's `watch` op and boot run (`apps/ink-tools-helper/AGENTS.md`
  › The firmware watch), `inkctl firmware check` and its fingerprint check on connect
  (`cli/inkctl/README.md`), and the `off` field of the registry, whose review date fails the
  `registry` gate once passed. Prior art: [`research/2026-11-architecture-prior-art.md`](research/2026-11-architecture-prior-art.md).
- **No fallback for a Supernote internal.** A broken internal stops its module and says so; it never
  takes a hidden second path. Outside services may keep a second source, such as the offline then
  online dictionary or a second translator (owner, 2026-11-25).
- **One owner per value** ([#295](https://github.com/martonpaulo/ink-tools/issues/295)). Device facts live in the registry, visual values in
  `ui-kit` tokens, copy in each tool's copy module, cross-language contracts in one shared file,
  plugin identity in `PluginConfig.json`; the DRY guard reads TypeScript, Java, Python and Swift,
  and the same value in two places passes only with a registered owner: `scripts/dry_cross.py`
  reads Java and Swift beside the Skill Deck copy `scripts/dry_check.py`, and fails a constant
  value two tools name unless a `twins` row of `dry-check.json` names its owner; its counts only go
  down. `scripts/plugin-version.cjs --identity` checks that each plugin's names agree, that
  `versionCode` rises, and that the plugins pin one `react`, `react-native` and `sn-plugin-lib`.
- **No hand-written queries or column names.** Code asks for an operation (`completedTasks()`,
  `writeEvent(event)`); only `sn-adapter` knows the authority, the table and the column names, and
  those come from `descriptor.json`, which `scripts/registry.py` writes from the registry, not
  from strings in the code.
- **Imports go one way.** Feature logic never imports `sn-plugin-lib`, names a content provider or
  imports a service client; `scripts/boundaries.py` enforces it in the `boundaries` gate and in CI
  ([#101](https://github.com/martonpaulo/ink-tools/issues/101)). It reads inkctl too, for the provider and
  service-host rules; inkctl's existing names are counts that only go down
  ([#295](https://github.com/martonpaulo/ink-tools/issues/295)). `plugins/ink-tools-probe` is exempt from
  the SDK and service rules, since it exists to call internals directly, but names each internal it
  probes only through its registry readers, as every tool does
  ([#294](https://github.com/martonpaulo/ink-tools/issues/294)).
- **Packages sit in layers, lowest first** ([#491](https://github.com/martonpaulo/ink-tools/issues/491)): `sn-adapter`, then `ink-core` and the other packages, then the tools. A package imports only a lower one, so no cycle joins two packages: the shapes both sides use (`Rect`, `Size`, `Outcome`) live in `sn-adapter`, and `ink-core` re-exports them. `packages/ui-kit/src` imports no plugin; its `renders/` harness may, since it draws the plugins' screens and ships on no tablet. The `layer` rule of `scripts/boundaries.py` checks both.
- **The highest dependency level that serves.** As with high-level and low-level languages,
  level 1 is the highest and level 5 the lowest. Use the highest level that delivers the outcome at
  acceptable cost and quality (owner, [#287](https://github.com/martonpaulo/ink-tools/issues/287)). The levels, from the highest to the lowest and so the most fragile: 1, the
  official `sn-plugin-lib` or our own code; 2, the device's internal data, such as its content
  providers; 3, the vendor's internal code and screens, such as a class loaded from another app;
  4, screen automation; 5, observed device behaviour that no API states, which changes silently and is
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
  versions, the exception's class and message, and the stack trace (owner, [#287](https://github.com/martonpaulo/ink-tools/issues/287)). In the TypeScript adapter it is `InternalFailure` of `sn-adapter`'s `src/failure.ts`: a registry
  item, the method, a copy key for the sentence, the firmware fingerprint, the app versions and the
  cause chain; in the Java adapter it is `InternalFailure.java`, which `scripts/registry.py` writes
  beside the `Registry.java` of the Ink Tools Helper and of Handwriting Language, and in the Python
  adapter `InternalFailure` of `cli/inkctl/src/inkctl`
  ([#294](https://github.com/martonpaulo/ink-tools/issues/294)).
- **No `URL` getter on the tablet.** React Native's `URL` throws on `protocol`, `host` and the
  rest, so tablet code parses with `parseUrl` of `sync-core`; the `url` rule of
  `scripts/boundaries.py` covers every plugin, `plugins/ink-tools-probe` included
  ([#209](https://github.com/martonpaulo/ink-tools/issues/209)).
- **Every full view closes, and no failure is a toast alone.** Each full view of a plugin shows
  ui-kit's Close, and each failure stays on screen in ui-kit's Error or Needs state; the `close`
  and `toast` rules of `scripts/boundaries.py` cover every plugin, `plugins/ink-tools-probe`
  included, and `PENDING_TOASTS` is empty since
  [#428](https://github.com/martonpaulo/ink-tools/issues/428) ([#259](https://github.com/martonpaulo/ink-tools/issues/259)).

## Shared packages

```
ink-tools/
  packages/
    sn-adapter/     # Supernote adapter: official sn-plugin-lib tier + internals tier (descriptor, adapt-on/off probe)
    sync-core/      # diff, recurrence expansion, mapping, module orchestration (provider-agnostic)
    ink-core/       # handwrite -> recognise -> lasso -> insert-on-page (shared by Lasso Actions, Device Link, Image Editing)
    picture-search/ # the picture search core and its pure-Java pixel measures (for Lasso Actions and Image Editing)
    puzzle-core/    # Puzzles: seeded generators with one solution and a difficulty rating, and the page drawing in 16 greys as a PNG background (for Puzzles, later the editor)
    ui-kit/         # the Settings look: tokens, shared styles, Button (imported by every plugin)
  plugins/
    account-sync/   # to-do + calendar + digest, each module and provider opt in/out
    lasso-actions/    # write a word -> insert a picture, a definition or a translation (each mode and pair opt in/out)
    device-link/ # send a page or a lasso selection to an iPhone or a Mac over LocalSend
    image-editing/  # lasso a picture on the page -> Enhance, Lighter, Darker, Undo, Restore original
    ink-tools-probe/ # permanent on-device investigation plugin
  cli/
    inkctl/          # the ADB control CLI (formerly supernote-adb, then inkctl)
  apps/
    handwriting-language/ # sideloaded tablet app: switch the handwriting language tablet-wide
    ink-tools-helper/ # sideloaded helper app: lets inkctl install, enable and permit plugins
    note-editor/ # macOS app, Note Editor: a .note reader and editor
```

## The plugins (on device)

### Plugin grouping

The tablet enables at most 10 plugins and every enabled plugin loads into one PluginHost process
([`supernote.md`](supernote.md#plugins)), so plugins group by surface of use (owner, 2026-11-25,
[#304](https://github.com/martonpaulo/ink-tools/issues/304)):

- A new feature becomes an opt-in/out module of an existing plugin; a new plugin only when it needs its own surface.
- At most 8 of Ink Tools' plugins are enabled, so third-party plugins keep room.
- Not one superplugin (one crash or update would take everything), not one plugin per feature.

| Plugin | Modules | Surface | Status |
| :--- | :--- | :--- | :--- |
| Smart Pen | Smart Shapes, Real-Time Text, Gestures ([#270](https://github.com/martonpaulo/ink-tools/issues/270)) | the pen while writing | Built ([#305](https://github.com/martonpaulo/ink-tools/issues/305)); Gestures not yet |
| Lasso Actions | Lookup, Convert to Text, Headings, Collection | lassoed handwriting | Built with Lookup ([#306](https://github.com/martonpaulo/ink-tools/issues/306)); Convert to Text still in Smart Pen until it moves; Headings and Collection paused |
| Image Editing | Enhance, Lighter, Darker, Document, Erase, Crop | a lassoed picture | unchanged |
| Device Link | send, receive | the page and files | unchanged |
| Account Sync | to-do, calendar, digest | outside services | unchanged |
| Puzzles | the games ([#376](https://github.com/martonpaulo/ink-tools/issues/376)) | its own view and a new page | Planned |

Ink Tools Probe stays a developer tool, off day to day. The conversion engine is shared package code,
`ink-core`'s `@ink-tools/ink-core/conversion` ([#305](https://github.com/martonpaulo/ink-tools/issues/305)): Smart Pen keeps live conversion and «Undo Conversion», Lasso Actions gets «Convert to Text»
([#250](https://github.com/martonpaulo/ink-tools/issues/250)); until [#306](https://github.com/martonpaulo/ink-tools/issues/306) moves it, Smart Pen still carries that lasso button. The table below lists the plugins as they ship today.

Each plugin is named here by its display name ([product › Display names](product.md#display-names)).
Older code names stay in npm packages, `pluginKey`, log prefixes, data folders and older issues:

| Display name | Folder | Code name |
| :--- | :--- | :--- |
| Account Sync | `plugins/account-sync/` | `bridge` (npm package, `BridgeFilesPackage`) |
| Lasso Actions | `plugins/lasso-actions/` | `lookup` (`pluginKey` `Lookup`, kept from Word Lookup so the tablet updates it in place, [#306](https://github.com/martonpaulo/ink-tools/issues/306)) |
| Device Link | `plugins/device-link/` | `relay` |
| Image Editing | `plugins/image-editing/` | `retouch` |
| Ink Tools Probe | `plugins/ink-tools-probe/` | `probe` |
| Smart Pen | `plugins/smart-pen/` | `RealTimeConversion` (`pluginKey`, kept from Real-Time Conversion so the tablet updates it in place, [#305](https://github.com/martonpaulo/ink-tools/issues/305)) |

«Bridge» alone never names the helper app: that is the Ink Tools Helper app,
[`apps/ink-tools-helper/`](#the-tablet-apps).

- **Account Sync** — brings external services onto the device. Three modules, each opt in/out: **to-do**
  (Todoist <-> native To-Do), **calendar** (Google / iCloud / ICS <-> native Calendar), **digest**
  (two-way sync between the native Digest and the owner's Telegram «Saved Messages» through Telegram's official API, pending feasibility). Each provider is a separate toggle. One
  plugin, not a bundle of separate plugins.
  - **Settings-only, no note surface.** Account Sync is pure configuration plus background sync; it has
    nothing to do with a note's canvas. The plugin API supports this: a note plugin's `index.js` (Lasso Actions's, for one) registers
    the note buttons (`registerButton(..., ['NOTE'], ...)`) and the plugin's Settings entry
    (`registerConfigButton()` + `startConfigQueue()`) **independently**. Account Sync registers only the
    config button and no NOTE buttons, so it appears only in the plugin settings, never in notes.
    (API-confirmed from the first note plugin; to confirm on device via Ink Tools Probe.)
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
  - **Background lifecycle** ([#370](https://github.com/martonpaulo/ink-tools/issues/370), [#283](https://github.com/martonpaulo/ink-tools/issues/283)). Every enabled plugin lives in
    the PluginHost process with no view open, and a native event reaches its JavaScript then (the
    provider observer's pass ran from the home screen), but a JS timer does not fire. So the
    automatic sync and the action channel tick on a native timer, sn-adapter's `TickModule` (level
    1: Android's `Handler`); it counts uptime, so it waits while the tablet sleeps. Whether the
    process survives a long sleep is a device check of [#370](https://github.com/martonpaulo/ink-tools/issues/370).
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
    «unverified app» warning and a cap of 100 users. The app is published, so its tokens do not
    expire after 7 days (owner, 2026-11-26, [#372](https://github.com/martonpaulo/ink-tools/issues/372); it was in «Testing» from 2026-11-16,
    [#124](https://github.com/martonpaulo/ink-tools/issues/124)). The loopback flow needs an OAuth client of the «Desktop app» type:
    the existing client is a «TVs and Limited Input devices» one, with no redirect URIs.
- **Lasso Actions** (formerly Word Lookup) — actions on lassoed handwriting, each a module switched on or off in its Settings ([#306](https://github.com/martonpaulo/ink-tools/issues/306)). Its Lookup module: write a word, lasso it, insert an **illustration**, a **photo**, a **definition**
  or a **translation**; each mode opt in/out, and each language pair opt in/out under the
  translation. A new plugin with its own `pluginID` (owner D40, [#110](https://github.com/martonpaulo/ink-tools/issues/110)); it replaced the
  first picture plugin, which is retired, uninstalled from the tablet ([#45](https://github.com/martonpaulo/ink-tools/issues/45)) and removed
  from the repository ([#288](https://github.com/martonpaulo/ink-tools/issues/288)).
- **Device Link** — sends the current page or a lasso selection as a PNG to an iPhone or a Mac over
  LocalSend v2, and will receive from them ([#98](https://github.com/martonpaulo/ink-tools/issues/98), [#49](https://github.com/martonpaulo/ink-tools/issues/49)). Its network half is a native
  Java module, as Ink Tools Probe's listener is.
- **Image Editing** — edit an image already on the page: lasso it and tap Enhance, Lighter, Darker, Undo or
  Restore original ([#136](https://github.com/martonpaulo/ink-tools/issues/136)). Its pixel work is a native Java module that reuses
  `picture-search`'s `Decolor` and `EinkPixels`.
- **Ink Tools Probe** — a minimal plugin for on-device investigation (provider reachability,
  permission checks), reused whenever a device question comes up.
- **Smart Pen** — the pen features, each a module switched on or off in its Settings ([#305](https://github.com/martonpaulo/ink-tools/issues/305)):
  Real-Time Text turns handwriting into a text box as each word ends, with an Undo Conversion
  ([#144](https://github.com/martonpaulo/ink-tools/issues/144)), and Smart Shapes turns a stroke held still at its end into a clean triangle, circle,
  square, rectangle or arrow, as the native Smart Straight Line does ([#253](https://github.com/martonpaulo/ink-tools/issues/253)); its guidance is
  [`plugins/smart-pen/AGENTS.md`](../plugins/smart-pen/AGENTS.md).

Lasso Actions, Device Link and Image Editing share `ink-core` (the handwrite -> recognise -> lasso -> insert-on-page
gesture). Account Sync's three modules share `sync-core`. All of them are to go through `sn-adapter` for
any Supernote access. Every plugin's Settings look comes from `ui-kit`
([#93](https://github.com/martonpaulo/ink-tools/issues/93)): Metro bundles it from `packages/` into each `.snplg`, and
`sn-adapter`, `ink-core` and `picture-search` the same way. Every plugin calls `sn-plugin-lib` only
through `sn-adapter`'s official tier ([#101](https://github.com/martonpaulo/ink-tools/issues/101)). The first picture plugin was the seed of `ink-core` and of Lasso Actions's picture modes; it is retired and removed ([#288](https://github.com/martonpaulo/ink-tools/issues/288)), and Lasso Actions
finds stickers, pictures and text (owner D45, [#125](https://github.com/martonpaulo/ink-tools/issues/125)). Its picture search core and pixel
measures are `packages/picture-search`.

## The tablet apps

- **Lingo** (`apps/handwriting-language/`) — a sideloaded Android app, not a plugin, that switches the
  handwriting recognition language of the whole tablet from a floating button or its sidebar entry
  ([#157](https://github.com/martonpaulo/ink-tools/issues/157), [#160](https://github.com/martonpaulo/ink-tools/issues/160)). It is plain Java with no plugin host, so it does not use `sn-adapter` or
  `ink-core`; its pure cycle and file switch are unit-tested on the JVM.
- **Ink Tools Helper** (`apps/ink-tools-helper/`) — a sideloaded helper app with no screen that binds
  PluginHost's exported `PluginSettingService` and runs one install, enable, disable, uninstall or
  permission change per `am broadcast` from `inkctl` ([#215](https://github.com/martonpaulo/ink-tools/issues/215)). `adb` cannot hold the callback binder
  PluginHost answers through, so a live app process must. Plain Java; its call encoding is
  unit-tested on the JVM.

## The host tools

- **`inkctl`** — control a Supernote over Wi-Fi ADB with direct calls, JSON answers and stable exit
  codes, no root (formerly `supernote-adb`, then `snadb`, which still runs as a shim,
  [#173](https://github.com/martonpaulo/ink-tools/issues/173)).
- **Note Editor** (`apps/note-editor/`, formerly the working name `desk`) — a macOS app that reads and edits Supernote `.note` files on the Mac ([#48](https://github.com/martonpaulo/ink-tools/issues/48)). It opens a note from a file or from the tablet through `inkctl` and pages through it ([#262](https://github.com/martonpaulo/ink-tools/issues/262)); a note from the tablet is edited through the tablet's file API ([#313](https://github.com/martonpaulo/ink-tools/issues/313)).

More tools may follow; this layout leaves room under `plugins/`, `cli/` and `apps/`.

## Device builds

A device check installs a build of `main` made on the Mac, so the tablet never waits for a version
bump ([#310](https://github.com/martonpaulo/ink-tools/issues/310)):

```bash
python3 scripts/device_build.py plugins/<folder> --install
```

The script refuses uncommitted changes under the plugin or `packages/` and a commit that is not on
`origin/main`. The build keeps the plugin's `versionName` and `versionCode`: PluginHost updates a
plugin over an equal `versionCode` and refuses only a lower one, and the version rule has no build
suffix ([#155](https://github.com/martonpaulo/ink-tools/issues/155)). Only the file name carries the commit,
`<Plugin>-<version>-main-<commit>.snplg`. `inkctl plugin install --same-version` proves the update by
PluginHost's own `installPlugin: success` line for that file.

The build of a version is still the `.snplg` asset of a plugin's CI prerelease
([#203](https://github.com/martonpaulo/ink-tools/issues/203)). Each `prerelease-<plugin>.yml` runs the plugin's gate, builds the package (with its
native `app.npk` where the plugin has one) and publishes `<Plugin>-<version>.snplg` under the tag
`<plugin>-v<version>`. A Mac downloads it with:

```bash
gh release download <tag> --repo martonpaulo/ink-tools --pattern '*.snplg'
```

The Ink Tools Helper app keeps its CI build: its stable signing key lives only in the repository
secrets ([#223](https://github.com/martonpaulo/ink-tools/issues/223), [`security.md`](security.md)).

## What this means for the cloud agent

Build the pure layers (`sync-core`, `ink-core`, provider implementations) and unit-test them with no
device and no secrets. The `sn-adapter` descriptor is filled from the private device-study
notes. Anything that needs the physical tablet or a live account is verified by the owner on the
Mac, not faked in the cloud.

A cloud session's work reaches `main` by `git merge --no-ff` of its hand-off branch, never by
cherry-pick: GitHub's compare counts commit IDs, so a cherry-picked commit still shows the branch
as ahead. Parallel cloud sessions race on a plugin's version: bump it right before landing, never
at the start of the work (lessons of the 2026-11-16 night rounds, [#214](https://github.com/martonpaulo/ink-tools/issues/214)).

## Repository layout

The `single-project-layout` divergence of `AGENTS.md`: the repository holds several independent subprojects under one folder per plugin in `plugins/`, `packages/`, `cli/inkctl/`, `apps/note-editor/` (the macOS app, [#48](https://github.com/martonpaulo/ink-tools/issues/48)) and `apps/handwriting-language/` (the Lingo app, a sideloaded Android app, not a plugin, named for its feature as every subproject folder is, [#194](https://github.com/martonpaulo/ink-tools/issues/194), [#160](https://github.com/martonpaulo/ink-tools/issues/160): a plugin cannot write the handwriting language file, [#157](https://github.com/martonpaulo/ink-tools/issues/157)), each with its own gate, and the plugins, the app and the CLI each with their own `AGENTS.md`, versioning and release policy; the root file carries shared policy and a route map.

## CI workflows

The `ci-pipelines` divergence of `AGENTS.md`: this is a monorepo of independent subprojects; CI lives at the root: one `validate-<subproject>.yml` per subproject, path-filtered, run in its folder, plus one `prerelease-<plugin>.yml` per plugin under `plugins/` ([#203](https://github.com/martonpaulo/ink-tools/issues/203)), `release-note-editor.yml` (the Note Editor's signed and notarized release when `Support/Info.plist` changes, and its cask in `martonpaulo/homebrew-tap`, [#445](https://github.com/martonpaulo/ink-tools/issues/445)), `validate-site.yml` (the site gate, which also deploys `site/` to GitHub Pages from `main`, [#371](https://github.com/martonpaulo/ink-tools/issues/371)), `lab.yml` (the search lab of the shared picture search, in `plugins/lasso-actions/lab/`, by hand on GitHub's runner only, [#108](https://github.com/martonpaulo/ink-tools/issues/108), [#288](https://github.com/martonpaulo/ink-tools/issues/288)), `scan.yml` (the weekly npm audit of every plugin; the text check and issue links of every Markdown file, [#77](https://github.com/martonpaulo/ink-tools/issues/77); `scripts/boundaries.py` on a package or plugin change, [#101](https://github.com/martonpaulo/ink-tools/issues/101); the icons, licence and Quick check gates and `scripts/workflow_paths.py`, [#301](https://github.com/martonpaulo/ink-tools/issues/301)) and one `dependabot.yml` ([#38](https://github.com/martonpaulo/ink-tools/issues/38)). The root `gates.json`, read by `scripts/gates.py`, maps each subproject's paths to its gate ([#75](https://github.com/martonpaulo/ink-tools/issues/75)); CI does not run the selector: `scripts/workflow_paths.py` keeps each `validate-<gate>.yml`'s push `paths` equal to that gate's rules, and each prerelease runs only when its version file changes ([#301](https://github.com/martonpaulo/ink-tools/issues/301)).
