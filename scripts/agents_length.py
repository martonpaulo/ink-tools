#!/usr/bin/env python3
"""Refuse an AGENTS.md over the line cap the root AGENTS.md › Route map sets for it.

    agents_length.py [--root DIR]

Every session loads these files whole, so the route map caps a module's own AGENTS.md and the root
file; this gate reads both caps from that sentence, the one owner of the numbers, on every change,
so a long file never lands (`apps/note-editor/AGENTS.md` reached 175 lines unseen). An AGENTS.md
below a `fixtures` or `testdata` folder is test input, not guidance. Reads `git ls-files`, so
untracked files never count. Prints one `path: N lines, over CAP` line per file.
Exit 0 with none, 1 with findings, 2 on a bad root or a route map with no caps.
"""
import argparse
import re
import sys
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
from case_check import tracked  # noqa: E402  one reader of the tracked files

MODULE_CAP = re.compile(r"own `AGENTS\.md` of at most (\d+) lines")
ROOT_CAP = re.compile(r"this file stays at most (\d+) lines")
FIXTURE_DIRS = {"fixture", "fixtures", "testdata"}


def caps(root_text):
    """(root cap, module cap) as the route map writes them, or None when it names neither."""
    root, module = ROOT_CAP.search(root_text), MODULE_CAP.search(root_text)
    return (int(root.group(1)), int(module.group(1))) if root and module else None


def over(files, root_cap, module_cap):
    """(path, lines, cap) for each AGENTS.md in `files`, a {path: text} map, over its cap."""
    found = []
    for path, text in sorted(files.items()):
        pure = PurePosixPath(path)
        if pure.name != "AGENTS.md" or FIXTURE_DIRS & {part.lower() for part in pure.parts[:-1]}:
            continue
        cap = root_cap if len(pure.parts) == 1 else module_cap
        count = len(text.splitlines())
        if count > cap:
            found.append((path, count, cap))
    return found


def main(argv=None):
    parser = argparse.ArgumentParser(description="Refuse an AGENTS.md over its line cap.")
    parser.add_argument("--root", default=".", help="the checkout to read, by default the current folder")
    given = parser.parse_args(argv).root
    try:
        root = Path(given).resolve()
        paths = [path for path in tracked(root) if PurePosixPath(path).name == "AGENTS.md"]
        files = {path: (root / path).read_text(encoding="utf-8") for path in paths}
    except (OSError, RuntimeError) as error:
        print("agents-length: cannot read %s: %s" % (given, error), file=sys.stderr)
        return 2
    limits = caps(files.get("AGENTS.md", ""))
    if limits is None:
        print("agents-length: the root AGENTS.md states no line caps", file=sys.stderr)
        return 2
    found = over(files, *limits)
    for path, count, cap in found:
        print("%s: %d lines, over %d" % (path, count, cap))
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
