#!/bin/bash
#
# Contract tests for src/inkctl: what each command asks of adb, what it answers, and its stable
# exit codes. `adb` is a stub that records its calls and answers from files in $work.

set -u

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0
root=/storage/emulated/0
serial=device-a.test:5555
note_activity=com.ratta.supernote.note/.view.NoteInsidePagesActivity
calendar_activity=com.ratta.supernote.calendar/.MainActivity

check() {
    if [ "$2" = "$3" ]; then
        printf 'ok - %s\n' "$1"
    else
        printf 'not ok - %s: expected [%s], got [%s]\n' "$1" "$3" "$2"
        failures=$((failures + 1))
    fi
}

mkdir -p "$work/bin" "$work/home/.config/inkctl" "$work/local"
# No test may reach the person's real browser (#124): every run gets $INKCTL_BROWSER, a stub, and
# this audit hook stops Python's own opener before it starts, leaving a mark the suite checks.
mkdir -p "$work/guard"
cat > "$work/guard/sitecustomize.py" <<PY
import sys
def refuse_real_browser(event, arguments):
    if event == "webbrowser.open":
        open("$work/real-browser-reached", "a").write("webbrowser.open\\n")
        raise RuntimeError("a test reached the real browser opener")
sys.addaudithook(refuse_real_browser)
PY
cat > "$work/bin/adb" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$ADB_LOG"
# A real `adb shell` forwards the input it inherits: with $ADB_READS_STDIN, every call but the
# secret write drains it, so a call that inherits a piped secret swallows it.
if [ -n "${ADB_READS_STDIN:-}" ]; then case "$*" in *"umask 077; mkdir -p "*) ;; *) cat >> "$ADB_FILES/swallowed" ;; esac; fi
if [ "$1" = connect ]; then
    if [ -z "${ADB_CONNECT_FAILS:-}" ] && { [ ! -f "$ADB_FILES/stale" ] || [ -f "$ADB_FILES/killed" ]; }; then echo device > "$ADB_FILES/state"; fi
    printf '%s\n' "${ADB_CONNECT_REPLY:-connected to $2}"
    exit 0
fi
if [ "$1" = kill-server ]; then touch "$ADB_FILES/killed"; exit 0; fi
if [ "$1" = devices ]; then echo 'List of devices attached'; cat "$ADB_FILES/usb"; exit 0; fi
[ "$1" = -s ] && shift 2
case "$1" in
    tcpip) echo "restarting in TCP mode port: $2" ;;
    get-state) cat "$ADB_FILES/state" ;;
    exec-out)
        if [ "$2" = screencap ]; then
            cat "$ADB_FILES/screen"
        elif [ -f "$ADB_FILES/busy" ]; then
            [ "$(cat "$ADB_FILES/busy")" = once ] && rm "$ADB_FILES/busy"
            echo 'ERROR: could not get idle state.'
        elif [ -f "$ADB_FILES/page" ]; then
            cat "$ADB_FILES/page$(cat "$ADB_FILES/page").xml"
        else
            cat "$ADB_FILES/tree.xml"
        fi ;;
    pull)
        if ! grep -qF "$2" "$ADB_FILES/paths"; then echo "adb: error: remote object '$2' does not exist" >&2; exit 1; fi
        if [ -f "$ADB_FILES/pull-content" ]; then cp "$ADB_FILES/pull-content" "$3"; fi ;;
    push)
        case "$3" in
            *MyStyle/Probe/command.json) cp "$2" "$ADB_FILES/command.json"; wc -c < "$2" | tr -d ' ' > "$ADB_FILES/size" ;;
            *MyStyle/Probe/picture.*) wc -c < "$2" | tr -d ' ' > "$ADB_FILES/size" ;;
        esac ;;
    logcat)
        if [ -f "$ADB_FILES/helper-answer" ]; then
            id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$ADB_FILES/command.json")
            sed "s/COMMAND_ID/$id/" "$ADB_FILES/helper-answer"
            exit 0
        fi
        cat "$ADB_FILES/log"
        # timing-independent: a hanging fake adb for the follow timeout; the test kills it, the length only bounds it.
        case " $* " in *" -d "*) ;; *) [ -n "${ADB_FOLLOW_FAILS:-}" ] && exit 1; [ -n "${ADB_HANG:-}" ] && exec sleep 5 ;; esac
        : ;;
    shell)
        case "$2" in
            "getprop ro.build.display.id") if [ -f "$ADB_FILES/firmware-id" ]; then cat "$ADB_FILES/firmware-id"; else echo Firmware.1; fi ;;
            "getprop ro.product.model") echo "Supernote Nomad" ;;
            "getprop ro.product.board") cat "$ADB_FILES/model" ;;
            "dumpsys battery"*) cat "$ADB_FILES/battery" ;;
            "sha256sum "*) cat "$ADB_FILES/checksum" ;;
            "dumpsys activity broadcasts") cat "$ADB_FILES/broadcasts" ;;
            "dumpsys package com.ratta.absent") echo 'Unable to find package' ;;
            "dumpsys package com.ratta"*) cat "$ADB_FILES/package-dump" ;;
            "echo ::route::"*)
                remaining=$2
                while [ -n "$remaining" ]; do
                    piece=${remaining%%; *}
                    if [ "$piece" = "$remaining" ]; then remaining=; else remaining=${remaining#*; }; fi
                    case "$piece" in
                        echo*) printf '%s\n' "${piece#echo }" ;;
                        *)
                            component=${piece##* }; component=${component//\'/}
                            if grep -qF "$component" "$ADB_FILES/hidden"; then echo '  enabled=true exported=false directBootAware=false'; else printf '  enabled=true exported=true directBootAware=false\n  permission=sample.PERMISSION\n'; fi ;;
                    esac
                done ;;
            "pm list packages") printf 'package:com.ratta.one\npackage:com.example.two\n' ;;
            "dumpsys package providers")
                for authority in com.ratta.supernote.task.provider com.ratta.supernote.pluginhost; do
                    grep -qF "$authority" "$ADB_FILES/gone" || printf '  [%s]:\n' "$authority"
                done ;;
            getprop*) printf 'Firmware.1\n%s\nPhysical size: 1920x2560\n  level: 93\n    mResumedActivity: ActivityRecord{fa2 u0 %s t1}\n' "$(cat "$ADB_FILES/model" 2>/dev/null)" "$(cat "$ADB_FILES/foreground")" ;;
            dumpsys*) printf '    mResumedActivity: ActivityRecord{fa2 u0 %s t1}\n' "$(cat "$ADB_FILES/foreground")" ;;
            "if [ "*)
                condition=${2#if \[ }; condition=${condition%% \]; then*}
                eval "set -- $condition"
                kind=${1#-}
                if grep -qxF "$kind $2" "$ADB_FILES/paths" || { [ "$kind" = e ] && grep -qE "^[df] $2\$" "$ADB_FILES/paths"; }; then echo yes; else echo no; fi ;;
            "ls -lA"*)
                if ! grep -qF "${2##*/}" "$ADB_FILES/paths"; then echo "ls: x: No such file or directory" >&2; exit 1; fi
                cat "$ADB_FILES/listing" ;;
            "ls -1 /storage/emulated/0/.data/dictionary"*)
                if [ -f "$ADB_FILES/lang-missing" ]; then echo "ls: x: No such file or directory" >&2; exit 1; fi
                cat "$ADB_FILES/lang-default"; echo ::packs::; cat "$ADB_FILES/lang-packs" ;;
            "touch /storage/emulated/0/.data/dictionary"*)
                set -- $2
                printf '%s\n' "${2##*/}" > "$ADB_FILES/lang-default" ;;  # the rm after && leaves only this file
            "find /storage/emulated/0/Note -name"*) cat "$ADB_FILES/notes-found" ;;
            "find /storage/emulated/0/MyStyle/fonts -type f") cat "$ADB_FILES/fonts-found" ;;
            "am start"*) cat "$ADB_FILES/am"; [ -f "$ADB_FILES/am-goes-to" ] && cat "$ADB_FILES/am-goes-to" > "$ADB_FILES/foreground"; : ;;
            "am broadcast -n com.martonpaulo.inktools.bridge/"*)
                printf '%s\n' "$2" >> "$ADB_FILES/bridge-calls"
                if [ -f "$ADB_FILES/bridge-answer" ]; then
                    echo 'Broadcasting: Intent { flg=0x20 cmp=com.martonpaulo.inktools.bridge/.CommandReceiver }'
                    cat "$ADB_FILES/bridge-answer"
                    [ -f "$ADB_FILES/rows-after-bridge" ] && cp "$ADB_FILES/rows-after-bridge" "$ADB_FILES/rows"
                    [ -f "$ADB_FILES/plugin-row-after" ] && cp "$ADB_FILES/plugin-row-after" "$ADB_FILES/plugin-row"
                else
                    echo 'Broadcast completed: result=0'
                fi
                : ;;
            "am broadcast"*) echo 'Broadcast completed: result=0' ;;
            "pm path com.martonpaulo.inktools.bridge")
                [ -f "$ADB_FILES/bridge-installed" ] || exit 1
                echo 'package:/data/app/bridge/base.apk' ;;
            "content query --uri content://com.ratta.supernote.pluginhost/plugins/"*) cat "$ADB_FILES/plugin-row" ;;
            "date +%s") echo 1800000000 ;;
            "date '+%m-%d %H:%M:%S.000'") echo '11-16 23:00:00.000' ;;
            "mkdir -p "*) : ;;
            "cmd package resolve-activity"*)
                if grep -qF "${2##* }" "$ADB_FILES/gone"; then echo 'No activity found'; else echo "priority=0"; echo "${2##* }"; fi ;;
            "cmd package query-receivers"*)
                if grep -qF "${2##* }" "$ADB_FILES/gone"; then echo 'No receivers found'; else echo "${2##* }"; fi ;;
            pidof*) cat "$ADB_FILES/pids" ;;
            "stat -c"*) cat "$ADB_FILES/size" ;;
            "pm list packages -3") echo package:com.example.one ;;
            "pm list packages -s") echo package:com.ratta.supernote.note ;;
            "content insert"*) [ -f "$ADB_FILES/insert-error" ] && cat "$ADB_FILES/insert-error"; : ;;
            "content query --uri content://com.ratta.supernote.task.provider/tasks_table"*)
                left=$(cat "$ADB_FILES/trigger-reads")
                if [ -f "$ADB_FILES/query-silent" ]; then
                    :
                elif [ "$left" -gt 0 ]; then
                    [ "$left" -lt 100 ] && echo $((left - 1)) > "$ADB_FILES/trigger-reads"
                    echo 'Row: 0 id=31'
                else
                    echo 'No result found.'
                fi ;;
            "date +%s") echo 1800000000 ;;
            "date '+%m-%d %H:%M:%S.000'") echo '11-16 23:00:00.000' ;;
            "mkdir -p "*) : ;;
            "cmd package resolve-activity"*)
                if grep -qF "${2##* }" "$ADB_FILES/gone"; then echo 'No activity found'; else echo "priority=0"; echo "${2##* }"; fi ;;
            "cmd package query-receivers"*)
                if grep -qF "${2##* }" "$ADB_FILES/gone"; then echo 'No receivers found'; else echo "${2##* }"; fi ;;
            pidof*) cat "$ADB_FILES/pids" ;;
            "stat -c"*) cat "$ADB_FILES/size" ;;
            "pm list packages -3") echo package:com.example.one ;;
            "pm list packages -s") echo package:com.ratta.supernote.note ;;
            "content insert"*) [ -f "$ADB_FILES/insert-error" ] && cat "$ADB_FILES/insert-error"; : ;;
            "content query --uri content://com.ratta.supernote.task.provider/tasks_table"*)
                left=$(cat "$ADB_FILES/trigger-reads")
                if [ -f "$ADB_FILES/query-silent" ]; then
                    :
                elif [ "$left" -gt 0 ]; then
                    [ "$left" -lt 100 ] && echo $((left - 1)) > "$ADB_FILES/trigger-reads"
                    echo 'Row: 0 id=31'
                else
                    echo 'No result found.'
                fi ;;
            uiautomator)
                cat "$ADB_FILES/events"
                # timing-independent: the real stream never ends; the test's limit ends this one.
                [ -n "${ADB_HANG:-}" ] && exec sleep 5
                : ;;
            "content query"*) cat "$ADB_FILES/rows" ;;
            "input tap"*)
                if [ -f "$ADB_FILES/taps-left" ]; then
                    left=$(($(cat "$ADB_FILES/taps-left") - 1))
                    echo "$left" > "$ADB_FILES/taps-left"
                    [ "$left" -eq 0 ] && cp "$ADB_FILES/rows-after" "$ADB_FILES/rows"
                fi
                if [ -f "$ADB_FILES/advance-after" ]; then
                    left=$(($(cat "$ADB_FILES/advance-after") - 1))
                    echo "$left" > "$ADB_FILES/advance-after"
                    [ "$left" -eq 0 ] && echo 2 > "$ADB_FILES/page"
                fi
                # With $ADB_FILES/tap-turns, each press shows the next screen, page<N+1>.xml, when it exists.
                if [ -f "$ADB_FILES/tap-turns" ]; then
                    next=$(($(cat "$ADB_FILES/page") + 1))
                    [ -f "$ADB_FILES/page$next.xml" ] && echo "$next" > "$ADB_FILES/page"
                fi
                : ;;
            "input swipe"*)
                if [ -f "$ADB_FILES/page" ]; then
                    set -- $2
                    page=$(cat "$ADB_FILES/page")
                    if [ "$4" -gt "$6" ]; then page=$((page + 1)); elif [ ! -f "$ADB_FILES/no-return" ]; then page=$((page - 1)); fi
                    if [ "$page" -ge 1 ] && [ -f "$ADB_FILES/page$page.xml" ]; then echo "$page" > "$ADB_FILES/page"; fi
                fi ;;
            "input "*) : ;;
            "umask 077; mkdir -p "*)
                [ -f "$ADB_FILES/write-fails" ] && { echo 'Permission denied' >&2; exit 1; }
                cat > "$ADB_FILES/secret-written" ;;
            "rm -f "*) printf '%s\n' "$2" >> "$ADB_FILES/removed"; target=${2#rm -f }; target=${target//\'/}; grep -vxF "f $target" "$ADB_FILES/paths" > "$ADB_FILES/paths.next"; mv "$ADB_FILES/paths.next" "$ADB_FILES/paths" ;;
            "tail -c 4 "*) printf 'wxyz' ;;
            *) echo "remote-out"; exit 9 ;;
        esac ;;
esac
STUB
chmod +x "$work/bin/adb"
log="$work/calls"
files="$work/files"
mkdir -p "$files"
script="$repo_root/src/inkctl"
snapshot_file="$work/home/.cache/inkctl/snapshot.json"
history_file="$work/home/.cache/inkctl/history.jsonl"

cat > "$files/tree.xml" <<'XML'
<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node resource-id="" text="" content-desc="" class="android.widget.FrameLayout" bounds="[0,0][1920,2560]"><node resource-id="com.ratta.supernote.note:id/files" text="" content-desc="" class="android.widget.ImageView" bounds="[0,0][100,200]" /><node resource-id="" text="Private words" content-desc="" class="android.widget.TextView" bounds="[100,200][300,400]" /><node resource-id="" text="" content-desc="Save" class="android.view.View" bounds="[10,10][20,20]" /><node resource-id="com.ratta.supernote.note:id/twin" text="" content-desc="" class="android.view.View" bounds="[0,0][10,10]" /><node resource-id="com.ratta.supernote.note:id/twin" text="" content-desc="" class="android.view.View" bounds="[10,0][20,10]" /><node resource-id="com.ratta.supernote.note:id/empty" text="" content-desc="" class="android.view.View" bounds="[5,5][5,5]" /></node></hierarchy>UI hierchary dumped to: /dev/tty
XML
cat > "$files/listing" <<'LS'
total 8
drwxrwx--x 3 root sdcard_rw 3452 2026-11-10 00:13:47.822255985 +0100 Sub Folder
-rw-rw---- 1 root sdcard_rw 1024 2026-10-22 19:14:09.378412609 +0200 A note.note
LS
cat > "$files/rows" <<'ROWS'
Row: 0 name={"en":"Sticker","ja":"x, y"}, pluginID=abc, num=1
Row: 1 name=Snap, pluginID=def, num=2
ROWS
cat > "$files/log" <<'LOG'
--------- beginning of main
11-10 00:14:27.376 I/Sync( 1218): access_token=abcdef next=1
LOG
printf '\211PNG\r\n\032\nDATA' > "$files/screen"
printf 'device-a.test\n' > "$work/home/.config/inkctl/address"

reset_device() {
    echo device > "$files/state"
    printf '%s' "$calendar_activity" > "$files/foreground"
    printf 'f %s\n' "$root/Note/A note.note" "$root/MyStyle/old.txt" > "$files/paths"
    printf 'd %s\n' "$root/Note" "$root/INBOX" >> "$files/paths"
    rm -f "$files/am-goes-to"
    printf 'Status: ok\nActivity: x\n' > "$files/am"
    printf '5\n' > "$files/size"
    : > "$files/usb"
}

run() {
    : > "$log"
    INKCTL_BROWSER="$work/bin/browser" PYTHONPATH="$work/guard" HOME="$work/home" PATH="$work/bin:$PATH" ADB_LOG="$log" ADB_FILES="$files" python3 -B "$script" "$@"
}

last_call() { grep -v 'dumpsys activity' "$log" | tail -1; }
called() { grep -cF -- "$1" "$log"; }
# The exit code of a run, then how many pushes it made: a refusal before any copy reads "<code>0".
exit_and_pushes() { run "$@" >/dev/null 2>&1; printf '%s%s' "$?" "$(called ' push ')"; }
field() { python3 -c "import json,sys; print(eval('d'+sys.argv[1], {'d': json.load(sys.stdin)}))" "$1"; }
expression() { python3 -c "import json,sys; print(eval(sys.argv[1], {'d': json.load(sys.stdin)}))" "$1"; }

reset_device

# Address and connection.
HOME="$work/empty" PATH="$work/bin:$PATH" ADB_LOG="$log" ADB_FILES="$files" python3 -B "$script" status >/dev/null 2>"$work/err"
check "no address stops with its own code" "$?" "2"
check "no address names the file" "$(grep -c 'inkctl/address' "$work/err")" "1"
SUPERNOTE_ADDRESS=device-b.test run status >/dev/null
check "the environment wins over the file" "$(grep -m1 -- "^-s" "$log")" "-s device-b.test:5555 get-state"

# The old name, snadb (#173): its address file is still read, and its shim forwards to inkctl.
mkdir -p "$work/legacy/.config/snadb"
printf 'device-c.test\n' > "$work/legacy/.config/snadb/address"
: > "$log"
HOME="$work/legacy" PATH="$work/bin:$PATH" ADB_LOG="$log" ADB_FILES="$files" python3 -B "$script" status >/dev/null 2>&1
check "the address file of the old name is still read" "$(grep -m1 -- "^-s" "$log")" "-s device-c.test:5555 get-state"
run no-such-command >/dev/null 2>&1
direct=$?
: > "$log"
HOME="$work/home" PATH="$work/bin:$PATH" ADB_LOG="$log" ADB_FILES="$files" python3 -B "$repo_root/src/snadb" no-such-command >/dev/null 2>"$work/err"
check "the snadb shim keeps the exit code" "$?" "$direct"
check "the snadb shim prints one deprecation line" "$(grep -c 'renamed to inkctl' "$work/err")" "1"
: > "$log"
HOME="$work/home" PATH="$work/bin:$PATH" ADB_LOG="$log" ADB_FILES="$files" python3 -B "$repo_root/src/snadb" status >/dev/null 2>&1
check "the snadb shim forwards the arguments" "$(grep -m1 -- "^-s" "$log")" "-s device-a.test:5555 get-state"
run status >/dev/null
check "a connected device skips adb connect" "$(called ' connect')$(called 'connect ')" "00"
echo offline > "$files/state"
run status >/dev/null
check "a device not ready is reconnected" "$(called "connect $serial")" "1"
echo offline > "$files/state"
ADB_CONNECT_FAILS=1 run tap 1 2 >/dev/null 2>"$work/err"
check "a silent device stops with its own code" "$?" "3"
check "a silent device says how to restore it" "$(grep -c 'adb tcpip 5555' "$work/err")" "1"
check "a silent device gets no input" "$(called 'input')" "0"
echo offline > "$files/state"
result=$(ADB_CONNECT_FAILS=1 ADB_CONNECT_REPLY='failed to connect: No route to host' run status --json 2>/dev/null)
check "a sleeping tablet is named" "$(printf '%s' "$result" | field "['state']")" "asleep"
check "a sleeping tablet leaves the ADB server alone" "$(called 'kill-server')" "0"
echo offline > "$files/state"
result=$(ADB_CONNECT_FAILS=1 ADB_CONNECT_REPLY='failed to connect: Connection refused' run status --json 2>/dev/null)
check "a restarted tablet is named" "$(printf '%s' "$result" | field "['state'],d['next']")" "('restarted', 'adb tcpip 5555')"
check "a restarted tablet gets the route that restores it" "$(printf '%s' "$result" | grep -c 'connect the USB cable')" "1"
echo offline > "$files/state"
result=$(ADB_CONNECT_FAILS=1 ADB_CONNECT_REPLY='failed to connect: Operation timed out' run status --json 2>/dev/null)
check "a tablet off the network is named" "$(printf '%s' "$result" | field "['state']")" "off_network"
closed_port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
echo offline > "$files/state"
result=$(SUPERNOTE_ADDRESS="127.0.0.1:$closed_port" ADB_CONNECT_FAILS=1 ADB_CONNECT_REPLY='failed to connect: No route to host' run status --json 2>/dev/null)
check "a closed port beats an old reply from the adb server" "$(printf '%s' "$result" | field "['state']")" "restarted"
echo offline > "$files/state"
listener=$(mktemp "$work/port.XXXXXX")
# timing-independent: the listener only holds the port open; the test kills it by its PID.
python3 -c 'import socket,sys,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("127.0.0.1",0)); s.listen(5); open(sys.argv[1],"w").write(str(s.getsockname()[1])); time.sleep(30)' "$listener" &
listener_pid=$!
# timing-independent: a poll with a deadline for the listener's port file.
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$listener" ] && break; sleep 0.2; done
echo offline > "$files/state"
touch "$files/stale"
SUPERNOTE_ADDRESS="127.0.0.1:$(cat "$listener")" run status >/dev/null 2>&1
check "a stale ADB server is restarted when the port answers" "$?$(called 'kill-server')" "01"
rm -f "$files/killed"
echo offline > "$files/state"
SUPERNOTE_ADDRESS="127.0.0.1:$(cat "$listener")" ADB_CONNECT_FAILS=1 run status >/dev/null 2>&1
check "a restart of the server that does not help is reported" "$?$(called 'kill-server')" "31"
rm -f "$files/killed" "$files/stale"
kill "$listener_pid" 2>/dev/null
wait "$listener_pid" 2>/dev/null
echo offline > "$files/state"
reset_device

# Status and JSON.
check "status reads firmware, battery and foreground" "$(run status --json | field "['firmware'],d['battery'],d['activity'],d['screen']")" "('Firmware.1', 93, '$calendar_activity', '1920x2560')"
check "--json also works before the command" "$(run --json status | field "['battery']")" "93"
check "an error in JSON keeps a name for the reader" "$(run files ls Absent --json 2>/dev/null | field "['error']")" "not_found"

# Firmware. The network is replaced inside the command, so nothing leaves this computer.
cat > "$work/firmware_run.py" <<'PY'
import importlib.machinery, importlib.util, io, os, sys

script, files, *arguments = sys.argv[1:]
loader = importlib.machinery.SourceFileLoader("supernote_under_test", script)
spec = importlib.util.spec_from_loader(loader.name, loader)
inkctl = importlib.util.module_from_spec(spec)
loader.exec_module(inkctl)

class Answer(io.BytesIO):
    def __init__(self, data, final):
        super().__init__(data)
        self.final = final
    def geturl(self):
        return self.final

def fake_open(url):
    if os.environ.get("FAIL_NETWORK"):
        import urllib.error
        raise urllib.error.URLError("no route")
    if url == inkctl.FIRMWARE_PAGE:
        return Answer(open(os.path.join(files, "page.html"), "rb").read(), url)
    final = os.environ.get("FINAL_URL", url)
    return Answer(open(os.path.join(files, "firmware.bin"), "rb").read(), final)

inkctl.open_url = fake_open
sys.argv = ["inkctl", *arguments]
sys.exit(inkctl.main())
PY
firmware() {
    : > "$log"
    HOME="$work/home" PATH="$work/bin:$PATH" ADB_LOG="$log" ADB_FILES="$files" python3 -B "$work/firmware_run.py" "$script" "$files" "$@"
}
cat > "$files/page.html" <<'HTML'
<table><tr><th>Manta &amp; Nomad</th><th>A5</th></tr><tr><th><a href="https://download-firmware.supernote.com/1/update.zip"><strong>Chauvet 3.40.1</strong></a></th><th><a href="https://download-firmware.supernote.com/2/update.zip">SN100.B000.445</a></th></tr></table>
HTML
python3 -c 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("a.txt","x"); z.close()' "$files/firmware.bin"
wc -c < "$files/firmware.bin" | tr -d ' ' > "$files/size"
python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest(), "x")' "$files/firmware.bin" > "$files/checksum"
echo "A5X2" > "$files/model"
echo "Chauvet.E103.2610191001.2559_release" > "$files/firmware-id"
echo "  level: 93" > "$files/battery"
result=$(firmware firmware --json)
check "firmware says when the build id holds no public version" "$(printf '%s' "$result" | field "['newer']")" "None"
firmware firmware --download >/dev/null 2>&1
check "firmware refuses to copy what it cannot compare" "$?$(called ' push ')" "130"
echo "Chauvet 3.31.45" > "$files/firmware-id"
result=$(firmware firmware --json)
check "firmware shows both versions" "$(printf '%s' "$result" | field "['installed'],d['newest'],d['newer']")" "('Chauvet 3.31.45', 'Chauvet 3.40.1', True)"
echo "Chauvet.E103.2610191001.2559_release" > "$files/firmware-id"
check "firmware takes the version the tablet shows" "$(firmware firmware --installed 3.31.45 --json | field "['newer']")" "True"
echo "Chauvet 3.31.45" > "$files/firmware-id"
check "firmware reads the model's own column" "$(printf '%s' "$result" | field "['url']")" "https://download-firmware.supernote.com/1/update.zip"
check "firmware alone copies nothing" "$(called ' push ')" "0"
result=$(firmware firmware --download --json)
check "firmware --download copies to EXPORT" "$(called " push ")" "1"
check "firmware --download proves the copy" "$(printf '%s' "$result" | expression "len(d['sha256']), d['path'], 'OK' in d['next']")" "(64, '/storage/emulated/0/EXPORT/update.zip', True)"
echo "other  x" > "$files/checksum"
firmware firmware --download >/dev/null 2>&1
check "a copy that differs is reported" "$?" "1"
python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest(), "x")' "$files/firmware.bin" > "$files/checksum"
echo "Chauvet 3.40.1" > "$files/firmware-id"
firmware firmware --download >/dev/null 2>&1
check "firmware refuses the same version" "$?$(called ' push ')" "130"
echo "Chauvet 3.41.0" > "$files/firmware-id"
firmware firmware --download >/dev/null 2>&1
check "firmware refuses a downgrade" "$?$(called ' push ')" "130"
echo "Chauvet 3.31.45" > "$files/firmware-id"
cp "$files/page.html" "$work/page.saved"
python3 -c 'import sys; p=sys.argv[1]; s=open(p).read(); open(p,"w").write(s.replace("https://download-firmware.supernote.com/1","https://example.com/1"))' "$files/page.html"
firmware firmware --download >/dev/null 2>&1
check "firmware refuses another host" "$?$(called ' push ')" "130"
python3 -c 'import sys; p=sys.argv[1]; s=open(p).read(); open(p,"w").write(s.replace("https://example.com/1","http://download-firmware.supernote.com/1"))' "$files/page.html"
firmware firmware --download >/dev/null 2>&1
check "firmware refuses plain http" "$?" "13"
cp "$work/page.saved" "$files/page.html"
result=$(FAIL_NETWORK=1 firmware firmware --json 2>/dev/null)
check "firmware reports a network failure in JSON" "$(printf '%s' "$result" | field "['error'],d['next']")" "('network_error', 'inkctl firmware')"
FINAL_URL=https://example.com/x firmware firmware --download >/dev/null 2>&1
check "firmware refuses a redirect to another host" "$?$(called ' push ')" "130"
echo "  level: 20" > "$files/battery"
firmware firmware --download >/dev/null 2>&1
check "firmware refuses a low battery" "$?$(called ' push ')" "130"
echo "  level: 93" > "$files/battery"
printf 'not a zip' > "$files/firmware.bin.keep"
cp "$files/firmware.bin" "$work/firmware.bin.saved"
printf 'not a zip' > "$files/firmware.bin"
firmware firmware --download >/dev/null 2>&1
check "firmware refuses a broken download" "$?$(called ' push ')" "130"
cp "$work/firmware.bin.saved" "$files/firmware.bin"
rm "$files/firmware.bin.keep"
echo "A9" > "$files/model"
firmware firmware >/dev/null 2>&1
check "firmware stops on a model it does not know" "$?" "1"
echo "A5X2" > "$files/model"
check "status names the Manta from its board, not from the model string" "$(run status --json | field "['model']")" "Manta"
echo "A6X2" > "$files/model"
check "status names the Nomad from its board" "$(run status --json | field "['model']")" "Nomad"
echo "A5X2" > "$files/model"
echo "<p>nothing</p>" > "$files/page.html"
firmware firmware >/dev/null 2>&1
check "firmware stops when the page has changed" "$?" "1"
echo 'Firmware' > "$files/firmware-id"
firmware firmware --read-only --download >/dev/null 2>&1
check "read-only refuses a firmware copy" "$?" "11"
rm "$files/firmware-id"

# Routes.
cat > "$files/package-dump" <<'DUMP'
Activity Resolver Table:
  Non-Data Actions:
      android.intent.action.MAIN:
        7ecff80 com.ratta.one/.MainActivity filter 2c1f9b9
          Action: "android.intent.action.MAIN"
          Category: "android.intent.category.LAUNCHER"

Receiver Resolver Table:
  Non-Data Actions:
      one.action.GO:
        ce293ac com.ratta.one/.GoReceiver filter 87f7875
          Action: "one.action.GO"
      one.action.AGAIN:
        ce293ac com.ratta.one/.GoReceiver filter 87f7876
          Action: "one.action.AGAIN"

Service Resolver Table:
  Non-Data Actions:
      one.messenger:
        b970957 com.ratta.one/a.Outer$Inner filter 471ac44
          Action: "one.messenger"

Registered ContentProviders:
  com.ratta.one/.P:
    Provider{f8bc805 com.ratta.one/.P}

ContentProvider Authorities:
  [com.ratta.supernote.task.provider]:
    Provider{f8bc805 com.ratta.one/.P}
      applicationInfo=ApplicationInfo{e53e05a com.ratta.one}
  [unknown.authority]:
    Provider{3350e6f com.ratta.one/.Q}

Key Set Manager:

Packages:
  Package [com.ratta.one] (657049):
DUMP
echo 'com.ratta.one/a.Outer$Inner' > "$files/hidden"
result=$(run routes com.ratta.one --json)
check "routes joins the filters of one component" "$(printf '%s' "$result" | expression "[c for c in d['packages'][0]['components'] if c['kind']=='receiver'][0]['filters']")" "['one.action.GO', 'one.action.AGAIN']"
check "routes gives the required permission" "$(printf '%s' "$result" | expression "d['packages'][0]['components'][0]['permission']")" "sample.PERMISSION"
check "routes leaves out what is not exported" "$(printf '%s' "$result" | expression "[c['kind'] for c in d['packages'][0]['components']]")" "['activity', 'receiver']"
check "routes reports what a read-back proved of a provider" "$(printf '%s' "$result" | expression "d['packages'][0]['providers'][0]['operations']['update']")" "works, and starts no sync"
check "routes does not claim an operation it never proved" "$(printf '%s' "$result" | expression "d['packages'][0]['providers'][1]['operations']")" "None"
check "routes quotes a component name" "$(grep -cF "'com.ratta.one/a.Outer\$Inner'" "$log")" "1"
check "routes is read-only" "$(called 'am start')$(called 'content ')$(called 'input ')" "000"
check "routes names which job each route does" "$(printf '%s' "$result" | expression "[j['command'] for j in d['jobs'] if j['job']=='sync the To-do']")" "['sync tasks']"
check "routes says which jobs have no route" "$(printf '%s' "$result" | expression "[j['needs'] for j in d['jobs_without_route']][0]")" "the screen, or the Ink Tools bridge app (#215)"
check "routes covers every Ratta package by default" "$(run routes --json | expression "[p['package'] for p in d['packages']]")" "['com.ratta.one']"
check "routes prints one line per route" "$(run routes com.ratta.one | grep -c '^receiver')" "1"
run routes com.ratta.absent >/dev/null 2>&1
check "routes on an unknown package stops with its own code" "$?" "4"

# Doctor.
: > "$files/gone"
printf 'com.ratta.supernote.calendar.notify.sync:\n' > "$files/broadcasts"
result=$(run doctor --json)
check "doctor reports every call" "$(printf '%s' "$result" | field "['calls'].__len__(),d['missing']")" "(5, 0)"
check "doctor names the firmware" "$(printf '%s' "$result" | field "['firmware']")" "Firmware.1"
check "doctor starts nothing" "$(called 'am start')$(called 'am broadcast')" "00"
check "doctor sends nothing to a provider" "$(called 'content ')" "0"
check "doctor prints one line per call" "$(run doctor | grep -c '^ok')" "5"
echo 'com.ratta.supernote.task.provider' > "$files/gone"
run doctor >"$work/out" 2>/dev/null
check "doctor stops with its own code when a call is missing" "$?" "10"
check "doctor names the missing call" "$(grep -c '^MISSING.provider.content://com.ratta.supernote.task.provider' "$work/out")" "1"
result=$(run doctor --json 2>/dev/null)
check "doctor keeps its data in JSON on a failure" "$(printf '%s' "$result" | field "['error'],d['missing']")" "('missing_call', 1)"
echo 'com.ratta.supernote.calendar.notify.sync' > "$files/gone"
check "doctor accepts a receiver registered while its app runs" "$(run doctor --json | field "['calls'][2]['exists']")" "True"
: > "$files/broadcasts"
result=$(run doctor --json)
check "doctor does not call an idle app's receiver missing" "$(printf '%s' "$result" | field "['calls'][2]['exists'],d['missing']")" "(None, 0)"
check "doctor says unknown for an idle app's receiver" "$(run doctor | grep -c '^unknown')" "1"
echo "$note_activity" > "$files/gone"
run doctor >/dev/null 2>&1
check "doctor finds a missing activity" "$?" "10"
: > "$files/gone"
check "help lists the doctor exit code" "$(python3 -B "$script" --help | grep -c '10 doctor found')" "1"

# Notes.
run note open "Note/A note.note" --page 3 >/dev/null
check "note open passes the page from 0 and quotes the path" "$(grep -cF "am start -W -a android.intent.action.VIEW -n $note_activity --es file_path '$root/Note/A note.note' --es from_app launcher --ei page 2" "$log")$(called "am start")" "11"
check "note open wakes the screen before it starts the app" "$(grep -n -E 'keyevent WAKEUP|am start' "$log" | head -1 | grep -c WAKEUP)" "1"
run note open Note/Absent.note >/dev/null 2>&1
check "note open on a missing file stops with its own code" "$?" "4"
check "note open on a missing file starts nothing" "$(called 'am start')" "0"
run note open Note/picture.png >/dev/null 2>&1
check "note open refuses another kind of file" "$?" "2"
printf 'Error: Activity class does not exist\n' > "$files/am"
run note open "Note/A note.note" >/dev/null 2>&1
check "note open reports a refused start" "$?" "1"
printf 'Status: ok\nActivity: x\n' > "$files/am"
printf '%s' "$note_activity" > "$files/am-goes-to"
result=$(run note open "Note/A note.note" --json)
check "note open says what changed" "$(printf '%s' "$result" | field "['activity_before'],d['activity'],d['changed']")" "('$calendar_activity', '$note_activity', True)"
reset_device

run note new "Note/New one.note" >/dev/null
check "note new names the folder and the bare name" "$(grep -cF "am start -W -a android.intent.action.VIEW -n $note_activity --es file_path $root/Note --es currentPath $root/Note --ei note_mode 0 --es note_name 'New one' --ez note_direction false --es note_style style_white" "$log")" "1"
run note new "Note/A note.note" >/dev/null 2>&1
check "note new never replaces a note" "$?$(called 'am start')" "50"
run note new Note/picture.png >/dev/null 2>&1
check "note new refuses another kind of file" "$?" "2"

# Files.
result=$(run files ls Note --json)
check "files ls parses folders" "$(printf '%s' "$result" | field "['entries'][0]")" "{'name': 'Sub Folder', 'type': 'dir', 'bytes': 3452, 'modified': '2026-11-10T00:13:47+01:00'}"
check "files ls parses a name with spaces" "$(printf '%s' "$result" | field "['entries'][1]['name']")" "A note.note"
run files ls Absent >/dev/null 2>&1
check "files ls on a missing folder stops with its own code" "$?" "4"
run files pull Absent "$work/local/x" >/dev/null 2>&1
check "files pull on a missing file stops with its own code" "$?" "4"
printf 'hello' > "$work/local/old.txt"
run files push "$work/local/old.txt" MyStyle/old.txt >/dev/null 2>&1
check "files push refuses to replace" "$?" "5"
check "files push that refuses copies nothing" "$(called ' push ')" "0"
check "files push replaces on request" "$(run files push "$work/local/old.txt" MyStyle/old.txt --overwrite --json | field "['replaced'],d['bytes']")" "(True, 5)"
run files push "$work/local/old.txt" INBOX >/dev/null
check "files push into a folder keeps the name" "$(called " push $work/local/old.txt $root/INBOX/old.txt")" "1"
printf '4\n' > "$files/size"
run files push "$work/local/old.txt" INBOX/new.txt >/dev/null 2>&1
check "files push proves the copy is whole" "$?" "1"
printf '5\n' > "$files/size"
run files push "$work/local/absent" INBOX >/dev/null 2>&1
check "files push of a missing local file stops with its own code" "$?" "4"

# Fonts (#247): the Note app's text-box font menu reads MyStyle/fonts.
fonts=$root/MyStyle/fonts
mkdir -p "$work/local/fonts"
for name in notes.txt sample.ttf.zip 'Bad;name.ttf' 'Sample Sans-Bold.TTF' SampleSans-Regular.ttf; do printf 'hello' > "$work/local/fonts/$name"; done
check "font install refuses a file that is not a font" "$(exit_and_pushes font install "$work/local/fonts/notes.txt")" "20"
check "font install refuses a font name inside another extension" "$(exit_and_pushes font install "$work/local/fonts/sample.ttf.zip")" "20"
check "font install refuses a shell character in the name" "$(exit_and_pushes font install "$work/local/fonts/Bad;name.ttf")" "20"
result=$(run font install "$work/local/fonts/Sample Sans-Bold.TTF" --json)
check "font install copies into MyStyle/fonts under its own name" "$(called " push $work/local/fonts/Sample Sans-Bold.TTF $fonts/Sample Sans-Bold.TTF")" "1"
check "font install names the font as the menu shows it" "$(printf '%s' "$result" | field "['fonts'][0]['name']")" "Sample Sans-Bold"
check "font install says how the menu sees it" "$(printf '%s' "$result" | field "['next']" | grep -c 'force-stop com.ratta.supernote.note')" "1"
printf 'f %s\n' "$fonts/SampleSans-Regular.ttf" >> "$files/paths"
check "font install refuses to replace a font" "$(exit_and_pushes font install "$work/local/fonts/SampleSans-Regular.ttf")" "50"
check "font list with no font folder is empty" "$(run font list --json | field "['fonts']")" "[]"
printf 'd %s\n' "$fonts" >> "$files/paths"
printf 'f %s\n' "$fonts/SampleSans-Regular.otf" "$fonts/Light/SampleSans-Light.otf" "$fonts/SampleSans-Regular.ttf.bak" >> "$files/paths"
printf '%s\n' "$fonts/SampleSans-Regular.ttf" "$fonts/SampleSans-Regular.otf" "$fonts/Light/SampleSans-Light.otf" "$fonts/readme.txt" > "$files/fonts-found"
check "font list names each file as the menu does, in subfolders too, fonts only" "$(run font list --json | expression "[(f['name'], len(f['files'])) for f in d['fonts']]")" "[('SampleSans-Light', 1), ('SampleSans-Regular', 2)]"
: > "$files/removed"
run font remove SampleSans-Regular >/dev/null 2>&1
check "font remove without --yes removes nothing" "$?$(called 'rm -f')" "20"
run font remove SampleSans-Regular --yes >/dev/null
check "font remove takes every file of that name" "$(wc -l < "$files/removed" | tr -d ' ')" "2"
check "font remove leaves a font whose name it prefixes" "$(grep -c 'SampleSans-Light' "$files/removed")" "0"
run font remove Absent --yes >/dev/null 2>&1
check "font remove of an unknown font stops with its own code" "$?" "4"
rm -f "$files/fonts-found"
reset_device

# Sync.
echo 2 > "$files/trigger-reads"
result=$(run sync tasks --json)
check "sync tasks waits until the sync removed its row" "$(printf '%s' "$result" | field "['app']")" "tasks"
check "sync tasks sends no broadcast Android refuses" "$(called 'am broadcast')" "0"
check "sync tasks inserts a row already marked as deleted" "$(grep -c 'content insert --uri content://com.ratta.supernote.task.provider/tasks_table --bind taskId:s:.* --bind title:s:supernote-sync-trigger .*--bind deleted:i:1 --bind hasSync:i:0' "$log")" "1"
check "sync tasks reads only its own row" "$(grep 'content query' "$log" | grep -vcF "taskId=")" "0"
echo 0 > "$files/trigger-reads"
run sync tasks >/dev/null 2>"$work/err"
check "sync tasks reports an insert that did not hold" "$?" "1"
echo 2 > "$files/trigger-reads"
touch "$files/query-silent"
run sync tasks >/dev/null 2>&1
check "sync tasks never reads silence as a finished sync" "$?" "1"
rm "$files/query-silent"
echo 100 > "$files/trigger-reads"
run sync tasks --timeout 0 >/dev/null 2>&1
check "sync tasks gives up with its own code" "$?" "6"
echo 'Error: provider refused' > "$files/insert-error"
echo 2 > "$files/trigger-reads"
run sync tasks >/dev/null 2>&1
check "sync tasks reports a refused insert" "$?$(called 'content query')" "10"
rm "$files/insert-error"
run sync calendar >/dev/null 2>&1
check "sync calendar stops when nothing would hear it" "$?$(called 'am broadcast')" "10"
echo 'com.ratta.supernote.calendar.notify.sync:' > "$files/broadcasts"
run sync calendar >/dev/null
check "sync calendar asks the Calendar app" "$(last_call)" "-s $serial shell am broadcast -a com.ratta.supernote.calendar.notify.sync"

run sync file "Note/A note.note" >/dev/null 2>&1
check "sync file is gone, because Android refuses its broadcast" "$?" "2"

# Screen.
run screen "$work/local/a.png" >/dev/null
check "screen saves the capture" "$(wc -c < "$work/local/a.png" | tr -d ' ')" "12"
printf 'not an image' > "$files/screen"
run screen "$work/local/a.png" >/dev/null 2>&1
check "a bad capture is reported" "$?" "1"
check "a bad capture keeps the earlier file" "$(wc -c < "$work/local/a.png" | tr -d ' ')" "12"
printf '\211PNG\r\n\032\nDATA' > "$files/screen"

# Snapshot and click.
run click @e1 >/dev/null 2>&1
check "click before any snapshot stops as stale" "$?" "7"
result=$(run snapshot --json)
check "snapshot numbers only nodes with a label and an area" "$(printf '%s' "$result" | field "['elements'].__len__()")" "5"
check "snapshot gives id, centre and activity" "$(printf '%s' "$result" | field "['elements'][0]['id'],d['elements'][0]['x'],d['elements'][0]['y'],d['activity']")" "('files', 50, 100, '$calendar_activity')"
check "snapshot text shows references" "$(run snapshot | sed -n 2p)" '@e1 ImageView id="files" [0, 0, 100, 200]'
check "the saved snapshot leaves out what the screen says" "$(grep -c 'Private words' "$snapshot_file")" "0"
check "the saved snapshot is private" "$(python3 -c 'import os,sys; print(format(os.stat(sys.argv[1]).st_mode & 0o777, "o"))' "$snapshot_file")" "600"
run click @e2 >/dev/null
check "click presses the element's centre" "$(called 'shell input tap 200 300')" "1"
run click @e99 >/dev/null 2>&1
check "an unknown reference stops with its own code" "$?" "4"
run click id:files >/dev/null
check "a stable selector needs no snapshot" "$(called 'shell input tap 50 100')" "1"
run click id:twin >/dev/null 2>&1
check "an ambiguous selector stops before pressing" "$?$(called 'input tap')" "40"
run click nonsense >/dev/null 2>&1
check "a bad target is bad usage" "$?" "2"
check "click returns a fresh snapshot on request" "$(run click desc:Save --snapshot --json | field "['elements'].__len__()")" "5"
run click text:Absent >/dev/null 2>&1
check "a selector with no match stops with its own code" "$?" "4"
printf '%s' "$note_activity" > "$files/foreground"
run click @e2 >/dev/null 2>&1
check "a reference from another screen stops as stale" "$?" "7"
check "a stale reference presses nothing" "$(called 'input tap')" "0"
reset_device
run snapshot >/dev/null
cp "$files/tree.xml" "$work/tree-before"
python3 -c 'import sys; p=sys.argv[1]; s=open(p).read(); open(p,"w").write(s.replace("[100,200][300,400]","[100,900][300,1000]"))' "$files/tree.xml"
run click @e2 >/dev/null 2>&1
check "a changed layout in the same app stops as stale" "$?$(called 'input tap')" "70"
cp "$work/tree-before" "$files/tree.xml"
reset_device
run click desc:Save --screen "$work/local/after.png" >/dev/null
check "click can save what it changed" "$(wc -c < "$work/local/after.png" | tr -d ' ')" "12"

echo once > "$files/busy"
check "a screen that settles on a later try still answers" "$(run snapshot --json | field "['elements'].__len__()")" "5"
echo always > "$files/busy"
run snapshot >/dev/null 2>&1
check "a screen that never settles stops with its own code" "$?" "8"
check "a screen that never settles is tried a bounded number of times" "$(called 'uiautomator dump')" "3"
run wait element id:files --timeout 0 >/dev/null 2>&1
check "a busy screen counts as not seen yet" "$?" "6"
rm -f "$files/busy"

# Lists that continue off the screen.
list_page() {
    printf "<?xml version='1.0' ?><hierarchy rotation=\"0\"><node resource-id=\"\" text=\"\" content-desc=\"\" class=\"android.widget.ListView\" scrollable=\"true\" bounds=\"[0,100][1000,1100]\"><node resource-id=\"\" text=\"%s\" content-desc=\"\" class=\"android.widget.TextView\" bounds=\"[0,100][1000,600]\" /><node resource-id=\"\" text=\"%s\" content-desc=\"\" class=\"android.widget.TextView\" bounds=\"[0,600][1000,%s]\" /></node></hierarchy>" "$1" "$2" "$3"
}
pages() {
    list_page One Two 1100 > "$files/page1.xml"
    list_page Three Four 1100 > "$files/page2.xml"
    list_page Five Six 700 > "$files/page3.xml"
    echo 1 > "$files/page"
}
stop_pages() { rm -f "$files/page" "$files"/page?.xml; }
pages
result=$(run snapshot --json)
check "a list is an element even with no label" "$(printf '%s' "$result" | field "['elements'][0]['scrollable'],d['elements'][0]['class']")" "(True, 'ListView')"
check "a list that reaches the edge continues" "$(printf '%s' "$result" | field "['elements'][0]['more']")" "True"
check "other elements are not lists" "$(printf '%s' "$result" | field "['elements'][1]['scrollable'],d['elements'][1]['more']")" "(False, None)"
check "the text marks a list" "$(run snapshot | sed -n 2p)" "@e1 ListView [0, 100, 1000, 1100] scrollable more=yes"
echo 3 > "$files/page"
check "a list with a tall gap has no more" "$(run snapshot --json | field "['elements'][0]['more']")" "False"
list_page Five Six 900 > "$files/page3.xml"
check "a small gap is unknown" "$(run snapshot --json | field "['elements'][0]['more']")" "None"
pages
result=$(run snapshot --all --json)
check "--all merges every page" "$(printf '%s' "$result" | expression "[e['text'] for e in d['elements'] if e['text']]")" "['One', 'Two', 'Three', 'Four', 'Five', 'Six']"
check "--all gives no reference off screen" "$(printf '%s' "$result" | expression "[(e['ref'], e.get('offscreen')) for e in d['elements']][-1]")" "('', True)"
check "--all stops after two quiet reads" "$(printf '%s' "$result" | field "['lists'][0]['steps']")" "4"
check "--all returns to the start" "$(printf '%s' "$result" | field "['lists'][0]['returned']")" "True"
check "--all leaves the first page" "$(cat "$files/page")" "1"
check "--all is complete when it ended by itself" "$(printf '%s' "$result" | field "['at_limit']")" "False"
pages
result=$(run snapshot --all --max-steps 1 --json)
check "--all says when it stopped at the limit" "$(printf '%s' "$result" | field "['at_limit']")" "True"
check "--all swipes no more than its limit" "$(called 'input swipe 500 900 500 300')" "1"
check "the text says when it stopped at the limit" "$(run snapshot --all --max-steps 1 | tail -1)" "list @e1: 2 more in 1 steps; stopped at the limit"
pages
check "--find scrolls to an element" "$(run snapshot --find text:Four --json | field "['found']['text'],d['steps']")" "('Four', 1)"
check "--find leaves it on screen" "$(cat "$files/page")" "2"
run click text:Four >/dev/null
check "--find gives a pressable element" "$?" "0"
pages
run snapshot --find text:One >/dev/null
check "--find sends no swipe for what is on screen" "$(called 'input swipe')" "0"
run snapshot --find text:Absent >/dev/null 2>&1
check "--find reports an absent element" "$?" "4"
check "--find returns after an absent element" "$(cat "$files/page")" "1"
run snapshot --find nonsense >/dev/null 2>&1
check "--find refuses a bad selector" "$?$(called 'input swipe')" "20"
printf '%s' "$note_activity" > "$files/foreground"
run snapshot --all >/dev/null 2>&1
check "--all refuses the note editor" "$?$(called 'input swipe')" "20"
run snapshot --find text:One >/dev/null 2>&1
check "--find refuses the note editor" "$?$(called 'input swipe')" "20"
reset_device
pages
touch "$files/no-return"
run snapshot --all --max-steps 1 >/dev/null
run click @e2 >/dev/null 2>&1
check "a failed return drops the old references" "$?" "7"
pages
touch "$files/no-return"
run snapshot --find text:Absent >/dev/null 2>&1
run click @e2 >/dev/null 2>&1
check "a --find that fails to return drops the old references" "$?" "7"
rm "$files/no-return"
pages
result=$(run snapshot --find text:Absent --max-steps 1 --json 2>/dev/null)
check "a --find stopped by the limit does not claim the element is absent" "$(printf '%s' "$result" | field "['at_limit']")" "True"
check "a --find stopped by the limit says so" "$(printf '%s' "$result" | field "['message']" | grep -c 'list continues')" "1"
stop_pages
result=$(run snapshot --all --json)
check "--all without lists is a plain snapshot" "$(printf '%s' "$result" | field "['elements'].__len__(),d['lists']")" "(5, [])"
check "--all without lists sends no swipe" "$(called 'input swipe')" "0"

# Screens that split a list into pages (#5).
paged_page() {
    printf "<?xml version='1.0' ?><hierarchy rotation=\"0\"><node text=\"%s\" resource-id=\"\" content-desc=\"\" class=\"T\" bounds=\"[0,0][50,10]\" /><node text=\"%s\" resource-id=\"a:id/content_page_number\" content-desc=\"\" class=\"T\" bounds=\"[80,0][90,10]\" /><node text=\"\" resource-id=\"a:id/ll_next_page\" content-desc=\"\" class=\"T\" bounds=\"[90,0][99,10]\" /></hierarchy>" "$1" "$2"
}
paged() {
    paged_page Apple "1 / 2" > "$files/page1.xml"
    paged_page Zebra "2 / 2" > "$files/page2.xml"
    echo 1 > "$files/page"
    echo 1 > "$files/advance-after"
}
paged
result=$(run snapshot --json)
check "a paged screen says more pages follow" "$(printf '%s' "$result" | field "['pages']")" "{'page': 1, 'total': 2, 'more': True}"
check "the text gives the pages" "$(run snapshot | tail -1)" "pages 1 / 2 more=yes"
check "a paged snapshot turns no page" "$(called 'input tap')" "0"
stop_pages
check "a screen with no page number has no pages" "$(run snapshot --json | expression "'pages' in d")" "False"
paged
result=$(run snapshot --all --json)
check "--all reads the next pages" "$(printf '%s' "$result" | expression "[(e['text'], e['ref'], e.get('offscreen')) for e in d['elements'] if e['text'] == 'Zebra']")" "[('Zebra', '', True)]"
check "--all says it did not return to the first page" "$(printf '%s' "$result" | field "['paging']['turned'],d['paging']['returned']")" "(1, False)"
check "--all presses next once" "$(called 'input tap 94 5')" "1"
run click @e1 >/dev/null 2>&1
check "a page turn drops the old references" "$?" "7"
paged
check "the text says it did not return" "$(run snapshot --all | tail -1)" "pages: 2 more in 1 turns; did not return to page 1, take a new snapshot"
paged
check "--find turns pages to an element" "$(run snapshot --find text:Zebra --json | field "['found']['text'],d['steps']")" "('Zebra', 1)"
check "--find stays on its page" "$(cat "$files/page")" "2"
run click text:Zebra >/dev/null
check "--find gives a pressable element on a later page" "$?" "0"
paged
run snapshot --find text:Absent >/dev/null 2>&1
check "--find reports an element on no page" "$?" "4"
rm -f "$files/advance-after"
stop_pages

# Wait.
check "wait activity returns once it holds" "$(run wait activity calendar --json | field "['kind']")" "activity"
run wait activity NoteInside --timeout 0 >/dev/null 2>&1
check "wait gives up with its own code" "$?" "6"
run wait file "Note/A note.note" --timeout 0 >/dev/null
check "wait file sees a file" "$?" "0"
run wait element id:files --timeout 0 >/dev/null
check "wait element sees an element" "$?" "0"
run wait element files --timeout 0 >/dev/null 2>&1
check "wait element refuses a bad selector" "$?" "2"
# A toast is caught from its accessibility event (#297).
cat > "$files/events" <<'EVENTS'
EventType: TYPE_WINDOW_CONTENT_CHANGED; EventTime: 100; PackageName: com.ratta.supernote.note; MovementGranularity: 0; Action: 0; ContentChangeTypes: [CONTENT_CHANGE_TYPE_SUBTREE]; WindowChangeTypes: [] [ ClassName: android.widget.FrameLayout; Text: []; ContentDescription: null; ]; recordCount: 0
EventType: TYPE_NOTIFICATION_STATE_CHANGED; EventTime: 200; PackageName: com.ratta.supernote.pluginhost; MovementGranularity: 0; Action: 0; ContentChangeTypes: []; WindowChangeTypes: [] [ ClassName: android.widget.Toast$TN; Text: [Other message]; ContentDescription: null; ]; recordCount: 0
EventType: TYPE_NOTIFICATION_STATE_CHANGED; EventTime: 300; PackageName: com.ratta.supernote.pluginhost; MovementGranularity: 0; Action: 0; ContentChangeTypes: []; WindowChangeTypes: [] [ ClassName: android.widget.Toast$TN; Text: [Sent to the Mac]; ContentDescription: null; ]; recordCount: 0
EVENTS
output=$(ADB_HANG=1 run wait toast "sent to" --timeout 3 --json)
check "wait toast finds the toast's text, in any case" "$?" "0"
check "wait toast names the text, package and event time" "$(printf '%s' "$output" | field "['text'],d['package'],d['event_time']")" "('Sent to the Mac', 'com.ratta.supernote.pluginhost', 300)"
check "wait toast reads the accessibility events" "$(called 'shell uiautomator events')" "1"
started=$SECONDS
ADB_HANG=1 run wait toast "Saved" --timeout 1 >/dev/null 2>&1
check "wait toast times out on another text" "$?" "6"
check "wait toast is bounded" "$((SECONDS - started < 4))" "1"
run wait toast "Saved" --timeout 3 --json >"$work/out" 2>/dev/null
check "an events stream that ends early is a device error" "$? $(field "['error']" < "$work/out")" "1 device_error"
run wait toast " " --timeout 1 >/dev/null 2>&1
check "wait toast refuses an empty text" "$?" "2"

# Apps, plugins and logs.
check "apps separates installed from system" "$(run apps --json | field "['apps'][0]['kind'],d['apps'][1]['kind']")" "('installed', 'system')"
check "plugin ls keeps a value with commas" "$(run plugin ls --json | field "['plugins'][0]['name']")" '{"en":"Sticker","ja":"x, y"}'
check "plugin ls splits the fields" "$(run plugin ls --json | field "['plugins'][1]['pluginID']")" "def"
cp "$files/rows" "$work/rows-copy"
: > "$files/rows"
run plugin ls >/dev/null 2>&1
check "plugin ls reports an answer with no rows and no word from the provider" "$?" "1"
echo 'No result found.' > "$files/rows"
check "plugin ls accepts a real empty list" "$(run plugin ls --json | field "['plugins']")" "[]"
cp "$work/rows-copy" "$files/rows"
printf 'hello' > "$work/local/my.snplg"
run plugin push "$work/local/my.snplg" >/dev/null
check "plugin push goes to MyStyle" "$(called " push $work/local/my.snplg $root/MyStyle/my.snplg")" "1"
run plugin push "$work/local/old.txt" >/dev/null 2>&1
check "plugin push refuses another kind of file" "$?" "2"
python3 - "$work/local/test.snplg" <<'PY'
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as archive:
    archive.writestr("plugin/PluginConfig.json", json.dumps({"pluginID": "new.plugin", "versionName": "2.0"}))
PY
cat > "$work/plugin-screen" <<'XML'
<?xml version='1.0' ?><hierarchy rotation="0"><node text="Apps" resource-id="" content-desc="" class="T" bounds="[0,0][10,10]" /><node text="Plugins" resource-id="" content-desc="" class="T" bounds="[10,0][20,10]" /><node text="Select Plugin Package" resource-id="" content-desc="" class="T" bounds="[20,0][30,10]" /><node text="Enabled (9/10)" resource-id="" content-desc="" class="T" bounds="[30,0][40,10]" /><node text="test.snplg" resource-id="" content-desc="" class="T" bounds="[40,0][50,10]" /><node text="" resource-id="a:id/top_save" content-desc="" class="T" bounds="[50,0][60,10]" /></node></hierarchy>
XML
sed -i.bak 's|</node></hierarchy>|</hierarchy>|' "$work/plugin-screen"
cp "$files/tree.xml" "$work/tree-saved"
cp "$files/rows" "$work/rows-saved"
cp "$work/plugin-screen" "$files/tree.xml"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=1.0\n' > "$files/rows"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=2.0\n' > "$files/rows-after"
wc -c < "$work/local/test.snplg" | tr -d ' ' > "$files/size"
echo 5 > "$files/taps-left"
result=$(run plugin install "$work/local/test.snplg" --json 2>"$work/err")
check "plugin install proves the new version" "$(printf '%s' "$result" | field "['action'],d['version'],d['row']['versionName']")" "('updated', '2.0', '2.0')"
check "plugin install opens Settings" "$(called "am start -W -n com.ratta.settings/.SettingsActivity")" "1"
check "plugin install presses each step" "$(called 'input tap')" "5"
check "plugin install reports the limit before installing" "$(grep -c 'plugins enabled: 9 of 10' "$work/err")" "1"
check "plugin install pushes the file" "$(called " push $work/local/test.snplg $root/MyStyle/test.snplg")" "1"
run plugin install "$work/local/test.snplg" >/dev/null 2>&1
check "plugin install refuses the same version" "$?$(called ' push ')" "50"
python3 - "$work/local/test.snplg" <<'PY'
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as archive:
    archive.writestr("plugin/PluginConfig.json", json.dumps({"pluginID": "new.plugin", "versionName": "2.0", "versionCode": "18"}))
PY
wc -c < "$work/local/test.snplg" | tr -d ' ' > "$files/size"
sed -i.bak '\|MyStyle/test.snplg|d' "$files/paths"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=2.0, versionCode=17\n' > "$files/rows"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=2.0, versionCode=18\n' > "$files/rows-after"
echo 5 > "$files/taps-left"
result=$(run plugin install "$work/local/test.snplg" --json 2>/dev/null)
check "plugin install updates a build that only raised versionCode" "$(printf '%s' "$result" | field "['action'],d['row']['versionCode']")" "('updated', '18')"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=2.0, versionCode=18\n' > "$files/rows"
run plugin install "$work/local/test.snplg" >/dev/null 2>&1
check "plugin install refuses the same versionCode" "$?" "5"
printf 'Row: 0 name=Other, pluginID=other\n' > "$files/rows"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=2.0\n' > "$files/rows-after"
echo 5 > "$files/taps-left"
check "plugin install says when the plugin is new" "$(run plugin install "$work/local/test.snplg" --json 2>/dev/null | field "['action']")" "installed"
printf 'Row: 0 name=Other, pluginID=other\n' > "$files/rows"
echo 99 > "$files/taps-left"
run plugin install "$work/local/test.snplg" --timeout 0 >/dev/null 2>&1
check "plugin install gives up when the read-back never shows it" "$?" "6"
python3 -c 'import sys; s=open(sys.argv[1]).read(); open(sys.argv[2],"w").write(s.replace("Plugins\"","Elsewhere\""))' "$work/plugin-screen" "$files/tree.xml"
echo 99 > "$files/taps-left"
run plugin install "$work/local/test.snplg" --step-timeout 0 >/dev/null 2>&1
check "an unexpected screen stops the install with its own code" "$?" "9"
check "an unexpected screen presses nothing more" "$(called 'input tap')" "1"
echo "f $root/MyStyle/test.snplg" >> "$files/paths"
printf 'Row: 0 name=Other, pluginID=other\n' > "$files/rows"
run plugin install "$work/local/test.snplg" >/dev/null 2>&1
check "plugin install refuses to replace an earlier copy" "$?$(called ' push ')" "50"
run plugin push "$work/local/test.snplg" >/dev/null 2>&1
check "plugin push refuses to replace an earlier copy" "$?$(called ' push ')" "50"
cp "$work/plugin-screen" "$files/tree.xml"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=1.0\n' > "$files/rows"
printf 'Row: 0 name=Snap, pluginID=new.plugin\n' > "$files/rows-after"
echo 5 > "$files/taps-left"
run plugin install "$work/local/test.snplg" --overwrite >/dev/null 2>"$work/err"
check "an update with no version column is not called proven" "$?$(grep -c 'cannot be proved' "$work/err")" "11"
sed -i.bak 's|<node text="Plugins"|<node text="test.snplg" resource-id="" content-desc="" class="T" bounds="[70,0][80,10]" /><node text="Plugins"|' "$files/tree.xml"
printf 'Row: 0 name=Other, pluginID=other\n' > "$files/rows"
echo 99 > "$files/taps-left"
run plugin install "$work/local/test.snplg" --overwrite --step-timeout 0 >/dev/null 2>&1
check "two files with the same name stop the install" "$?" "9"
cp "$work/plugin-screen" "$files/tree.xml"
python3 -c 'import sys; p=sys.argv[1]; s=open(p).read(); open(p,"w").write(s.replace("test.snplg","other.snplg"))' "$files/tree.xml"
run plugin install "$work/local/test.snplg" --overwrite --step-timeout 0 >/dev/null 2>&1
check "a file missing from the picker stops the install" "$?" "9"
python3 - "$work/plugin-screen" "$files" <<'PY'
import sys
screen = open(sys.argv[1]).read()
number = '<node text="%s" resource-id="a:id/content_page_number" content-desc="" class="T" bounds="[80,0][90,10]" /><node text="" resource-id="a:id/ll_next_page" content-desc="" class="T" bounds="[90,0][99,10]" /></hierarchy>'
open(sys.argv[2] + "/page1.xml", "w").write(screen.replace("test.snplg", "other.snplg").replace("</hierarchy>", number % "1 / 2"))
open(sys.argv[2] + "/page2.xml", "w").write(screen.replace("</hierarchy>", number % "2 / 2"))
PY
echo 1 > "$files/page"
echo 4 > "$files/advance-after"
printf 'Row: 0 name=Other, pluginID=other\n' > "$files/rows"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=2.0\n' > "$files/rows-after"
echo 6 > "$files/taps-left"
check "plugin install finds a file on a later page of the picker" "$(run plugin install "$work/local/test.snplg" --overwrite --json 2>/dev/null | field "['action']")" "installed"
check "plugin install presses next once" "$(called 'input tap 94 5')" "1"
rm -f "$files/page" "$files/advance-after" "$files"/page?.xml
printf 'hello' > "$work/local/bad.snplg"
run plugin install "$work/local/bad.snplg" >/dev/null 2>&1
check "a file with no plugin config stops before any copy" "$?$(called ' push ')" "20"
run plugin install "$work/local/old.txt" >/dev/null 2>&1
check "plugin install refuses another kind of file" "$?" "2"

# The Ink Tools bridge app (#215): install, enable, disable and Always Allow through one ordered broadcast.
bridge_calls() { cat "$files/bridge-calls" 2>/dev/null; }
exit_of() { run "$@" >/dev/null 2>&1; echo $?; }
wc -c < "$work/local/test.snplg" | tr -d ' ' > "$files/size"
printf 'Row: 0 name=Other, pluginID=other\n' > "$files/rows"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=2.0\n' > "$files/rows-after-bridge"
touch "$files/bridge-installed"
printf 'Broadcast completed: result=1, data="ok onSuccess PluginInfo{pluginID=new.plugin}"\n' > "$files/bridge-answer"
: > "$files/bridge-calls"
result=$(run plugin install "$work/local/test.snplg" --overwrite --json 2>/dev/null)
check "plugin install goes through the bridge when it is installed" "$(printf '%s' "$result" | field "['route'],d['action'],d['row']['versionName']")" "('bridge', 'installed', '2.0')"
check "the bridge install names the pushed path" "$(bridge_calls)" "am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op install --es path $root/MyStyle/test.snplg"
check "the bridge install presses nothing on the screen" "$(called 'input tap')$(called 'SettingsActivity')" "00"
check "the bridge install keeps PluginHost's answer" "$(printf '%s' "$result" | field "['bridge']")" "ok onSuccess PluginInfo{pluginID=new.plugin}"
rm -f "$files/rows-after-bridge"
printf 'Row: 0 name=Other, pluginID=other\n' > "$files/rows"
printf 'Broadcast completed: result=2, data="failed onFailed PluginError{code=3}"\n' > "$files/bridge-answer"
run plugin install "$work/local/test.snplg" --overwrite >/dev/null 2>"$work/err"
check "a refused bridge install fails with PluginHost's error" "$?$(grep -c 'onFailed PluginError{code=3}' "$work/err")" "11"
# #225: PluginHost can answer onFailed after the update landed; the list's version decides.
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=1.0\n' > "$files/rows"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=2.0\n' > "$files/rows-after-bridge"
printf 'Broadcast completed: result=2, data="failed onFailed PluginError{errorCode=100}"\n' > "$files/bridge-answer"
result=$(run plugin install "$work/local/test.snplg" --overwrite --json 2>"$work/err")
check "a bridge onFailed whose version landed reports the update" "$?$(printf '%s' "$result" | field "['action'],d['row']['versionName']")" "0('updated', '2.0')"
check "a bridge onFailed that landed logs the host's error once" "$(grep -c 'onFailed PluginError{errorCode=100}' "$work/err")" "1"
printf 'Row: 0 name=Snap, pluginID=new.plugin, versionName=1.0\n' | tee "$files/rows" > "$files/rows-after-bridge"
run plugin install "$work/local/test.snplg" --overwrite >/dev/null 2>"$work/err"
check "a bridge onFailed whose version did not change still fails" "$?$(grep -c 'onFailed PluginError{errorCode=100}' "$work/err")" "11"
rm -f "$files/rows-after-bridge"
printf 'Row: 0 name=Other, pluginID=other\n' > "$files/rows"
printf 'Broadcast completed: result=5, data="timeout no callback"\n' > "$files/bridge-answer"
check "a bridge with no callback times out" "$(exit_of plugin install "$work/local/test.snplg" --overwrite)" "6"
rm -f "$files/rows-after-bridge"

printf 'Row: 0 name=Snap, pluginID=new.plugin, enable=false\nRow: 1 name=Other, pluginID=other, enable=true\n' > "$files/rows"
printf 'Row: 0 name=Snap, pluginID=new.plugin, enable=true\nRow: 1 name=Other, pluginID=other, enable=true\n' > "$files/rows-after-bridge"
printf 'Broadcast completed: result=1, data="ok onSuccess"\n' > "$files/bridge-answer"
: > "$files/bridge-calls"
check "plugin enable proves the change in the list" "$(run plugin enable Snap --json | field "['action'],d['row']['enable']")" "('enabled', 'true')"
check "plugin enable sends the plugin's id" "$(bridge_calls)" "am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op enable --es pluginID new.plugin"
: > "$files/bridge-calls"
check "plugin enable leaves an enabled plugin alone" "$(run plugin enable new.plugin --json | field "['action']")$(bridge_calls)" "unchanged"
printf 'Row: 0 name=Snap, pluginID=new.plugin, enable=false\nRow: 1 name=Other, pluginID=other, enable=true\n' > "$files/rows-after-bridge"
check "plugin disable proves the change in the list" "$(run plugin disable Snap --json | field "['action'],d['enable']")" "('disabled', False)"
check "plugin disable sends op disable" "$(bridge_calls | tail -1)" "am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op disable --es pluginID new.plugin"
printf 'Row: 0 name=Snap, pluginID=new.plugin, enable=true\n' > "$files/rows"
printf 'Row: 0 name=Snap, pluginID=new.plugin, enable=true\n' > "$files/rows-after-bridge"
check "plugin disable times out when the list never changes" "$(exit_of plugin disable Snap --timeout 0)" "6"
# #228: an enable PluginHost leaves unanswered names its refusal of the plugin's own files, never a CPU listing.
cp "$files/log" "$work/log-before-enable"
printf 'Row: 0 name=Snap, pluginID=new.plugin, enable=false\n' | tee "$files/rows" > "$files/rows-after-bridge"
printf 'Broadcast completed: result=5, data="timeout no callback"\n' > "$files/bridge-answer"
printf '%s\n' '11-16 23:00:02.000 I/PluginSec( 1): DENY tid=2 reason=other_plugin path=/data/plugins/new.plugin/app_1.npk' \
  '11-16 23:00:02.100 I/PluginSec( 1): DENY tid=3 reason=system_dir_listing path=/sys/devices/system/cpu' > "$files/log"
result=$(run plugin enable Snap --json 2>/dev/null)
check "a refused enable fails with PluginHost's refusal of its own files" "$?$(printf '%s' "$result" | expression "len(d['denied']), 'other_plugin' in d['message'], 'system_dir_listing' in d['message']")" "6(1, True, False)"
check "a refused enable says how to load the plugin again" "$(printf '%s' "$result" | expression "d['next'].startswith('inkctl plugin disable new.plugin')")" "True"
check "a refused enable reads only PluginHost's log since the call" "$(called 'logcat -d -v time -T 11-16 23:00:00.000 -s PluginSec')" "1"
: > "$files/log"
result=$(run plugin enable Snap --json 2>/dev/null)
check "an unanswered enable with no refusal keeps the bridge log step" "$?$(printf '%s' "$result" | field "['next']")" "6inkctl logs --tag InkToolsBridge"
cp "$work/log-before-enable" "$files/log"
printf 'Broadcast completed: result=1, data="ok onSuccess PluginInfo{pluginID=new.plugin}"\n' > "$files/bridge-answer"
check "plugin enable names a missing plugin" "$(exit_of plugin enable Nothing)" "4"
printf 'Row: 0 name=Snap, pluginID=new.plugin, enable=false\n' > "$files/rows"
rm -f "$files/bridge-installed"
: > "$files/bridge-calls"
run plugin enable Snap >/dev/null 2>"$work/err"
check "plugin enable without the bridge app stops with its own code and sends nothing" "$?$(bridge_calls)" "14"
check "plugin enable without the bridge says how to install it" "$(grep -c 'inktools-bridge' "$work/err")" "1"
check "read-only mode refuses plugin enable" "$(exit_of --read-only plugin enable Snap)" "11"
touch "$files/bridge-installed"
rm -f "$files/bridge-answer"
check "an installed bridge that never answers stops with code 14" "$(exit_of plugin enable Snap)" "14"

printf 'Broadcast completed: result=1, data="ok allow new.plugin"\n' > "$files/bridge-answer"
printf 'Row: 0 pluginID=new.plugin, usesPermissions=[{"name":"plugin.permission.FILE:READ","status":0},{"name":"plugin.permission.FILE:WRITE","status":-1}]\n' > "$files/plugin-row"
printf 'Row: 0 pluginID=new.plugin, usesPermissions=[{"name":"plugin.permission.FILE:READ","status":2},{"name":"plugin.permission.FILE:WRITE","status":2}]\n' > "$files/plugin-row-after"
: > "$files/bridge-calls"
result=$(run plugin allow Snap --json)
check "plugin allow sets every used permission to Always Allow and proves it" "$(printf '%s' "$result" | field "['permissions']")" "{'plugin.permission.FILE:READ': 2, 'plugin.permission.FILE:WRITE': 2}"
check "plugin allow sends the names and status 2" "$(bridge_calls)" "am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op allow --es pluginID new.plugin --es perm plugin.permission.FILE:READ,plugin.permission.FILE:WRITE --ei status 2"
check "plugin allow reads the single-plugin row" "$(called 'content query --uri content://com.ratta.supernote.pluginhost/plugins/new.plugin')" "2"
printf 'Row: 0 pluginID=new.plugin, usesPermissions=[{"name":"plugin.permission.FILE:READ","status":0},{"name":"plugin.permission.FILE:WRITE","status":0}]\n' > "$files/plugin-row"
rm -f "$files/plugin-row-after"
: > "$files/bridge-calls"
check "plugin allow times out when the row keeps the old status" "$(exit_of plugin allow Snap plugin.permission.FILE:READ --timeout 0)" "6"
check "plugin allow sends only the named permission" "$(bridge_calls | grep -c 'perm plugin.permission.FILE:READ --ei')" "1"
check "plugin allow refuses a permission the plugin does not use" "$(exit_of plugin allow Snap plugin.permission.NETWORK)" "4"
printf 'Row: 0 pluginID=new.plugin, usesPermissions=something else\n' > "$files/plugin-row"
check "plugin allow stops on a notation it cannot read" "$(exit_of plugin allow Snap)" "1"
printf 'Row: 0 name=Snap, pluginID=new.plugin, enable=true\nRow: 1 name=Other, pluginID=other, enable=true\n' > "$files/rows"
printf 'Row: 0 name=Other, pluginID=other, enable=true\n' > "$files/rows-after-bridge"
printf 'Broadcast completed: result=1, data="ok onSuccess"\n' > "$files/bridge-answer"
: > "$files/bridge-calls"
check "plugin uninstall goes through the bridge and proves it from the list" "$(run plugin uninstall Snap --json | field "['route'],d['action']")" "('bridge', 'uninstalled')"
check "the bridge uninstall presses nothing on the screen" "$(bridge_calls)$(called 'input tap')" "am broadcast -n com.martonpaulo.inktools.bridge/.CommandReceiver -f 32 --es op uninstall --es pluginID new.plugin0"
printf 'Row: 0 name=Snap, pluginID=new.plugin, enable=true\n' > "$files/rows"
check "plugin list is plugin ls" "$(run plugin list --json | field "['plugins'][0]['pluginID']")" "new.plugin"
rm -f "$files/bridge-installed" "$files/bridge-answer" "$files/rows-after-bridge" "$files/plugin-row" "$files/plugin-row-after" "$files/bridge-calls"
# A plugin's page in Settings (#191): each press shows the next screen of a synthetic walk.
settings_screens() {
    python3 - "$files" "$@" <<'PY'
import sys
folder, screens = sys.argv[1], sys.argv[2:]
def node(text, top, left=0, right=900, ident=""):
    return f'<node text="{text}" resource-id="{ident}" content-desc="" class="T" bounds="[{left},{top}][{right},{top + 100}]" />'
def page(*rows):
    return "<?xml version='1.0' ?><hierarchy rotation=\"0\">" + "".join(rows) + "</hierarchy>"
def permissions(*states):
    labels = ("Network Access", "File Read Access", "File Write Access")
    return page(node("Permissions", 0, right=1920), *(node(label, 200 + 200 * index) + node(state, 200 + 200 * index, 1200, 1800) for index, (label, state) in enumerate(zip(labels, states))))
shown = {
    "list": page(node("Apps", 0), node("Plugins", 100), node("Select Plugin Package", 200), node("Enabled (3/10)", 300), node("Snap", 400)),
    "plugin": page(node("Snap", 0), node("Permissions", 100), node("Uninstall", 200)),
    "bare": page(node("Snap", 0)),
    "start": permissions("Ask Every Time", "Allow", "Don't Allow"),
    "half": permissions("Allow", "Allow", "Don't Allow"),
    "done": permissions("Allow", "Allow", "Allow"),
    "dialog": page(node("Network Access", 1000, right=1920), node("Allow", 1100, right=1920), node("Ask Every Time", 1200, right=1920), node("Don't Allow", 1300, right=1920)),
    "confirm": page(node("Uninstall", 800, right=1920), node("Uninstall this plugin? Its data will also be deleted.", 1000, right=1920), node("Cancel", 1200), node("Uninstall", 1200, 1000, 1900, "com.ratta.settings:id/plugin_confirm_ok")),
    "silent": page(node("Remove Snap?", 1000, right=1920), node("OK", 1200, 1000, 1900)),
}
for number, name in enumerate(screens, 1):
    open(f"{folder}/page{number}.xml", "w").write(shown[name])
PY
    echo 1 > "$files/page"
    touch "$files/tap-turns"
}
end_settings() { rm -f "$files/page" "$files/tap-turns" "$files"/page?.xml; }
printf 'Row: 0 name={"en":"Snap"}, pluginID=snap.id, pluginKey=SnapKey\nRow: 1 name=Other, pluginID=other\n' > "$files/rows"
settings_screens list list list plugin start
result=$(run plugin permissions SnapKey --json 2>/dev/null)
check "plugin permissions reads each permission and its state" "$(printf '%s' "$result" | expression "[(p['permission'], p['state']) for p in d['permissions']]")" "[('Network Access', 'Ask Every Time'), ('File Read Access', 'Allow'), ('File Write Access', \"Don't Allow\")]"
check "plugin permissions finds the plugin by its pluginKey" "$(printf '%s' "$result" | field "['plugin']")" "snap.id"
check "plugin permissions presses only the way to the page" "$(called 'input tap')" "4"
settings_screens list list list plugin start dialog half dialog done
result=$(run plugin permissions snap always --json 2>/dev/null)
check "plugin permissions always changes only what is not on Allow" "$(printf '%s' "$result" | field "['changed']")" "['Network Access', 'File Write Access']"
check "plugin permissions always reads every state back" "$(printf '%s' "$result" | expression "{p['state'] for p in d['permissions']}")" "{'Allow'}"
check "plugin permissions always presses each row and its choice" "$(called 'input tap')" "8"
check "plugin permissions always presses the choice in the dialog" "$(called 'input tap 960 1150')" "2"
settings_screens list list list plugin start dialog half dialog half
run plugin permissions Snap always --step-timeout 0 >/dev/null 2>"$work/err"
check "a read-back that keeps another state fails" "$?$(grep -c 'File Write Access' "$work/err")" "11"
settings_screens list list list plugin start half
run plugin permissions Snap always --step-timeout 0 >/dev/null 2>&1
check "a row that opens no dialog stops before the choice" "$?$(called 'input tap')" "95"
settings_screens list list list bare
run plugin permissions Snap --step-timeout 0 >/dev/null 2>&1
check "a plugin page with no Permissions stops with its own code" "$?$(called 'input tap')" "93"
run plugin permissions Missing >/dev/null 2>&1
check "plugin permissions of an unknown plugin presses nothing" "$?$(called 'input tap')" "40"
printf 'Row: 0 name=Snap, pluginID=snap.id\nRow: 1 name=Snap, pluginID=snap.two\n' > "$files/rows"
run plugin uninstall Snap >/dev/null 2>&1
check "a name two plugins share stops before the uninstall" "$?$(called 'input tap')" "40"
printf 'Row: 0 name={"en":"Snap"}, pluginID=snap.id\nRow: 1 name=Other, pluginID=other\n' > "$files/rows"
printf 'Row: 0 name=Other, pluginID=other\n' > "$files/rows-after"
echo 5 > "$files/taps-left"
settings_screens list list list plugin confirm bare
result=$(run plugin uninstall snap.id --json 2>/dev/null)
check "plugin uninstall proves it from the plugin list" "$(printf '%s' "$result" | field "['action'],d['plugin']")" "('uninstalled', 'snap.id')"
check "plugin uninstall presses the confirmation after reading it" "$(called 'input tap 1450 1250')" "1"
printf 'Row: 0 name={"en":"Snap"}, pluginID=snap.id\n' > "$files/rows"
echo 99 > "$files/taps-left"
settings_screens list list list plugin confirm bare
run plugin uninstall Snap --timeout 0 >/dev/null 2>&1
check "plugin uninstall gives up when the plugin stays in the list" "$?" "6"
settings_screens list list list plugin silent
run plugin uninstall Snap --step-timeout 0 >/dev/null 2>&1
check "a confirmation without the data warning is never confirmed" "$?$(called 'input tap')" "94"
end_settings
rm -f "$files/taps-left" "$files/rows-after"
printf '5\n' > "$files/size"
cp "$work/tree-saved" "$files/tree.xml"
cp "$work/rows-saved" "$files/rows"
output=$(run logs --tag Sync --lines 5)
check "logs read without clearing" "$(last_call)" "-s $serial logcat -d -v time -t 5 -s Sync"
check "logs mask a credential" "$(printf '%s' "$output" | grep -c 'abcdef')" "0"
check "logs keep the other fields" "$(printf '%s' "$output" | grep -c 'next=1')" "1"
cp "$files/log" "$work/log.saved"
cat > "$files/log" <<'LOG'
11-10 00:14:27.376 I/A( 1): {"token":"abc1"} access_token='abc2' Authorization: Bearer abc3
LOG
check "logs mask quoted values and a bearer token" "$(run logs | grep -c 'abc[123]')" "0"
cp "$work/log.saved" "$files/log"
check "logs parse in JSON" "$(run logs --json | field "['lines'][0]['tag'],d['lines'][0]['pid']")" "('Sync', 1218)"

# What the command can reach.
for changing in "note open Note/a.note" "note new Note/b.note" "files push $work/local/old.txt INBOX" "sync tasks" "sync calendar" "click id:files" "tap 1 2" "swipe 1 2 3 4" "plugin push $work/local/my.snplg" "plugin install $work/local/test.snplg" "plugin permissions Snap" "plugin uninstall Snap" "shell ls" "wifi on" "wifi off" "snapshot --all" "snapshot --find text:One" "firmware --download"; do
    # shellcheck disable=SC2086 # each entry is a command with its arguments
    run --read-only $changing >/dev/null 2>&1
    check "read-only refuses: $changing" "$?$(wc -l < "$log" | tr -d ' ')" "110"
done
SUPERNOTE_READ_ONLY=1 run tap 1 2 >/dev/null 2>&1
check "the environment turns on read-only mode" "$?" "11"
check "read-only allows what only reads" "$(run --read-only status --json | field "['battery']")" "93"
for private in Note "Note/A note.note" /sdcard/Note/x "Note/../Note/x" "" /storage/emulated /storage/emulated/0/EXPORT/a.note //storage/emulated/0/Note/a.pdf /storage/emulated/0/NOTE/a.pdf /sdcard/x.NOTE; do
    run files pull "$private" "$work/local/x" >/dev/null 2>&1
    check "files pull protects: [$private]" "$?$(called ' pull ')" "120"
done
run files pull EXPORT/a.pdf "$work/local/x" >/dev/null 2>&1
check "files pull allows another folder" "$(called ' pull ')" "1"
echo "f $root/Note/Tests/Round one.note" >> "$files/paths"
run files pull "Note/Tests/Round one.note" "$work/local/x" >/dev/null 2>&1
check "files pull allows a test note without the flag" "$?$(called ' pull ')" "01"
run files pull "Note/Tests/../A note.note" "$work/local/x" >/dev/null 2>&1
check "files pull keeps a path that leaves Note/Tests/ protected" "$?$(called ' pull ')" "120"
run files pull EXPORT/a.pdf "$work/local/x" >/dev/null 2>&1
check "files pull allows another folder" "$(called ' pull ')" "1"
echo "f $root/Note/A note.note" >> "$files/paths"
run files pull "Note/A note.note" "$work/local/x" --allow-notes >/dev/null
check "--allow-notes copies a note" "$?$(called ' pull ')" "01"
printf '%s' "$note_activity" > "$files/foreground"
run screen "$work/local/note.png" >/dev/null 2>&1
check "screen protects a note on the screen" "$?$(called screencap)" "120"
check "screen with --allow-notes captures it" "$(run screen "$work/local/note.png" --allow-notes --json | field "['bytes']")" "12"
# A test note under Note/Tests/ needs no flag; the title its bottom bar shows is the evidence (#193).
cp "$files/tree.xml" "$work/tree-saved"
sed 's|</node></hierarchy>|<node resource-id="com.ratta.supernote.note:id/tv_button" text="Round one" content-desc="" class="android.widget.TextView" bounds="[1400,2444][1770,2560]" /></node></hierarchy>|' "$work/tree-saved" > "$files/tree.xml"
printf '%s\n' "$root/Note/Tests/Round one.note" "$root/Note/Diary.note" > "$files/notes-found"
check "screen captures a test note without the flag" "$(run screen "$work/local/note.png" --json | field "['bytes']")" "12"
printf '%s\n' "$root/Note/Tests/Round one.note" "$root/Note/Round one.note" > "$files/notes-found"
run screen "$work/local/note.png" >/dev/null 2>&1
check "a note of the same name outside Note/Tests/ stays protected" "$?" "12"
printf '%s\n' "$root/Note/Diary.note" > "$files/notes-found"
run screen "$work/local/note.png" >/dev/null 2>&1
check "a title that names no test note stays protected" "$?" "12"
cp "$work/tree-saved" "$files/tree.xml"
reset_device
printf '%s' "$note_activity" > "$files/am-goes-to"
result=$(run note open "Note/A note.note" --screen "$work/local/skip.png" --json)
check "a capture over a note is skipped and reported" "$(printf '%s' "$result" | expression "'screen_refused' in d, 'screen' in d")" "(True, False)"
check "a skipped capture does not fail the action" "$(called screencap)" "0"
reset_device
result=$(run wifi off --json 2>/dev/null)
check "wifi off with no cable refuses, so the session is not stranded" "$?$(printf '%s' "$result" | field "['error']")$(called ' usb')" "1no_usb0"
result=$(run wifi off --leave-unreachable --json)
check "wifi off asks the tablet to close the port" "$(called ' usb')$(called 'disconnect')" "11"
check "wifi off says how to turn it on" "$(printf '%s' "$result" | field "['restore']" | grep -c 'adb tcpip 5555')" "1"
check "wifi off is logged as a change" "$(tail -1 "$history_file" | field "['command']")" "wifi off"
reset_device
echo absent > "$files/state"
printf 'USB0001\tdevice\n' > "$files/usb"
result=$(run wifi on --json)
check "wifi on opens the port over the cable" "$(called '-s USB0001 tcpip 5555')" "1"
check "wifi on connects over Wi-Fi after it" "$(called "connect $serial")$(printf '%s' "$result" | field "['wifi_adb']")" "1on"
check "wifi on is logged as a change" "$(tail -1 "$history_file" | field "['command']")" "wifi on"
reset_device
printf '%s\tdevice\nUSB0002\tunauthorized\n' "$serial" > "$files/usb"
result=$(run wifi on --json 2>/dev/null)
check "wifi on with no authorized cable says so" "$?$(printf '%s' "$result" | field "['error']")$(called tcpip)" "1no_usb0"
reset_device
check "status says Wi-Fi ADB is on" "$(run status --json | field "['wifi_adb']")" "on"
check "status names the Wi-Fi link" "$(run status --json | field "['link']")" "wifi"

# The USB cable (#171): one authorized tablet on USB carries every call, with or without Wi-Fi.
reset_device
printf 'USB0001\tdevice\n' > "$files/usb"
result=$(run status --json)
check "one tablet on USB carries the calls" "$(printf '%s' "$result" | field "['link']")$(called '-s USB0001 shell')$(called "-s $serial")" "usb30"
check "the cable needs no adb connect" "$(called 'connect ')" "0"
check "status over the cable asks whether Wi-Fi ADB is on" "$(printf '%s' "$result" | field "['wifi_adb']")" "off"
check "the USB serial is masked in the log" "$(tail -1 "$history_file" | grep -c USB0001)" "0"
HOME="$work/empty" PATH="$work/bin:$PATH" ADB_LOG="$log" ADB_FILES="$files" python3 -B "$script" status >/dev/null 2>&1
check "the cable works with no address recorded" "$?" "0"
printf 'USB0001\tdevice\n%s\toffline\n' "$serial" > "$files/usb"
run status >/dev/null
check "an offline Wi-Fi device leaves the cable in use" "$?$(called '-s USB0001 shell')" "03"
result=$(run wifi off --json)
check "wifi off over the cable closes the port and keeps the cable" "$(called '-s USB0001 usb')$(called "disconnect $serial")$(printf '%s' "$result" | field "['wifi_adb']")" "11off"
printf 'USB0001\tdevice\nUSB0002\tdevice\n' > "$files/usb"
run status >/dev/null
check "two tablets on USB leave Wi-Fi in use" "$(called "-s $serial shell")$(called '-s USB0001 shell')" "30"
printf 'USB0001\tunauthorized\n' > "$files/usb"
run status >/dev/null
check "an unauthorized cable leaves Wi-Fi in use" "$(called "-s $serial shell")" "3"
reset_device
check "help lists the read-only exit code" "$(python3 -B "$script" --help | grep -c '11 read-only')" "1"

# The lasso «⋯» list (#189): tv_button rows in a scrolling list that moves with the lasso.
lasso_screen() {  # the rows' names; a row named "-" is cut by the list's lower edge
    printf "<?xml version='1.0' ?><hierarchy rotation=\"0\"><node resource-id=\"a:id/lassoMore\" text=\"\" content-desc=\"lassoMore\" class=\"L\" bounds=\"[1370,150][1486,264]\" /><node resource-id=\"\" text=\"\" content-desc=\"\" class=\"androidx.recyclerview.widget.RecyclerView\" scrollable=\"true\" bounds=\"[906,326][1484,1006]\">"
    top=326
    for name in "$@"; do
        bottom=$((top + 140)); [ "$bottom" -gt 1006 ] && bottom=1006
        printf "<node resource-id=\"a:id/tv_button\" text=\"%s\" content-desc=\"\" class=\"T\" bounds=\"[1059,%s][1419,%s]\" />" "$name" "$top" "$bottom"
        top=$((top + 142))
    done
    printf "</node><node resource-id=\"a:id/tv_button\" text=\"Round one\" content-desc=\"\" class=\"T\" bounds=\"[1401,2444][1769,2560]\" /></hierarchy>"
}
closed_lasso() {
    printf "<?xml version='1.0' ?><hierarchy rotation=\"0\"><node resource-id=\"\" text=\"\" content-desc=\"lassoMore\" class=\"L\" bounds=\"[1370,150][1486,264]\" /></hierarchy>"
}
lasso_pages() {
    lasso_screen "Flip Horizontal" "Flip Vertical" "Recognize as Text" "New Event" "New Task" > "$files/page1.xml"
    lasso_screen "New Task" "Enhance" "Lighter" "Darker" "Restore original" > "$files/page2.xml"
    echo 1 > "$files/page"
}
swipes_inside() {  # every swipe of the last run starts and ends inside the list's bounds
    grep 'input swipe' "$log" | awk '{ if ($6 < 906 || $6 > 1484 || $8 < 906 || $8 > 1484 || $7 < 326 || $7 > 1006 || $9 < 326 || $9 > 1006) bad++ } END { print bad + 0 }'
}
printf '%s' "$note_activity" > "$files/foreground"
lasso_pages
result=$(run lasso rows --json)
check "lasso rows lists every row once, in order" "$(printf '%s' "$result" | field "['rows']")" "['Flip Horizontal', 'Flip Vertical', 'Recognize as Text', 'New Event', 'New Task', 'Enhance', 'Lighter', 'Darker', 'Restore original']"
check "lasso rows swipes only inside the list" "$(called 'input swipe')$(swipes_inside)" "40"
lasso_pages
result=$(run lasso press Lighter --json)
check "lasso press scrolls to a row below the first screen and presses its centre" "$(called 'input tap 1239 680')$(printf '%s' "$result" | field "['row']")" "1Lighter"
check "lasso press swipes only inside the list" "$(swipes_inside)" "0"
lasso_pages
lasso_screen "Flip Horizontal" "Flip Vertical" "Recognize as Text" "New Event" "-" > "$files/page1.xml"
lasso_screen "New Event" "Enhance" "Lighter" "Darker" "Restore original" > "$files/page2.xml"
run lasso press "Flip Vertical" >/dev/null
check "lasso press on the first screen sends no swipe" "$(called 'input swipe')$(called 'input tap 1239 538')" "01"
lasso_pages
run lasso press Absent >/dev/null 2>&1
check "lasso press of a missing row stops with not found" "$?$(called 'input tap')" "40"
stop_pages
run lasso rows >/dev/null 2>&1
check "lasso rows with no lasso toolbar stops before any press" "$?$(called 'input')" "90"
closed_lasso > "$files/page1.xml"
lasso_screen "Flip Horizontal" "Flip Vertical" > "$files/page2.xml"
echo 1 > "$files/page"
echo 1 > "$files/advance-after"
touch "$files/no-return"
check "lasso rows opens a closed list first" "$(run lasso rows --json | field "['rows']")$(called 'input tap 1428 207')" "['Flip Horizontal', 'Flip Vertical']1"
rm -f "$files/no-return" "$files/advance-after"
stop_pages
reset_device

# Ink and lasso through Probe's «Run Command» button (#148).
helper_screen() {
    printf "<?xml version='1.0' ?><hierarchy rotation=\"0\"><node resource-id=\"\" text=\"\" content-desc=\"plugins\" class=\"L\" bounds=\"[0,1400][116,1540]\" /><node resource-id=\"\" text=\"Run Command\" content-desc=\"\" class=\"T\" bounds=\"[200,1400][500,1500]\" /><node resource-id=\"a:id/tv_button\" text=\"Round one\" content-desc=\"\" class=\"T\" bounds=\"[1401,2444][1769,2560]\" /></hierarchy>"
}
answer_line() {  # the time, then the answer's tail after the id
    printf '%s I/ReactNativeJS(  900): SNPROBE answer %s\n' "$1" "$2"
}
helper_ready() {
    reset_device
    printf '%s' "$note_activity" > "$files/foreground"
    helper_screen > "$files/tree.xml"
    printf '%s\n' "$root/Note/Tests/Round one.note" > "$files/notes-found"
    answer_line '11-16 23:00:01.000' 'COMMAND_ID 1/1 {"ok":true,"op":"insertStrokes","ms":80,"page":0,"strokes":7,"rect":{"left":100,"top":248,"right":400,"bottom":335}}' > "$files/helper-answer"
}
command_field() { python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2], {'d': d}))" "$files/command.json" "$1"; }
cp "$files/tree.xml" "$work/tree-before-helper"
helper_ready
result=$(run ink write "maçã" --at 100 200 --json)
check "ink write pushes the strokes of each letter and accent" "$?$(command_field "d['op'], len(d['strokes'])")" "0('insertStrokes', 8)"
check "ink write places the text's top-left corner at --at" "$(command_field "min(p[0] for s in d['strokes'] for p in s), min(p[1] for s in d['strokes'] for p in s) >= 200")" "(100, True)"
check "ink write presses Run Command and reads Probe's answer" "$(called 'input tap 350 1450')$(printf '%s' "$result" | field "['ok'],d['rect']['left']")" "1(True, 100)"
check "ink write reads only the log after its push" "$(called 'logcat -d -v time -T 11-16 23:00:00.000 -s ReactNativeJS')" "1"
check "ink write presses Run Command from its one screen read (#286)" "$(called 'uiautomator dump')" "1"
helper_ready
run --time ink write "a" --at 100 200 >/dev/null 2>"$work/err"
check "--time prints the run's own time on stderr (#286)" "$?$(grep -cE '^time: [0-9]+([.][0-9]+)? s$' "$work/err")" "01"
for value in 0 abc 9; do
    INKCTL_POLL_SECONDS=$value run status >/dev/null 2>"$work/err"
    check "INKCTL_POLL_SECONDS=$value is a usage error before any adb call (#286)" "$?$(grep -c . "$log")$(grep -c INKCTL_POLL_SECONDS "$work/err")" "201"
done
INKCTL_POLL_SECONDS=0.05 run status >/dev/null 2>&1
check "INKCTL_POLL_SECONDS in range is taken (#286)" "$?" "0"
answer_line '11-16 23:00:01.000' 'COMMAND_ID 1/2 {"ok":true,"op":"lassoLast","rect":{"left":92,' > "$files/helper-answer"
answer_line '11-16 23:00:01.001' 'COMMAND_ID 2/2 "top":240,"right":408,"bottom":343},"counts":{"trailNum":7},"ms":200}' >> "$files/helper-answer"
check "lasso last-insert joins an answer in two chunks" "$(run lasso last-insert --json | field "['counts']")$(command_field "d['op']")" "{'trailNum': 7}lassoLast"
run lasso rect 10 20 300 40 >/dev/null
check "lasso rect sends the page rectangle" "$(command_field "d['rect']")" "{'left': 10, 'top': 20, 'right': 310, 'bottom': 60}"
answer_line '11-16 23:00:01.000' 'COMMAND_ID 1/1 {"ok":false,"code":1501,"message":"insertPageElements: no permission"}' > "$files/helper-answer"
run ink write "a" --at 100 200 >/dev/null 2>"$work/err"
check "a refusal by Probe fails with its code" "$?$(grep -c '1501 insertPageElements: no permission' "$work/err")" "11"
answer_line '11-16 23:00:01.000' 'unknown 1/1 {"ok":false,"code":1,"message":"command file: not in MyStyle/Probe"}' > "$files/helper-answer"
run lasso last-insert >/dev/null 2>"$work/err"
check "an unreadable command file is reported, not waited on" "$?$(grep -c 'command file' "$work/err")" "11"
answer_line '11-16 22:59:59.000' 'unknown 1/1 {"ok":false,"code":1,"message":"an older press"}' > "$files/helper-answer"
run lasso last-insert --timeout 0 >/dev/null 2>&1
check "an unknown answer from before the push is ignored, and no answer times out" "$?" "6"
helper_ready
answer_line '11-16 23:00:01.000' 'COMMAND_ID 1/1 {"ok":true,"op":"readLasso","ms":30,"strokes":[[[110,220],[130,260]],[[150,230],[160,240]]]}' > "$files/helper-answer"
run ink save "$work/local/sample.json" >/dev/null
check "ink save writes the lassoed strokes from the top-left corner" "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["strokes"][0])' "$work/local/sample.json")" "[[0, 0], [20, 40]]"
helper_ready
run ink strokes "$work/local/sample.json" --at 500 600 >/dev/null
check "ink strokes moves a saved sample to --at" "$(command_field "d['strokes'][1][0]")" "[540, 610]"
run ink write "í" --at 100 200 >/dev/null
check "an accent on i takes the dot's place" "$(command_field "len(d['strokes'])")" "2"
run ink write "Wq!" --at 100 200 >/dev/null 2>&1
check "a character the font lacks is a usage error before any push" "$?$(called ' push ')" "20"
run ink write "abc" --at 1900 200 >/dev/null 2>&1
check "ink that leaves the page is a usage error before any push" "$?$(called ' push ')" "20"
printf '%s\n' "$root/Note/Diary.note" > "$files/notes-found"
run ink write "a" --at 100 200 >/dev/null 2>&1
check "ink write on a note outside Note/Tests/ is refused" "$?$(called ' push ')" "120"
run ink write "a" --at 100 200 --allow-notes >/dev/null 2>&1
check "--allow-notes lets ink write on another note" "$?" "0"
printf '%s' "$calendar_activity" > "$files/foreground"
run lasso last-insert >/dev/null 2>&1
check "with no note open the helper stops before any push or press" "$?$(called ' push ')$(called 'input tap')" "900"
run --read-only ink write "a" --at 100 200 >/dev/null 2>&1
check "read-only refuses ink write" "$?" "11"
# Paging through Probe and the test fixtures note (#220): the note app ignores the page extra for a
# note opened before, so Probe jumps and reads the page back.
fixtures="$root/Note/Tests/Fixtures.note"
counter_screen() {  # the note's page counter, N of 14, beside the title
    helper_screen | sed "s|</hierarchy>|<node resource-id=\"a:id/tv_button\" text=\"$1 / 14\" content-desc=\"\" class=\"T\" bounds=\"[1401,2300][1769,2400]\" /></hierarchy>|" > "$files/tree.xml"
}
jump_answer() { answer_line '11-16 23:00:01.000' "COMMAND_ID 1/1 {\"ok\":true,\"op\":\"jumpToPage\",\"ms\":40,\"page\":$1}" > "$files/helper-answer"; }
helper_ready
printf 'f %s\n' "$fixtures" >> "$files/paths"
jump_answer 2
counter_screen 3
result=$(run fixture casa --json)
check "fixture opens the fixtures note at its page" "$?$(grep -cF "am start -W -a android.intent.action.VIEW -n $note_activity --es file_path $fixtures --es from_app launcher --ei page 2" "$log")" "01"
check "fixture asks Probe to jump to the page, from 0" "$(command_field "d['op'], d['page']")" "('jumpToPage', 2)"
check "fixture proves the page from the page counter" "$(printf '%s' "$result" | field "['fixture'],d['page'],d['path']")" "('casa', 3, '$fixtures')"
jump_answer 9
result=$(run fixture casa --json)
check "fixture ignores a wrong Probe read-back when the counter shows the page (#220)" "$?$(printf '%s' "$result" | field "['page']")" "03"
counter_screen 1
run fixture casa >/dev/null 2>"$work/err"
check "fixture on the wrong page after opening fails and names the shown page" "$?$(grep -c 'shows page 1, not page 3' "$work/err")" "91"
run fixture kitchen >/dev/null 2>"$work/err"
check "an unknown fixture is a usage error before any call to the note" "$?$(called 'am start')$(grep -c 'below-word' "$work/err")" "201"
run fixture apple --lasso nothing >/dev/null 2>&1
check "an unknown rect of a fixture is a usage error before any call to the note" "$?$(called 'am start')" "20"
jump_answer 5
counter_screen 6
run fixture translation --lasso manzana >/dev/null
check "fixture --lasso lassoes the named rect after the jump" "$?$(command_field "d['op'], d['rect']")" "0('lassoRect', {'left': 300, 'top': 700, 'right': 760, 'bottom': 769})"
printf 'f %s\n' "$root/Note/A note.note" > "$files/paths"
run fixture casa >/dev/null 2>"$work/err"
check "a missing fixtures note stops with not found, names the page map and creates nothing" "$?$(grep -c 'issues/214#issuecomment' "$work/err")$(called 'am start')$(called ' push ')" "4100"
result=$(run fixture --list --json)
check "fixture --list reaches no tablet" "$?$(grep -c . "$log")" "00"
check "fixture --list gives every fixture in page order" "$(printf '%s' "$result" | expression "[f['name'] for f in d['fixtures']], [f['page'] for f in d['fixtures']] == list(range(1, 14))")" "(['apple', 'maca', 'casa', 'cafe', 'coffee', 'translation', 'full-name', 'no-letters', 'marks', 'photo', 'illustration', 'blank', 'below-word'], True)"
check "fixture --list gives each rect and what the page serves" "$(printf '%s' "$result" | expression "d['fixtures'][12]['rects']['line'], d['fixtures'][0]['rects']['label'], d['fixtures'][5]['serves']")" "([500, 560, 1252, 662], [60, 40, 1860, 110], ['#127'])"
check "fixture --list runs in read-only mode" "$(run --read-only fixture --list >/dev/null; echo $?)" "0"
jump_answer 2
counter_screen 3
result=$(run note open "Note/A note.note" --page 3 --json)
check "note open --page proves the page through Probe" "$?$(command_field "d['op'], d['page']")$(printf '%s' "$result" | field "['page']")" "0('jumpToPage', 2)3"
counter_screen 7
run note open "Note/A note.note" --page 3 >/dev/null 2>"$work/err"
check "note open --page on a note that keeps its last page fails and names the shown page" "$?$(grep -c 'shows page 7, not page 3' "$work/err")" "91"
helper_screen > "$files/tree.xml"
run note open "Note/A note.note" --page 3 >/dev/null 2>"$work/err"
check "note open --page with no page counter on screen fails and says so" "$?$(grep -c 'page counter' "$work/err")" "11"
run note open "Note/A note.note" --page 0 >/dev/null 2>&1
check "note open --page 0 is a usage error before any start" "$?$(called 'am start')" "20"
# The tablet's PNG of a page and the test notebooks' inserts, through Probe (#261).
helper_ready
render="$root/MyStyle/Probe/page.png"
printf 'f %s\n' "$render" >> "$files/paths"
printf 'PNG' > "$files/pull-content"
answer_line '11-16 23:00:01.000' 'COMMAND_ID 1/1 {"ok":true,"op":"renderPage","ms":300,"page":1,"path":"/storage/emulated/0/MyStyle/Probe/page.png"}' > "$files/helper-answer"
result=$(run note png 2 "$work/local/page2.png" --json)
check "note png asks Probe for the page, from 0, and pulls it" "$?$(command_field "d['op'], d['page']")$(printf '%s' "$result" | field "['page'],d['bytes']")$(cat "$work/local/page2.png")" "0('renderPage', 1)(2, 3)PNG"
check "note png removes the tablet's copy" "$(grep -cxF "rm -f $render" "$files/removed")" "1"
run note png 2 "$work/local/page2.png" >/dev/null 2>&1
check "note png refuses to replace a local file before any push" "$?$(called ' push ')" "50"
printf 'f %s\n' "$render" >> "$files/paths"
run note png 2 "$work/local/page2.png" --overwrite >/dev/null
check "note png --overwrite replaces it" "$?" "0"
run note png 0 "$work/local/page0.png" >/dev/null 2>&1
check "note png 0 is a usage error" "$?" "2"
answer_line '11-16 23:00:01.000' 'COMMAND_ID 1/1 {"ok":true,"op":"insertPicture","ms":90,"page":0,"path":"/storage/emulated/0/MyStyle/Probe/picture.png"}' > "$files/helper-answer"
printf 'picture' > "$work/local/square.png"
run note insert-picture "$work/local/square.png" >/dev/null
check "note insert-picture pushes the picture to Probe's folder and names it" "$?$(called "push $work/local/square.png $root/MyStyle/Probe/picture.png")$(command_field "d['op'], d['path']")" "01('insertPicture', '/storage/emulated/0/MyStyle/Probe/picture.png')"
printf 'gif' > "$work/local/square.gif"
run note insert-picture "$work/local/square.gif" >/dev/null 2>&1
check "note insert-picture of a GIF is a usage error before any push" "$?$(called "square.gif")" "20"
answer_line '11-16 23:00:01.000' 'COMMAND_ID 1/1 {"ok":true,"op":"insertTextBox","ms":90,"page":0,"rect":{"left":100,"top":200,"right":900,"bottom":320}}' > "$files/helper-answer"
run note insert-text "Test box" --at 100 200 --size 800 120 >/dev/null
check "note insert-text sends the text, the rect and the font size" "$?$(command_field "d['op'], d['text'], d['rect'], d['fontSize']")" "0('insertTextBox', 'Test box', {'left': 100, 'top': 200, 'right': 900, 'bottom': 320}, 40)"
run note insert-text "Test box" --at 1800 200 --size 800 120 >/dev/null 2>&1
check "a text box that leaves the page is a usage error" "$?" "2"
answer_line '11-16 23:00:01.000' 'COMMAND_ID 1/1 {"ok":true,"op":"insertPage","ms":400,"page":1,"template":"style_white"}' > "$files/helper-answer"
run note insert-page style_white --page 2 >/dev/null
check "note insert-page sends the template and the page, from 0" "$?$(command_field "d['op'], d['page'], d['template']")" "0('insertPage', 1, 'style_white')"
run note insert-page ../x.png --page 2 >/dev/null 2>&1
check "a template that is not a system name is a usage error" "$?" "2"
# A page move goes to Probe's file API on a closed note, while another note is open (#263).
printf 'f %s\n' "$root/Note/Tests/Move.note" "$root/Note/Tests/Round one.note" "$root/Note/Diary.note" >> "$files/paths"
answer_line '11-16 23:00:01.000' 'COMMAND_ID 1/1 {"ok":true,"op":"movePage","ms":700,"path":"/storage/emulated/0/Note/Tests/Move.note","from":0,"to":2,"pages":4,"template":"style_white","storedTemplate":"style_white_a5x2","elements":3}' > "$files/helper-answer"
result=$(run note move-page Note/Tests/Move.note 1 3 --json)
check "note move-page sends the note's path and the pages, from 0" "$?$(command_field "d['op'], d['path'], d['from'], d['to'], 'template' in d")" "0('movePage', '$root/Note/Tests/Move.note', 0, 2, False)"
check "note move-page answers the pages from 1" "$(printf '%s' "$result" | field "['from'],d['to'],d['elements']")" "(1, 3, 3)"
run note move-page Note/Tests/Move.note 3 1 --template style_5mm_grid >/dev/null
check "note move-page --template sends the template" "$?$(command_field "d['from'], d['to'], d['template']")" "0(2, 0, 'style_5mm_grid')"
rm -f "$files/command.json"
for bad in "Note/Tests/Move.note 2 2" "Note/Tests/Move.note 0 2" "Note/Tests/Move.pdf 1 2" "Note/Tests/Move.note 1 2 --template ../x"; do
    run note move-page $bad >/dev/null 2>&1
    check "note move-page $bad is a usage error before any push" "$?$([ -e "$files/command.json" ] && echo pushed)" "2"
done
run note move-page Note/Diary.note 1 2 >/dev/null 2>&1
check "note move-page on a note outside Note/Tests/ is refused" "$?$([ -e "$files/command.json" ] && echo pushed)" "12"
run note move-page Note/Tests/Absent.note 1 2 >/dev/null 2>&1
check "note move-page of a missing note is not found" "$?" "4"
run note move-page "Note/Tests/Round one.note" 1 2 >/dev/null 2>&1
check "note move-page refuses the open note" "$?$([ -e "$files/command.json" ] && echo pushed)" "9"
run --read-only note move-page Note/Tests/Move.note 1 3 >/dev/null 2>&1
check "read-only refuses note move-page" "$?" "11"
printf '%s\n' "$root/Note/Diary.note" > "$files/notes-found"
for refused in "png 1 $work/local/diary.png" "insert-page style_white --page 2"; do
    run note $refused >/dev/null 2>&1
    check "note ${refused%% *} on a note outside Note/Tests/ is refused" "$?" "12"
done
run --read-only note insert-page style_white --page 2 >/dev/null 2>&1
check "read-only refuses note insert-page" "$?" "11"
rm -f "$files/pull-content" "$work/local/page2.png" "$work/local/square.png" "$work/local/square.gif"
rm -f "$files/helper-answer" "$files/command.json" "$files/notes-found"
cp "$work/tree-before-helper" "$files/tree.xml"
reset_device

# The handwriting language (#190): one code file in default/, packs as folders in resources/.
printf 'pt_BR\n' > "$files/lang-default"
printf 'en_US\nes_ES\npt_BR\nzh_CN\n' > "$files/lang-packs"
check "lang get reads the code and the packs" "$(run lang get --json | field "['language'],d['installed']")" "('pt_BR', ['en_US', 'es_ES', 'pt_BR', 'zh_CN'])"
result=$(run lang set en_US --json)
check "lang set writes the new file before it deletes the old one" "$(called 'touch /storage/emulated/0/.data/dictionary/default/en_US && rm -f /storage/emulated/0/.data/dictionary/default/pt_BR')" "1"
check "lang set tells the system and reads it back" "$(called 'am broadcast -a hw_type_change')$(printf '%s' "$result" | field "['before'],d['language']")" "1('pt_BR', 'en_US')"
check "lang cycle goes to the next of the cycle" "$(run lang cycle --json | field "['language']")" "es_ES"
check "lang cycle comes back to the first" "$(run lang cycle --json | field "['language']")" "pt_BR"
run lang set ja_JP >/dev/null 2>&1
check "lang set of a pack that is not installed stops with not found" "$?$(called touch)" "40"
run lang set english >/dev/null 2>&1
check "lang set of a bad code is a usage error" "$?" "2"
: > "$files/lang-default"
check "an empty default folder reads as English" "$(run lang get --json | field "['language']")" "en_US"
printf 'pt_BR\n' > "$files/lang-default"
run lang set en_US --read-only >/dev/null 2>&1
check "lang set is a change, refused in read-only mode" "$?$(called touch)" "110"
touch "$files/lang-missing"
run lang get >/dev/null 2>&1
check "a missing language folder stops with not found" "$?" "4"
rm -f "$files/lang-missing"

# The device log's filters.
: > "$files/pids"
run logs --level W >/dev/null
check "logs --level filters on the device" "$(last_call)" "-s $serial logcat -d -v time -t 100 *:W"
run logs --tag Sync --level E >/dev/null
check "logs --level joins --tag" "$(last_call)" "-s $serial logcat -d -v time -t 100 -s Sync:E"
run logs --package com.example.one >/dev/null 2>&1
check "logs --package on a process that is not running stops with its own code" "$?" "4"
echo 4242 > "$files/pids"
run logs --package com.example.one >/dev/null
check "logs --package reads that process" "$(last_call)" "-s $serial logcat -d -v time -t 100 --pid=4242"
run logs --pid 77 >/dev/null
check "logs --pid reads that process" "$(last_call)" "-s $serial logcat -d -v time -t 100 --pid=77"
check "logs --lines is a real limit" "$(run logs --lines 1 --json | field "['lines'].__len__()")" "1"
check "logs --grep ignores case" "$(run logs --grep 'NEXT=1' --json | field "['lines'].__len__()")" "1"
check "logs --grep drops the rest" "$(run logs --grep absent --json | field "['lines'].__len__()")" "0"
run logs --since 5m >/dev/null
check "logs --since counts a period on the device's clock" "$(last_call)" "-s $serial logcat -d -v time -T 1799999700.000"
run logs --since '11-10 00:14:27.376' >/dev/null
check "logs --since takes a device time" "$(last_call)" "-s $serial logcat -d -v time -T 11-10 00:14:27.376"
run logs --since soon >/dev/null 2>&1
check "logs --since refuses a bad period" "$?" "2"
cat >> "$files/log" <<'LOG'
11-10 00:14:28.000 W/PluginSec( 900): DENY camera for one.plugin
11-10 00:14:29.000 I/ReactNativeJS( 901): [SomePlugin] ready
11-10 00:14:30.000 I/Other( 902): unrelated
LOG
check "logs --since-last reads everything the first time" "$(run logs --since-last --json | field "['lines'].__len__()")" "4"
result=$(run logs --since-last --json)
check "logs --since-last starts at the last line read" "$(last_call)" "-s $serial logcat -d -v time -T 11-10 00:14:30.000"
check "logs --since-last does not repeat that line" "$(printf '%s' "$result" | field "['lines'].__len__()")" "0"
result=$(run logs --plugin someplugin --json)
check "logs --plugin keeps that plugin's lines and denied permissions" "$(printf '%s' "$result" | expression "[l['tag'] for l in d['lines']]")" "['PluginSec', 'ReactNativeJS']"
check "logs --plugin marks a denied permission" "$(printf '%s' "$result" | field "['lines'][0]['denied'],d['lines'][1]['denied']")" "(True, False)"
check "logs --plugin reads a wide window" "$(called 'logcat -d -v time -t 5000')" "1"
# A plugin logs under ReactNativeJS with its pluginKey as prefix, whatever name the reader gives (#192).
cp "$files/rows" "$work/rows-saved"
cp "$files/log" "$work/log-saved"
printf 'Row: 0 name={"en":"Image Editing"}, pluginID=retouchid1, pluginKey=Retouch, num=1\n' > "$files/rows"
printf '11-10 00:15:00.000 E/ReactNativeJS( 901): Retouch: Enhance: failed: getPageSize: 1503\n11-10 00:15:01.000 I/ReactNativeJS( 901): Lookup: ready\n' >> "$files/log"
for name in "Image Editing" retouch retouchid1; do
    check "logs --plugin finds the ReactNativeJS line by $name" "$(run logs --plugin "$name" --json | expression "[l['message'] for l in d['lines'] if l.get('tag') == 'ReactNativeJS']")" "['Retouch: Enhance: failed: getPageSize: 1503']"
done
echo '--------- beginning of main' > "$files/log"  # logcat -s Retouch finds nothing: the stub does not filter tags
run logs --tag Retouch >/dev/null 2>"$work/err"
check "logs --tag with a plugin's name points to --plugin" "$(grep -c 'use --plugin Retouch' "$work/err")" "1"
run logs --tag Other >/dev/null 2>"$work/err"
check "logs --tag with another tag gives no hint" "$(grep -c 'use --plugin' "$work/err")" "0"
cp "$work/rows-saved" "$files/rows"
cp "$work/log-saved" "$files/log"
check "logs --follow prints and ends with the device" "$(run logs --follow --timeout 2 --grep unrelated)" "11-10 00:14:30.000 I/Other( 902): unrelated"
started=$SECONDS
output=$(ADB_HANG=1 run logs --follow --timeout 1 --json)
status=$?
check "logs --follow ends at its limit without failing" "$status" "0"
check "logs --follow is bounded" "$((SECONDS - started < 4))" "1"
check "logs --follow in JSON keeps the lines" "$(printf '%s' "$output" | field "['lines'].__len__()")" "4"
ADB_FOLLOW_FAILS=1 run logs --follow --timeout 2 >/dev/null 2>&1
check "logs --follow reports a logcat that failed" "$?" "1"
check "logs --follow never keeps the log open" "$(last_call)" "-s $serial logcat -v time -t 100"
run logs --follow --since-last >/dev/null 2>&1
check "logs refuses --follow with --since-last" "$?" "2"

# The command's own log.
rm -f "$history_file"
run status >/dev/null
check "a run adds one line" "$(wc -l < "$history_file" | tr -d ' ')" "1"
check "the log's fields are the contract" "$(run history --json --limit 1 | expression "[sorted(r) for r in d['runs']]")" "[['app_after', 'app_before', 'calls', 'command', 'error', 'exit', 'seconds', 'time']]"
check "a run names the app in front" "$(run history --json --limit 1 | field "['runs'][0]['app_before'],d['runs'][0]['app_after']")" "('$calendar_activity', '$calendar_activity')"
check "the log file is private" "$(python3 -c 'import os,sys; print(format(os.stat(sys.argv[1]).st_mode & 0o777, "o"))' "$history_file")" "600"
run files ls "Note" >/dev/null
check "a run names its command" "$(run history --json --limit 1 | field "['runs'][0]['command']")" "files ls"
check "a call keeps its verb and timing" "$(run history --json --limit 1 | expression "[c['call'] for c in d['runs'][0]['calls']]")" "['devices', 'get-state', 'shell dumpsys', 'shell ls', 'shell dumpsys']"
run note open "Note/A note.note" >/dev/null
check "the log keeps no path" "$(grep -c 'A note' "$history_file")" "0"
check "the log masks the address" "$(grep -c 'device-a' "$history_file")" "0"
run note open "Note/A note.note" --log-paths >/dev/null
check "--log-paths keeps the path" "$(grep -c 'A note' "$history_file")" "1"
check "--log-paths still masks the address" "$(grep -c 'device-a' "$history_file")" "0"
run files ls 'Note?password=hunter2' --log-paths >/dev/null 2>&1
check "the log masks a credential" "$(grep -c 'hunter2' "$history_file")" "0"
rm -f "$history_file"
run files ls Absent >/dev/null 2>&1
run status >/dev/null
check "history --failures keeps failed runs" "$(run history --failures --json | expression "[r['error'] for r in d['runs']]")" "['not_found']"
check "history --command filters by name" "$(run history --command files --json | field "['runs'].__len__()")" "1"
check "history --command takes a full name" "$(run history --command 'files ls' --json | field "['runs'].__len__()")" "1"
check "history --since keeps a recent run" "$(run history --since 1h --json | field "['runs'].__len__()")" "2"
printf '{"time": "2020-01-01T00:00:00+00:00", "command": "status", "exit": 0, "seconds": 0, "error": null}\n' >> "$history_file"
check "history --since drops an old run" "$(run history --since 1h --json | field "['runs'].__len__()")" "2"
check "history --limit keeps the newest" "$(run history --limit 1 --json | field "['runs'][0]['command']")" "status"
run history --since soon >/dev/null 2>&1
check "history refuses a bad period" "$?" "2"
printf 'not json\n' >> "$history_file"
check "history counts a broken line" "$(run history --json 2>/dev/null | field "['unreadable']")" "1"
HOME="$work/home" PATH="$work/empty" "$(command -v python3)" -B "$script" history >/dev/null 2>&1
status=$?
check "history needs no device" "$status" "0"
check "history adds no line" "$(grep -c '"command": "history"' "$history_file")" "0"
printf '\377\376 not text\n' >> "$history_file"
run history --json 2>/dev/null | field "['unreadable']" > "$work/out"
check "history counts a line that is not text" "$(cat "$work/out")" "2"
python3 -c 'import sys; open(sys.argv[1], "w").write("{\"time\": \"x\"}\n" * 80000)' "$history_file"
run status >/dev/null
check "the log stays within its limit" "$(($(wc -c < "$history_file") < 1000000))" "1"
check "the log keeps the newest run" "$(tail -1 "$history_file" | grep -c '"status"')" "1"
output=$(run shell echo hi 2>/dev/null)
check "a shell run is logged with the device's exit code" "$(tail -1 "$history_file" | field "['command'],d['exit']")" "('shell', 9)"
run nonsense >/dev/null 2>&1
check "bad usage is logged" "$(tail -1 "$history_file" | field "['command'],d['exit'],d['error']")" "('(usage)', 2, 'usage')"
rm -f "$history_file"
mkdir "$history_file"
run status >/dev/null 2>"$work/err"
check "a log that cannot be written keeps the exit code" "$?" "0"
check "a log that cannot be written says so" "$(grep -c 'run log was not written' "$work/err")" "1"
rmdir "$history_file"
output=$(run status --trace 2>"$work/err")
check "--trace shows each call" "$(grep -c 'trace: get-state' "$work/err")" "1"
check "--trace ends with the run's record" "$(tail -1 "$work/err" | grep -c '"command": "status"')" "1"
check "--trace leaves the answer alone" "$(printf '%s\n' "$output" | grep -c trace)" "0"

# Failures carry their cause and next command.
result=$(run files ls Absent --json 2>/dev/null)
check "a failure names its cause and next command" "$(printf '%s' "$result" | expression "sorted(d),d['next']")" "(['cause', 'error', 'message', 'next'], 'inkctl files ls')"
run click id:absent --json 2>/dev/null > "$work/out"
check "a missing element points to a snapshot" "$(field "['next']" < "$work/out")" "inkctl snapshot"
check "every failure kind has its advice" "$(python3 - "$script" <<'PY'
import re, sys
source = open(sys.argv[1]).read()
advice = source[source.index("FAILURE_ADVICE = {"):source.index("class Failure")]
kinds = set(re.findall(r'Failure\(\s*EXIT_\w+,\s*"(\w+)"', source))
print(sorted(kind for kind in kinds if f'"{kind}"' not in advice))
PY
)" "[]"

# Bridge's sign-in secrets (#116): the value travels on stdin, never in argv or the history.
# The private folder refuses adb (#116), so the value waits in a one-shot drop file Account Sync takes.
private=/storage/emulated/0/.data/plugin/inktools-account-sync
synthetic=tok-SYNTHETIC-0000-wxyz
output=$(printf '%s\r\n' "$synthetic" | run secret set todoist --json)
check "secret set writes the value from stdin without its line end" "$(cat "$files/secret-written")" "$synthetic"
check "secret set writes a temp name, then renames it" "$(called "mkdir -p $private && cat > $private/todoist.secret.partial && mv $private/todoist.secret.partial $private/todoist.secret")" "1"
check "secret set shows only the last four characters" "$(printf '%s' "$output" | field "['tail']")" "…wxyz"
check "the secret never reaches an adb argument" "$(grep -cF "$synthetic" "$log")" "0"
check "the secret never reaches the history" "$(grep -cF "$synthetic" "$history_file")" "0"
rm -f "$files/secret-written"
printf '%s\n' "$synthetic" | ADB_READS_STDIN=1 run secret set todoist >/dev/null
check "no earlier adb call swallows the piped secret" "$(cat "$files/secret-written")" "$synthetic"
check "no adb call but the write reads standard input" "$(cat "$files/swallowed" 2>/dev/null)" ""
rm -f "$files/secret-written" "$files/swallowed"
printf '\n' | run secret set todoist >/dev/null 2>&1
check "an empty secret is refused as usage" "$?" "2"
printf 'a\tb' | run secret set todoist >/dev/null 2>&1
check "a control character is refused" "$?" "2"
check "a refused secret writes nothing" "$([ -f "$files/secret-written" ] && echo written || echo none)" "none"
printf 'x' | run secret set dropbox >/dev/null 2>&1
check "an unknown provider is refused" "$?" "2"
touch "$files/write-fails"
printf 'x' | run secret set icloud >/dev/null 2>&1
check "a refused write fails" "$?" "1"
check "a refused write removes its temp file" "$(grep -cF "rm -f $private/icloud.secret.partial" "$files/removed")" "1"
rm -f "$files/write-fails"
printf 'x' | SUPERNOTE_READ_ONLY=1 run secret set todoist >/dev/null 2>&1
check "read-only mode refuses secret set" "$?" "11"
printf 'f %s\n' "$private/todoist.secret" >> "$files/paths"
check "secret status shows the tail of a stored secret" "$(run secret status | head -1)" "todoist: waiting for Account Sync (…wxyz)"
check "secret status names a provider with none" "$(run secret status | tail -1)" "google-client: nothing waiting"
check "secret remove takes back a waiting secret" "$(run secret remove todoist)" "todoist: the waiting secret was removed"
check "secret status reads back nothing waiting" "$(run secret status | head -1)" "todoist: nothing waiting"
providers=$(grep '^export const SECRET_PROVIDERS' "$repo_root/../../packages/sync-core/src/secrets.ts" | grep -o "'[a-z-]*'" | tr -d "'" | paste -sd, -)
check "the providers are sync-core's" "$providers" "todoist,icloud,google,google-client"
check "the file name is sync-core's" "$(grep -c '`${provider}.secret`' "$repo_root/../../packages/sync-core/src/secrets.ts")" "1"

# Every Keychain account inkctl names is the secret's name in upper snake case (credential naming rule, #277).
check "each Keychain account is named by the rule" "$(grep -E '^[A-Z_]+_ACCOUNT = ' "$repo_root/src/inkctl" | grep -cvE '= "[A-Z][A-Z0-9_]+"$')" "0"

# The Google sign-in on the Mac (#124): `security`, the browser and Google's token endpoint are stubs.
# The real Keychain, browser and network are never reached: PATH puts the `security` stub first,
# $BROWSER is the browser stub, and the client's token_uri is a local fake.
export KEYCHAIN="$work/keychain" SECURITY_LOG="$work/security.log"
mkdir -p "$KEYCHAIN"
cat > "$work/bin/security" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$SECURITY_LOG"
if [ "$1" = -i ]; then
    cat > "$KEYCHAIN/stdin"
    line=$(cat "$KEYCHAIN/stdin")
    [ -f "$KEYCHAIN/write-fails" ] || printf '%s' "${line##*-w }" > "$KEYCHAIN/ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN"
    exit 0
fi
[ -f "$KEYCHAIN/$5" ] || { echo 'security: The specified item could not be found in the keychain.' >&2; exit 44; }
cat "$KEYCHAIN/$5"
echo
STUB
cat > "$work/browser.py" <<'PY'
import os, sys, urllib.error, urllib.parse, urllib.request
keychain, mode = os.environ["KEYCHAIN"], os.environ["BROWSER_MODE"]
open(f"{keychain}/auth-url", "w").write(sys.argv[1])
query = urllib.parse.parse_qs(urllib.parse.urlsplit(sys.argv[1]).query)
redirect = query["redirect_uri"][0]
try:
    urllib.request.urlopen(f"{redirect}/favicon.ico", timeout=10)
except urllib.error.HTTPError:
    pass
answer = {"ok": {"state": query["state"][0], "code": "code-SYNTHETIC"},
          "badstate": {"state": "not-this-sign-in", "code": "code-SYNTHETIC"},
          "denied": {"state": query["state"][0], "error": "access_denied"}}[mode]
try:
    page = urllib.request.urlopen(f"{redirect}/?{urllib.parse.urlencode(answer)}", timeout=20).read()
except urllib.error.HTTPError as failed:
    page = failed.read()
open(f"{keychain}/page.html", "wb").write(page)
PY
cat > "$work/bin/browser" <<STUB
#!/bin/bash
[ "\$BROWSER_MODE" = none ] && exit 0
python3 "$work/browser.py" "\$1" >/dev/null 2>&1 &
exit 0
STUB
cat > "$work/token.py" <<'PY'
import http.server, json, os
keychain = os.environ["KEYCHAIN"]
both = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly"
class Token(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        open(f"{keychain}/token-body", "wb").write(self.rfile.read(int(self.headers["Content-Length"])))
        mode = open(f"{keychain}/token-mode").read().strip()
        status, answer = {
            "ok": (200, {"access_token": "access-SYNTHETIC", "refresh_token": os.environ["SYNTHETIC_REFRESH"], "scope": both}),
            "narrow": (200, {"access_token": "access-SYNTHETIC", "refresh_token": os.environ["SYNTHETIC_REFRESH"], "scope": both.split()[1]}),
            "refuse": (400, {"error": "invalid_grant"}),
        }[mode]
        body = json.dumps(answer).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *ignored):
        pass
server = http.server.HTTPServer(("127.0.0.1", 0), Token)
open(f"{keychain}/token-port.partial", "w").write(str(server.server_port))
os.rename(f"{keychain}/token-port.partial", f"{keychain}/token-port")
server.serve_forever()
PY
chmod +x "$work/bin/security" "$work/bin/browser"
export SYNTHETIC_REFRESH='1//SYNTHETIC-refresh-0000_wxyz'
python3 -B "$work/token.py" &
token_pid=$!
trap 'kill "$token_pid" 2>/dev/null; rm -rf "$work"' EXIT
# timing-independent: a poll with a deadline for the fake token server's port file.
for _ in $(seq 50); do [ -f "$KEYCHAIN/token-port" ] && break; sleep 0.1; done
client="$KEYCHAIN/ACCOUNT_SYNC_GOOGLE_OAUTH_CLIENT"
printf '{"installed": {"client_id": "client-SYNTHETIC.apps.example.test", "client_secret": "client-secret-SYNTHETIC", "auth_uri": "https://accounts.example.test/auth", "token_uri": "http://127.0.0.1:%s/token"}}' "$(cat "$KEYCHAIN/token-port")" > "$client"
google() { run google login --timeout 20 "$@"; }

echo ok > "$KEYCHAIN/token-mode"
output=$(BROWSER_MODE=ok google --json 2>"$work/err")
check "google login signs in" "$?" "0"
check "google login stores the refresh token" "$(cat "$KEYCHAIN/ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN")" "$SYNTHETIC_REFRESH"
check "google login shows only the token's length" "$(printf '%s' "$output" | field "['length'],d['keychain']['account']")" "(${#SYNTHETIC_REFRESH}, 'ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN')"
check "the stored token carries its description" "$(grep -c ' -j "inkctl google login writes this Google refresh token .* Value lives in the Mac login Keychain; to rotate, ' "$KEYCHAIN/stdin")" "1"
check "the token goes to security on stdin" "$(grep -c "^add-generic-password -U -s ink-tools -a ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN .* -w $SYNTHETIC_REFRESH$" "$KEYCHAIN/stdin")" "1"
check "the token never reaches an argument" "$(grep -cF "$SYNTHETIC_REFRESH" "$SECURITY_LOG")" "0"
check "no secret reaches the output" "$(printf '%s\n' "$output" "$(cat "$work/err")" | grep -cF -e "$SYNTHETIC_REFRESH" -e client-secret-SYNTHETIC)" "0"
check "google login never writes the history" "$(cat "$history_file" 2>/dev/null | grep -c '"command": "google')" "0"
check "google login names the push to the tablet" "$(printf '%s' "$output" | field "['next']")" "security find-generic-password -s ink-tools -a ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN -w | inkctl secret set google"
# The «Desktop app» client reaches the tablet from the Keychain item, never from stdin (#200).
rm -f "$files/secret-written"
output=$(printf 'ignored' | run secret set google-client --json 2>"$work/err")
check "secret set google-client writes the Keychain client's two fields" "$(field "['client_id'],sorted(d)" < "$files/secret-written")" "('client-SYNTHETIC.apps.example.test', ['client_id', 'client_secret'])"
check "secret set google-client writes the Keychain client's secret" "$(python3 -c 'import json,sys; a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2]))["installed"]; print(a["client_secret"] == b["client_secret"])' "$files/secret-written" "$client")" "True"
check "secret set google-client writes its own drop file" "$(called "cat > $private/google-client.secret.partial && mv $private/google-client.secret.partial $private/google-client.secret")" "1"
check "the client secret never reaches the output or an argument" "$(printf '%s\n' "$output" "$(cat "$work/err")" "$(cat "$log")" | grep -cF client-secret-SYNTHETIC)" "0"
mv "$client" "$client.away"
rm -f "$files/secret-written"
run secret set google-client --json >"$work/out" 2>/dev/null
check "no Keychain client is a failure that writes nothing" "$? $([ -f "$files/secret-written" ] && echo written || echo none)" "4 none"
# The credential naming rule (#277): the account is the secret's name, and a new item gets its description.
check "no Keychain client names the item to add, with its description" "$(field "['next'].split(' -j ')[0], ' Value lives in the Mac login Keychain; to rotate, ' in d['next']" < "$work/out")" "('security add-generic-password -s ink-tools -a ACCOUNT_SYNC_GOOGLE_OAUTH_CLIENT', True)"
mv "$client.away" "$client"
auth=$(cat "$KEYCHAIN/auth-url")
check "the consent asks both Calendar scopes and the test calendars, offline" "$(python3 -c 'import sys,urllib.parse as u; q=dict(u.parse_qsl(u.urlsplit(sys.argv[1]).query)); print(q["scope"], q["access_type"], q["code_challenge_method"], q["redirect_uri"].startswith("http://127.0.0.1:"))' "$auth")" "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.app.created offline S256 True"
check "the exchange proves the PKCE verifier" "$(python3 -c 'import sys,hashlib,base64,urllib.parse as u; q=dict(u.parse_qsl(u.urlsplit(sys.argv[1]).query)); b=dict(u.parse_qsl(open(sys.argv[2]).read())); print(base64.urlsafe_b64encode(hashlib.sha256(b["code_verifier"].encode()).digest()).rstrip(b"=").decode()==q["code_challenge"], b["code"], b["grant_type"], b["redirect_uri"]==q["redirect_uri"])' "$auth" "$KEYCHAIN/token-body")" "True code-SYNTHETIC authorization_code True"
check "the success page names the product and the state" "$(grep -c -e 'Ink Tools</span>' -e '<span>Signed in to Google</span>' "$KEYCHAIN/page.html")" "2"
check "the page has a dark look" "$(grep -c 'prefers-color-scheme: dark' "$KEYCHAIN/page.html")" "1"

rm -f "$KEYCHAIN/ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN" "$KEYCHAIN/token-body"
BROWSER_MODE=badstate google --json >"$work/out" 2>/dev/null
check "a wrong state is refused" "$?" "1"
check "a wrong state names its error" "$(field "['error']" < "$work/out")" "google_denied"
check "a wrong state exchanges no code" "$([ -f "$KEYCHAIN/token-body" ] && echo exchanged || echo none)" "none"
check "a wrong state shows the failure page" "$(grep -c '<span>Sign-in failed</span>' "$KEYCHAIN/page.html")" "1"
BROWSER_MODE=denied google >/dev/null 2>"$work/err"
check "a refused consent fails" "$?" "1"
check "a refused consent names Google's answer" "$(grep -c 'access_denied' "$work/err")" "1"
echo narrow > "$KEYCHAIN/token-mode"
BROWSER_MODE=ok google >/dev/null 2>"$work/err"
check "a consent without calendar.events fails" "$?" "1"
check "a narrow consent names the missing scope" "$(grep -c 'left out calendar.events;' "$work/err")" "1"
check "a narrow consent stores nothing" "$([ -f "$KEYCHAIN/ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN" ] && echo stored || echo none)" "none"
echo refuse > "$KEYCHAIN/token-mode"
BROWSER_MODE=ok google --json >"$work/out" 2>/dev/null
check "a refused code fails with Google's reason" "$(field "['error'],d['message']" < "$work/out")" "('google_refused', 'Google refused the code (HTTP 400 invalid_grant)')"
echo ok > "$KEYCHAIN/token-mode"
touch "$KEYCHAIN/write-fails"
BROWSER_MODE=ok google --json >"$work/out" 2>/dev/null
check "a Keychain write that does not read back fails" "$(field "['error']" < "$work/out")" "keychain_error"
rm -f "$KEYCHAIN/write-fails"
BROWSER_MODE=none run google login --timeout 1 >/dev/null 2>&1
check "no answer from the browser times out" "$?" "6"
printf '{"web": {}}' > "$client"
BROWSER_MODE=none google --json >"$work/out" 2>/dev/null
check "a client of another type is refused" "$(field "['error']" < "$work/out")" "google_client"
rm "$client"
BROWSER_MODE=none google >/dev/null 2>&1
check "a missing client exits 4" "$?" "4"
kill "$token_pid"
wait "$token_pid" 2>/dev/null
printf '{"installed": {"client_id": "client-SYNTHETIC.apps.example.test", "client_secret": "client-secret-SYNTHETIC", "auth_uri": "https://accounts.example.test/auth", "token_uri": "https://oauth.example.test/token"}}' > "$client"
# $BROWSER names a program that does not exist, so Python has an opener to try on Linux CI too,
# where it registers none; the guard must stop it before it starts.
check "the guard stops the real browser opener" "$(INKCTL_BROWSER= BROWSER="$work/bin/no-such-browser" PYTHONPATH="$work/guard" HOME="$work/home" PATH="$work/bin:$PATH" python3 -B "$script" google login --timeout 1 >/dev/null 2>&1; echo "$? $(cat "$work/real-browser-reached")")" "1 webbrowser.open"
rm -f "$work/real-browser-reached" "$client"

# Test sandboxes (#297): a fake Todoist and Google, answering in the APIs' recorded shapes.
cat > "$work/apis.py" <<'PY'
import http.server, json, os, sys, urllib.parse
root = sys.argv[1]
state = {
    "projects": [{"id": "p-inbox", "name": "Inbox"}, {"id": "p-old", "name": "teste ink-tools old"}],
    "tasks": {},
    "calendars": [{"id": "primary-SYNTHETIC@example.test", "summary": "Primary"}],
    "events": {},
}
serial = [0]
def new_id(prefix):
    serial[0] += 1
    return f"{prefix}-{serial[0]}"
class Api(http.server.BaseHTTPRequestHandler):
    def answer(self, status, body=None):
        raw = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def handle_call(self):
        split = urllib.parse.urlsplit(self.path)
        query = dict(urllib.parse.parse_qsl(split.query))
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        body = json.loads(raw) if self.headers.get("Content-Type") == "application/json" else raw.decode()
        open(f"{root}/api-calls", "a").write(f"{self.command} {self.path} {self.headers.get('Authorization')}\n")
        path, method = split.path, self.command
        if path == "/token":
            form = dict(urllib.parse.parse_qsl(body))
            if form.get("grant_type") != "refresh_token" or form.get("refresh_token") != "1//SYNTHETIC-refresh":
                return self.answer(400, {"error": "invalid_grant"})
            return self.answer(200, {"access_token": "access-SYNTHETIC", "expires_in": 3599})
        if os.path.exists(f"{root}/api-refuses"):
            return self.answer(403, {"error": {"code": 403, "message": "Request had insufficient authentication scopes."}})
        if path == "/todoist/projects" and method == "GET":
            rows = state["projects"]
            if "cursor" not in query:  # two pages, as Todoist API v1 pages its lists
                return self.answer(200, {"results": rows[:1], "next_cursor": "page-2"})
            return self.answer(200, {"results": rows[1:], "next_cursor": None})
        if path == "/todoist/projects" and method == "POST":
            row = {"id": new_id("p"), "name": body["name"], "color": "charcoal", "is_archived": False}
            state["projects"].append(row)
            return self.answer(200, row)
        if path == "/todoist/tasks" and method == "GET":
            return self.answer(200, {"results": state["tasks"].get(query["project_id"], []), "next_cursor": None})
        if path.startswith("/todoist/projects/") and method == "DELETE":
            pid = urllib.parse.unquote(path.rsplit("/", 1)[1])
            state["projects"] = [row for row in state["projects"] if row["id"] != pid]
            return self.answer(204)
        if path == "/google/users/me/calendarList":
            return self.answer(200, {"kind": "calendar#calendarList", "items": state["calendars"]})
        if path == "/google/calendars" and method == "POST":
            row = {"kind": "calendar#calendar", "id": new_id("c") + "@group.calendar.google.com", "summary": body["summary"]}
            state["calendars"].append(row)
            return self.answer(200, row)
        if path.startswith("/google/calendars/") and path.endswith("/events"):
            cid = urllib.parse.unquote(path.split("/")[3])
            return self.answer(200, {"kind": "calendar#events", "items": state["events"].get(cid, [])})
        if path.startswith("/google/calendars/") and method == "DELETE":
            cid = urllib.parse.unquote(path.rsplit("/", 1)[1])
            state["calendars"] = [row for row in state["calendars"] if row["id"] != cid]
            return self.answer(204)
        return self.answer(404, {"error": "not found"})
    do_GET = do_POST = do_DELETE = handle_call
    def log_message(self, *ignored):
        pass
server = http.server.HTTPServer(("127.0.0.1", 0), Api)
open(f"{root}/api-port.partial", "w").write(str(server.server_port))
os.rename(f"{root}/api-port.partial", f"{root}/api-port")
server.serve_forever()
PY
python3 -B "$work/apis.py" "$work" &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null; rm -rf "$work"' EXIT
# timing-independent: a poll with a deadline for the fake API server's port file.
for _ in $(seq 50); do [ -f "$work/api-port" ] && break; sleep 0.1; done
api="http://127.0.0.1:$(cat "$work/api-port")"
python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); s["todoistApi"]=sys.argv[2]+"/todoist"; s["googleCalendarApi"]=sys.argv[2]+"/google"; json.dump(s, open(sys.argv[3], "w"))' "$repo_root/../../packages/sync-core/src/services.json" "$api" "$work/services.json"
export INKCTL_SERVICES="$work/services.json"
printf 'todoist-SYNTHETIC-token' > "$KEYCHAIN/ACCOUNT_SYNC_TODOIST_TOKEN"
printf '1//SYNTHETIC-refresh' > "$KEYCHAIN/ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN"
printf '{"installed": {"client_id": "client-SYNTHETIC.apps.example.test", "client_secret": "client-secret-SYNTHETIC", "auth_uri": "https://accounts.example.test/auth", "token_uri": "%s/token"}}' "$api" > "$KEYCHAIN/ACCOUNT_SYNC_GOOGLE_OAUTH_CLIENT"
check "sandbox todoist list finds none at first" "$(run sandbox todoist list --json | field "['sandboxes']")" "[]"
output=$(run sandbox todoist create --json)
check "sandbox todoist create makes the project" "$?" "0"
check "sandbox todoist create names it" "$(printf '%s' "$output" | field "['created'],d['name']")" "(True, 'teste ink-tools')"
check "sandbox todoist create sends the token as a bearer" "$(grep -c '^POST /todoist/projects Bearer todoist-SYNTHETIC-token$' "$work/api-calls")" "1"
check "sandbox todoist create twice makes one project" "$(run sandbox todoist create --json | field "['created']") $(grep -c '^POST /todoist/projects' "$work/api-calls")" "False 1"
check "sandbox todoist list reads the project's tasks" "$(run sandbox todoist list --json | expression "[(r['name'], r['items']) for r in d['sandboxes']]")" "[('teste ink-tools', [])]"
check "sandbox todoist clean removes only the test project" "$(run sandbox todoist clean --json | field "['removed']") $(grep -c '^DELETE' "$work/api-calls")" "['p-1'] 1"
check "sandbox todoist clean never touches another project" "$(grep -c -e 'p-inbox' -e 'p-old' "$work/api-calls")" "0"
check "sandbox todoist clean again removes nothing" "$(run sandbox todoist clean)" "todoist: project «teste ink-tools»: none to remove"
check "sandbox google create makes the calendar" "$(run sandbox google create --json | field "['created'],d['name']")" "(True, 'teste ink-tools')"
check "sandbox google uses a refreshed access token" "$(grep -c '^POST /google/calendars Bearer access-SYNTHETIC$' "$work/api-calls")" "1"
check "sandbox google clean removes only the test calendar" "$(run sandbox google clean --json | field "['removed']") $(grep -c 'primary-SYNTHETIC' "$work/api-calls")" "['c-2@group.calendar.google.com'] 0"
touch "$work/api-refuses"
run sandbox google create --json >"$work/out" 2>/dev/null
check "a token without the scope names the sign-in" "$? $(field "['error'],d['next'],d['status']" < "$work/out")" "1 ('api_refused', 'inkctl google login', 403)"
rm -f "$work/api-refuses"
run --read-only sandbox todoist clean >/dev/null 2>&1
check "read-only mode refuses a sandbox change" "$?" "11"
run --read-only sandbox todoist list >/dev/null 2>&1
check "read-only mode allows a sandbox list" "$?" "0"
rm "$KEYCHAIN/ACCOUNT_SYNC_TODOIST_TOKEN"
run sandbox todoist list --json >"$work/out" 2>/dev/null
check "no Todoist token exits 4 and names the Keychain item" "$? $(field "['next']" < "$work/out")" "4 security add-generic-password -s ink-tools -a ACCOUNT_SYNC_TODOIST_TOKEN -w"
check "no sandbox call reached the tablet" "$(cat "$log" | wc -l | tr -d ' ')" "0"
check "no token reaches the output" "$(run sandbox google list --json 2>&1 | grep -c -e access-SYNTHETIC -e 1//SYNTHETIC -e client-secret-SYNTHETIC)" "0"
kill "$api_pid"
wait "$api_pid" 2>/dev/null
unset INKCTL_SERVICES
rm -f "$KEYCHAIN/ACCOUNT_SYNC_GOOGLE_OAUTH_CLIENT" "$KEYCHAIN/ACCOUNT_SYNC_GOOGLE_REFRESH_TOKEN"

# A headless LocalSend peer (#297), over a fake localgo that answers LocalSend's info call on 127.0.0.1.
cat > "$work/localgo.py" <<'PY'
import http.server, os, sys
args = sys.argv[1:]
open(os.environ["LOCALGO_LOG"], "a").write(" ".join(args) + "\n")
if args[0] == "send":
    print("Sent 1 file")
    sys.exit(int(os.environ.get("LOCALGO_SEND_EXIT", "0")))
port = int(args[args.index("--port") + 1])
if "--http" not in args:
    sys.exit(3)  # the fake serves only plain http: an https start must fail and leave nothing behind
class Info(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'{"alias": "teste ink-tools", "version": "2.2"}'
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *ignored):
        pass
http.server.HTTPServer(("127.0.0.1", port), Info).serve_forever()
PY
printf '#!/bin/bash\nexec python3 -B "%s/localgo.py" "$@"\n' "$work" > "$work/bin/localgo"
chmod +x "$work/bin/localgo"
export LOCALGO_LOG="$work/localgo.log"
localsend_port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
output=$(run localsend receive --http --port "$localsend_port" --folder "$work/received" --json)
check "localsend receive starts a peer" "$?" "0"
localsend_pid=$(printf '%s' "$output" | field "['pid']")
check "localsend receive answers the protocol, port and folder" "$(printf '%s' "$output" | field "['protocol'],d['port']==$localsend_port,d['folder']")" "('http', True, '$work/received')"
check "localsend receive auto-accepts into the folder, with no clipboard" "$(grep -c -e "^serve --auto-accept --no-clipboard --quiet --alias teste ink-tools --port $localsend_port --dir $work/received " "$LOCALGO_LOG")" "1"
run localsend receive --http --port "$localsend_port" --folder "$work/received" >/dev/null 2>&1
check "a second receive is refused while one runs" "$?" "8"
printf 'synthetic' > "$work/received/page.png"
output=$(run localsend stop --json)
check "localsend stop ends the peer and lists what came in" "$(printf '%s' "$output" | field "['stopped'],d['received']")" "(True, ['page.png'])"
check "localsend stop leaves no process" "$(kill -0 "$localsend_pid" 2>/dev/null && echo running || echo gone)" "gone"
check "localsend stop again finds none" "$(run localsend stop)" "no LocalSend peer runs"
run localsend receive --port "$localsend_port" --folder "$work/received" --json >"$work/out" 2>/dev/null
check "an https peer that never answers is a device error" "$? $(field "['error']" < "$work/out")" "1 device_error"
check "a failed start leaves no record" "$([ -f "$work/home/.cache/inkctl/localsend.json" ] && echo kept || echo none)" "none"
: > "$LOCALGO_LOG"
run localsend send "$work/received/page.png" --ip "127.0.0.1:$localsend_port" --json >/dev/null
check "localsend send passes each file and the address" "$(cat "$LOCALGO_LOG")" "send --file $work/received/page.png --ip 127.0.0.1:$localsend_port"
run localsend send "$work/received/page.png" >/dev/null 2>&1
check "localsend send needs a receiver" "$?" "2"
run localsend send "$work/no-such-file" --to Mac >/dev/null 2>&1
check "localsend send refuses a missing file" "$?" "4"
LOCALGO_SEND_EXIT=1 run localsend send "$work/received/page.png" --to Mac >/dev/null 2>&1
check "a failed send fails" "$?" "1"
check "no localsend call reached the tablet" "$(wc -l < "$log" | tr -d ' ')" "0"

# Coordinates and the shell.
run tap 12 34 >/dev/null
check "tap wakes the screen first" "$(called 'keyevent WAKEUP')" "1"
check "tap presses coordinates" "$(called 'shell input tap 12 34')" "1"
run swipe 1 2 3 4 >/dev/null
check "swipe drags" "$(called 'shell input swipe 1 2 3 4')" "1"
output=$(run shell echo hi)
status=$?
check "shell returns the device's exit code" "$status" "9"
check "shell passes the output through" "$output" "remote-out"

# What the command says about itself.
help=$(python3 -B "$script" --help)
sentence=$(sed -n 's/^Let an agent/let an agent/p' "$repo_root/README.md" | head -1)
check "help opens with the sentence of the README" "$(printf '%s\n' "$help" | grep -cF "inkctl: $sentence")" "1"
check "help documents the log's fields" "$(printf '%s\n' "$help" | grep -c 'app_before the app in front')" "1"
check "help ends with the repository" "$(printf '%s\n' "$help" | tail -1)" "https://github.com/martonpaulo/ink-tools"

# The duplication gate reads the extensionless command.
copy="$work/gate-copy"
mkdir -p "$copy/src" "$copy/scripts"
cp "$script" "$copy/src/inkctl"
cp "$repo_root/scripts/dry_check.py" "$copy/scripts/"
cp "$repo_root/dry-check.json" "$copy/"
# timing-independent: the sleep is text planted in a copy for the dry check to flag; it never runs.
python3 -c 'import sys; p=sys.argv[1]; s=open(p).read(); open(p,"w").write(s.replace("def remote_path(path: str) -> str:\n", "def remote_path(path: str) -> str:\n    time.sleep(12345)\n", 1))' "$copy/src/inkctl"
python3 -B "$copy/scripts/dry_check.py" --root "$copy" magic >"$work/out" 2>&1
check "the duplication gate fails on a magic value in the command" "$?" "1"
check "the duplication gate names the command" "$(grep -m1 -c 'src/inkctl' "$work/out")" "1"

# The registry block (#294): written from registry/, each item once with a probe or a reason.
registry_check='
import runpy, sys
ns = runpy.run_path(sys.argv[1], run_name="registry_test")
ids = [item["id"] for item in ns["REGISTRY_ITEMS"]]
assert len(set(ids)) == len(ids), "an item is listed twice"
assert all((item["probe"] is None) != (item["unprobed"] is None) for item in ns["REGISTRY_ITEMS"]), "an item lacks a probe or a reason"
print(ns["REGISTRY"]["todo.provider"]["tasksUri"])
'
check "the registry block loads and derives the To-Do URI" "$(python3 -c "$registry_check" "$script" 2>&1)" "content://com.ratta.supernote.task.provider/tasks_table"

check "no test reached the real browser opener" "$([ -f "$work/real-browser-reached" ] && echo reached || echo never)" "never"

[ "$failures" -eq 0 ]
