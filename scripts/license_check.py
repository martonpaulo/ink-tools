#!/usr/bin/env python3
"""Refuse a project licence line that says anything but CC BY-NC-SA 4.0 (#276).

    license_check.py [--root DIR]

Checks, outside node_modules: every tracked `LICENSE` file opens with the copyright line and the
CC BY-NC-SA 4.0 link; every `- License:` line of an `AGENTS.md` and every `[...](LICENSE)` link in
a README names CC BY-NC-SA 4.0. Third-party rows and NOTICE.md texts are not read.
Prints one `path:line: text` per bad line. Exit 0 pass, 1 a bad line.
"""
import argparse
import re
import sys
from pathlib import Path

NAME = "CC BY-NC-SA 4.0"
LINK = "https://creativecommons.org/licenses/by-nc-sa/4.0/"
HEAD_CHARS = 400  # the link sits in the first lines of a LICENSE
SHOWN_CHARS = 80  # how much of a bad line is printed


def files(root, name):
    return [p for p in sorted(root.rglob(name)) if "node_modules" not in p.parts]


def check(root):
    bad = []
    for path in files(root, "LICENSE"):
        text = path.read_text(encoding="utf-8")
        if not text.startswith("Copyright (c)") or LINK not in text[:HEAD_CHARS]:
            bad.append(f"{path.relative_to(root)}:1: not the {NAME} text")
    for path in files(root, "AGENTS.md"):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.startswith("- License:") and NAME not in line:
                bad.append(f"{path.relative_to(root)}:{n}: {line[:SHOWN_CHARS]}")
    for path in files(root, "README.md"):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"\]\(LICENSE\)", line) and "badge" not in line and NAME not in line:
                bad.append(f"{path.relative_to(root)}:{n}: {line[:SHOWN_CHARS]}")
    return bad


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    bad = check(Path(parser.parse_args().root))
    print("\n".join(bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
