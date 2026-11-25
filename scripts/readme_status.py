#!/usr/bin/env python3
"""Refuse a README Status cell outside the vocabulary AGENTS.md records (#268).

    readme_status.py [--root DIR]

AGENTS.md's `- README Status values:` line lists the allowed values in backticks; it is the one
source. Every table in README.md whose last header cell is `Status` must end each row with one of
them; a `<br>` may stand for the space between the emoji and the word. Prints one `README.md:<line>: <cell>` line per bad cell. Exit 0 when all pass, 1 on a bad
cell, 2 when AGENTS.md has no values line or README.md has no Status table.
"""
import argparse
import re
import sys
from pathlib import Path

VALUES_LINE = "- README Status values:"


def allowed(agents_text):
    """The backticked values on AGENTS.md's values line, or None when the line is missing."""
    for line in agents_text.splitlines():
        if line.startswith(VALUES_LINE):
            return re.findall(r"`([^`]+)`", line)
    return None


def cells(line):
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def bad_cells(readme_text, values):
    """(line number, cell) for each Status cell outside `values`, and whether a Status table exists."""
    found, bad, in_table = False, [], False
    for number, line in enumerate(readme_text.splitlines(), 1):
        if not line.startswith("|"):
            in_table = False
            continue
        row = cells(line)
        if not in_table:
            in_table = row[-1] == "Status"
            found = found or in_table
            continue
        if set(row[-1]) <= set(":- "):
            continue
        # The emoji may sit on its own line above the word (owner, 2026-11-25): «🟡<br>Beta» is «🟡 Beta».
        if row[-1].replace("<br>", " ", 1) not in values:
            bad.append((number, row[-1]))
    return found, bad


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=".")
    root = Path(parser.parse_args().root)
    values = allowed((root / "AGENTS.md").read_text(encoding="utf-8"))
    if not values:
        print(f"AGENTS.md: no `{VALUES_LINE}` line with backticked values", file=sys.stderr)
        return 2
    found, bad = bad_cells((root / "README.md").read_text(encoding="utf-8"), values)
    if not found:
        print("README.md: no table whose last column is Status", file=sys.stderr)
        return 2
    for number, cell in bad:
        print(f"README.md:{number}: {cell!r} is not one of {', '.join(values)}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
