# Relay — agent guidance

Scoped guidance for `plugins/relay/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Built, not yet on the device** ([#98](https://github.com/martonpaulo/supernote-tools/issues/98)): «Send Page» (sidebar) and «Send Selection» (lasso
toolbar) send a PNG to the LocalSend device chosen in Settings, with a toast for the result.
`src/localsend/protocol.ts` owns the LocalSend v2 bodies and answers; `src/send/sendPng.ts` the
flow; `src/settings/device.ts` the chosen device; `native/` the Java module `RelayLocalSend`
(discovery, the pinned POST, the settings file); the sn-adapter official tier gives `pageImage` and
`lassoImage`. Still to come in [#98](https://github.com/martonpaulo/supernote-tools/issues/98): the device round (multicast from a plugin, the toast)
and an address field for a device discovery cannot see.

**Receive half built, not yet on the device** ([#49](https://github.com/martonpaulo/supernote-tools/issues/49)): «Receive» (sidebar, a view) runs
`native/.../Receiver.java`, an HTTPS LocalSend v2 receiver with the v3 certificate of
`Identity.java`, for `RECEIVE_WINDOW_MS`; `src/localsend/protocol.ts` decides each offer
(`decideOffer`), `src/receive/receive.ts` places the item in the note. Still to come: the device
round, and whether the receiver can stay on with the view closed.

**PDF to note built, not yet on the device** ([#143](https://github.com/martonpaulo/supernote-tools/issues/143)): one `application/pdf` offer is
saved as `received-<session>.pdf`; `native/.../PdfPages.java` renders it with Android's
`PdfRenderer` to page-sized PNGs, and `src/receive/pdfNote.ts` creates the note in `Note/` with
`createNote` (page 1) and `insertNotePage` (each further page), then removes the PDF and the PNGs;
a failure also removes the note. To test on the device: whether `insertNotePage` takes a PNG path
as its template, its page index base, and whether the note keeps its backgrounds once the PNGs
are gone.

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
  the tablet's identity both ways.
- The receiver serves only private IPv4 peers, within `Receiver.MAX_JSON_BYTES` and
  `MAX_FILE_BYTES`, and names a received file from its type, never the sender's file name.
- Log no image content, token or session id; only status codes and timings.
- Permissions: `INTERNET`, `FILE:READ` and `FILE:WRITE`; `__tests__/pluginConfig.test.ts` checks them.
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../ink2pic/docs/brief.md`.

## Reuse

Scaffold copied from `../lookup`, which took it from `../lingo` (same runtime, build and release
shape); `scripts/native-build.cjs` and its toolchain from `../probe`. No Notipal code is reused:
the client and the receiver follow the LocalSend v2 protocol text.
