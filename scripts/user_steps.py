#!/usr/bin/env python3
"""Refuse a developer step on a user page or in a user tool's visible text (#507).

    user_steps.py [--root DIR]

A person who is not a developer installs and uses Ink Tools with no terminal, Python, Homebrew or
typed adb (`docs/decisions.md`, 2026-11-27). This check reads the user surfaces that
`scripts/user_steps.json` names and fails on a line that asks the reader to open a terminal, run
Python, use Homebrew, or type an `adb` or `inkctl` command. The data file holds every list:

- `surfaces`: the user pages and copy files, as `git ls-files` patterns;
- `developer`: the pages a surface pattern reaches that stay developer pages;
- `developer_headings`: a Markdown section under one of these headings is a developer section;
- `known`: a hit already tracked by an open issue, by path, a text its line holds, and the issue.
  A known entry that no longer hits fails as `stale`, so the list only shrinks.

In a code file (not `.md` or `.html`), comment lines are skipped: only the visible strings count.
Prints one `path:line: term` per hit. Exit 0 with none, 1 with hits or stale entries, 2 on a bad root.
"""
import argparse
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

DATA = "scripts/user_steps.json"
VERBS = r"(?:run|type|enter|install|use|open)"
TOOLS = {"adb": r"adb", "inkctl": r"inkctl", "python": r"python3?|pip3?"}
COMMENT = re.compile(r"^\s*(?://|/\*|\*|#)")
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")


def tool_patterns(tool):
    """The shapes of a step that asks the reader to type `tool`."""
    return (
        rf"\b{VERBS}\s+(?:the\s+)?`?(?:{tool})\b",
        rf"`(?:{tool})\s[^`]*`",
        rf"<code>(?:{tool})\s",
        rf"\b(?:{tool})`?\s+commands?\b",
    )


PATTERNS = [(term, re.compile(pattern, re.IGNORECASE))
            for term, tool in TOOLS.items() for pattern in tool_patterns(tool)]
FENCED = [(term, re.compile(rf"^\s*(?:\$\s+)?(?:{tool})\s+\S", re.IGNORECASE)) for term, tool in TOOLS.items()]
PATTERNS += [
    ("terminal", re.compile(r"\b(?:open|launch|in|into|from)\s+(?:the\s+|a\s+)?terminal\b", re.IGNORECASE)),
    ("terminal", re.compile(r"\bterminal\.app\b", re.IGNORECASE)),
    ("homebrew", re.compile(r"\bhomebrew\b|\bbrew\s+(?:install|tap|upgrade)\b", re.IGNORECASE)),
]


def load(root):
    """The data file of `root`, its lists as written."""
    return json.loads((root / DATA).read_text(encoding="utf-8"))


def surface_files(root, data):
    """Every tracked file a surface pattern names, less the developer pages."""
    result = subprocess.run(["git", "-C", str(root), "ls-files"], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"git ls-files exited {result.returncode}")
    tracked = result.stdout.splitlines()
    names = {path for path in tracked for pattern in data["surfaces"] if fnmatch.fnmatchcase(path, pattern)}
    return sorted(names - set(data["developer"]))


def line_terms(text, fenced=False):
    """The terms of every developer step on one line, each once, in pattern order; a line of a
    fenced block also counts as a command when it starts with a tool."""
    terms = []
    for term, pattern in PATTERNS + (FENCED if fenced else []):
        if term not in terms and pattern.search(text):
            terms.append(term)
    return terms


def file_hits(path, text, headings):
    """The (line number, line, term) of every developer step in one file's user text."""
    markdown = path.endswith(".md")
    code = not markdown and not path.endswith(".html")
    developer_level = 0
    fenced = False
    found = []
    for number, line in enumerate(text.splitlines(), 1):
        if markdown and line.lstrip().startswith("```"):
            fenced = not fenced
        heading = HEADING.match(line) if markdown and not fenced else None
        if heading:
            level = len(heading.group(1))
            if developer_level and level <= developer_level:
                developer_level = 0
            if not developer_level and any(heading.group(2).startswith(name) for name in headings):
                developer_level = level
            continue
        if developer_level or (code and COMMENT.match(line)):
            continue
        found += [(number, line, term) for term in line_terms(line, fenced)]
    return found


def check(root):
    """The hits no known entry covers, and the known entries that cover no hit."""
    data = load(root)
    hits = []
    used = set()
    for path in surface_files(root, data):
        text = (root / path).read_text(encoding="utf-8", errors="replace")
        for number, line, term in file_hits(path, text, data["developer_headings"]):
            known = [index for index, entry in enumerate(data["known"])
                     if entry["path"] == path and entry["text"] in line]
            used.update(known)
            if not known:
                hits.append((path, number, term))
    stale = [entry for index, entry in enumerate(data["known"]) if index not in used]
    return hits, stale


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=".")
    args = parser.parse_args(argv)
    root = Path(args.root)
    if not (root / ".git").exists() or not (root / DATA).is_file():
        print(f"user_steps: {root} is not a Git checkout with {DATA}", file=sys.stderr)
        return 2
    try:
        hits, stale = check(root)
    except RuntimeError as error:
        print(f"user_steps: {error}", file=sys.stderr)
        return 2
    for path, line, term in hits:
        print(f"{path}:{line}: {term}")
    for entry in stale:
        print(f"stale: {entry['path']}: {entry['text']!r} (#{entry['issue']}) no longer hits; drop it from {DATA}")
    if hits or stale:
        print(f"user_steps: {len(hits)} developer step(s), {len(stale)} stale entry(ies); "
              f"a user page asks for no terminal, Python, Homebrew, adb or inkctl (#507)")
        return 1
    print("user_steps: pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
