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
| `inkctl batch FILE` | Runs a JSON list of steps through Probe in one push and one press: `{"steps": [{"do": "ink write", "text": "...", "at": [X, Y], "size": N}, {"do": "ink strokes", "file": "sample.json", "at": [X, Y]}, {"do": "lasso rect", "rect": [X, Y, W, H]}, {"do": "lasso last-insert"}]}`, at most 64 steps. Each step is checked as its own command checks it before anything is sent, and prints its own line. Probe stops at the first refused step; the failure names it and still prints the steps before it ([#286](https://github.com/martonpaulo/ink-tools/issues/286)). Not yet run on the tablet. |
| `inkctl note png PAGE LOCAL` | Saves the tablet's own PNG of a page of the open test note, through Probe, the reference the Ink Notebook Editor's reader is checked against ([#261](https://github.com/martonpaulo/ink-tools/issues/261)). It removes the tablet's copy. |
| `inkctl note insert-picture FILE` \| `note insert-text TEXT --at X Y --size W H` \| `note insert-page TEMPLATE --page N` | Places a picture, adds a text box or inserts a page with a system template on the open test note, through Probe, to make test notebooks ([#261](https://github.com/martonpaulo/ink-tools/issues/261)). |
| `inkctl note move-page PATH FROM TO [--template T]` | Moves a page of a closed test note through Probe's file API calls while another note is open: a new page at TO with the page's elements and template, then the old page removed. Built for the write-back measures of [#263](https://github.com/martonpaulo/ink-tools/issues/263); not yet run on the tablet. |
| `inkctl lang get\|set CODE\|cycle` | Reads or switches the handwriting recognition language of the whole tablet. `set` refuses a pack that is not installed, writes the new code file before it deletes the old one, tells the system with `hw_type_change` and reads the folder back. `cycle` goes `pt_BR`, `en_US`, `es_ES` among the installed packs. |
| `inkctl screen FILE.png` | Saves what the screen shows. |
| `inkctl snapshot` | Lists the screen's elements with short references, marks each list that can scroll, and gives a paged screen's page and page count. `--all` reads each list and page to its end. `--find X` scrolls or turns pages until an element appears. After turning pages it does not return to the first page yet: take a new snapshot. |
| `inkctl click TARGET` | Presses `@eN` from the last snapshot, or `id:X`, `desc:X`, `text:X`. |
| `inkctl wait activity\|file\|element X` | Waits for a condition, with a time limit. |
| `inkctl wait toast TEXT` | Catches a short on-screen message (a toast) that holds TEXT, in any case, and returns its text, package and event time. It reads the toast's accessibility event through `uiautomator events`, since logcat and `dumpsys notification` carry no toast text on Android 11, so it sees only toasts shown after it starts: start it in the background, then do the step that shows the message. That step is a `tap`: while the wait holds `uiautomator`, a `click` or `snapshot` cannot read the screen and fails with «no screen tree came back». Run on the Manta against Real-Time Conversion's «Real-Time Text on» and «off» toasts ([#297](https://github.com/martonpaulo/ink-tools/issues/297)). |
| `inkctl apps` | Lists installed packages. |
| `inkctl plugin list\|push` | Lists plugins from PluginHost's content provider (`plugin ls` is the same), or copies one to `MyStyle`. |
| `inkctl plugin install FILE.snplg` | Copies a plugin, installs or updates it, and proves it from the plugin list: through the bridge app when it is installed (`"route": "bridge"`), else through named elements (`"route": "screen"`). `--same-version` updates a plugin installed at the same version, such as a build of `main` ([#310](https://github.com/martonpaulo/ink-tools/issues/310)), and proves it by PluginHost's own `installPlugin: success` line for that file. |
| `inkctl plugin enable\|disable NAME` | Turns a plugin on or off through the Ink Tools bridge app ([`apps/inktools-bridge/`](../../apps/inktools-bridge/)), and proves it from the plugin list. Without the bridge app it stops with exit code 14. Not yet run on the tablet ([#215](https://github.com/martonpaulo/ink-tools/issues/215)). |
| `inkctl plugin action PLUGIN ACTION` | Runs a plugin's own action with no screen and no press, and prints the line the plugin logs for it: `account-sync sync` («Sync now»; `--module calendar` or `todo` for one module) and `plugin-diagnostics run-probe` («Run Probe»). It writes `action.json` with the tablet's time in the plugin's folder (the sign-in drop folder, `MyStyle/Probe/`), which the plugin reads on a timer, and waits for the answer: exit 0 done, 1 the action failed, 2 refused, 6 no answer, 7 stale ([#283](https://github.com/martonpaulo/ink-tools/issues/283)). Not yet run on the tablet. |
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
| `inkctl sandbox todoist\|google create\|list\|clean` | Makes, lists or deletes the test project in Todoist or the test calendar in Google, named «teste ink-tools», with the token in the login Keychain. It finds the object by that exact name and touches nothing else; each write is read back. `--read-only` allows only `list`. Google needs `calendar.app.created`: a token from before that scope fails with `api_refused` and the next step `inkctl google login` ([#297](https://github.com/martonpaulo/ink-tools/issues/297)). |
| `inkctl localsend receive\|send\|stop` | A headless LocalSend peer on this Mac, with no window, through [LocalGo](https://github.com/bethropolis/localgo) (MIT, LocalSend v2.2; install it with `go install github.com/bethropolis/localgo/cmd/localgo@v0.6.9`). `receive` starts it as «teste ink-tools», auto-accepting into `.scratch/localsend-received/` (or `--folder`), over https or, with `--http`, plain http as LocalSend with Encryption off; it fails when the port already answers, such as with the LocalSend app open. `send FILE... --to ALIAS` or `--ip HOST[:PORT]` sends to another device. `stop` ends the peer by its recorded process and lists what came in. LocalGo was chosen over the official `localsend-cli`, which asks a key for each sender that is not paired over https, and `localsnd`, which has no https. With the macOS firewall on, macOS asks once whether `localgo` may accept incoming connections ([#297](https://github.com/martonpaulo/ink-tools/issues/297)). |
| `inkctl google login` | Signs Account Sync in to Google Calendar in this Mac's browser, with Google's installed-app flow: a redirect to `127.0.0.1`, `state` and PKCE, scopes `calendar.readonly` and `calendar.events`, and `calendar.app.created` for `sandbox google`, which it asks but does not require. It reads the «Desktop app» client from the login Keychain and stores the refresh token there, and prints only the token's length and the command that sends it to the tablet through `inkctl secret set google`. The browser then shows a success or failure page ([#124](https://github.com/martonpaulo/ink-tools/issues/124)). |
| `inkctl shell COMMAND...` | Runs a command on the tablet. |

`--read-only` or `SUPERNOTE_READ_ONLY` refuses every command that changes the tablet. `files pull` and `screen` refuse the notes folder and a note on the screen unless you pass `--allow-notes`. Test notes under `Note/Tests/` need no flag: a pull of a path inside that folder, and a capture when the title the note shows names a note there and no note outside it.

Every command takes `--json`. A failure in JSON has `cause` and `next`, the next command to try. `--trace` prints each ADB call to stderr as it runs. `--time` prints the run's own time on stderr at its end, the same time `inkctl history` keeps ([#286](https://github.com/martonpaulo/ink-tools/issues/286)).

<br />

## 🔐 Secrets and variables

`inkctl secret set` passes a Bridge sign-in secret from standard input to the tablet and keeps no
copy. `inkctl google login` keeps the Google sign-in in the login Keychain, service `ink-tools`.

| Name | Where | What for |
| :--- | :--- | :--- |
| `SUPERNOTE_ADDRESS` | environment | The tablet's address. It wins over the file below. |
| `SUPERNOTE_READ_ONLY` | environment | When set, refuses every command that changes the tablet. |
| `INKCTL_POLL_SECONDS` | environment | The sleep between the reads of every wait, from 0.05 to 5 seconds (default 0.5); any other value is a usage error ([#286](https://github.com/martonpaulo/ink-tools/issues/286)). |
| `INKCTL_BROWSER` | environment | A program that `google login` runs with the consent address, instead of the system browser. The tests set it to a stub. |
| `~/.config/inkctl/address` | your computer | The tablet's address, on its first line. |
| `INKCTL_SERVICES` | environment | A JSON file in place of `packages/sync-core/src/services.json`, the one owner of the Todoist and Google addresses, scopes and the test objects' name. The tests point it at a fake server. |
| `ACCOUNT_SYNC_TODOIST_TOKEN` | login Keychain, service `ink-tools` | The Todoist token `sandbox todoist` uses. |
| `ACCOUNT_SYNC_GOOGLE_OAUTH_CLIENT` | login Keychain, service `ink-tools` | The JSON of the Google OAuth client of type «Desktop app», which `google login` reads. |
| `ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN` | login Keychain, service `ink-tools` | The Google refresh token `google login` writes. The Google app is published, so it does not expire after 7 days; one issued before 2026-11-26 lasts 7 days. |

Every Keychain item's name, description and rotation is in [Account Sync sign-in secrets](../../docs/security.md#account-sync-sign-in-secrets).

---

<br />

## Scope

[`docs/product.md`](docs/product.md) says what belongs here and what never will. [`docs/research/`](docs/research/) holds the notes behind it.

---

<br />

## Limitations

- **Turned on by hand, until the Bridge does it.** Wi-Fi ADB needs one USB command, and again after each restart of the tablet. Android 11's Wireless debugging turns itself off at every boot, and its port changes each time it starts (measured on a Manta, firmware Chauvet.E103.2610191001.2559, [#1](https://github.com/martonpaulo/ink-tools/issues/1)). The route the owner chose keeps the cable out of it: the [Ink Tools Bridge](../../apps/inktools-bridge/README.md#wi-fi-adb-after-a-restart) turns Wireless debugging on again at each boot, and when the stored port refuses, `inkctl` reads `adb mdns services`, takes the `_adb-tls-connect._tcp` row whose address is exactly the stored one, and connects once to its port. A row of another device or address is never used, and with no matching row the error still names the USB route. The `inkctl` half is covered by contract tests; the Bridge half and the whole route wait for a check on the tablet.
- **A sleeping tablet may not answer.** With the global setting `wifi_sleep_policy` at `2`, a Manta on firmware 3.31.45 kept answering while asleep for the 15 minutes measured, and lost 1% of battery with one port check a minute. A longer sleep is not measured. The error says whether the tablet is asleep, restarted, or off the network, and names what restores it. A stale local `adb` server is restarted by the command when the port still answers.
- **A locked tablet is not tested.** The owner runs the tablet with no lock code, so what `input keyevent WAKEUP` and `screencap` do behind a lock screen is not known. The command never bypasses a lock code or PIN.
- **Changing a plugin needs the Ink Tools bridge app, or the screen.** `adb` cannot call PluginHost's settings service, so a small sideloaded app does ([#215](https://github.com/martonpaulo/ink-tools/issues/215)). With it, `plugin install` and `plugin uninstall` touch no screen (`"route": "bridge"`), and `enable`, `disable` and `allow` work; without it, the install, the permissions and the uninstall press named elements and stop on a screen they do not expect. The bridge route is not yet run on the tablet.
- **Files sync by themselves.** On firmware 3.31.45 the tablet's own watcher picks up a copied file, and Android refuses the app's sync broadcast from ADB, so there is no `sync file` command.
- **Private interfaces.** The intents and broadcasts are not documented by Ratta. A firmware update can change them, so run `inkctl doctor` after one. It proves a call exists, not that it still works.
- **ADB has wide access.** The Manta's ADB asks no computer for authorization (`ro.adb.secure` is 0, measured on firmware Chauvet.E103.2610191001.2559, [#1](https://github.com/martonpaulo/ink-tools/issues/1)): over the cable, and over Wi-Fi while it is on, any computer can read and delete every note, and Wi-Fi mode opens a port on your network until `inkctl wifi off`. See [`SECURITY.md`](SECURITY.md).

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
- **Press a plugin's buttons yourself.** Run «Sync now» and «Run Probe» with `inkctl plugin action` ([#283](https://github.com/martonpaulo/ink-tools/issues/283)). A plugin action with no command yet is pressed with `inkctl click` on its named element, or `lasso press` for a lasso row; never ask the owner to tap a button.
- **Batch the helper steps.** Many `ink write` and `lasso` steps go in one `inkctl batch FILE`, one press for them all. After each answer Probe reads its command file again for 120 s, so the next Probe command within that window needs no press; past it, inkctl presses «Run Command» again ([#286](https://github.com/martonpaulo/ink-tools/issues/286)). Whether PluginHost keeps Probe's timer running between presses is not yet measured.
- **Expect a slow `lasso press`.** It scrolls the «⋯» list from the top, so a press takes 30 to 60 s with about 40 rows, every Ink Tools plugin on.
- **Close a plugin's Settings view first.** It stays over Settings after `am force-stop com.ratta.settings`, and `plugin install`'s screen path then fails with `text:Apps is not on the screen`; Back closes it.
- **Read the detail page's title before a tap.** A plugin with no config button has «Uninstall» where another plugin has «Settings»; read `plugin_detail_title` first.
- **Test another permission state through the bridge.** `plugin allow` always writes status 2. Send the bridge `allow` with `--ei status 0` (or 1, -1) for one permission, read it back from `content://com.ratta.supernote.pluginhost/plugins/<id>`, then restore with `inkctl plugin allow <id>`.
- **Read the plugin list after a bridge `failed`.** An install can land while the callback fails ([#225](https://github.com/martonpaulo/ink-tools/issues/225)); `plugin list` is the proof.
- **Run one session per tablet.** Two agents on the tablet at once gave phantom page changes and Settings windows over the note (2026-11-17).

<br />

## License

[CC BY-NC-SA 4.0](LICENSE) © 2026 Marton Paulo.
