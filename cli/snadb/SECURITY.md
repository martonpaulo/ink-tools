# Security

Report a vulnerability through a [private security advisory](https://github.com/martonpaulo/supernote-tools/security/advisories/new). Do not open a public issue for it.

## What the command can reach

- ADB accepts only computers the tablet has authorized. An authorized computer can reach every file in the tablet's shared storage, including notes.
- Whether the tablet offers a way to revoke an authorized computer is not known yet.
- Wi-Fi ADB opens port 5555 on the network until the tablet restarts, or until `snadb wifi off`. Use it only on a network you trust.
- `snadb shell` runs any command the `shell` user may run.

## Limits inside the command

`--read-only` and the notes refusals guard against an agent's mistake. They do not protect against someone who already has the computer's ADB key.

## What it keeps

- The tablet's address, in a file you create.
- The last snapshot, with only positions and element ids, readable only by you, in `~/.cache/snadb/`.
- A record of each run, readable only by you and limited to about 1 MB, in `~/.cache/snadb/history.jsonl`. It holds the command's name, timings, exit codes and the app in front. It holds no note content, screen text, file content or credentials, and the address is masked. File paths are kept only with `--log-paths`.
- `snadb logs` masks values that look like credentials. The mask is a best effort, so read a log before you share it.
