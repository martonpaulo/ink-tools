#!/usr/bin/env python3
"""Write a plugin's release notes from repository data (#373).

    release_notes.py [--root DIR] PLUGIN_FOLDER     print the notes, such as plugins/smart-pen
    release_notes.py [--root DIR] --check           check every released tool's data, print nothing

The notes hold the tool's name and version from `PluginConfig.json`, the risk notice from
`docs/risk-notice.md`, the permissions the tool asks for in plain words (from `uses-permissions`),
the network services it sends data to (the tool's `network` list in `docs/tools.json`) and the link
to the install guide, naming the file the release carries (the `asset=` line of the plugin's
`prerelease-<folder>.yml`). `--check` also holds `docs/install.md`'s File column to that name for
each tool it lists as released. A permission this script does not know fails, so a new one gets its words
before a release; a tool that asks for the internet with no `network` entry, or lists one without
asking for it, fails, so the notes never contradict the code. Internal tools are never released and
are not checked. Exit 0, or 1 with one line per problem.
"""
import argparse
import json
import re
import sys
from pathlib import Path

RISK_NOTICE = "docs/risk-notice.md"
TOOLS = "docs/tools.json"
INSTALL_GUIDE = "https://github.com/martonpaulo/ink-tools/blob/main/docs/install.md"
INSTALL_DOC = "docs/install.md"
# The release file a prerelease workflow writes: `asset="build/outputs/<Prefix>-${TAG#<folder>-v}.snplg"`.
# The install guide's table: Tool, Stable release, File, Why not yet.
TOOL, RELEASED, FILE = 0, 1, 2
ASSET = re.compile(r'asset="build/outputs/([A-Za-z0-9]+)-\$\{TAG#')
INTERNAL = "Internal"
# Each permission a plugin may ask for: the words the notes use, and whether it reaches the network.
PERMISSIONS = {
    "plugin.permission.INTERNET": ("Internet: to reach the services listed below", True),
    "plugin.permission.FILE:READ": ("Read files: to read your notes, pictures and its own settings", False),
    "plugin.permission.FILE:WRITE": ("Write files: to save into your notes and its own folder", False),
    "plugin.permission.FILE:DELETE": ("Delete files: to remove the files it made", False),
}


def tool_entry(root, name):
    """The `docs/tools.json` entry whose name is `name`, or None."""
    tools = json.loads((root / TOOLS).read_text(encoding="utf-8"))["tools"]
    return next((tool for tool in tools if tool["name"] == name), None)


def asset_file(root, folder):
    """The release file of the plugin in `folder`, as `<Prefix>-<version>.snplg`, or None."""
    workflow = root / ".github" / "workflows" / f"prerelease-{Path(folder).name}.yml"
    found = ASSET.search(workflow.read_text(encoding="utf-8")) if workflow.is_file() else None
    return f"{found.group(1)}-<version>.snplg" if found else None


def guide_problems(root, folders):
    """Each released row of the install guide whose File cell is not its release's file (#373)."""
    guide = root / INSTALL_DOC
    if not guide.is_file():
        return []
    found = []
    for line in guide.read_text(encoding="utf-8").splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) <= FILE or not cells[RELEASED].startswith("yes"):
            continue
        folder = folders.get(cells[TOOL])
        expected = asset_file(root, folder) if folder else None
        if expected is None:
            found.append(f"{INSTALL_DOC}: {cells[TOOL]} is released but no plugin's prerelease workflow names its file")
        elif cells[FILE] != f"`{expected}`":
            found.append(f"{INSTALL_DOC}: {cells[TOOL]}'s file is {cells[FILE] or 'empty'}, but its release ships `{expected}`")
    return found


def problems_of(folder, config, entry):
    """What keeps the notes of the plugin in `folder` from being true."""
    found = []
    if entry is None:
        return [f"{folder}: no entry named {config['name']!r} in {TOOLS}"]
    asked = config.get("uses-permissions", [])
    for permission in asked:
        if permission not in PERMISSIONS:
            found.append(f"{folder}: permission {permission} has no words in release_notes.py PERMISSIONS")
    network = entry.get("network")
    if network is None:
        found.append(f"{folder}: {TOOLS} gives {config['name']} no network list (an empty list means none)")
    else:
        online = any(PERMISSIONS.get(permission, ("", False))[1] for permission in asked)
        if online != bool(network):
            found.append(f"{folder}: asks for the internet: {online}, but its network list has {len(network)} entries")
    return found


def notes(root, folder):
    """The notes' Markdown, or raise ValueError naming each problem."""
    config = json.loads((root / folder / "PluginConfig.json").read_text(encoding="utf-8"))
    entry = tool_entry(root, config["name"])
    found = problems_of(folder, config, entry)
    if found:
        raise ValueError("\n".join(found))
    notice = (root / RISK_NOTICE).read_text(encoding="utf-8").strip()
    permissions = "\n".join(f"- {PERMISSIONS[p][0]}" for p in config.get("uses-permissions", [])) or "- None"
    network = "\n".join(f"- {service}" for service in entry["network"]) or "- None: it sends nothing over the network."
    asset = asset_file(root, folder)
    file = f"`{asset.replace('<version>', config['versionName'])}`" if asset else "`.snplg`"
    return "\n\n".join([
        f"{config['name']} {config['versionName']}, an unofficial plugin for Supernote tablets.",
        "## Before you install\n\n" + notice,
        "## Permissions it asks for\n\n" + permissions,
        "## Where it sends data\n\n" + network,
        f"## Install\n\nDownload {file} below and follow the [install guide]({INSTALL_GUIDE}).",
    ]) + "\n"


def check(root):
    """Every non-internal plugin's problems, and the install guide's file names."""
    found = []
    folders = {}
    for config_path in sorted(root.glob("plugins/*/PluginConfig.json")):
        config = json.loads(config_path.read_text(encoding="utf-8"))
        folders[config["name"]] = config_path.parent.relative_to(root).as_posix()
        entry = tool_entry(root, config["name"])
        if entry is not None and entry.get("status") == INTERNAL:
            continue
        found += problems_of(config_path.parent.relative_to(root).as_posix(), config, entry)
    return found + guide_problems(root, folders)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=".", help="the checkout (default: here)")
    parser.add_argument("--check", action="store_true", help="check every released tool's data")
    parser.add_argument("folder", nargs="?", help="a plugin folder, such as plugins/smart-pen")
    args = parser.parse_args()
    root = Path(args.root)
    if args.check:
        found = check(root)
        if found:
            print("\n".join(found))
        sys.exit(1 if found else 0)
    if not args.folder:
        parser.error("name a plugin folder, or pass --check")
    try:
        print(notes(root, args.folder.rstrip("/")), end="")
    except ValueError as error:
        print(error, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
