# Security

The monorepo's security rules that every subproject shares. Ink2Pic's answer to each item of the
application-security standard is in [`plugins/ink2pic/docs/security.md`](../plugins/ink2pic/docs/security.md).

## Dependency audit

The weekly `Scan` workflow runs [`scripts/npm_audit.py`](../scripts/npm_audit.py) in every plugin and
in `packages/`. It runs `npm audit --omit=dev` and fails on every advisory, whatever its severity,
except the ones [`audit-exceptions.json`](../audit-exceptions.json) names
([#154](https://github.com/martonpaulo/supernote-tools/issues/154)).

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
python3 scripts/npm_audit.py plugins/lookup
```
