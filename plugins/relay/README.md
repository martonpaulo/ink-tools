# Relay

A Supernote plugin: send the current page, or a lasso selection, as a picture to your iPhone or
your Mac over [LocalSend](https://localsend.org), with one tap.

**Status: built, not yet tried on the device.** The work is tracked in
[#98](https://github.com/martonpaulo/supernote-tools/issues/98), and the receive half in [#49](https://github.com/martonpaulo/supernote-tools/issues/49).

## What it does

- «Send page» in the note's sidebar: the current page as a PNG.
- «Send selection» in the lasso toolbar: only the selection as a PNG.
- Pick the receiving device once in Settings; later sends go to it with no question.

## Built on

React Native + `sn-plugin-lib`, like `../lookup`, with a native Java module for the network, as
`../probe` has.
