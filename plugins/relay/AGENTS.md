# Relay — agent guidance

Scoped guidance for `plugins/relay/`. Inherits the repository root `../../AGENTS.md`; this file holds
only what is specific here. A `CLAUDE.md` symlink points at this file.

## Status

**Scaffolded** ([#98](https://github.com/martonpaulo/supernote-tools/issues/98)): plugin shell with a Settings entry and no note button, build to
`Relay.snplg`, `npm run validate` green. `src/localsend/protocol.ts` owns the LocalSend v2 announce,
prepare-upload and answer parsing; the sn-adapter official tier gives `pageImage` and `lassoImage`.
Still to come in [#98](https://github.com/martonpaulo/supernote-tools/issues/98): the native discovery and pinned HTTPS client, the device choice,
the «Send page» and «Send selection» buttons, the icons and the prerelease. The receive half is
[#49](https://github.com/martonpaulo/supernote-tools/issues/49).

## What it is

Send the current page, or a lasso selection, as a PNG to an iPhone or a Mac running LocalSend on
the same network. Layers: `../../docs/architecture.md`.

## Rules

- The network half is native Java, as Probe's listener is: `fetch` cannot reach a receiver, since
  cleartext fails and HTTPS meets a self-signed certificate (`../../docs/supernote.md` › Plugins).
- A receiver's certificate is accepted only when its SHA-256 equals the fingerprint it announced;
  never a trust-all manager. Send only to a private IPv4 address (`isPrivateAddress`).
- Every multicast or HTTP answer is untrusted: parse it in `src/localsend/protocol.ts`, within
  `MAX_ANSWER_BYTES`, and drop an unknown shape.
- Log no image content, token or session id; only status codes and timings.
- Permissions: `INTERNET`, `FILE:READ` and `FILE:WRITE`; `__tests__/pluginConfig.test.ts` checks them.
- Keep React Native 0.79.2, React 19.0.0 and `sn-plugin-lib` 0.2.3 exact: PluginHost fixes them.
  Never change `pluginID`.
- Before an `sn-plugin-lib` call, read the recorded gotchas in `../ink2pic/docs/brief.md`.

## Reuse

Scaffold copied from `../lookup`, which took it from `../lingo` (same runtime, build and release
shape).
