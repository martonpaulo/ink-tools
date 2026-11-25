# Custom tap gestures in NOTE: what a service or a plugin can see and press

Status: research for [#251](https://github.com/martonpaulo/ink-tools/issues/251), 2026-11-25.
One agent-driven device round on the owner's Nomad (firmware `Chauvet.E103.2610191001.2559_release`,
Android 11, API 30) with a throwaway accessibility service, Gesture Probe
(`com.martonpaulo.inktools.gestureprobe`), driven by broadcasts and `inkctl`, on a blank test note.
The probe was turned off and uninstalled after the round, and the test note deleted; the tablet's
accessibility settings read as before (`enabled_accessibility_services` null,
`accessibility_enabled` 0), so Handwriting Language's `WritingWatcher` was off before and after.

Marks, as in [`../supernote.md`](../supernote.md): **[measured]** on the tablet in this round;
**[official]** Android or Supernote documentation or AOSP source; **[community]** a third-party
project; **[inference]** reasoned, not run.

## Contents

- [Answer in short](#answer-in-short)
- [1. What a service or a plugin can see of taps](#1-what-a-service-or-a-plugin-can-see-of-taps)
- [2. Choosing a pen or the eraser from a service](#2-choosing-a-pen-or-the-eraser-from-a-service)
- [3. Telling a finger from the pen](#3-telling-a-finger-from-the-pen)
- [4. SnToggle](#4-sntoggle)
- [5. Proposal](#5-proposal)
- [What a device round with the owner must confirm](#what-a-device-round-with-the-owner-must-confirm)
- [The probe](#the-probe)

## Answer in short

- **Pressing NOTE's toolbar works from an accessibility service.** Each toolbar button is a node
  with a stable content description (`pen_1`, `pen_2`, `pen_3`, `eraser_1`, `eraser_3`, `lasso`,
  `undo` per SnToggle). A tap gesture (`dispatchGesture`) at the node's centre selects the tool:
  finding the node took 19 to 40 ms, the gesture ended 62 to 84 ms after the command, and NOTE
  reported the new selection 46 to 47 ms after the tap [measured]. `ACTION_CLICK` on the node fails
  (`performAction` returns false; the nodes are not clickable) [measured].
- **Seeing the taps is the hard part.** An accessibility service on Android 11 gets raw touches
  only in touch exploration mode, which also takes the pen (the `Wacom-pen` device reports itself
  as a touchscreen), so it would break writing [official, AOSP; measured device sources]. An
  untouchable overlay is told of every touch-down elsewhere, but with no position and no tool
  type [measured]. A plugin's motion listener gives position and tool type (finger or pen) and is
  the route SnToggle uses [official types, community].
- **Recommended:** detect gestures in an Ink Tools plugin's motion listener, and press NOTE's
  toolbar from one Ink Tools accessibility service. SnToggle has no license, so none of its code
  is copied; its README is the only thing read.

## 1. What a service or a plugin can see of taps

| Route | Sees | Cost to writing |
| :--- | :--- | :--- |
| Accessibility events (`typeAllMask`) | No touch events in NOTE: only window and content changes [measured] | None |
| Touch exploration mode (`FLAG_REQUEST_TOUCH_EXPLORATION_MODE`, with `FLAG_REQUEST_MULTI_FINGER_GESTURES`) | Gestures such as double tap and two- and three-finger taps, through `onGesture` [official] | Every touchscreen event goes through the explorer, the pen's too, unless it lands in a passthrough region; a one-finger tap becomes a hover, so NOTE's own buttons need a double tap [official, AOSP `AccessibilityInputFilter` for Android 11 routes any event `isFromSource(SOURCE_TOUCHSCREEN)`]. Not run with real fingers: see below |
| Overlay of type `TYPE_ACCESSIBILITY_OVERLAY`, 1 × 1 px, `FLAG_NOT_TOUCHABLE` and `FLAG_WATCH_OUTSIDE_TOUCH` | One `ACTION_OUTSIDE` per touch-down anywhere, with its time and source, but `x`, `y` and the tool type zeroed (`tool=0`) [measured]. A drag gives the same single event as a tap [measured], and the lift is not reported | None: the overlay takes no touch [measured, the tool still changed under it] |
| Plugin `registerMotionListener` | Every motion in screen pixels, `action` down, up, move, cancel, and `toolType` 1 finger or 2 pen [official, `sn-plugin-lib` 0.2.3 types] | None reported [community: SnToggle detects finger double taps and two- and three-finger taps this way while the note is in front] |

- While the tablet sleeps, the service's window tree for NOTE is empty: no toolbar node is found
  until `input keyevent 224` wakes it [measured].
- NOTE's own gestures to avoid: a two-finger double tap toggles full screen; NOTE has no
  three-finger gesture [community, SnToggle README]; a two-finger press and hold opens the Region
  eraser or the Lasso [official].
- Agent limit: `adb shell input` events are injected and skip the accessibility input filter, so
  touch exploration let an injected finger tap press the eraser directly [measured]; the agent
  cannot test what touch exploration does to real fingers or the real pen, and `input` cannot
  send two fingers at once.

## 2. Choosing a pen or the eraser from a service

- The toolbar is a column of nodes on the leading edge, each 116 × 141 px, with the content
  descriptions above, in the order the owner arranged them (here `pen_1`, `pen_3`, `pen_2`)
  [measured]. Finding by description, not by position, keeps working when the owner moves or
  reorders the toolbar [inference; community: SnToggle relies on it].
- Tap gesture at the node's centre (40 ms stroke): eraser then pen 1 were selected, shown by the
  outlined box on the button in the screenshots [measured]. Total from the command to NOTE's
  content change: about 90 to 130 ms, before the e-ink refresh [measured].
- No node reports which tool is selected (`isSelected` and `isChecked` false on every button,
  and every button has a `button_tag` child) [measured]; SnToggle reads it from a screenshot of the
  button's top edge [community]. A toggle («pen ⇄ eraser») needs that; a fixed mapping («double tap
  = pen 1») does not.
- With the toolbar hidden (full screen) the buttons are not on screen; SnToggle shows the toolbar,
  taps and hides it again [community; not measured here].

## 3. Telling a finger from the pen

- Device sources [measured, `dumpsys input`]: the pen is `Wacom-pen`, source `0x5002`
  (touchscreen and stylus); the fingers are `fts_ts`, source `0x1103`; the side strip is
  `fts_slide_ts`.
- The overlay's `ACTION_OUTSIDE` keeps the source: an injected finger tap read `0x1002` and an
  injected stylus tap `0x4002` [measured]. So a real pen touch should read with the stylus bit and
  a finger without it [inference: real pen not tested].
- A plugin's motion listener names the tool directly (`toolType` 1 or 2) [official types]; SnToggle
  also ignores finger taps for 0.6 s after pen contact (palm guard) [community].

## 4. SnToggle

[gi-os/supernote-gestures](https://github.com/gi-os/supernote-gestures) ships a plugin and an APK:
a finger double tap toggles pen and eraser, a two-finger tap undoes, a three-finger tap redoes, a
pen scribble erases [community, README]. It has no license, so its code cannot be copied or
adapted; using it as it is would mean installing a stranger's unlicensed build. Gaps against the
wish in [#251](https://github.com/martonpaulo/ink-tools/issues/251):

- Its gestures are fixed; the owner wants his own mapping (double tap = pen 1, triple tap =
  eraser, and so on).
- Its own service would sit beside Handwriting Language's `WritingWatcher`; `settings put` of a
  second service replaces the first unless the list is joined with `:`.
- A second plugin and app outside Ink Tools' build, versions and device rounds.

## 5. Proposal

For the owner to choose on the owner page; follow-up issues are captured after the choice.

- **A (recommended): Ink Tools Gestures.** A plugin (or a part of an existing one) detects
  finger gestures with its motion listener: double tap, triple tap, two-finger tap, three-finger
  tap, with the timings and palm guard above. Its settings map each gesture to one action: pen 1,
  2 or 3, eraser 1 or 2, lasso, undo, redo, or nothing. One Ink Tools accessibility service, the
  existing `WritingWatcher` gaining toolbar presses, presses NOTE's button by its description, so
  only one service is ever enabled. Defaults: double tap = pen 1, triple tap = eraser 1.
- **B: Accessibility only.** The service's overlay counts finger touch-downs (no plugin). Cheaper,
  but it cannot tell a tap from a drag or know where the finger is, so a quick scroll or page swipe
  could switch the tool.
- **C: Install SnToggle as it is.** No work here, fixed gestures, an unlicensed third-party build.

## What a device round with the owner must confirm

Pen steps the agent cannot drive:

1. Real pen touch on the overlay: the source has the stylus bit.
2. A finger double tap and triple tap reach a plugin's motion listener while the note is in front
   and no plugin view is open, with `toolType` 1.
3. Writing right after a gesture-driven tool change works, with no lost stroke.

## The probe

A single Java class built with Handwriting Language's toolchain (`javac`, D8, `aapt2`,
`apksigner`), kept only in the session scratch. Its configuration: `typeAllMask`,
`flagRetrieveInteractiveWindows`, `flagReportViewIds`, `flagIncludeNotImportantViews`,
`canPerformGestures`, `canRequestTouchExplorationMode`. Broadcast actions: `DUMP` (log every node
with a description or view id), `CLICK --es desc <desc> --es how node|gesture`, `MODE --es mode
plain|explore|multi`, `OVERLAY --es state on|off`, `PASS --es rect l,t,r,b` (passthrough regions).
Enabled with `settings put secure enabled_accessibility_services
com.martonpaulo.inktools.gestureprobe/.GestureProbe` and `accessibility_enabled 1`. An
`inkctl screen` or `snapshot` restarts the service, which resets runtime flags; plain `adb exec-out
screencap -p` does not.
