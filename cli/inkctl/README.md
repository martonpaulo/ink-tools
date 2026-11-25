<div align="center">

# inkctl

Let an agent control a Supernote e-ink tablet over Wi-Fi ADB with direct calls, JSON answers and stable exit codes, without root.

[![Validate](https://img.shields.io/github/actions/workflow/status/martonpaulo/ink-tools/validate-inkctl.yml?branch=main&style=flat&labelColor=30363d&label=validate)](https://github.com/martonpaulo/ink-tools/actions/workflows/validate-inkctl.yml)

</div>

**One command, `inkctl`, reaches the tablet the way a program calls an API.** Direct calls come first: Android intents, broadcasts, content providers and files. Element references from a screen snapshot come next, and coordinates are the last resort.

**This is an unofficial project.** It is not affiliated with or endorsed by Ratta. "Supernote" is a trademark of its owner and is used here only to name the device. These were checked on a Manta (A5 X2) with firmware 3.31.45: the commands that only read, `click`, `note open`, `note new`, `files push`, `sync tasks`, `snapshot --all` and the refusal of a stale reference. The other commands that change the tablet are covered by contract tests and still wait for a check on a device. Other models and firmware can differ.

---

<br />

## 🌱 Quick Start

Needs Python 3.9 or later, `adb` on your `PATH`, and Sideloading turned on in the tablet's settings ([how](docs/research/2026-11-adb-on-supernote.md#steps)).

```bash
git clone https://github.com/martonpaulo/ink-tools
ln -s "$PWD/ink-tools/cli/inkctl/src/inkctl" ~/.local/bin/inkctl
export SUPERNOTE_ADDRESS=192.0.2.10
inkctl wifi on     # over USB; a restart of the tablet turns it off
inkctl status
inkctl wifi off    # when the work ends
```

Keep the address in `~/.config/inkctl/address` instead of the variable, if you prefer.

When one authorized tablet is attached by USB, every command goes over the cable, even with an address recorded and with the tablet's Wi-Fi off; no address is needed then. Without a cable, or with two USB devices, commands go over Wi-Fi ADB. `inkctl status` names the link.

The command was called `snadb` until 2026-11-16 ([#173](https://github.com/martonpaulo/supernote-tools/issues/173)). `src/snadb` still runs `inkctl`, after one line that asks for the new name, and an address in `~/.config/snadb/address` is still read.

<br />

## 🛠 Commands

| Command | What it does |
| :--- | :--- |
| `make validate` | Runs the full gate: text, duplication and the command's contract tests. |
| `inkctl --help` | Lists every command and exit code. |
| `inkctl status` | Shows connection, firmware, screen size, battery, the app in front, the link in use (`usb` or `wifi`) and whether Wi-Fi ADB is on. |
| `inkctl firmware` | Shows the installed and the newest official firmware. `--download` copies the newest one to `EXPORT`, after the checks it names. The tablet's build id holds no public version, so pass `--installed X.Y.Z` from Settings > About. |
| `inkctl routes [PACKAGE]` | Lists, read-only, each exported entry point with its filters and permission, and which job each route does. |
| `inkctl doctor` | Checks, read-only, that each call this command makes still exists. Run it after a firmware update. |
| `inkctl note open PATH --page N` | Opens a note at a page, counted from 1. The note app ignores the page for a note it opened before, so with `--page` it then presses the Probe's «Run Command» to jump to the page, then reads the page counter «N / total» on the screen, and fails with exit 9 and the page the note shows when they differ ([#220](https://github.com/martonpaulo/ink-tools/issues/220)). |
| `inkctl fixture NAME` | Opens the test fixtures note, `Note/Tests/Fixtures.note`, at that fixture's page and proves the page the same way. `--lasso ITEM` then lassoes one of the fixture's rects, as `lasso rect` does. `fixture --list` prints each fixture's page, rects and the issues it serves, from the one table in `src/inkctl` (`FIXTURES`), with no tablet. The command never creates the note: when it is missing, it says so and links the [page map](https://github.com/martonpaulo/ink-tools/issues/214#issuecomment-6936338459). |
| `inkctl note new PATH` | Creates a blank portrait note and opens it. It never replaces a file. |
| `inkctl files ls\|pull\|push` | Lists and copies files. A push never replaces a file without `--overwrite`. |
| `inkctl font install FILE...` | Copies `.ttf` or `.otf` fonts to `MyStyle/fonts`, where the Note app's text-box font menu reads them, and never replaces one without `--overwrite`. The menu lists each file by its name without the extension, after it is closed once or the Note app restarts ([#247](https://github.com/martonpaulo/ink-tools/issues/247)). |
| `inkctl font list\|remove NAME` | Lists the installed fonts by the menu's name, or removes one; `remove` only names the files until it gets `--yes`. |
| `inkctl sync tasks` | Starts a To-do sync and waits until it has run. |
| `inkctl sync calendar` | Asks the Calendar app to sync. The app must be open, and the answer does not prove a sync ran. |
| `inkctl lasso rows` | Opens the lasso «⋯» list when it is closed and reads every row once, in list order. It swipes only inside the list's own bounds, read again before each swipe, because the list moves with the lasso. |
| `inkctl lasso press ROW` | Opens the list, scrolls inside it until the named row shows whole, and presses it. Without a lasso toolbar both stop before any press (exit 9); a row that is not in the list exits 4. |
| `inkctl lasso rect X Y W H` | Lassoes that page rectangle with no pen, through the «Run Command» button of the Probe plugin, which must be installed with its file permissions on «Always Allow». |
| `inkctl lasso last-insert` | Lassoes the page's last element, such as the ink `ink write` just put there or a picture another plugin inserted. |
| `inkctl ink write TEXT --at X Y` | Writes the text as synthetic pen strokes (lowercase letters, digits and the Portuguese and Spanish accents), its top-left corner at `X Y` and its x-height `--size` px. Only on a note under `Note/Tests/`, unless `--allow-notes`. Whether handwriting recognition reads these strokes is measured in `docs/supernote.md`. |
| `inkctl ink strokes FILE --at X Y` \| `ink save FILE` | Inserts a saved stroke sample, or saves the lassoed strokes as one, so a round can replay real handwriting. |
| `inkctl lang get\|set CODE\|cycle` | Reads or switches the handwriting recognition language of the whole tablet. `set` refuses a pack that is not installed, writes the new code file before it deletes the old one, tells the system with `hw_type_change` and reads the folder back. `cycle` goes `pt_BR`, `en_US`, `es_ES` among the installed packs. |
| `inkctl screen FILE.png` | Saves what the screen shows. |
| `inkctl snapshot` | Lists the screen's elements with short references, marks each list that can scroll, and gives a paged screen's page and page count. `--all` reads each list and page to its end. `--find X` scrolls or turns pages until an element appears. After turning pages it does not return to the first page yet: take a new snapshot. |
| `inkctl click TARGET` | Presses `@eN` from the last snapshot, or `id:X`, `desc:X`, `text:X`. |
| `inkctl wait activity\|file\|element X` | Waits for a condition, with a time limit. |
| `inkctl apps` | Lists installed packages. |
| `inkctl plugin list\|push` | Lists plugins from PluginHost's content provider (`plugin ls` is the same), or copies one to `MyStyle`. |
| `inkctl plugin install FILE.snplg` | Copies a plugin, installs or updates it, and proves it from the plugin list: through the bridge app when it is installed (`"route": "bridge"`), else through named elements (`"route": "screen"`). |
| `inkctl plugin enable\|disable NAME` | Turns a plugin on or off through the Ink Tools bridge app ([`apps/inktools-bridge/`](../../apps/inktools-bridge/)), and proves it from the plugin list. Without the bridge app it stops with exit code 14. Not yet run on the tablet ([#215](https://github.com/martonpaulo/ink-tools/issues/215)). |
| `inkctl plugin allow NAME [PERM...]` | Sets the named permissions, by default every one the plugin uses, to «Always Allow» (status 2) through the bridge app, and proves each from the single-plugin row's `usesPermissions`. Not yet run on the tablet ([#215](https://github.com/martonpaulo/ink-tools/issues/215)). |
| `inkctl plugin permissions NAME [always]` | Opens Settings › Apps › Plugins › the plugin › Permissions through named elements and lists each permission and its state. With `always`, it sets each permission the page lists to «Allow» and reads the states back. `NAME` is the name the plugin list shows, its `pluginKey` or its `pluginID`. The texts of these screens are not measured on the tablet yet ([#191](https://github.com/martonpaulo/ink-tools/issues/191)). |
| `inkctl plugin uninstall NAME` | Uninstalls a plugin through the bridge app when it is installed, else from its Settings page through named elements, presses the confirmation only after it reads «Its data will also be deleted», and proves the uninstall from the plugin list. The plugin's data on the tablet is deleted. Not yet run on the tablet ([#191](https://github.com/martonpaulo/ink-tools/issues/191)). |
| `inkctl logs` | Shows the recent device log with credentials masked. It filters by time, level, package, process and text, follows new lines with a time limit, and shows only what is new with `--since-last`. `--plugin NAME` keeps one plugin's lines and every denied permission: `NAME` is the name the plugin list shows, its `pluginKey` or its `pluginID`. A plugin logs under the tag `ReactNativeJS`, not its own name, so `--tag` with a plugin's name finds nothing and says to use `--plugin`. |
| `inkctl history` | Reads what this command did: `--failures`, `--command NAME`, `--since 2h`. |
| `inkctl tap\|swipe` | Presses by coordinates, the last resort. |
| `inkctl wifi on` | Over the USB cable, turns Wi-Fi ADB on (`adb tcpip 5555`) and connects to it. |
| `inkctl wifi off` | Turns Wi-Fi ADB off over the cable, which keeps working after it, and says how to turn it on again. With no cable it refuses, unless `--leave-unreachable` says the work has ended. Off is the safe state: leave Wi-Fi ADB off when no work runs. |
| `inkctl secret set PROVIDER` | Writes a sign-in secret for the Bridge plugin (`todoist`, `icloud` or `google`) from standard input, or, for `google-client`, the «Desktop app» OAuth client's `client_id` and `client_secret` from the login Keychain item that `google login` reads ([#200](https://github.com/martonpaulo/ink-tools/issues/200)), as a one-shot drop file in `/storage/emulated/0/.data/plugin/inktools-account-sync/`: `adb` cannot write Bridge's private plugin folder, so Account Sync moves the value there and deletes the drop file on its next start or «Sync now». The value never goes into an argument, the log or the history; only its last 4 characters are shown. Not yet run on the tablet ([#116](https://github.com/martonpaulo/ink-tools/issues/116)). |
| `inkctl secret remove PROVIDER` | Takes back a drop file Account Sync has not taken yet. A secret already moved in is signed out in Account Sync Settings. |
| `inkctl secret status` | Says which providers have a drop file waiting, with only its last 4 characters. |
| `inkctl google login` | Signs Account Sync in to Google Calendar in this Mac's browser, with Google's installed-app flow: a redirect to `127.0.0.1`, `state` and PKCE, scopes `calendar.readonly` and `calendar.events`. It reads the «Desktop app» client from the login Keychain and stores the refresh token there, and prints only the token's length and the command that sends it to the tablet through `inkctl secret set google`. The browser then shows a success or failure page ([#124](https://github.com/martonpaulo/ink-tools/issues/124)). |
| `inkctl shell COMMAND...` | Runs a command on the tablet. |

`--read-only` or `SUPERNOTE_READ_ONLY` refuses every command that changes the tablet. `files pull` and `screen` refuse the notes folder and a note on the screen unless you pass `--allow-notes`. Test notes under `Note/Tests/` need no flag: a pull of a path inside that folder, and a capture when the title the note shows names a note there and no note outside it.

Every command takes `--json`. A failure in JSON has `cause` and `next`, the next command to try. `--trace` prints each ADB call to stderr as it runs.

<br />

## 🔐 Secrets and variables

`inkctl secret set` passes a Bridge sign-in secret from standard input to the tablet and keeps no
copy. `inkctl google login` keeps the Google sign-in in the login Keychain, service `ink-tools`.

| Name | Where | What for |
| :--- | :--- | :--- |
| `SUPERNOTE_ADDRESS` | environment | The tablet's address. It wins over the file below. |
| `SUPERNOTE_READ_ONLY` | environment | When set, refuses every command that changes the tablet. |
| `INKCTL_BROWSER` | environment | A program that `google login` runs with the consent address, instead of the system browser. The tests set it to a stub. |
| `~/.config/inkctl/address` | your computer | The tablet's address, on its first line. |
| `account-sync-google-oauth-client` | login Keychain, service `ink-tools` | The JSON of the Google OAuth client of type «Desktop app», which `google login` reads. |
| `account-sync-google-refresh-token` | login Keychain, service `ink-tools` | The Google refresh token `google login` writes. While the consent screen is in «Testing», it lasts 7 days. |

---

<br />

## Scope

[`docs/product.md`](docs/product.md) says what belongs here and what never will. [`docs/research/`](docs/research/) holds the notes behind it.

---

<br />

## Limitations

- **Turned on by hand.** Wi-Fi ADB needs one USB command, and again after each restart of the tablet.
- **A sleeping tablet may not answer.** With the global setting `wifi_sleep_policy` at `2`, a Manta on firmware 3.31.45 kept answering while asleep for the 15 minutes measured, and lost 1% of battery with one port check a minute. A longer sleep is not measured. The error says whether the tablet is asleep, restarted, or off the network, and names what restores it. A stale local `adb` server is restarted by the command when the port still answers.
- **A locked tablet is not tested.** The owner runs the tablet with no lock code, so what `input keyevent WAKEUP` and `screencap` do behind a lock screen is not known. The command never bypasses a lock code or PIN.
- **Changing a plugin needs the Ink Tools bridge app, or the screen.** `adb` cannot call PluginHost's settings service, so a small sideloaded app does ([#215](https://github.com/martonpaulo/ink-tools/issues/215)). With it, `plugin install` and `plugin uninstall` touch no screen (`"route": "bridge"`), and `enable`, `disable` and `allow` work; without it, the install, the permissions and the uninstall press named elements and stop on a screen they do not expect. The bridge route is not yet run on the tablet.
- **Files sync by themselves.** On firmware 3.31.45 the tablet's own watcher picks up a copied file, and Android refuses the app's sync broadcast from ADB, so there is no `sync file` command.
- **Private interfaces.** The intents and broadcasts are not documented by Ratta. A firmware update can change them, so run `inkctl doctor` after one. It proves a call exists, not that it still works.
- **ADB has wide access.** ADB accepts only computers the tablet has authorized. One of those computers can read and delete every note, and Wi-Fi mode opens a port on your network until `inkctl wifi off`. See [`SECURITY.md`](SECURITY.md).

<br />

## Device rounds

Notes for an agent that drives the tablet in a test round, learned in the rounds of 2026-11-16 and 2026-11-17 ([#214](https://github.com/martonpaulo/ink-tools/issues/214)):

- **Name the device for raw `adb`.** With the USB cable and Wi-Fi ADB both attached, `adb` refuses a call with more than one device; pass `-s <serial>`. `inkctl` picks the link itself.
- **Query the Calendar provider with a projection and a filter.** A plain `adb shell content query` of `content://com.ratta.supernote.calendar.provider/data_info` was reported to fail with a `NullPointerException` in `setNotificationUri` (not re-measured); the form with `--projection` and `--where` returned rows ([#43](https://github.com/martonpaulo/ink-tools/issues/43)).
- **Test with real handwriting and no pen.** Copy a word the owner wrote on a note under `Note/Tests/` to the test page (for example `ink save`, then `ink strokes`), lasso it with `lasso last-insert`, and press rows with `lasso press` ([#148](https://github.com/martonpaulo/ink-tools/issues/148), [#189](https://github.com/martonpaulo/ink-tools/issues/189)). A ready word, picture or blank page is one call away: `fixture NAME --lasso ITEM` ([#220](https://github.com/martonpaulo/ink-tools/issues/220)).
- **Delete the older build.** Each install leaves its `.snplg` in `MyStyle/`; delete the older build after a newer one is installed.
- **Stop each log capture by its PID.** Capture the PID of every `adb logcat` you start and stop that PID, never a name pattern.
- **Read a log from your own start line.** `adb shell logcat -c` did not always clear the buffer, and `logcat -d -T` with the device's time printed nothing in a script; read the whole buffer and filter by text, from the line your step logged first.
- **Wake the tablet before each step.** It sleeps between long steps and a press then does nothing; send `input keyevent 224` first. After `inkctl wifi on`, wait for the device: USB answers «device not found» for a few seconds while adbd restarts.
- **Parse `content query` rows with free text last.** A column can hold commas, so put the free-text column last in `--projection`.
- **Keep the fixtures note.** `Note/Tests/Fixtures.note` holds one fixture per page, copied from the owner's real handwriting with no pen; never delete it. Its pen steps left are «coffee» on page 5 and a small drawing on page 9 ([#148](https://github.com/martonpaulo/ink-tools/issues/148), [#214](https://github.com/martonpaulo/ink-tools/issues/214)).
- **Wait about 4 s after a page jump.** The next press of the plugins button after `jumpToPage` is lost; 1.5 s is too short on a page with a picture.
- **Lasso again before a press.** A Probe command run after a Word Lookup or Device Transfer insert clears the inserted picture's lasso; lasso it by its rect before `lasso press`.
- **Know which helper holds Plugin Diagnostics' `pluginID`.** `fixture` and `ink write` press Plugin Diagnostics' «Run Command», so they fail with `text:Run Command is not on the screen` while the Probe helper is installed in its place. With Probe, insert synthetic text as a Probe `strokes` command from `text_strokes(text, left, top, size)` in `src/inkctl`, loaded with `importlib`'s `SourceFileLoader`.
- **Expect a slow `lasso press`.** It scrolls the «⋯» list from the top, so a press takes 30 to 60 s with about 40 rows, every Ink Tools plugin on.
- **Close a plugin's Settings view first.** It stays over Settings after `am force-stop com.ratta.settings`, and `plugin install`'s screen path then fails with `text:Apps is not on the screen`; Back closes it.
- **Read the detail page's title before a tap.** A plugin with no config button has «Uninstall» where another plugin has «Settings»; read `plugin_detail_title` first.
- **Test another permission state through the bridge.** `plugin allow` always writes status 2. Send the bridge `allow` with `--ei status 0` (or 1, -1) for one permission, read it back from `content://com.ratta.supernote.pluginhost/plugins/<id>`, then restore with `inkctl plugin allow <id>`.
- **Read the plugin list after a bridge `failed`.** An install can land while the callback fails ([#225](https://github.com/martonpaulo/ink-tools/issues/225)); `plugin list` is the proof.
- **Run one session per tablet.** Two agents on the tablet at once gave phantom page changes and Settings windows over the note (2026-11-17).

<br />

## License

[MIT](LICENSE) © 2026 Marton Paulo.
