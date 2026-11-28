#!/usr/bin/env python3
"""Keep `docs/feature-defaults.md` whole: every tool has its section, every row its decision (#547).

    feature_defaults.py [--root DIR]

The interface standard asks one row per user-facing feature: its default, and whether the person
can change it, with the path to the control, or why it is fixed. This check reads the file and
`docs/tools.json`, and prints one `kind<TAB>where<TAB>detail` line per problem:

- `missing-file`: there is no `docs/feature-defaults.md`;
- `missing-tool`: a tool of `docs/tools.json` has no `## <name>` section;
- `unknown-tool`: a section names no tool of `docs/tools.json`;
- `missing-feature`: a feature `docs/tools.json` lists, not planned, has no row whose «Feature»
  cell is its name, or starts with its name and ` › ` for one of its settings;
- `empty-tool`: a section has no row;
- `bad-row`: a row has not four cells, or an empty feature or default;
- `no-decision`: the «Change» cell is neither a path (`A › B`) nor `fixed: <reason>`;
- `duplicate-key`: two rows of one section name the same key.

Each plugin's own Jest test checks that every game and settings key it has holds a row, by the
«Key» column (`scripts/feature_defaults.py` reads only the document). Exit 0 with no problem, 1
with problems, 2 on a bad root. Python's standard library only.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DOC = "docs/feature-defaults.md"
TOOLS = "docs/tools.json"
HEADER = ("Feature", "Default", "Change", "Key")
SECTION = re.compile(r"^## (.+?)\s*$")
KEY = re.compile(r"`([^`]+)`")
CONTENTS = "Contents"


def cells(line: str) -> list[str]:
    """The cells of one Markdown table row."""
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def sections(text: str) -> dict[str, list[list[str]]]:
    """Each `## ` section's table rows, the header and its rule left out."""
    out: dict[str, list[list[str]]] = {}
    current: str | None = None
    for line in text.splitlines():
        heading = SECTION.match(line)
        if heading:
            # The Contents list a long document opens with (text_check.py) is no tool.
            current = None if heading.group(1) == CONTENTS else heading.group(1)
            if current is not None:
                out[current] = []
            continue
        if current is None or not line.lstrip().startswith("|"):
            continue
        row = cells(line)
        if tuple(row) == HEADER or all(set(cell) <= set(":- ") for cell in row):
            continue
        out[current].append(row)
    return out


def check(root: Path) -> list[tuple[str, str, str]]:
    doc = root / DOC
    if not doc.is_file():
        return [("missing-file", DOC, "the file does not exist")]
    listed = json.loads((root / TOOLS).read_text(encoding="utf-8"))["tools"]
    tools = [tool["name"] for tool in listed]
    found = sections(doc.read_text(encoding="utf-8"))
    problems: list[tuple[str, str, str]] = []
    problems += [("missing-tool", name, "no section") for name in tools if name not in found]
    problems += [("unknown-tool", name, f"not a tool of {TOOLS}") for name in found if name not in tools]
    for tool in listed:
        rows = found.get(tool["name"])
        if rows is None:
            continue
        named = {row[0].split(" › ")[0] for row in rows if row}
        for feature in tool.get("features", []):
            if not feature.get("planned") and feature["name"] not in named:
                problems.append(("missing-feature", f"{tool['name']} › {feature['name']}", f"a feature of {TOOLS} with no row"))
    for name, rows in found.items():
        if not rows:
            problems.append(("empty-tool", name, "no row"))
        keys: set[str] = set()
        for row in rows:
            where = f"{name} › {row[0]}"
            if len(row) != len(HEADER) or not row[0] or not row[1]:
                problems.append(("bad-row", where, " | ".join(row)))
                continue
            change = row[2]
            if not (change.startswith("fixed: ") and len(change) > len("fixed: ")) and "›" not in change:
                problems.append(("no-decision", where, change or "empty"))
            for key in KEY.findall(row[HEADER.index("Key")]):
                if key in keys:
                    problems.append(("duplicate-key", where, key))
                keys.add(key)
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=".")
    root = Path(parser.parse_args(argv).root)
    if not (root / TOOLS).is_file():
        print(f"error\t{root}\tno {TOOLS}", file=sys.stderr)
        return 2
    problems = check(root)
    for problem in problems:
        print("\t".join(problem))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
