# Relay — agent guidance

Scoped guidance for `plugins/device-link/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Built, not yet on the device** ([#98](https://github.com/martonpaulo/supernote-tools/issues/98)): «Send Page» (sidebar) and «Send Selection» (lasso
toolbar) send a PNG to the LocalSend device picked from a list on each send ([#307](https://github.com/martonpaulo/ink-tools/issues/307): `findForSend`,
`src/send/pickSession.ts`, `src/PickDevice.tsx`; none found opens Settings' «No LocalSend device
found»), with a toast for the result. `src/localsend/protocol.ts` owns the LocalSend v2 bodies and
answers; `src/send/sendPng.ts` the flow; `src/settings/device.ts` the pins, a fingerprint per alias
set on the first sent item and refused when it changes (`pinnedSend`), and the last pick, listed
first; `native/` the Java module `RelayLocalSend`
(discovery, the pinned POST, the settings file); the sn-adapter official tier gives `pageImage` and
`lassoImage`. Discovery announces by multicast and, for its window, serves `/register` with our
identity (`Discovery.listen`, refusing every offer), since LocalSend answers an announce there
first; each register body is one more answer for `parseAnnounce`. The Settings view has «Close»,
and Back does each view's exit (close, stop, cancel). Since 0.1.0 beta 10, each POST presents
the `Identity.java` certificate as our TLS client certificate, which LocalSend 1.18 requires (a
send without one met «certificate required» and read «not reachable»), and each step and outcome
is a `Relay: send:` log line. Since beta 12, each send first logs its target (`to <alias> at
<ip>:<port> over <protocol>`), and an offer that cannot connect looks for the receiver again by
its fingerprint (`findAgain`): found at a new address, it is saved there and offered once more.
On beta 10 every send went to the address saved a week before, which the Mac no longer held, while
discovery found it at its new one (measured on a beta 11 test build: the saved address failed in
its connect, the found one gave no answer within the 10 s limit). An offer the receiver took and did not answer is `NO_ANSWER`
(`PinnedClient.NoAnswer`, «did not accept in time»), never «not reachable»: LocalSend answers
`prepare-upload` only on the person's accept, so its window is `TIMEOUTS.prepareMs`, 60 s.
On beta 12 «Send Selection» reached the Mac's LocalSend 1.18.2 and arrived as a PNG of only the
selection (2026-11-25). Still to come in [#98](https://github.com/martonpaulo/supernote-tools/issues/98): «Send Page», the iPhone, Back reaching the view and an address field for a device
discovery cannot see.

**Receive half built, not yet on the device** ([#49](https://github.com/martonpaulo/supernote-tools/issues/49)): «Receive» (sidebar, a view) runs
`native/.../Receiver.java`, an HTTPS LocalSend v2 receiver with the v3 certificate of
`Identity.java`, for `RECEIVE_WINDOW_MS`; `src/localsend/protocol.ts` decides each offer
(`decideOffer`), `src/receive/receive.ts` places the item in the note; a second text on the same
page goes one line below the first. A text goes into the first free band of the page, past its
strokes, text boxes and pictures (`freeTextBox`, `ink-core`'s `freeRect` that Word Lookup uses,
[#199](https://github.com/martonpaulo/ink-tools/issues/199)), and is lassoed only when the whole page was read and nothing else is under it
([#168](https://github.com/martonpaulo/ink-tools/issues/168)'s rule, ink-core's `inkUnderRect`). On the tablet (2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)), an `application/zip` offer is
refused at `prepare-upload` with 403, and a received photo is lassoed for a plugin: Image Editing's
«Document» reached `modifyPageElements` on beta 7, where beta 6 got error 904 from
`getLassoElementTypeCounts`. Since 0.1.0 beta 8, a received picture is lassoed by its rect after
`insertImage`, the one rect the insert added to the page, under the same rule, because the host's
floating selection is no lasso for the plugin API and «Document» edited nothing on it; its file
stays until the next receive ([#196](https://github.com/martonpaulo/ink-tools/issues/196)). Since
beta 9, the page is read again every 250 ms for up to 3 s until the host commits the picture (on
beta 8 a read 120 ms after the insert held 0 elements), else the centred rect the host places it
at (`centredRect`, the picture's own size from `Image.getSize`) is lassoed. The view's ×
and Back only close the view: the native receiver goes on, on its own thread, and takes every
item until `RECEIVE_WINDOW_MS` ends or «Stop» is pressed, each with its toast, and a tap on «Receive» shows the running
receive again ([#289](https://github.com/martonpaulo/ink-tools/issues/289); on 0.2.0 beta 1 the ×
stopped it and the next send met «connection refused»). Its waits tick on `DeviceLinkTicks`, as a
JS timer never fires with the view closed. Back reaches the view through sn-adapter's
`BackKeyModule`, registered as `DeviceLinkBack` ([#300](https://github.com/martonpaulo/ink-tools/issues/300)): on beta 1 Back went past the view and
closed the note behind it. Settings' «Receive in the background» switch, off by default, starts
the same receiver at plugin start with no tap and no window end, until «Stop» or the switch turned
off (`src/receive/background.ts`, `runBackgroundReceive`). A background receive that ends by
«Stop» or a failure turns the switch off and tells an open Settings view; a failure also says why
in a toast. A stop sent while the receiver still starts is sent again once it is ready
(`stopReceiving` in `session.ts`), as the native start clears a stop queued before it. With no note open, a text or a picture waits in `tmp/pending.json`
(`src/receive/pending.ts`) and the next «Receive» tap or pen-up in a note places it ([#289](https://github.com/martonpaulo/ink-tools/issues/289)).
To test on the device: the switch after a plugin update, a Wi-Fi change while it is on, and its
battery cost.

**Send Text built, not yet on the device** ([#99](https://github.com/martonpaulo/ink-tools/issues/99)): «Send Text» (lasso toolbar, a view) reads the
lassoed handwriting with `ink-core`'s `readLassoQuery`, shows it with the devices found, one tap
each to send ([#307](https://github.com/martonpaulo/ink-tools/issues/307)), the title bar's × its one Cancel ([#526](https://github.com/martonpaulo/ink-tools/issues/526); `src/send/textSession.ts`, `TextView`), and offers it as one `text/plain` file whose
`preview` is the text (`textOffer`); a 204 is «sent», a 200 uploads the bytes
(`src/send/sendText.ts`). To test on the device: how the iOS and macOS LocalSend apps show it.

**PDF to note built, not yet on the device** ([#143](https://github.com/martonpaulo/supernote-tools/issues/143)): one `application/pdf` offer is
saved as `received-<session>.pdf`; `native/.../PdfPages.java` renders it with Android's
`PdfRenderer` to page-sized PNGs, and `src/receive/pdfNote.ts` creates the note in `Note/` with
`createNote` (page 1) and `insertNotePage` (each further page), then removes the PDF and the PNGs;
a failure also removes the note. A received PDF became `Note/Scan <yyyy-MM-dd> <HHmm>.note` in the
root `Note/` folder, not the open note's folder (measured, 2026-11-17, [#214](https://github.com/martonpaulo/ink-tools/issues/214)). To test on the device: whether `insertNotePage` takes a PNG path
as its template, its page index base, and whether the note keeps its backgrounds once the PNGs
are gone.

**Editor helper built, not yet on the device** ([#312](https://github.com/martonpaulo/ink-tools/issues/312)): the Note Editor's tablet
helper, the action `edit` of sn-adapter's action channel ([#283](https://github.com/martonpaulo/ink-tools/issues/283)), which ticks on
`DeviceLinkTicks` (`RelayPackage.java`) with no view open. inkctl's `note edit` writes `action.json`
and the pictures in `.data/plugin/inktools-device-link/` (`EDITOR_FOLDER`), read with
`RelayLocalSend.readText`. `src/editor/operations.ts` owns the operations and the named refusals;
on the open note the element calls are the open-note calls, and a modify or page change saves the
note first; on another note, the file API by path. A picture moves as a new picture from the file
the request names, then the old one deleted, as a modify draws it twice (`docs/supernote.md`). A shape is the tablet's own geometry element, type 700 (`straightLine`, a closed `GEO_polygon`, `GEO_circle` or `GEO_ellipse` at angle 0), inserted and moved by rect like a stroke; whether the file API takes it on a closed note waits for the device round ([#463](https://github.com/martonpaulo/ink-tools/issues/463)). `transformElements` maps strokes through one matrix, their points, outline and box, for a resize, a rotation or a flip, and refuses a picture, a text box or a stroke it takes off the page ([#326](https://github.com/martonpaulo/ink-tools/issues/326)). `insertKeyword` (1 to 100 characters on one line) and `deleteKeyword` (a page's keyword by its index) go by path with the tablet's `insertKeyWord` and `deleteKeyWord`, the open note too after a save; the index's base and order wait for the device round ([#346](https://github.com/martonpaulo/ink-tools/issues/346)). `src/editor/penGate.ts` holds each edit while
the pen is on the page, at most 20 s. The action `save-note` (`src/editor/save.ts`) saves the open
note, which inkctl asks before it opens another note ([#426](https://github.com/martonpaulo/ink-tools/issues/426)). The action `templates` (`src/editor/templates.ts`) lists the tablet's page templates for the
editor's Insert Page, the system ones by name and the PNGs straight in `MyStyle/` by full path,
which `insertPage` also takes ([#451](https://github.com/martonpaulo/ink-tools/issues/451)). To test on the device: each operation with the screen
untouched, whether a picture element takes a path in that folder, and a stroke's `setRange` move.

## What it is

Send the current page, or a lasso selection, as a PNG to an iPhone or a Mac running LocalSend on
the same network, receive a text or a picture from them into the open note, and turn a received
PDF into a new note with its pages as backgrounds. Layers: `../../docs/architecture.md`.

## Rules

- The network half is native Java, as Probe's listener is: `fetch` cannot reach a receiver, since
  cleartext fails and HTTPS meets a self-signed certificate (`../../docs/supernote.md` › Plugins).
- A receiver's certificate is accepted only when its SHA-256 equals the fingerprint it announced;
  never a trust-all manager. Send only to a private IPv4 address (`isPrivateAddress`).
- Every multicast or HTTP answer is untrusted: parse it in `src/localsend/protocol.ts`, within
  `MAX_ANSWER_BYTES`, and drop an unknown shape.
- Relay's own certificate is X.509 v3 (`Identity.java`): iOS LocalSend refuses v1 with
  `UnsupportedCertVersion`; a stored certificate that is not v3 is replaced. Its fingerprint is
  the tablet's identity both ways, and it is our TLS client certificate on every send, for any
  authority the receiver names (`Identity.clientKeyManagers`, `../../docs/supernote.md` ›
  Plugins); one certificate per install.
- The receiver serves only private IPv4 peers, within `Receiver.MAX_JSON_BYTES` and
  `MAX_FILE_BYTES`, and names a received file from its type, never the sender's file name.
- Log no image content, text, token or session id; only steps, status codes, timings and the
  toast line (`sendLog`).
- Permissions: `INTERNET`, `FILE:READ` and `FILE:WRITE`; `__tests__/pluginConfig.test.ts` checks them.
  `src/permissions.ts` asks for each one before the first file, note or network call of a tap and
  when Settings opens, and a refusal, on a send or a receive, holds the Needs state that names it ([#163](https://github.com/martonpaulo/supernote-tools/issues/163), [#428](https://github.com/martonpaulo/ink-tools/issues/428), [#438](https://github.com/martonpaulo/ink-tools/issues/438)); `__tests__/permissions.test.tsx`
  checks that every declared permission is asked.
- Relay writes only in its private folder (`getPluginDirPath`): the settings (`settingsPath`), and
  the sent PNGs, received files and PDF pages in `tempDir`. A shared path such as
  `/storage/emulated/0/Relay/` is outside PluginHost's whitelist ([#164](https://github.com/martonpaulo/supernote-tools/issues/164)). A native delete goes
  through `TextFiles.delete`, which never throws, so every promise settles.
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../../docs/research/plugin-brief/brief.md`.

## Reuse

Scaffold copied from `../lasso-actions`, which took it from the removed Lingo plugin (same runtime, build and release
shape); `scripts/native-build.cjs` and its toolchain from `../ink-tools-probe`. No Notipal code is reused:
the client and the receiver follow the LocalSend v2 protocol text.
