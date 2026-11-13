# ADB on the Supernote Manta (A5 X2)

Status: current

Researched 2026-11-09 from public sources, then checked on one Manta with firmware 3.31.45.

## Answer

There is no build number to tap. Ratta removed the Developer Mode entry in 3.15.27 and added a Sideloading switch in 3.16.27. On this model that switch turns on ADB. It needs no root.

## Steps

1. Open Settings > Security & Privacy > Sideloading > On ([official changelog](https://support.supernote.com/change-log/changelog-for-manta-and-nomad)).
2. Accept the disclaimer with "Accept and Enable" ([community guide](https://github.com/dwongdev/sugoi-supernote/blob/main/Guides/how%20to%20sideload%20supernote.md)).
3. Keep the USB cable connected. If the tablet asks to allow the computer, tap OK ([Supernote-Install](https://github.com/qiaodenghui/Supernote-Install)).
4. Run `adb devices`.
5. For Wi-Fi, run `adb tcpip 5555` once over USB, then `adb connect <address>:5555`.

If `adb devices` stays empty, turn the switch off and on, connect the cable again, and try a USB-A to USB-C data cable ([Adam Dimech](https://code.adamdimech.au/sideload-apps-onto-a-supernote-device/)).

## What works

Checked on the Manta, firmware 3.31.45:

- `adb shell`, as the user `shell`.
- `adb exec-out screencap -p`, which returns a 1920x2560 image.
- `adb shell input tap X Y`.
- Wi-Fi ADB on port 5555, until the tablet restarts.

Reported by others:

- `adb install`, on a Manta with 3.20.29.
- `adb shell`, `logcat`, `push` and `pull`, on a Manta in October 2026 ([SnapMark SPIKES](https://github.com/traderchrisdev/SnapMark/blob/main/SPIKES.md)).
- `adb logcat -c` fails with a kernel log error on a Manta beta, and `logcat -d` works ([folder-shortcuts#10](https://github.com/marc-korte/supernote-folder-shortcuts/issues/10)).

## Contradictions

- One report says shell, logcat, push and pull answer "not support command" ([apclark31](https://github.com/apclark31/supernote-plugin-research/blob/main/CLAUDE.md), April 2026, device and firmware not stated). Later reports contradict it. The cause is unknown.
- One Manta with 3.30.45 and Sideloading on showed nothing in `adb devices`, and its computer did not see the tablet on USB ([sn-tcp-tunnel#8](https://github.com/gorlix/sn-tcp-tunnel/issues/8)). It is unresolved.

## Risks

- **Warranty:** no statement from Ratta was found. A community guide lists possible voiding as a risk.
- **Updates:** the switch was reported removed in 3.17.29 and restored in 3.18.29, so an update may remove it again.
- **Factory reset:** expect the switch to be off afterwards. Nothing is documented.
- **Access:** with ADB on, an authorized computer can read and delete every note. Wi-Fi mode also opens a port on the network until the tablet restarts.
- **Downgrades:** the official changelog warns that a firmware downgrade can cause a boot loop. Nothing here needs one.

The switch can be turned off.

## Other routes to control

- The plugin API has no call that presses the screen. It only listens to touch ([API index](https://docs.supernote.com/_llms/en/api-reference.txt)).
- Browse & Access serves files only. Screen Mirroring is view only.
- The official documentation has no page on ADB.

## Limits of this research

- Reddit could not be read directly.
- No statement from Ratta on ADB in firmware 3.x was found.
