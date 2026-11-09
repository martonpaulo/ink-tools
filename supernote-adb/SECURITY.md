# Security

Report a vulnerability through a [private security advisory](https://github.com/martonpaulo/supernote-adb/security/advisories/new). Do not open a public issue for it.

## What the command can reach

- ADB gives an authorized computer access to every file in the tablet's shared storage, including notes.
- Wi-Fi ADB opens port 5555 on the network until the tablet restarts. Use it only on a network you trust.
- `supernote shell` runs any command the `shell` user may run.

## What it keeps

- The tablet's address, in a file you create.
- The last snapshot, with only positions and element ids, readable only by you, in `~/.cache/supernote-adb/`.
- `supernote logs` masks values that look like credentials. The mask is a best effort, so read a log before you share it.
