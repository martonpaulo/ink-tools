#!/usr/bin/env python3
"""Check that every place Ink Tools stores data is in the storage inventory (#485).

    storage_inventory.py [--root DIR]

The disclosure rule of `docs/product.md` › Constraints asks each tool to show the disk it uses, so a
new storage location must not appear unnoticed. A code file stores data when one of its code lines
holds a storage marker (`MARKERS`: a folder made or named, a file written or downloaded, an app
folder of the Mac); every such file under `plugins/`, `packages/`, `apps/` and `cli/` must be named,
in backticks, in a row of `docs/storage.md`. Tests, test helpers, mocks, the search lab, the renders
harness and build folders are not read.

shortcut: a marker is a pattern over lines, not a parse; a store reached through a helper it does
not name passes. Upgrade to a typed storage port per runtime when one slips through.
shortcut: a row naming a file that no longer exists is not a finding, since a row may name code a
hand-off branch holds before it reaches `main` (#503); add that check once no hand-off is pending.

Prints one `path: text` line per finding. Exit 0 with none, 1 with findings, 2 on a bad root.
"""
import argparse
import re
import sys
from pathlib import Path

INVENTORY = "docs/storage.md"
FOLDERS = ("plugins", "packages", "apps", "cli")
SKIP = {"node_modules", ".git", ".scratch", ".claude", "build", "android", ".toolchain", ".build",
        "__tests__", "__mocks__", "tests", "Tests", "native-tests", "testing", "lab", "renders"}
CODE = {".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs", ".java", ".kt", ".swift", ".py"}
MARKERS = re.compile(
    r"pluginDataFolder\(|\bSHARED_FOLDER\b|\bPACK_STORE_FOLDER\b|downloadToFile\(|downloadThumbToFile\("
    r"|FileOutputStream\(|getFilesDir\(|getCacheDir\(|getExternalFilesDir\(|applicationSupportDirectory"
    r"|cachesDirectory|\.cache/inkctl|FileUtils\.(?:writeFile|copyFile|makeDir)\b|Files\.write\("
    r"|createFile\(|writeText\(|appendText\(|writeBytes\(|FileWriter\(|\bwrite\(to:|createDirectory\(")
COMMENT = re.compile(r"^\s*(?://|\*|/\*|#)")
TICKED = re.compile(r"`([^`\s]+)`")


def is_python(path):
    """An extensionless host tool whose `#!` line names Python, as inkctl is."""
    try:
        with open(path, "rb") as handle:
            first = handle.readline().decode("utf-8", "replace")
    except OSError:
        return False
    return first.startswith("#!") and "python" in first


def code_files(root):
    """Every code file under the tool folders, relative to root, skipping test and build folders."""
    for top in FOLDERS:
        stack = [root / top] if (root / top).is_dir() else []
        while stack:
            folder = stack.pop()
            for entry in sorted(folder.iterdir()):
                if entry.is_dir():
                    if entry.name not in SKIP:
                        stack.append(entry)
                elif entry.suffix in CODE or (not entry.suffix and is_python(entry)):
                    yield entry.relative_to(root).as_posix()


def stores(root, rel):
    """True when a code line of the file holds a storage marker."""
    text = (root / rel).read_text(encoding="utf-8", errors="replace")
    return any(MARKERS.search(line) for line in text.splitlines() if not COMMENT.match(line))


def listed(root):
    """Every repository path the inventory names in backticks, or None without an inventory."""
    try:
        text = (root / INVENTORY).read_text(encoding="utf-8")
    except OSError:
        return None
    return {token for token in TICKED.findall(text) if token.split("/", 1)[0] in FOLDERS}


def findings(root):
    names = listed(root)
    if names is None:
        return [(INVENTORY, "the storage inventory is missing")]
    return sorted((rel, "stores data but %s does not list it; add its row (#485)" % INVENTORY)
                  for rel in code_files(root) if stores(root, rel) and rel not in names)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check the storage inventory (#485).")
    parser.add_argument("--root", default=".", help="the checkout to read")
    root = Path(parser.parse_args(argv).root).resolve()
    if not root.is_dir():
        print("storage-inventory: no folder at %s" % root, file=sys.stderr)
        return 2
    found = findings(root)
    print("\n".join("%s: %s" % item for item in found) if found else "storage-inventory: ok")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
