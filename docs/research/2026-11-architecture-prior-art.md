# The target architecture against prior art

Status: research, 2026-11-25. It compares the Ink Tools target architecture (`docs/architecture.md`,
[#293](https://github.com/martonpaulo/ink-tools/issues/293), [#294](https://github.com/martonpaulo/ink-tools/issues/294), [#295](https://github.com/martonpaulo/ink-tools/issues/295)) with projects that live on undocumented platforms and with general practice.

## Contents

- [What the target already matches](#what-the-target-already-matches)
- [Where it diverges](#where-it-diverges)
- [Improvements adopted into the plans](#improvements-adopted-into-the-plans)
- [Risks to avoid](#risks-to-avoid)
- [Uncertain](#uncertain)

## What the target already matches

| Target element | Prior art |
| :--- | :--- |
| Five levels, each internal classified | Android's non-SDK interface lists (`sdk`, `unsupported`, `max-target-x`, `blocked`), shipped as data for each release and enforced by lint and logcat; Google advises a migration plan and a public API request for each use ([developer.android.com, restrictions on non-SDK interfaces](https://developer.android.com/guide/app-compatibility/restrictions-non-sdk-interfaces)) |
| Descriptor as data plus a start-up probe | KOReader declares per-model capabilities and probes paths at run time, never gating on firmware version ([koreader generic/device.lua](https://raw.githubusercontent.com/koreader/koreader/master/frontend/device/generic/device.lua)); feature detection over version sniffing ([MDN, 2025-12-19](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Testing/Feature_detection)) |
| A broken part stops instead of writing against a changed schema | Calibre's Kobo driver stops database writes on an unknown database version ([Launchpad #2064546, 2024](https://bugs.launchpad.net/calibre/+bug/2064546)); Toltec refuses unsupported OS versions ([remarkable.guide](https://remarkable.guide/faqs.html)); BepInEx refuses a plugin whose dependency range fails ([BepInDependency](https://docs.bepinex.dev/api/BepInEx.BepInDependency.html)) |
| Device adapter and provider interfaces | Anti-corruption layer ([Azure Architecture Center, 2026-05-28](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer)); Home Assistant keeps device communication in a separate library ([HA contributing](https://developers.home-assistant.io/docs/core/integration/contributing_to_core)) |
| Firmware watch on upstream change | Contract tests run on the schedule of the external service's changes ([Fowler, 2011-01-12](https://martinfowler.com/bliki/ContractTest.html)) |
| Two-layer failures | RFC 9457 `detail` for the client, never debugging data ([rfc9457](https://www.rfc-editor.org/rfc/rfc9457.html)); anyhow cause chains ([docs.rs](https://docs.rs/anyhow/latest/anyhow/)); Home Assistant Repairs: translated text, severity, a stable id updated in place ([HA repairs](https://contributors.home-assistant.io/core/integrations/repairs/)) |
| One owner per value across languages | Style Dictionary, one token source for every platform ([styledictionary.com](https://styledictionary.com/info/architecture/)); the repository's own `tokens.json` → `android-tokens.cjs` |

## Where it diverges

- **No fallback anywhere** is right for Supernote internals and wrong for outside services. Owner
  decision, 2026-11-25: no fallback for a device internal (the module stops and says so); outside
  services keep a second source (offline then online dictionary, a second translator).
- **Trigger on firmware only** is too narrow: the descriptor tracks vendor app versions apart from
  the firmware, and a plugin may never see a «first start».
- **Four hand-written registry readers** contradict the repository's own token pipeline.
- **A probe for every item** is not always possible without side effects: Digest has no safe test
  write.
- Pact-style consumer contracts do not apply to a provider we do not control ([docs.pact.io](https://docs.pact.io/getting_started/what_is_pact_good_for)).

## Improvements adopted into the plans

Recorded on [#293](https://github.com/martonpaulo/ink-tools/issues/293) and [#294](https://github.com/martonpaulo/ink-tools/issues/294):

1. One JSON Schema for the registry; TypeScript, Java, Python and Swift readers generated with a
   staleness `--check`.
2. The watch keys on an environment fingerprint (`Build.FINGERPRINT`, every vendor app's
   `versionCode`, the registry version), never on a version gate.
3. Per-item status `ok / broken / unprobed`; an unprobed item records its reason and accepted risk;
   high-impact items add a read round-trip on a known row.
4. A data kill switch per module, with a review date ([Fowler and Hodgson on toggles, 2017-10-09](https://martinfowler.com/articles/feature-toggles.html)).
5. One failure value: code (the registry id), severity, user copy key, detail, cause chain,
   context; one card per watch run, updated by a stable id.
6. A compatibility table per fingerprint, generated from the watch.
7. Recorded fixtures per fingerprint, run in CI against the adapters.
8. Registry fields `evidence`, `upgradePath`, `lastVerified`, `publicApiRequest`, and a ratchet per
   level.
9. A boundary denylist of vendor names with the registry as the allowlist.
10. The watch runs in the Ink Tools Helper app and on `inkctl` connect.

## Risks to avoid

Probes that change vendor data; schema probes that miss a change of meaning; version gating coming
back through the descriptor's version labels; the registry as a god object (keep it data only, split
by module); probe cost on e-ink at start; kill switches left off forever; one card per item; mocks
standing in for the real device.

## Uncertain

Whether Supernote vendor apps update apart from the firmware; whether a sideloaded app may run at
boot on this firmware; the current upper bound of Toltec's compatibility.
