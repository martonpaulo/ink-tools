<div align="center">

# Supernote ADB

Let an agent control a Supernote e-ink tablet over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root.

[![Validate](https://img.shields.io/github/actions/workflow/status/martonpaulo/supernote-adb/validate.yml?branch=main&style=flat&labelColor=30363d&label=validate)](https://github.com/martonpaulo/supernote-adb/actions/workflows/validate.yml)

</div>

**One command, `supernote`, reaches the tablet the way a program calls an API.** Direct calls come first: Android intents, broadcasts, content providers and files. Element references from a screen snapshot come next, and coordinates are the last resort.

**This is an unofficial project.** It is not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its owner and is used here only to name the device. The commands that only read and `click` were checked on a Manta (A5 X2) with firmware 3.31.45. The other commands that change the tablet are covered by contract tests and still wait for a check on a device. Other models and firmware can differ.

---

<br />

## 🌱 Quick Start

Needs Python 3.9 or later, `adb` on your `PATH`, and Sideloading turned on in the tablet's settings ([how](docs/research/2026-11-adb-on-supernote.md#steps)).

```bash
git clone https://github.com/martonpaulo/supernote-adb
ln -s "$PWD/supernote-adb/src/supernote" ~/.local/bin/supernote
adb tcpip 5555    # once, over USB; a restart of the tablet turns it off
export SUPERNOTE_ADDRESS=192.0.2.10
supernote status
```

Keep the address in `~/.config/supernote-adb/address` instead of the variable, if you prefer.

<br />

## 🛠 Commands

| Command | What it does |
| :--- | :--- |
| `make validate` | Runs the full gate: text, duplication and the command's contract tests. |
| `supernote --help` | Lists every command and exit code. |
| `supernote status` | Shows connection, firmware, screen size, battery and the app in front. |
| `supernote note open PATH --page N` | Opens a note at a page, counted from 1. |
| `supernote note new PATH` | Creates a blank portrait note and opens it. It never replaces a file. |
| `supernote files ls\|pull\|push` | Lists and copies files. A push never replaces a file without `--overwrite`. |
| `supernote sync file PATH` | Asks the tablet to sync one file. |
| `supernote sync tasks\|calendar` | Asks the To-do or the Calendar app to sync. |
| `supernote screen FILE.png` | Saves what the screen shows. |
| `supernote snapshot` | Lists the screen's elements with short references. |
| `supernote click TARGET` | Presses `@eN` from the last snapshot, or `id:X`, `desc:X`, `text:X`. |
| `supernote wait activity\|file\|element X` | Waits for a condition, with a time limit. |
| `supernote apps` | Lists installed packages. |
| `supernote plugin ls\|push` | Lists plugins, or copies one to `MyStyle`. The install is then done on the tablet. |
| `supernote logs` | Shows the recent device log with credentials masked. |
| `supernote tap\|swipe` | Presses by coordinates, the last resort. |
| `supernote shell COMMAND...` | Runs a command on the tablet. |

Every command takes `--json`.

<br />

## 🔐 Secrets and variables

The command reads no secret.

| Name | Where | What for |
| :--- | :--- | :--- |
| `SUPERNOTE_ADDRESS` | environment | The tablet's address. It wins over the file below. |
| `~/.config/supernote-adb/address` | your computer | The tablet's address, on its first line. |

---

<br />

## Scope

[`docs/product.md`](docs/product.md) says what belongs here and what never will. [`docs/research/`](docs/research/) holds the notes behind it.

---

<br />

## Limitations

- **Turned on by hand.** Wi-Fi ADB needs one USB command, and again after each restart of the tablet.
- **Installing a plugin needs the tablet's screen.** The platform offers no other route.
- **`supernote sync tasks` fails.** Android refuses that broadcast from ADB ([details](https://github.com/martonpaulo/supernote-adb/issues/11)).
- **Private interfaces.** The intents and broadcasts are not documented by Ratta. A firmware update can change them.
- **ADB has wide access.** A computer you authorize can read and delete every note, and Wi-Fi mode opens a port on your network. See [`SECURITY.md`](SECURITY.md).

<br />

## License

[MIT](LICENSE) © 2026 Marton Paulo.
