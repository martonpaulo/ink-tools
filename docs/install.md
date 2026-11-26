# Install Ink Tools on a Supernote

How a person outside the project installs, updates and removes an Ink Tools plugin on a Supernote
tablet ([#373](https://github.com/martonpaulo/ink-tools/issues/373)). Read the notice first.

## Contents

- [Before you install](#before-you-install)
- [What you can install](#what-you-can-install)
- [Install a plugin](#install-a-plugin)
- [Update a plugin](#update-a-plugin)
- [Remove a plugin](#remove-a-plugin)
- [How each step is checked](#how-each-step-is-checked)

## Before you install

<!-- risk-notice:start: written by scripts/risk_notice.py from docs/risk-notice.md -->
<p><strong>Ink Tools is unofficial.</strong> It is not made, affiliated with, endorsed or reviewed by Ratta. «Supernote» is a trademark of its owner and names the device only.</p>
<p>Some tools use parts of the tablet's software that Ratta does not document. A firmware update can change those parts and break a feature until a fix ships. The <a href="https://github.com/martonpaulo/ink-tools/issues/293" target="_blank" rel="noopener">firmware watch</a>, being built now, checks those parts after an update and reports what broke.</p>
<p>No tool needs root or modified firmware. Use these tools at your own risk, and keep a backup of your notes before you install or update one.</p>
<!-- risk-notice:end -->

## What you can install

A tool gets a stable release only when it is ready: the README marks it Beta or Working and no
open P0 or P1 issue names it. Each release lists the permissions the tool asks for and every
network service it sends data to.

| Tool | Stable release | File | Why not yet |
| :--- | :--- | :--- | :--- |
| Smart Pen | yes, from `0.1.0` | `SmartPen-<version>.snplg` | |
| Device Link | yes, from `0.1.0` | `Relay-<version>.snplg` | |
| Lasso Actions | not yet | | an open P1 issue: [#13](https://github.com/martonpaulo/ink-tools/issues/13) |
| Account Sync | not yet | | in progress |
| Image Editing | not yet | | in progress |
| Handwriting Language | not yet | | it has no release build signed with a release key yet; it is a sideloaded app, not a plugin |
| Ink Notebook Editor | not yet | | in progress |
| Ink Tools Control | no release | | a Mac command line tool, unversioned: use it from a clone of this repository |
| Ink Tools Helper, Ink Tools Probe | no release | | developer tools for this project, never offered to others |

Every other build on the [releases page](https://github.com/martonpaulo/ink-tools/releases) is a
prerelease for testing.

## Install a plugin

1. Open the tool's release on the [releases page](https://github.com/martonpaulo/ink-tools/releases)
   and download its `.snplg` file, named as the table above shows. Keep the file name: it carries
   the version.
2. Connect the tablet to the computer with a USB cable, or use Supernote Cloud, and copy the file
   into the tablet's `MyStyle` folder.
3. On the tablet, open Settings, then Apps, then Plugins, and tap Select Plugin Package. In Select
   Plugin, choose the file, then tap Install.
4. When the tablet asks, allow the permissions the release notes list. A plugin that is refused a
   permission shows what it needs and how to give it.
5. Tap the plugin in the Plugins list to open its page, and turn it on with the switch there. The
   tablet keeps at most 10 plugins on at one time.

## Update a plugin

1. Download the newer `.snplg` and copy it into `MyStyle`, as when you installed it.
2. Install it again from Settings, then Apps, then Plugins, then Select Plugin Package: choose the
   new file, then tap Install.
   The tablet replaces the old version. Choose the new file by its version
   in the name: reinstalling from the plugin's existing entry installs the old copy again.

## Remove a plugin

1. Open Settings, then Apps, then Plugins, and tap the plugin.
2. Tap Uninstall and confirm. Your notes stay as they are.
3. Delete the `.snplg` from `MyStyle` if you do not need it again.

## How each step is checked

The project checks these steps on a tablet in its device rounds, with Ink Tools Control
(`cli/inkctl/`) for every step a command can do, and the person's own hands for the pen and screen
steps:

| Step | Checked with |
| :--- | :--- |
| Copy the file | `inkctl plugin push FILE.snplg` |
| Install and update | `inkctl plugin install FILE.snplg`, then `inkctl plugin list` |
| Allow permissions | `inkctl plugin permissions NAME` |
| Turn on | `inkctl plugin enable NAME` |
| Remove | `inkctl plugin uninstall NAME` |
| Select Plugin Package and the permission prompt on screen | by hand, in the device round |
