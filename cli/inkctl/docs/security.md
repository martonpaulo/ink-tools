# Security items

One row per item of the Skill Deck application-security standard. This project is a local command with no server, database, account or web interface.

| # | Item | Applies | Status | Evidence | Smallest fix |
| --- | --- | --- | --- | --- | --- |
| 1 | No hard-coded key | Yes: any repository could hold one | Met | the command reads no key; the pre-commit scanner runs on each commit | None |
| 2 | No secret in Git history | Yes | Met | fresh history; `history_scan.py` before publication | None |
| 3 | No privileged key in a client | No client and no key | Not applicable | local command only | None |
| 4 | A public database key reaches only what row-level security allows | No database | Not applicable | the snapshot file has mode 600 instead | None |
| 5 | Row-level security on every table with personal data | No database | Not applicable | the snapshot file has mode 600 instead | None |
| 6 | No open policy in a multi-tenant project | No database and no tenants | Not applicable | one user on one computer | None |
| 7 | Least privilege for every role and service | Yes: the ADB session | Met | runs as the `shell` user, with no root (`docs/product.md`); `files pull` and `screen` refuse notes without `--allow-notes`, except test notes under `Note/Tests/`, proved by the path or by the title the note shows ([#193](https://github.com/martonpaulo/ink-tools/issues/193)) | None |
| 8 | No mass assignment | No stored objects from outside | Not applicable | no data layer | None |
| 9 | Parameterized queries | Yes: device shell commands | Met | paths and extras go through `shlex.quote` in `src/inkctl` | None |
| 10 | Validate every input from outside | Yes: arguments and device output | Met | suffix, selector and PNG checks, tested in `tests/inkctl.test.sh` | None |
| 11 | No sensitive screen without authentication | No screens | Not applicable | command line only; the Manta's ADB authorizes no computer (`ro.adb.secure` 0, [#1](https://github.com/martonpaulo/ink-tools/issues/1)), so Wi-Fi ADB stays off unless a round needs it | None |
| 12 | Validate the session on the server | No server | Not applicable | local command only | None |
| 13 | `HttpOnly`, `Secure` and `SameSite` cookies | No cookies | Not applicable | local command only | None |
| 14 | Hashed passwords and limited sign-in attempts | No sign-in | Not applicable | local command only | None |
| 15 | HTTPS everywhere | ADB is not HTTP | Not applicable | Wi-Fi ADB exposure is stated in `SECURITY.md` | None |
| 16 | Security headers | No web responses | Not applicable | local command only | None |
| 17 | Rate limits on AI routes and sensitive endpoints | No endpoints | Not applicable | local command only | None |
| 18 | Bot protection on public forms | No forms | Not applicable | local command only | None |
| 19 | Restricted uploads | Yes: `files push` and `plugin push` | Met | no replacement without `--overwrite`; size checked after the copy; `.snplg` required for a plugin | None |
| 20 | Trimmed API responses | No API | Not applicable | local command only | None |
| 21 | No leak in errors or logs | Yes: `logs` | Partial | a pattern masks values that look like credentials; a best effort stated in `SECURITY.md` | Extend the pattern when a new form appears |
| 22 | Check a package before installing it | No dependencies | Not applicable | Python standard library and `adb` only | None |
| 23 | Sensitive data encrypted at rest | Yes: the snapshot | Met | holds only positions and ids, mode 600, tested in `tests/inkctl.test.sh` | None |
| 24 | Audit row-level security before delivery | No database | Not applicable | the snapshot file has mode 600 instead | None |
