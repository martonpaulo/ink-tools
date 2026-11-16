<div align="center">

# inkctl

Let an agent control a Supernote e-ink tablet over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root.

[![Validate](https://img.shields.io/github/actions/workflow/status/martonpaulo/supernote-tools/validate-inkctl.yml?branch=main&style=flat&labelColor=30363d&label=validate)](https://github.com/martonpaulo/supernote-tools/actions/workflows/validate.yml)

</div>

**One command, `inkctl`, reaches the tablet the way a program calls an API.** Direct calls come first: Android intents, broadcasts, content providers and files. Element references from a screen snapshot come next, and coordinates are the last resort.

**This is an unofficial project.** It is not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its owner and is used here only to name the device. These were checked on a Manta (A5 X2) with firmware 3.31.45: the commands that only read, `click`, `note open`, `note new`, `files push`, `sync tasks`, `snapshot --all` and the refusal of a stale reference. The other commands that change the tablet are covered by contract tests and still wait for a check on a device. Other models and firmware can differ.

---

<br />

## 🌱 Quick Start

Needs Python 3.9 or later, `adb` on your `PATH`, and Sideloading turned on in the tablet's settings ([how](docs/research/2026-11-adb-on-supernote.md#steps)).

```bash
git clone https://github.com/martonpaulo/supernote-tools
ln -s "$PWD/supernote-tools/cli/inkctl/src/inkctl" ~/.local/bin/inkctl
export SUPERNOTE_ADDRESS=192.0.2.10
inkctl wifi on     # over USB; a restart of the tablet turns it off
inkctl status
inkctl wifi off    # when the work ends
```

Keep the address in `~/.config/inkctl/address` instead of the variable, if you prefer.

The command was called `snadb` until 2026-11-16 ([#173](https://github.com/martonpaulo/supernote-tools/issues/173)). `src/snadb` still runs `inkctl`, after one line that asks for the new name, and an address in `~/.config/snadb/address` is still read.

<br />

## 🛠 Commands

| Command | What it does |
| :--- | :--- |
| `make validate` | Runs the full gate: text, duplication and the command's contract tests. |
| `inkctl --help` | Lists every command and exit code. |
| `inkctl status` | Shows connection, firmware, screen size, battery, the app in front and that Wi-Fi ADB is on. |
| `inkctl firmware` | Shows the installed and the newest official firmware. `--download` copies the newest one to `EXPORT`, after the checks it names. The tablet's build id holds no public version, so pass `--installed X.Y.Z` from Settings > About. |
| `inkctl routes [PACKAGE]` | Lists, read-only, each exported entry point with its filters and permission, and which job each route does. |
| `inkctl doctor` | Checks, read-only, that each call this command makes still exists. Run it after a firmware update. |
| `inkctl note open PATH --page N` | Opens a note at a page, counted from 1. |
| `inkctl note new PATH` | Creates a blank portrait note and opens it. It never replaces a file. |
| `inkctl files ls\|pull\|push` | Lists and copies files. A push never replaces a file without `--overwrite`. |
| `inkctl sync tasks` | Starts a To-do sync and waits until it has run. |
| `inkctl sync calendar` | Asks the Calendar app to sync. The app must be open, and the answer does not prove a sync ran. |
| `inkctl screen FILE.png` | Saves what the screen shows. |
| `inkctl snapshot` | Lists the screen's elements with short references, marks each list that can scroll, and gives a paged screen's page and page count. `--all` reads each list and page to its end. `--find X` scrolls or turns pages until an element appears. After turning pages it does not return to the first page yet: take a new snapshot. |
| `inkctl click TARGET` | Presses `@eN` from the last snapshot, or `id:X`, `desc:X`, `text:X`. |
| `inkctl wait activity\|file\|element X` | Waits for a condition, with a time limit. |
| `inkctl apps` | Lists installed packages. |
| `inkctl plugin ls\|push` | Lists plugins, or copies one to `MyStyle`. The install is then done on the tablet. |
| `inkctl plugin install FILE.snplg` | Copies a plugin, installs or updates it through named elements, and proves it from the plugin list. |
| `inkctl logs` | Shows the recent device log with credentials masked. It filters by time, level, package, process and text, follows new lines with a time limit, and shows only what is new with `--since-last`. `--plugin NAME` keeps one plugin's lines and every denied permission. |
| `inkctl history` | Reads what this command did: `--failures`, `--command NAME`, `--since 2h`. |
| `inkctl tap\|swipe` | Presses by coordinates, the last resort. |
| `inkctl wifi on` | Over the USB cable, turns Wi-Fi ADB on (`adb tcpip 5555`) and connects to it. |
| `inkctl wifi off` | Turns Wi-Fi ADB off when the work ends, and says how to turn it on again. Off is the safe state: leave Wi-Fi ADB off when no work runs. |
| `inkctl secret set PROVIDER` | Writes a sign-in secret for the Bridge plugin (`todoist`, `icloud` or `google`) from standard input, into Bridge's private plugin folder. The value never goes into an argument, the log or the history; only its last 4 characters are shown. Not yet run on the tablet ([#116](https://github.com/martonpaulo/ink-tools/issues/116)). |
| `inkctl secret remove PROVIDER` | Signs Bridge out of a provider by deleting its secret. |
| `inkctl secret status` | Says which providers have a secret, with only its last 4 characters. |
| `inkctl shell COMMAND...` | Runs a command on the tablet. |

`--read-only` or `SUPERNOTE_READ_ONLY` refuses every command that changes the tablet. `files pull` and `screen` refuse the notes folder and a note on the screen unless you pass `--allow-notes`.

Every command takes `--json`. A failure in JSON has `cause` and `next`, the next command to try. `--trace` prints each ADB call to stderr as it runs.

<br />

## 🔐 Secrets and variables

The command stores no secret of its own. `inkctl secret set` passes a Bridge sign-in secret from
standard input to the tablet and keeps no copy.

| Name | Where | What for |
| :--- | :--- | :--- |
| `SUPERNOTE_ADDRESS` | environment | The tablet's address. It wins over the file below. |
| `SUPERNOTE_READ_ONLY` | environment | When set, refuses every command that changes the tablet. |
| `~/.config/inkctl/address` | your computer | The tablet's address, on its first line. |

---

<br />

## Scope

[`docs/product.md`](docs/product.md) says what belongs here and what never will. [`docs/research/`](docs/research/) holds the notes behind it.

---

<br />

## Limitations

- **Turned on by hand.** Wi-Fi ADB needs one USB command, and again after each restart of the tablet.
- **A sleeping tablet may not answer.** With the global setting `wifi_sleep_policy` at `2`, a Manta on firmware 3.31.45 kept answering while asleep for the 15 minutes measured, and lost 1% of battery with one port check a minute. A longer sleep is not measured. The error says whether the tablet is asleep, restarted, or off the network, and names what restores it. A stale local `adb` server is restarted by the command when the port still answers.
- **Installing a plugin uses the tablet's screen.** The platform offers no other route, so the install presses named elements and stops on a screen it does not expect.
- **Files sync by themselves.** On firmware 3.31.45 the tablet's own watcher picks up a copied file, and Android refuses the app's sync broadcast from ADB, so there is no `sync file` command.
- **Private interfaces.** The intents and broadcasts are not documented by Ratta. A firmware update can change them, so run `inkctl doctor` after one. It proves a call exists, not that it still works.
- **ADB has wide access.** ADB accepts only computers the tablet has authorized. One of those computers can read and delete every note, and Wi-Fi mode opens a port on your network until `inkctl wifi off`. See [`SECURITY.md`](SECURITY.md).

<br />

## License

[MIT](LICENSE) © 2026 Marton Paulo.
