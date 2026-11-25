#!/usr/bin/env python3
"""Refuse a README Status cell outside the vocabulary AGENTS.md records (#268).

    readme_status.py [--root DIR]

AGENTS.md's `- README Status values:` line lists the allowed values in backticks; it is the one
source. Every table in README.md, Markdown or HTML with one row per line, whose last header cell is `Status` must end each row with one of
them; `&nbsp;` may stand for any space, to keep the status on one line. A cell may wrap the value in one link, to the piece's releases (owner, 2026-11-25), and holds nothing else. Prints one `README.md:<line>: <cell>` line per bad cell. Exit 0 when all pass, 1 on a bad
cell, 2 when AGENTS.md has no values line or README.md has no Status table.

A table with no Status column holds each row's status as the emoji of one value, before the name in
the Name cell (owner, 2026-11-25); a row whose Name cell shows an icon must have one.
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
    """A row's cells: a Markdown `| a | b |` row, or an HTML `<tr><td>a</td><td>b</td></tr>` row on one line."""
    if line.lstrip().startswith("<tr>"):
        return [cell.strip() for cell in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", line)]
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


LINKED = re.compile(r'^<a href="[^"]+">(.*)</a>$|^\[(.*)\]\([^)]+\)$')
# The emoji stays outside the link, so only the word is underlined (owner, 2026-11-25).
EMOJI_THEN_LINK = re.compile(r'^(\S+)(?:&nbsp;| )<a href="[^"]+">([^<]*)</a>$')


def status_value(cell):
    """A Status cell's value: the cell, or the text of the one release link that wraps it."""
    split = EMOJI_THEN_LINK.match(cell)
    if split:
        return f"{split.group(1)} {split.group(2)}".replace("&nbsp;", " ")
    linked = LINKED.match(cell)
    return (linked.group(1) or linked.group(2) if linked else cell).replace("&nbsp;", " ")


def is_row(line):
    """True for a Markdown table row or a one-line HTML table row (fixed widths need HTML, owner 2026-11-25)."""
    return line.startswith("|") or line.lstrip().startswith("<tr>")


def bad_cells(readme_text, values):
    """(line number, cell) for each Status cell outside `values`, and whether a Status table exists."""
    found, bad, in_table, name_status = False, [], False, False
    for number, line in enumerate(readme_text.splitlines(), 1):
        if line.strip() in ("<table>", "</table>"):
            in_table = in_table and line.strip() == "<table>"
            continue
        if not is_row(line):
            in_table = False
            continue
        row = cells(line)
        if not in_table:
            in_table = row[-1] == "Status" or (row[0] == "Name" and "Status" not in row)
            name_status = row[-1] != "Status"
            continue
        if name_status:
            if "<img" not in row[0]:
                continue
            found = True
            text = re.sub(r"</?su[bp]>", "", re.sub(r"^.*?</p>", "", row[0]))
            dot = text.replace("&nbsp;", " ").split(" ", 1)[0]
            if dot not in {value.split(" ", 1)[0] for value in values}:
                bad.append((number, dot))
            continue
        found = True
        if set(row[-1]) <= set(":- "):
            continue
        # No-break spaces keep a status on one line, which widens the column (owner, 2026-11-25).
        if status_value(row[-1]) not in values:
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
