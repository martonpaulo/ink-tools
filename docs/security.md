# Security

The monorepo's security rules that every subproject shares. Ink2Pic's answer to each item of the
application-security standard is in [`plugins/ink2pic/docs/security.md`](../plugins/ink2pic/docs/security.md).

## Dependency audit

The weekly `Scan` workflow runs [`scripts/npm_audit.py`](../scripts/npm_audit.py) in every plugin and
in `packages/`. It runs `npm audit --omit=dev` and fails on every advisory, whatever its severity,
except the ones [`audit-exceptions.json`](../audit-exceptions.json) names
([#154](https://github.com/martonpaulo/ink-tools/issues/154)).

- A dependency gets fixed by an upgrade first: a patch release, then an `overrides` entry, only when
  React Native 0.79.2 and the build stay unchanged. PluginHost on the tablet fixes that React Native
  version.
- An exception is allowed only when no fixed version fits React Native 0.79.2. It names one advisory
  and the package it reaches, with its reason.
- Every exception today is in the React Native build tooling (the CLI and Metro). That code runs on
  the developer's machine and in CI on the project's own files. It is never packaged in a `.snplg`
  and never runs on the tablet.
- Remove an exception as soon as a fix fits. When React Native moves past 0.79.2, re-run the audit
  and remove each entry it no longer reports.

To check one subproject on the Mac:

```bash
python3 scripts/npm_audit.py plugins/word-lookup
```

## Android signing keys

The Ink Tools bridge prerelease signs its APK with one stable key, so each build updates the last
one on the tablet ([#223](https://github.com/martonpaulo/ink-tools/issues/223)). The rule and the fallback are in
[`apps/inktools-bridge/AGENTS.md`](../apps/inktools-bridge/AGENTS.md#versioning-and-signing).

- The keystore and its password are two repository secrets, `INKTOOLS_BRIDGE_KEYSTORE_BASE64` and
  `INKTOOLS_BRIDGE_KEYSTORE_PASSWORD`. Only `prerelease-inktools-bridge.yml` reads them, in the
  env of its build step. It runs on a push to `main` or by hand, never on a pull request, so a
  fork never reaches them. No validate workflow reads a stored secret.
- The keystore is decoded under `RUNNER_TEMP`, outside the checkout, and removed after the build.
  The password reaches apksigner by variable name, never on a command line or in the log.
- It is a test key for a sideloaded developer app, not a release key. A leaked key lets someone
  sign an APK that updates the bridge, which still needs `adb` on the tablet. To rotate it, make a
  new keystore, set both secrets again and uninstall the bridge once on the tablet.
- The Lingo app has no prerelease: its CI build is never installed, so its per-run debug key needs
  no secret.
