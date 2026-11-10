#!/bin/bash
#
# Contract tests for src/supernote: what each command asks of adb, what it answers, and its stable
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

mkdir -p "$work/bin" "$work/home/.config/supernote-adb" "$work/local"
cat > "$work/bin/adb" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$ADB_LOG"
if [ "$1" = connect ]; then
    if [ -z "${ADB_CONNECT_FAILS:-}" ] && { [ ! -f "$ADB_FILES/stale" ] || [ -f "$ADB_FILES/killed" ]; }; then echo device > "$ADB_FILES/state"; fi
    printf '%s\n' "${ADB_CONNECT_REPLY:-connected to $2}"
    exit 0
fi
if [ "$1" = kill-server ]; then touch "$ADB_FILES/killed"; exit 0; fi
[ "$1" = -s ] && shift 2
case "$1" in
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
        if ! grep -qF "$2" "$ADB_FILES/paths"; then echo "adb: error: remote object '$2' does not exist" >&2; exit 1; fi ;;
    push) : ;;
    logcat)
        cat "$ADB_FILES/log"
        case " $* " in *" -d "*) ;; *) [ -n "${ADB_HANG:-}" ] && exec sleep 5 ;; esac ;;
    shell)
        case "$2" in
            "getprop ro.build.display.id") echo Firmware.1 ;;
            "dumpsys package providers")
                for authority in com.ratta.supernote.task.provider com.ratta.supernote.pluginhost; do
                    grep -qF "$authority" "$ADB_FILES/gone" || printf '  [%s]:\n' "$authority"
                done ;;
            getprop*) printf 'Firmware.1\nPhysical size: 1920x2560\n  level: 93\n    mResumedActivity: ActivityRecord{fa2 u0 %s t1}\n' "$(cat "$ADB_FILES/foreground")" ;;
            dumpsys*) printf '    mResumedActivity: ActivityRecord{fa2 u0 %s t1}\n' "$(cat "$ADB_FILES/foreground")" ;;
            "if [ "*)
                condition=${2#if \[ }; condition=${condition%% \]; then*}
                eval "set -- $condition"
                kind=${1#-}
                if grep -qxF "$kind $2" "$ADB_FILES/paths" || { [ "$kind" = e ] && grep -qE "^[df] $2\$" "$ADB_FILES/paths"; }; then echo yes; else echo no; fi ;;
            "ls -lA"*)
                if ! grep -qF "${2##*/}" "$ADB_FILES/paths"; then echo "ls: x: No such file or directory" >&2; exit 1; fi
                cat "$ADB_FILES/listing" ;;
            "am start"*) cat "$ADB_FILES/am"; [ -f "$ADB_FILES/am-goes-to" ] && cat "$ADB_FILES/am-goes-to" > "$ADB_FILES/foreground"; : ;;
            "am broadcast"*) echo 'Broadcast completed: result=0' ;;
            "date +%s") echo 1800000000 ;;
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
                if [ "$left" -gt 0 ]; then
                    [ "$left" -lt 100 ] && echo $((left - 1)) > "$ADB_FILES/trigger-reads"
                    echo 'Row: 0 id=31'
                else
                    echo 'No result found.'
                fi ;;
            "content query"*) cat "$ADB_FILES/rows" ;;
            "input tap"*)
                if [ -f "$ADB_FILES/taps-left" ]; then
                    left=$(($(cat "$ADB_FILES/taps-left") - 1))
                    echo "$left" > "$ADB_FILES/taps-left"
                    [ "$left" -eq 0 ] && cp "$ADB_FILES/rows-after" "$ADB_FILES/rows"
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
            *) echo "remote-out"; exit 9 ;;
        esac ;;
esac
STUB
chmod +x "$work/bin/adb"
log="$work/calls"
files="$work/files"
mkdir -p "$files"
script="$repo_root/src/supernote"
snapshot_file="$work/home/.cache/supernote-adb/snapshot.json"
history_file="$work/home/.cache/supernote-adb/history.jsonl"

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
printf 'device-a.test\n' > "$work/home/.config/supernote-adb/address"

reset_device() {
    echo device > "$files/state"
    printf '%s' "$calendar_activity" > "$files/foreground"
    printf 'f %s\n' "$root/Note/A note.note" "$root/MyStyle/old.txt" > "$files/paths"
    printf 'd %s\n' "$root/Note" "$root/INBOX" >> "$files/paths"
    rm -f "$files/am-goes-to"
    printf 'Status: ok\nActivity: x\n' > "$files/am"
    printf '5\n' > "$files/size"
}

run() {
    : > "$log"
    HOME="$work/home" PATH="$work/bin:$PATH" ADB_LOG="$log" ADB_FILES="$files" python3 -B "$script" "$@"
}

last_call() { grep -v 'dumpsys activity' "$log" | tail -1; }
called() { grep -cF -- "$1" "$log"; }
field() { python3 -c "import json,sys; print(eval('d'+sys.argv[1], {'d': json.load(sys.stdin)}))" "$1"; }
expression() { python3 -c "import json,sys; print(eval(sys.argv[1], {'d': json.load(sys.stdin)}))" "$1"; }

reset_device

# Address and connection.
HOME="$work/empty" PATH="$work/bin:$PATH" ADB_LOG="$log" ADB_FILES="$files" python3 -B "$script" status >/dev/null 2>"$work/err"
check "no address stops with its own code" "$?" "2"
check "no address names the file" "$(grep -c 'supernote-adb/address' "$work/err")" "1"
SUPERNOTE_ADDRESS=device-b.test run status >/dev/null
check "the environment wins over the file" "$(head -1 "$log")" "-s device-b.test:5555 get-state"
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
listener=$(mktemp "$work/port.XXXXXX")
python3 -c 'import socket,sys,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("127.0.0.1",0)); s.listen(5); open(sys.argv[1],"w").write(str(s.getsockname()[1])); time.sleep(30)' "$listener" &
listener_pid=$!
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

# Doctor.
: > "$files/gone"
result=$(run doctor --json)
check "doctor reports every call" "$(printf '%s' "$result" | field "['calls'].__len__(),d['missing']")" "(6, 0)"
check "doctor names the firmware" "$(printf '%s' "$result" | field "['firmware']")" "Firmware.1"
check "doctor starts nothing" "$(called 'am start')$(called 'am broadcast')" "00"
check "doctor sends nothing to a provider" "$(called 'content ')" "0"
check "doctor prints one line per call" "$(run doctor | grep -c '^ok')" "6"
echo 'com.ratta.supernote.task.provider' > "$files/gone"
run doctor >"$work/out" 2>/dev/null
check "doctor stops with its own code when a call is missing" "$?" "10"
check "doctor names the missing call" "$(grep -c '^MISSING.provider.content://com.ratta.supernote.task.provider' "$work/out")" "1"
result=$(run doctor --json 2>/dev/null)
check "doctor keeps its data in JSON on a failure" "$(printf '%s' "$result" | field "['error'],d['missing']")" "('missing_call', 1)"
echo 'com.ratta.supernote.filesync.action.START_FILE_SYNC' > "$files/gone"
run doctor >/dev/null 2>&1
check "doctor finds a missing receiver" "$?" "10"
echo "$note_activity" > "$files/gone"
run doctor >/dev/null 2>&1
check "doctor finds a missing activity" "$?" "10"
: > "$files/gone"
check "help lists the doctor exit code" "$(python3 -B "$script" --help | grep -c '10 doctor found')" "1"

# Notes.
run note open "Note/A note.note" --page 3 >/dev/null
check "note open passes the page from 0 and quotes the path" "$(grep -cF "am start -W -a android.intent.action.VIEW -n $note_activity --es file_path '$root/Note/A note.note' --es from_app launcher --ei page 2" "$log")$(called "am start")" "11"
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

# Sync.
run sync file "Note/A note.note" >/dev/null
check "sync file sends the path" "$(last_call | grep -cF "am broadcast -a com.ratta.supernote.filesync.action.START_FILE_SYNC --es com.ratta.supernote.filesync.FILE_PATH '$root/Note/A note.note'")" "1"
run sync file Note/Absent.note >/dev/null 2>&1
check "sync file on a missing file stops with its own code" "$?" "4"
echo 2 > "$files/trigger-reads"
result=$(run sync tasks --json)
check "sync tasks waits until the sync removed its row" "$(printf '%s' "$result" | field "['app']")" "tasks"
check "sync tasks sends no broadcast Android refuses" "$(called 'am broadcast')" "0"
check "sync tasks inserts a row already marked as deleted" "$(grep -c 'content insert --uri content://com.ratta.supernote.task.provider/tasks_table --bind taskId:s:.* --bind title:s:supernote-sync-trigger .*--bind deleted:i:1 --bind hasSync:i:0' "$log")" "1"
check "sync tasks reads only its own row" "$(grep 'content query' "$log" | grep -vcF "taskId=")" "0"
echo 0 > "$files/trigger-reads"
run sync tasks >/dev/null 2>"$work/err"
check "sync tasks reports an insert that did not hold" "$?" "1"
echo 100 > "$files/trigger-reads"
run sync tasks --timeout 0 >/dev/null 2>&1
check "sync tasks gives up with its own code" "$?" "6"
echo 'Error: provider refused' > "$files/insert-error"
echo 2 > "$files/trigger-reads"
run sync tasks >/dev/null 2>&1
check "sync tasks reports a refused insert" "$?$(called 'content query')" "10"
rm "$files/insert-error"
run sync calendar >/dev/null
check "sync calendar asks the Calendar app" "$(last_call)" "-s $serial shell am broadcast -a com.ratta.supernote.calendar.notify.sync"

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
rm "$files/no-return"
stop_pages
result=$(run snapshot --all --json)
check "--all without lists is a plain snapshot" "$(printf '%s' "$result" | field "['elements'].__len__(),d['lists']")" "(5, [])"
check "--all without lists sends no swipe" "$(called 'input swipe')" "0"

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

# Apps, plugins and logs.
check "apps separates installed from system" "$(run apps --json | field "['apps'][0]['kind'],d['apps'][1]['kind']")" "('installed', 'system')"
check "plugin ls keeps a value with commas" "$(run plugin ls --json | field "['plugins'][0]['name']")" '{"en":"Sticker","ja":"x, y"}'
check "plugin ls splits the fields" "$(run plugin ls --json | field "['plugins'][1]['pluginID']")" "def"
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
printf 'hello' > "$work/local/bad.snplg"
run plugin install "$work/local/bad.snplg" >/dev/null 2>&1
check "a file with no plugin config stops before any copy" "$?$(called ' push ')" "20"
run plugin install "$work/local/old.txt" >/dev/null 2>&1
check "plugin install refuses another kind of file" "$?" "2"
rm -f "$files/taps-left" "$files/rows-after"
printf '5\n' > "$files/size"
cp "$work/tree-saved" "$files/tree.xml"
cp "$work/rows-saved" "$files/rows"
output=$(run logs --tag Sync --lines 5)
check "logs read without clearing" "$(last_call)" "-s $serial logcat -d -v time -t 5 -s Sync"
check "logs mask a credential" "$(printf '%s' "$output" | grep -c 'abcdef')" "0"
check "logs keep the other fields" "$(printf '%s' "$output" | grep -c 'next=1')" "1"
check "logs parse in JSON" "$(run logs --json | field "['lines'][0]['tag'],d['lines'][0]['pid']")" "('Sync', 1218)"

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
check "logs --follow prints and ends with the device" "$(run logs --follow --timeout 2 --grep unrelated)" "11-10 00:14:30.000 I/Other( 902): unrelated"
started=$SECONDS
output=$(ADB_HANG=1 run logs --follow --timeout 1 --json)
status=$?
check "logs --follow ends at its limit without failing" "$status" "0"
check "logs --follow is bounded" "$((SECONDS - started < 4))" "1"
check "logs --follow in JSON keeps the lines" "$(printf '%s' "$output" | field "['lines'].__len__()")" "4"
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
check "a call keeps its verb and timing" "$(run history --json --limit 1 | expression "[c['call'] for c in d['runs'][0]['calls']]")" "['get-state', 'shell dumpsys', 'shell ls', 'shell dumpsys']"
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
check "a failure names its cause and next command" "$(printf '%s' "$result" | expression "sorted(d),d['next']")" "(['cause', 'error', 'message', 'next'], 'supernote files ls')"
run click id:absent --json 2>/dev/null > "$work/out"
check "a missing element points to a snapshot" "$(field "['next']" < "$work/out")" "supernote snapshot"
check "every failure kind has its advice" "$(python3 - "$script" <<'PY'
import re, sys
source = open(sys.argv[1]).read()
advice = source[source.index("FAILURE_ADVICE = {"):source.index("class Failure")]
kinds = set(re.findall(r'Failure\(\s*EXIT_\w+,\s*"(\w+)"', source))
print(sorted(kind for kind in kinds if f'"{kind}"' not in advice))
PY
)" "[]"

# Coordinates and the shell.
run tap 12 34 >/dev/null
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
check "help opens with the sentence of the README" "$(printf '%s\n' "$help" | grep -cF "supernote: $sentence")" "1"
check "help documents the log's fields" "$(printf '%s\n' "$help" | grep -c 'app_before the app in front')" "1"
check "help ends with the repository" "$(printf '%s\n' "$help" | tail -1)" "https://github.com/martonpaulo/supernote-adb"

[ "$failures" -eq 0 ]
