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
    if [ -z "${ADB_CONNECT_FAILS:-}" ]; then echo device > "$ADB_FILES/state"; fi
    printf 'connected to %s\n' "$2"
    exit 0
fi
[ "$1" = -s ] && shift 2
case "$1" in
    get-state) cat "$ADB_FILES/state" ;;
    exec-out)
        if [ "$2" = screencap ]; then
            cat "$ADB_FILES/screen"
        elif [ -f "$ADB_FILES/busy" ]; then
            [ "$(cat "$ADB_FILES/busy")" = once ] && rm "$ADB_FILES/busy"
            echo 'ERROR: could not get idle state.'
        else
            cat "$ADB_FILES/tree.xml"
        fi ;;
    pull)
        if ! grep -qF "$2" "$ADB_FILES/paths"; then echo "adb: error: remote object '$2' does not exist" >&2; exit 1; fi ;;
    push) : ;;
    logcat) cat "$ADB_FILES/log" ;;
    shell)
        case "$2" in
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
            "stat -c"*) cat "$ADB_FILES/size" ;;
            "pm list packages -3") echo package:com.example.one ;;
            "pm list packages -s") echo package:com.ratta.supernote.note ;;
            "content query"*) cat "$ADB_FILES/rows" ;;
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

last_call() { tail -1 "$log"; }
called() { grep -cF -- "$1" "$log"; }
field() { python3 -c "import json,sys; print(eval('d'+sys.argv[1], {'d': json.load(sys.stdin)}))" "$1"; }

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
reset_device

# Status and JSON.
check "status reads firmware, battery and foreground" "$(run status --json | field "['firmware'],d['battery'],d['activity'],d['screen']")" "('Firmware.1', 93, '$calendar_activity', '1920x2560')"
check "--json also works before the command" "$(run --json status | field "['battery']")" "93"
check "an error in JSON keeps a name for the reader" "$(run files ls Absent --json 2>/dev/null | field "['error']")" "not_found"

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
run sync tasks >/dev/null
check "sync tasks asks the To-do app" "$(last_call)" "-s $serial shell am broadcast -a com.ratta.supernote.launcher.clicksync"
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
output=$(run logs --tag Sync --lines 5)
check "logs read without clearing" "$(last_call)" "-s $serial logcat -d -v time -t 5 -s Sync"
check "logs mask a credential" "$(printf '%s' "$output" | grep -c 'abcdef')" "0"
check "logs keep the other fields" "$(printf '%s' "$output" | grep -c 'next=1')" "1"
check "logs parse in JSON" "$(run logs --json | field "['lines'][0]['tag'],d['lines'][0]['pid']")" "('Sync', 1218)"

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
check "help ends with the repository" "$(printf '%s\n' "$help" | tail -1)" "https://github.com/martonpaulo/supernote-adb"

[ "$failures" -eq 0 ]
