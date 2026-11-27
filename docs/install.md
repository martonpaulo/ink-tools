# Install Ink Tools on a Supernote

How a person outside the project installs, updates and removes an Ink Tools plugin on a Supernote
tablet, and installs the other tools ([#373](https://github.com/martonpaulo/ink-tools/issues/373)). Read the notice first.

## Contents

- [Before you install](#before-you-install)
- [What you can install](#what-you-can-install)
- [Install a plugin](#install-a-plugin)
- [Update a plugin](#update-a-plugin)
- [Remove a plugin](#remove-a-plugin)
- [Install the tablet app](#install-the-tablet-app)
- [Install the Mac app](#install-the-mac-app)

## Before you install

<!-- risk-notice:start: written by scripts/risk_notice.py from docs/risk-notice.md -->
<p><strong>Ink Tools is unofficial.</strong> It is not made, affiliated with, endorsed or reviewed by Ratta. «Supernote» is a trademark of its owner and names the device only.</p>
<p>Some tools use parts of the tablet's software that Ratta does not document. A firmware update can change those parts and break a feature until a fix ships. The <a href="https://github.com/martonpaulo/ink-tools/issues/293" target="_blank" rel="noopener">firmware watch</a> checks those parts after an update and reports what broke.</p>
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
| Puzzles | not yet | | in progress: no game yet ([#376](https://github.com/martonpaulo/ink-tools/issues/376)) |
| Handwriting Language | not yet | `lingo-app-<version>.apk` | test builds ship as prereleases signed with its release key ([#494](https://github.com/martonpaulo/ink-tools/issues/494)); it is a sideloaded app, not a plugin |
| Note Editor | not yet | | in progress |
| Ink Tools Helper, Ink Tools Probe | no release | | developer tools for this project, never offered to others |

Every other build on the [releases page](https://github.com/martonpaulo/ink-tools/releases) is a
prerelease for testing.

## Install a plugin

1. Download the plugin's `.snplg` file from [inktools.martonpaulo.com](https://inktools.martonpaulo.com/#tools).
2. Copy the file into the tablet's `MyStyle` folder, over a USB cable or Supernote Cloud.
3. On the tablet, open **Settings** › **Apps** › **Plugins** › **Select Plugin Package**, choose the file and tap **Install**.
4. Turn the plugin on in **Settings** › **Apps** › **Plugins**. The install itself asks nothing:
   the tablet asks for each permission the release notes list the first time you open the plugin's
   Settings or press one of its buttons. Choose **Always Allow**, as a button that works with no
   screen of its own works only with Always Allow ([Plugins](supernote.md#plugins)). A plugin that
   is refused a permission shows what it needs and how to give it.

## Update a plugin

Copy the new `.snplg` into `MyStyle` and install it the same way. Choose the file with the new version in its name.

## Remove a plugin

Open **Settings** › **Apps** › **Plugins**, tap the plugin, then tap **Uninstall**. Your notes stay as they are.

## Install the tablet app

Handwriting Language has no release yet: its first prerelease waits for its signing key, and then installs on the tablet with no computer; its [README](../apps/handwriting-language/README.md#install) shows the steps.

## Install the Mac app

Note Editor has no release yet. It will be a notarized download from [inktools.martonpaulo.com](https://inktools.martonpaulo.com/), with no terminal step ([#445](https://github.com/martonpaulo/ink-tools/issues/445)).
