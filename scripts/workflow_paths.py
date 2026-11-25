#!/usr/bin/env python3
"""Keep each validate workflow's `paths` equal to the `gates.json` rules of its gate (#301).

    workflow_paths.py [--root DIR]

CI runs path-filtered workflows, one `validate-<gate>.yml` per subproject, while the selector
(`scripts/gates.py`) reads `gates.json`. Both are written by hand, so they drift: a folder one names
and the other misses runs a gate locally that CI never runs, or the reverse. For each workflow whose
gate is in `gates.json`, two things must hold:

- `missing`: every rule path that selects the gate is covered by one of the workflow's push `paths`;
- `extra`: every workflow path reaches a rule that selects the gate.

Rule paths follow `gates.py` (`dir/` a folder, a `*` glob, else one file); workflow paths follow
GitHub's filter globs (`dir/**` a folder, `*` within one folder). A rule `dir/` is covered by
`dir/**` or by a wider `parent/**`; a glob or file rule by the same text, by a `parent/**` it lies
under, or, for a file, by any workflow glob that matches it. A gate with no `validate-*.yml` (such as
`dry` or `case`) is skipped and listed on one `skip` line; a workflow with no gate fails.

Prints one `kind<TAB>workflow<TAB>path` line per problem. Exit 0 with none, 1 with problems, 2 on a
bad root. Python's standard library only.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import pathlib
import re
import sys

WORKFLOWS = ".github/workflows"
PREFIX = "validate-"
WILDCARDS = "*?["


def push_paths(text: str) -> list[str] | None:
    """The `paths` list of the workflow's `on: push:` block, or None when it has none."""
    match = re.search(r"^  push:\n(?:    .*\n)*?    paths: \[(.*)\]\s*$", text, re.MULTILINE)
    if not match:
        return None
    return [item.strip().strip("'\"") for item in match.group(1).split(",") if item.strip()]


def literal(pattern: str) -> str:
    """The part of a pattern before its first wildcard."""
    cut = min((pattern.index(char) for char in WILDCARDS if char in pattern), default=len(pattern))
    return pattern[:cut]


def github_match(glob: str, path: str) -> bool:
    """GitHub's filter glob: `**` crosses folders, `*` and `?` stay within one."""
    parts = []
    index = 0
    while index < len(glob):
        if glob.startswith("**", index):
            parts.append(".*")
            index += 2
        elif glob[index] == "*":
            parts.append("[^/]*")
            index += 1
        elif glob[index] == "?":
            parts.append("[^/]")
            index += 1
        else:
            parts.append(re.escape(glob[index]))
            index += 1
    return re.fullmatch("".join(parts), path) is not None


def folder_glob(glob: str) -> str | None:
    """`dir/` for a workflow glob `dir/**` (`""` for `**`), else None."""
    if glob == "**":
        return ""
    folder = glob.removesuffix("**")
    if folder != glob and folder.endswith("/") and not any(char in folder for char in WILDCARDS):
        return folder
    return None


def covered(rule: str, globs: list[str]) -> bool:
    """Whether a workflow glob runs on every path the rule names."""
    for glob in globs:
        folder = folder_glob(glob)
        if folder is not None and rule.startswith(folder):
            return True
        if rule.endswith("/") and glob == rule + "**":
            return True
        if glob == rule:
            return True
        if not rule.endswith("/") and not any(char in rule for char in WILDCARDS) and github_match(glob, rule):
            return True
    return False


def reaches(glob: str, rules: list[str]) -> bool:
    """Whether some path the workflow glob names is a path one of the rules names."""
    folder = folder_glob(glob)
    if folder is None and not any(char in glob for char in WILDCARDS):
        return any(rule_match(rule, glob) for rule in rules)
    start = folder if folder is not None else literal(glob)
    for rule in rules:
        if not rule.endswith("/") and not any(char in rule for char in WILDCARDS):
            if github_match(glob, rule):
                return True
            continue
        head = rule if rule.endswith("/") else literal(rule)
        if head.startswith(start) or start.startswith(head):
            return True
    return False


def rule_match(rule: str, path: str) -> bool:
    """`gates.py`'s rule matching: a folder prefix, a glob whose `*` crosses folders, or one file."""
    if rule.endswith("/"):
        return path.startswith(rule)
    if any(char in rule for char in WILDCARDS):
        return fnmatch.fnmatchcase(path, rule) or ("/" not in rule and fnmatch.fnmatchcase(path.rsplit("/", 1)[-1], rule))
    return path == rule


def check(root: pathlib.Path) -> tuple[list[tuple[str, str, str]], list[str]]:
    """The problems, then the gates no workflow runs."""
    data = json.loads((root / "gates.json").read_text(encoding="utf-8"))
    gates = [gate["name"] for gate in data["gates"]]
    problems = []
    seen = set()
    for file in sorted((root / WORKFLOWS).glob(f"{PREFIX}*.yml")):
        gate = file.stem[len(PREFIX):]
        name = file.name
        if gate not in gates:
            problems.append(("no-gate", name, gate))
            continue
        seen.add(gate)
        globs = push_paths(file.read_text(encoding="utf-8"))
        if globs is None:
            problems.append(("no-paths", name, "on.push.paths"))
            continue
        rules = [rule["path"] for rule in data["rules"] if gate in rule["gates"]]
        problems += [("missing", name, rule) for rule in rules if not covered(rule, globs)]
        problems += [("extra", name, glob) for glob in globs if not reaches(glob, rules)]
    return problems, [gate for gate in gates if gate not in seen]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=".", help="the repository (default: the current folder)")
    args = parser.parse_args(argv)
    root = pathlib.Path(args.root)
    if not (root / "gates.json").is_file() or not (root / WORKFLOWS).is_dir():
        print(f"workflow_paths.py: no gates.json or {WORKFLOWS} in {root}", file=sys.stderr)
        return 2
    problems, skipped = check(root)
    for problem in problems:
        print("\t".join(problem))
    if skipped:
        print("skip\t" + ",".join(skipped))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
