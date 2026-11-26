#!/usr/bin/env python3
"""Refuse tracked text that says how vendor software was taken apart or worked around (#408).

    public_wording.py [--root DIR]

The repository is public. A device fact is written by what it is and how it was seen (observed
device behaviour, device data, measured on the tablet), never by the method used on vendor
software; vendor internal names live in `registry/items/` and in the code that needs them
(`AGENTS.md` › Scope, reuse, and implementation). `TERMS` is the forbidden list, matched without
case; `ALLOWED` names the only files that may hold it: this checker and its test.

Reads tracked files only (`git grep`), so untracked and ignored scratch never counts, and skips
binary files. Prints one `path:line: term` per hit. Exit 0 with none, 1 with hits, 2 on a bad root.
"""
import argparse
import subprocess
import sys
from pathlib import Path

TERMS = (
    "decompil",
    "jadx",
    "reverse[- ]?engineer",
    "smali",
    "apktool",
    "dex2jar",
    "ghidra",
    "sandbox bypass",
    "bypass(es|ing)? (the |its )?sandbox",
)
PATTERN = "|".join(TERMS)
ALLOWED = ("scripts/public_wording.py", "scripts/test_public_wording.py")


def hits(root):
    """The (path, line, matched text) of every forbidden term in a tracked file outside ALLOWED."""
    command = ["git", "-C", str(root), "grep", "-n", "-I", "-i", "-E", "-o", PATTERN, "--", "."]
    command += [f":(exclude){path}" for path in ALLOWED]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode not in (0, 1):
        raise RuntimeError(result.stderr.strip() or f"git grep exited {result.returncode}")
    found = []
    for row in result.stdout.splitlines():
        path, line, text = row.split(":", 2)
        found.append((path, int(line), text))
    return found


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=".")
    args = parser.parse_args(argv)
    root = Path(args.root)
    if not (root / ".git").exists():
        print(f"public_wording: {root} is not a Git checkout", file=sys.stderr)
        return 2
    try:
        found = hits(root)
    except RuntimeError as error:
        print(f"public_wording: {error}", file=sys.stderr)
        return 2
    for path, line, text in found:
        print(f"{path}:{line}: {text}")
    if found:
        print(f"public_wording: {len(found)} forbidden term(s); write the fact neutrally (AGENTS.md, #408)")
        return 1
    print("public_wording: pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
