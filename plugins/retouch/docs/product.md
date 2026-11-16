# Retouch product definition

Status: current, 2026-11-16. Scope and the reuse check behind it are in
[`../../../docs/plugin-scope.md`](../../../docs/plugin-scope.md#retouch).

## Contents

- [What it is](#what-it-is)
- [Who it is for](#who-it-is-for)
- [What it does](#what-it-does)
- [What it will never do](#what-it-will-never-do)
- [Limits the owner set](#limits-the-owner-set)

## What it is

Retouch is a Supernote plugin that edits a picture already on the page. You lasso the picture and
tap one edit in the lasso menu; the finished picture replaces it in place.

## Who it is for

A Supernote Manta owner who puts photos, screenshots and drawings in notes and finds them faded
or too dark on the 16-grey screen.

## What it does

- Enhance for e-ink, Lighter, Darker, Undo and Restore original, each one tap
  ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)).
- Each edit is a switch in Settings.

## What it will never do

- Sliders for brightness, contrast or levels, or a live preview: every step costs one e-ink
  refresh ([#47](https://github.com/martonpaulo/supernote-tools/issues/47)).
- Scale a picture up.

## Limits the owner set

| Limit | Value | Set |
| :--- | :--- | :--- |
| Time of one edit | Within 2 s on the Manta, measured on the device; a longer one shows the plugin's «Working…» panel ([#103](https://github.com/martonpaulo/supernote-tools/issues/103)) | Owner, 2026-11-15 ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)) |
| Picture width after Enhance | At most the page width, never scaled up | Owner, 2026-11-15 ([#136](https://github.com/martonpaulo/supernote-tools/issues/136)) |
